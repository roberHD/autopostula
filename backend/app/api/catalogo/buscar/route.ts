import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Autocompletado contra el catálogo CIUO/ChileValora (docs/objetivo-laboral.md
// §4) -- lo usa el paso "¿Qué buscas?" del onboarding para que la persona
// elija su objetivo de una lista en vez de escribir texto libre. Elegir del
// catálogo ancla el objetivo a un código CIUO real, así el triaje no tiene
// que adivinar (§8.3 del otro documento: la ambigüedad de "operario" u
// "auxiliar" se resuelve solo si la persona elige de una lista concreta).
//
// docs/revision-2026-09-16.md §2.4: antes esto leía scripts/data/
// catalogo-ocupaciones-cl.json con `fs` -- un archivo gitignored (pensado
// para el scrape crudo), presente solo en el disco de quien lo generó. En
// producción (Vercel) el archivo no existe: HTTP 500 siempre, autocompletado
// muerto, objetivos guardados sin CIUO (rompe el triaje de §2.5 y el filtro
// de nivel de §2.7). El catálogo YA vive en la base de datos -- lib/triaje.ts
// ya lo consulta ahí (TituloCanonico con origen=CATALOGO_OFICIAL) para el
// triaje del onboarding -- así que esto pasa a leer de la misma fuente en vez
// de mantener una segunda copia (el JSON) que se puede desincronizar. `fs` +
// `process.cwd()` es frágil incluso con el archivo en el repo (serverless).

type Entrada = { ciuo: string; etiqueta: string; grupo: string | null; normalizado: string };

// Mismo criterio que antes: se cachea en memoria del proceso, no se
// reconsulta en cada request. El catálogo oficial es chico y fijo (no la
// cosecha completa, que sí crece) -- cabe entero sin problema.
let catalogoCache: Entrada[] | null = null;

// Misma normalización que el resto del sistema (lib/triaje.ts, extension/core.js
// AP.n) -- tiene que ser idéntica o "buscar por lo que ya viene normalizado
// en el catálogo" deja de matchear.
function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function cargarCatalogo(): Promise<Entrada[]> {
  if (catalogoCache) return catalogoCache;

  const [titulos, grupos] = await Promise.all([
    prisma.tituloCanonico.findMany({
      where: { origen: "CATALOGO_OFICIAL", ciuo: { not: null } },
      select: { ciuo: true, formaLimpia: true },
    }),
    prisma.grupoCiuo.findMany({ select: { codigo: true, nombre: true } }),
  ]);

  const nombreGrupo = new Map(grupos.map((g) => [g.codigo, g.nombre]));
  catalogoCache = titulos.map((t) => ({
    ciuo: t.ciuo as string,
    etiqueta: t.formaLimpia,
    grupo: nombreGrupo.get(t.ciuo as string) ?? null,
    normalizado: normalizar(t.formaLimpia),
  }));
  return catalogoCache;
}

const MAX_RESULTADOS = 20;

export async function GET(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = normalizar(searchParams.get("q") || "");
  if (q.length < 2) {
    return NextResponse.json({ resultados: [] });
  }

  const catalogo = await cargarCatalogo();

  // "Empieza con" prioriza sobre "contiene en cualquier parte" -- para
  // autocompletado es casi siempre lo más relevante ("vend" -> "vendedor"
  // antes que "asistente de ventas").
  const empiezan: Entrada[] = [];
  const contienen: Entrada[] = [];
  for (const oc of catalogo) {
    if (oc.normalizado.startsWith(q)) empiezan.push(oc);
    else if (contienen.length < MAX_RESULTADOS * 2 && oc.normalizado.includes(q)) contienen.push(oc);
  }

  // Dedup por código CIUO -- mostrar cada código una sola vez (con el
  // primer nombre encontrado), no las 5 variantes de "vendedor" que
  // comparten el mismo código.
  const vistos = new Set<string>();
  const resultados: { ciuo: string; etiqueta: string; grupo: string | null }[] = [];
  for (const oc of [...empiezan, ...contienen]) {
    if (vistos.has(oc.ciuo)) continue;
    vistos.add(oc.ciuo);
    resultados.push({ ciuo: oc.ciuo, etiqueta: oc.etiqueta, grupo: oc.grupo });
    if (resultados.length >= MAX_RESULTADOS) break;
  }

  return NextResponse.json({ resultados });
}
