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

// docs/objetivo-laboral.md §7.4: el triaje se ancla en los ObjetivoLaboral
// declarados por la persona, no en CvProfile.cargoObjetivo. Cada uno reparte
// una porción de los 20 títulos según su peso -- el llamador (route.ts) arma
// esta lista, y si todavía no hay ningún objetivo confirmado, cae a un único
// objetivo sintético con el cargoObjetivo del CV (peso 1), igual que
// funcionaba antes de que existiera ObjetivoLaboral.
export type ObjetivoTriaje = { etiqueta: string; ciuo: string | null; peso: number };

const NUCLEO = 5;
const VECINOS = 10;
const FUERA = 5;
const TOTAL = NUCLEO + VECINOS + FUERA;
// Piso por objetivo -- sin esto, un objetivo secundario de peso bajo (ej. 0.3
// contra un 1.0 principal) podría quedar con 0 o 1 título, que no alcanza ni
// para el núcleo. Mejor mostrar algunos de más que dejarlo sin representación.
const MIN_POR_OBJETIVO = 4;

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

// Todos los títulos del catálogo que podrían corresponder al objetivo --
// exacto si existe, si no, cualquiera que lo contenga como substring. Esta
// lista completa (no un único "mejor" match) es la que permite medir si el
// término es ambiguo antes de intentar anclarlo a un solo código.
//
// Cuando el objetivo ya trae un código CIUO (se eligió del catálogo, no se
// escribió libre -- docs/objetivo-laboral.md §4), se filtra DIRECTO por ese
// código: no hay nada que desambiguar, la persona ya resolvió la ambigüedad
// al elegir de una lista.
async function buscarCandidatos(objetivo: ObjetivoTriaje): Promise<FilaCatalogo[]> {
  if (objetivo.ciuo) {
    return prisma.tituloCanonico.findMany({
      where: { ciuo: objetivo.ciuo, origen: "CATALOGO_OFICIAL" },
      select: { id: true, formaCruda: true, ciuo: true },
      take: 500,
    });
  }

  const objetivoNorm = normalizar(objetivo.etiqueta || "");
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
  if (cantidad <= 0) return [];
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
// adivinar, se reparten los títulos entre las familias principales y se deja
// que los swipes del usuario resuelvan cuál es -- para eso existe el triaje.
function repartirEntreFamilias(familiasPrincipales: [string, FilaCatalogo[]][], excluir: string[], cupo: number): TituloTriaje[] {
  const porFamilia = Math.ceil(cupo / familiasPrincipales.length);
  const resultado: TituloTriaje[] = [];
  for (const [, items] of familiasPrincipales) {
    const disponibles = items.filter((t) => !excluir.includes(t.formaCruda));
    const elegidos = barajar(disponibles).slice(0, porFamilia);
    resultado.push(...elegidos.map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo })));
  }
  return barajar(resultado).slice(0, cupo);
}

// Caso normal (1-2 familias, §8.3): se ancla a un código CIUO concreto y se
// arma el clásico núcleo / vecinos (mismo subgrupo) / fuera (mismo gran
// grupo, distinto subgrupo), repartido en proporción 25/50/25 sobre el cupo
// que le tocó a este objetivo (5/10/5 de 20 es ese mismo reparto).
async function seleccionarConAncla(candidatos: FilaCatalogo[], excluir: string[], cupo: number): Promise<TituloTriaje[]> {
  const cupoNucleo = Math.max(1, Math.round((cupo * NUCLEO) / TOTAL));
  const cupoVecinos = Math.max(1, Math.round((cupo * VECINOS) / TOTAL));
  const cupoFuera = Math.max(0, cupo - cupoNucleo - cupoVecinos);

  // Entre los candidatos, el título más corto es el más representativo
  // ("vendedor(a)" vale más como ancla que "vendedor de cursos y planes
  // educativos a empresas e instituciones"). Si el objetivo ya trae CIUO,
  // todos los candidatos comparten ese código -- el "ancla" solo elige cuál
  // usar como representante, no cuál código es.
  const ancla = [...candidatos].sort((a, b) => a.formaCruda.length - b.formaCruda.length)[0];
  const anclaCiuo = ancla.ciuo!;
  const grupoAncla = await prisma.grupoCiuo.findUnique({ where: { codigo: anclaCiuo } });

  async function titulosPorCiuos(ciuos: string[], cantidad: number) {
    if (!ciuos.length || cantidad <= 0) return [];
    const filas = await prisma.tituloCanonico.findMany({
      where: { ciuo: { in: ciuos }, origen: "CATALOGO_OFICIAL", formaCruda: { notIn: excluir } },
    });
    return barajar(filas).slice(0, cantidad);
  }

  const nucleo = await titulosPorCiuos([anclaCiuo], cupoNucleo);

  let vecinos: Awaited<ReturnType<typeof titulosPorCiuos>> = [];
  let fuera: Awaited<ReturnType<typeof titulosPorCiuos>> = [];

  if (grupoAncla) {
    const gruposVecinos = await prisma.grupoCiuo.findMany({
      where: { subgrupo: grupoAncla.subgrupo, codigo: { not: anclaCiuo } },
    });
    vecinos = await titulosPorCiuos(gruposVecinos.map((g) => g.codigo), cupoVecinos);

    const gruposFuera = await prisma.grupoCiuo.findMany({
      where: { granGrupo: grupoAncla.granGrupo, subgrupo: { not: grupoAncla.subgrupo } },
    });
    fuera = await titulosPorCiuos(gruposFuera.map((g) => g.codigo), cupoFuera);
  }

  const combinados: FilaCatalogo[] = [...nucleo, ...vecinos, ...fuera];

  // Relleno en dos niveles si el vecindario estructural del ancla no alcanza
  // el cupo: primero con OTROS candidatos que también matchearon el objetivo
  // (siguen siendo relevantes aunque caigan fuera del subgrupo/gran grupo del
  // ancla -- ver el caso "operario" en la nota de arriba, donde su
  // vecindario es angosto pero hay decenas de otros candidatos igual de
  // válidos). Solo si eso tampoco alcanza, se recurre a una muestra sin
  // relación con el término.
  if (combinados.length < cupo) {
    const usados = new Set(combinados.map((t) => t.formaCruda));
    const otrosCandidatos = candidatos.filter((c) => !usados.has(c.formaCruda) && !excluir.includes(c.formaCruda));
    combinados.push(...barajar(otrosCandidatos).slice(0, cupo - combinados.length));
  }

  if (combinados.length < cupo) {
    const usados = new Set(combinados.map((t) => t.formaCruda));
    const relleno = await prisma.tituloCanonico.findMany({
      where: { origen: "CATALOGO_OFICIAL", formaCruda: { notIn: [...excluir, ...usados] } },
      take: 300,
    });
    combinados.push(...barajar(relleno).slice(0, cupo - combinados.length));
  }

  return combinados.map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo }));
}

