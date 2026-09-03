import { prisma } from "@/lib/prisma";

// Selección de títulos para el triaje (docs/rediseno-filtrado-ofertas.md §8.3):
// no al azar puro -- se busca máxima información por swipe mostrando casos de
// frontera. La vecindad entre roles sale gratis de la jerarquía CIUO (mismo
// subgrupo de 3 dígitos = vecino cercano), sin IA ni embeddings.
//
// Misma normalización que el parser (extension/core.js AP.n, backend/scripts/limpieza/parser.ts)
// -- tiene que ser idéntica o el ancla nunca encuentra el título del catálogo.
function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type TituloTriaje = { id: string; titulo: string; ciuo: string | null };
type FilaCatalogo = { id: string; formaCruda: string; ciuo: string | null };

const NUCLEO = 5;
const VECINOS = 10;
const FUERA = 5;
const TOTAL = NUCLEO + VECINOS + FUERA;

// Familia = primer dígito del CIUO (el "gran grupo"). Una familia cuenta como
// "principal" si concentra al menos el 10% de los candidatos -- umbral medido
// contra el catálogo real (§8.3): con esto, vendedor/cajero/garzón/reponedor
// dan 1-2 familias (anclables) y auxiliar/ayudante/encargado dan 4-5 (no).
const UMBRAL_FAMILIA = 0.1;
const MAX_FAMILIAS_ANCLABLE = 2;

function barajar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Todos los títulos del catálogo que podrían corresponder al cargoObjetivo --
// exacto si existe, si no, cualquiera que lo contenga como substring. Esta
// lista completa (no un único "mejor" match) es la que permite medir si el
// término es ambiguo antes de intentar anclarlo a un solo código.
async function buscarCandidatos(cargoObjetivo: string | null): Promise<FilaCatalogo[]> {
  const objetivoNorm = normalizar(cargoObjetivo || "");
  if (!objetivoNorm) return [];

  const exactos = await prisma.tituloCanonico.findMany({
    where: { formaCruda: objetivoNorm, ciuo: { not: null } },
    select: { id: true, formaCruda: true, ciuo: true },
  });
  if (exactos.length) return exactos;

  return prisma.tituloCanonico.findMany({
    where: { formaCruda: { contains: objetivoNorm }, ciuo: { not: null } },
    select: { id: true, formaCruda: true, ciuo: true },
    take: 500,
  });
}

async function muestraVariada(excluir: string[], cantidad: number): Promise<TituloTriaje[]> {
  const variados = await prisma.tituloCanonico.findMany({
    where: { origen: "CATALOGO_OFICIAL", formaCruda: { notIn: excluir } },
    take: 300,
  });
  return barajar(variados)
    .slice(0, cantidad)
    .map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo }));
}

// Cargo genuinamente ambiguo (§8.3, "El ancla no siempre existe"): "operario"
// no es una ocupación, es un modificador -- cae en 3+ grandes grupos CIUO
// distintos y ninguna heurística de string elige bien entre ellos ("operario"
// -> "Operario de ferry" no tiene más sentido que cualquier otro). En vez de
// adivinar, se reparten los 20 títulos entre las familias principales y se
// deja que los swipes del usuario resuelvan cuál es -- para eso existe el
// triaje.
function repartirEntreFamilias(familiasPrincipales: [string, FilaCatalogo[]][], excluir: string[]): TituloTriaje[] {
  const porFamilia = Math.ceil(TOTAL / familiasPrincipales.length);
  const resultado: TituloTriaje[] = [];
  for (const [, items] of familiasPrincipales) {
    const disponibles = items.filter((t) => !excluir.includes(t.formaCruda));
    const elegidos = barajar(disponibles).slice(0, porFamilia);
    resultado.push(...elegidos.map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo })));
  }
  return barajar(resultado).slice(0, TOTAL);
}

