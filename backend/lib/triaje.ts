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

const NUCLEO = 5;
const VECINOS = 10;
const FUERA = 5;
const TOTAL = NUCLEO + VECINOS + FUERA;

function barajar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Busca en el catálogo el título más parecido al cargoObjetivo del usuario,
// para usarlo como "centro" del que se calcula la vecindad. Si no encuentra
// nada, devuelve null -- el llamador cae a una muestra variada del catálogo.
async function buscarAncla(cargoObjetivo: string | null): Promise<string | null> {
  const objetivoNorm = normalizar(cargoObjetivo || "");
  if (!objetivoNorm) return null;

  const exacto = await prisma.tituloCanonico.findFirst({
    where: { formaCruda: objetivoNorm, ciuo: { not: null } },
  });
  if (exacto?.ciuo) return exacto.ciuo;

  // Entre las coincidencias parciales, la más corta es la más representativa
  // ("vendedor(a)" vale más como ancla que "vendedor de cursos y planes
  // educativos a empresas e instituciones") -- sin ordenar por largo, Postgres
  // devuelve cualquiera de las dos con la misma probabilidad.
  const parciales = await prisma.tituloCanonico.findMany({
    where: { formaCruda: { contains: objetivoNorm }, ciuo: { not: null } },
    select: { formaCruda: true, ciuo: true },
    take: 200,
  });
  if (!parciales.length) return null;
  parciales.sort((a, b) => a.formaCruda.length - b.formaCruda.length);
  return parciales[0].ciuo;
}

export async function seleccionarTitulosTriaje(userId: string, cargoObjetivo: string | null): Promise<TituloTriaje[]> {
  const yaDecididos = await prisma.decisionOferta.findMany({
    where: { userId, fuente: "TRIAJE_ONBOARDING" },
    select: { tituloCrudo: true },
  });
  const excluir = yaDecididos.map((d) => d.tituloCrudo);

  const anclaCiuo = await buscarAncla(cargoObjetivo);

  // Sin ancla -- no se pudo ubicar el cargoObjetivo en el catálogo -- se cae a
  // una muestra variada para no dejar el triaje vacío.
  if (!anclaCiuo) {
    const variados = await prisma.tituloCanonico.findMany({
      where: { origen: "CATALOGO_OFICIAL", formaCruda: { notIn: excluir } },
      take: 300,
    });
    return barajar(variados)
      .slice(0, TOTAL)
      .map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo }));
  }

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

  const combinados = [...nucleo, ...vecinos, ...fuera];

  // Relleno: si por poca cobertura del catálogo en esta zona no se llegó a 20,
  // se completa con una muestra variada en vez de entregar un triaje corto.
  if (combinados.length < TOTAL) {
    const usados = new Set(combinados.map((t) => t.formaCruda));
    const relleno = await prisma.tituloCanonico.findMany({
      where: { origen: "CATALOGO_OFICIAL", formaCruda: { notIn: [...excluir, ...usados] } },
      take: 300,
    });
    combinados.push(...barajar(relleno).slice(0, TOTAL - combinados.length));
  }

  const vistos = new Set<string>();
  const sinRepetir = combinados.filter((t) => {
    if (vistos.has(t.formaCruda)) return false;
    vistos.add(t.formaCruda);
    return true;
  });

  return barajar(sinRepetir).map((t) => ({ id: t.id, titulo: t.formaCruda, ciuo: t.ciuo }));
}