// La misma lógica que antes tenía seleccionarTitulosTriaje para UN objetivo,
// ahora parametrizada por cuántos títulos le tocan (su cupo dentro del total).
async function seleccionarParaUnObjetivo(objetivo: ObjetivoTriaje, excluir: string[], cupo: number): Promise<TituloTriaje[]> {
  if (cupo <= 0) return [];
  const candidatos = await buscarCandidatos(objetivo);

  if (!candidatos.length) {
    // Sin candidatos -- no se pudo ubicar el objetivo en el catálogo -- se
    // cae a una muestra variada para no dejar su cupo vacío.
    return muestraVariada(excluir, cupo);
  }

  const porFamilia = new Map<string, FilaCatalogo[]>();
  for (const c of candidatos) {
    const familia = c.ciuo![0];
    if (!porFamilia.has(familia)) porFamilia.set(familia, []);
    porFamilia.get(familia)!.push(c);
  }
  const familiasPrincipales = [...porFamilia.entries()].filter(
    ([, items]) => items.length / candidatos.length >= UMBRAL_FAMILIA
  );

  return familiasPrincipales.length > MAX_FAMILIAS_ANCLABLE
    ? repartirEntreFamilias(familiasPrincipales, excluir, cupo)
    : seleccionarConAncla(candidatos, excluir, cupo);
}

// Reparte el total de títulos entre los objetivos según su peso, con un piso
// mínimo por objetivo (ver MIN_POR_OBJETIVO) para que uno secundario no
// quede sin representación. El sobrante por redondeo va al de mayor peso.
function repartirCupos(objetivos: ObjetivoTriaje[], total: number): number[] {
  const pesoTotal = objetivos.reduce((s, o) => s + Math.max(0, o.peso || 0), 0) || objetivos.length;
  const crudos = objetivos.map((o) => (Math.max(0, o.peso || 0) / pesoTotal) * total);
  const cupos = crudos.map((c) => Math.max(MIN_POR_OBJETIVO, Math.round(c)));

  // El piso mínimo puede hacer que la suma pase el total disponible (varios
  // objetivos de peso chico) -- se recorta proporcionalmente empezando por
  // el que tiene más cupo, nunca por debajo del piso salvo que ya no quede
  // más remedio (más objetivos que títulos totales, caso extremo).
  let exceso = cupos.reduce((s, c) => s + c, 0) - total;
  while (exceso > 0) {
    const iMax = cupos.reduce((iM, c, i) => (c > cupos[iM] ? i : iM), 0);
    if (cupos[iMax] <= 1) break; // no hay más margen para recortar
    cupos[iMax]--;
    exceso--;
  }
  return cupos;
}

export async function seleccionarTitulosTriaje(userId: string, objetivos: ObjetivoTriaje[]): Promise<TituloTriaje[]> {
  const yaDecididos = await prisma.decisionOferta.findMany({
    where: { userId, fuente: "TRIAJE_ONBOARDING" },
    select: { tituloCrudo: true },
  });
  const excluirBase = yaDecididos.map((d) => d.tituloCrudo);

  const objetivosValidos = (objetivos || []).filter((o) => o.etiqueta || o.ciuo);
  if (!objetivosValidos.length) {
    return barajar(await muestraVariada(excluirBase, TOTAL));
  }

  const cupos = repartirCupos(objetivosValidos, TOTAL);

  let seleccion: TituloTriaje[] = [];
  let excluir = [...excluirBase];
  for (let i = 0; i < objetivosValidos.length; i++) {
    const parcial = await seleccionarParaUnObjetivo(objetivosValidos[i], excluir, cupos[i]);
    seleccion.push(...parcial);
    excluir = [...excluir, ...parcial.map((t) => t.titulo)];
  }

  // Relleno final si por poca cobertura no se llegó al total (puede pasar
  // con el reparto entre familias si alguna tiene pocos títulos disponibles).
  if (seleccion.length < TOTAL) {
    const usados = new Set(seleccion.map((t) => t.titulo));
    seleccion = [...seleccion, ...(await muestraVariada([...excluirBase, ...usados], TOTAL - seleccion.length))];
  }

  const vistos = new Set<string>();
  const sinRepetir = seleccion.filter((t) => {
    if (vistos.has(t.titulo)) return false;
    vistos.add(t.titulo);
    return true;
  });

  return barajar(sinRepetir);
}