// Caso normal (1-2 familias, §8.3): se ancla a un código CIUO concreto y se
// arma el clásico 5 núcleo / 10 vecinos (mismo subgrupo) / 5 fuera (mismo
// gran grupo, distinto subgrupo).
async function seleccionarConAncla(candidatos: FilaCatalogo[], excluir: string[]): Promise<TituloTriaje[]> {
  // Entre los candidatos, el título más corto es el más representativo
  // ("vendedor(a)" vale más como ancla que "vendedor de cursos y planes
  // educativos a empresas e instituciones").
  const ancla = [...candidatos].sort((a, b) => a.formaCruda.length - b.formaCruda.length)[0];
  const anclaCiuo = ancla.ciuo!;
  const grupoAncla = await prisma.grupoCiuo.findUnique({ where: { codigo: anclaCiuo } });

  async function titulosPorCiuos(ciuos: string[], cantidad: number) {
    if (!ciuos.length) return [];
    const filas = await prisma.tituloCanonico.findMany({
      where: { ciuo: { in: ciuos }, origen: "CATALOGO_OFICIAL", formaCruda: { notIn: excluir } },
    });
    return barajar(filas).slice(0, cantidad);
  }

  const nucleo = await titulosPorCiuos([anclaCiuo], NUCLEO);

  let vecinos: Awaited<ReturnType<typeof titulosPorCiuos>> = [];
  let fuera: Awaited<ReturnType<typeof titulosPorCiuos>> = [];

  if (grupoAncla) {
    const gruposVecinos = await prisma.grupoCiuo.findMany({
      where: { subgrupo: grupoAncla.subgrupo, codigo: { not: anclaCiuo } },
    });
    vecinos = await titulosPorCiuos(gruposVecinos.map((g) => g.codigo), VECINOS);

    const gruposFuera = await prisma.grupoCiuo.findMany({
      where: { granGrupo: grupoAncla.granGrupo, subgrupo: { not: grupoAncla.subgrupo } },
    });
    fuera = await titulosPorCiuos(gruposFuera.map((g) => g.codigo), FUERA);
  }

  const combinados: FilaCatalogo[] = [...nucleo, ...vecinos, ...fuera];

  // Relleno en dos niveles si el vecindario estructural del ancla no alcanza
  // los 20: primero con OTROS candidatos que también matchearon el
  // cargoObjetivo (siguen siendo relevantes al término buscado aunque caigan
  // fuera del subgrupo/gran grupo del ancla -- ver el caso "operario" en la
  // nota de arriba, donde su vecindario es angosto pero hay decenas de otros
  // candidatos igual de válidos). Solo si eso tampoco alcanza, se recurre a
  // una muestra sin relación con el término.
  if (combinados.length < TOTAL) {
    const usados = new Set(combinados.map((t) => t.formaCruda));
    const otrosCandidatos = candidatos.filter((c) => !usados.has(c.formaCruda) && !excluir.includes(c.formaCruda));
    combinados.push(...barajar(otrosCandidatos).slice(0, TOTAL - combinados.length));
  }

  if (combinados.length < TOTAL) {
    const usados = new Set(combinados.map((t) => t.formaCruda));
    const relleno = await prisma.tituloCanonico.findMany({
      where: { origen: "CATALOGO_OFICIAL", formaCruda: { notIn: [...excluir, ...usados] } },
      take: 300,
    });
    combinados.push(...barajar(relleno).slice(0, TOTAL - combinados.length));
  }

  return combinados.map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo }));
}

export async function seleccionarTitulosTriaje(userId: string, cargoObjetivo: string | null): Promise<TituloTriaje[]> {
  const yaDecididos = await prisma.decisionOferta.findMany({
    where: { userId, fuente: "TRIAJE_ONBOARDING" },
    select: { tituloCrudo: true },
  });
  const excluir = yaDecididos.map((d) => d.tituloCrudo);

  const candidatos = await buscarCandidatos(cargoObjetivo);

  let seleccion: TituloTriaje[];
  if (!candidatos.length) {
    // Sin candidatos -- no se pudo ubicar el cargoObjetivo en el catálogo --
    // se cae a una muestra variada para no dejar el triaje vacío.
    seleccion = await muestraVariada(excluir, TOTAL);
  } else {
    const porFamilia = new Map<string, FilaCatalogo[]>();
    for (const c of candidatos) {
      const familia = c.ciuo![0];
      if (!porFamilia.has(familia)) porFamilia.set(familia, []);
      porFamilia.get(familia)!.push(c);
    }
    const familiasPrincipales = [...porFamilia.entries()].filter(
      ([, items]) => items.length / candidatos.length >= UMBRAL_FAMILIA
    );

    seleccion =
      familiasPrincipales.length > MAX_FAMILIAS_ANCLABLE
        ? repartirEntreFamilias(familiasPrincipales, excluir)
        : await seleccionarConAncla(candidatos, excluir);
  }

  // Relleno final si por poca cobertura no se llegó a los 20 (puede pasar con
  // el reparto entre familias si alguna tiene pocos títulos disponibles).
  if (seleccion.length < TOTAL) {
    const usados = new Set(seleccion.map((t) => t.titulo));
    seleccion = [...seleccion, ...(await muestraVariada([...excluir, ...usados], TOTAL - seleccion.length))];
  }

  const vistos = new Set<string>();
  const sinRepetir = seleccion.filter((t) => {
    if (vistos.has(t.titulo)) return false;
    vistos.add(t.titulo);
    return true;
  });

  return barajar(sinRepetir);
}
