import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Autocompletado contra el catálogo CIUO/ChileValora (docs/objetivo-laboral.md
// §4) -- lo usa el paso "¿Qué buscas?" del onboarding para que la persona
// elija su objetivo de una lista en vez de escribir texto libre. Elegir del
// catálogo ancla el objetivo a un código CIUO real, así el triaje no tiene
// que adivinar (§8.3 del otro documento: la ambigüedad de "operario" u
// "auxiliar" se resuelve solo si la persona elige de una lista concreta).

type OcupacionCatalogo = { ocupacion: string; ciuo: string; fuente: string; normalizado: string };
type Catalogo = { grupos: Record<string, string>; ocupaciones: OcupacionCatalogo[] };

let catalogoCache: Catalogo | null = null;
function cargarCatalogo(): Catalogo {
  if (!catalogoCache) {
    const ruta = path.join(process.cwd(), "scripts", "data", "catalogo-ocupaciones-cl.json");
    catalogoCache = JSON.parse(fs.readFileSync(ruta, "utf8"));
  }
  return catalogoCache!;
}

// Misma normalización que el resto del sistema (lib/triaje.ts, extension/core.js
// AP.n) -- tiene que ser idéntica o "buscar por lo que ya viene normalizado
// en el catálogo" deja de matchear.
function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  const catalogo = cargarCatalogo();

  // "Empieza con" prioriza sobre "contiene en cualquier parte" -- para
  // autocompletado es casi siempre lo más relevante ("vend" -> "vendedor"
  // antes que "asistente de ventas").
  const empiezan: OcupacionCatalogo[] = [];
  const contienen: OcupacionCatalogo[] = [];
  for (const oc of catalogo.ocupaciones) {
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
    resultados.push({ ciuo: oc.ciuo, etiqueta: oc.ocupacion, grupo: catalogo.grupos[oc.ciuo] ?? null });
    if (resultados.length >= MAX_RESULTADOS) break;
  }

  return NextResponse.json({ resultados });
}
