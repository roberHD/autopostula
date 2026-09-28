import { prisma } from "@/lib/prisma";
import { normalizarPatron } from "@/lib/normalizar-patron";

/**
 * Amplitud de búsqueda (docs/amplitud-de-busqueda.md §4 y §5).
 *
 * Hasta ahora el motor sabía una sola cosa: buscar los roles declarados. Quien
 * puso "vendedor de calzado" no veía un aviso de vendedor audiovisual, y quien
 * busca "lo primero que haya, part time" no tenía forma de decirlo.
 *
 * La amplitud la declara la persona y se resuelve con el catálogo CIUO que ya
 * está en la base (TituloCanonico + GrupoCiuo), sin IA: la jerarquía sale del
 * código mismo por prefijo.
 *
 * Los oficios que entran por amplitud entran con PESO BAJO a propósito: con el
 * umbral de postular en 65, un rol de peso 0,5 que calza en el título da 50 y
 * cae en la banda gris -- o sea, aparece en "Por decidir" y lo decide la
 * persona. Abrirse no es postular a ciegas (§4, regla 1).
 */
export type Amplitud = "solo" | "parecidos" | "rubro" | "abierto";

export const AMPLITUD_POR_DEFECTO: Amplitud = "parecidos";

const AMPLITUDES: Amplitud[] = ["solo", "parecidos", "rubro", "abierto"];

export function esAmplitud(valor: unknown): valor is Amplitud {
  return typeof valor === "string" && (AMPLITUDES as string[]).includes(valor);
}

/** Peso con el que entra un oficio traído por amplitud, según qué tan lejos está. */
const PESO_POR_AMPLITUD: Record<"parecidos" | "rubro", number> = {
  parecidos: 0.5,
  rubro: 0.35,
};

/**
 * Tope de oficios extra. 87 oficios por sus sinónimos serían cientos de
 * expresiones regulares corriendo sobre cada aviso, en el hilo de la página
 * del portal. Se ordena por frecuencia real (lo que la extensión ha visto
 * publicado) y se corta.
 */
const MAX_ROLES_EXTRA = 24;

/** "Vendedor(A) De Mesón" -> "vendedor de meson". El (a)/(A) es ruido de género. */
function limpiarNombre(nombre: string): string {
  return nombre
    .replace(/\(\s*[aoAO]s?\s*\)/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Un nombre del catálogo sirve como patrón del scorer solo si es corto. Se usa
 * la MISMA regla que normalizarPatron (§2.1): hasta 3 palabras y sin listas.
 * "Vendedor de farmacia" sirve; "Ayudante de ventas en local comercial, tienda
 * y almacén" no calzaría nunca con un aviso real.
 */
function sirveComoPatron(nombre: string): string | null {
  const limpio = limpiarNombre(nombre);
  const terminos = normalizarPatron(limpio);
  return terminos.length === 1 ? terminos[0] : null;
}

export type ObjetivoParaAmplitud = { ciuo: string | null; etiqueta: string };

/**
 * Los códigos CIUO de los objetivos declarados. El que se eligió del catálogo
 * ya trae el suyo; el que se escribió libre se resuelve contra la base (§4.5),
 * buscando primero entre los oficios y después entre los NOMBRES DE GRUPO --
 * "Asistente de Ventas" no existe como oficio, pero es parte del nombre del
 * grupo 5223 ("Vendedores y asistentes de venta de tiendas, almacenes...").
 */
export async function resolverCiuos(objetivos: ObjetivoParaAmplitud[]): Promise<string[]> {
  const codigos = new Set<string>();
  const sinCodigo: string[] = [];

  for (const objetivo of objetivos) {
    if (objetivo.ciuo) codigos.add(objetivo.ciuo);
    else if (objetivo.etiqueta?.trim()) sinCodigo.push(limpiarNombre(objetivo.etiqueta));
  }

  for (const etiqueta of sinCodigo) {
    const exacto = await prisma.tituloCanonico.findFirst({
      where: { formaLimpia: etiqueta, ciuo: { not: null } },
      orderBy: { frecuencia: "desc" },
      select: { ciuo: true },
    });
    if (exacto?.ciuo) {
      codigos.add(exacto.ciuo);
      continue;
    }

    const parcial = await prisma.tituloCanonico.findFirst({
      where: { formaLimpia: { contains: etiqueta, mode: "insensitive" }, ciuo: { not: null } },
      orderBy: { frecuencia: "desc" },
      select: { ciuo: true },
    });
    if (parcial?.ciuo) {
      codigos.add(parcial.ciuo);
      continue;
    }

    // Último intento: el nombre del grupo. Se parte la etiqueta en palabras
    // largas para no depender del orden ni de los plurales del nombre oficial.
    const palabras = etiqueta.split(/\s+/).filter((p) => p.length >= 5);
    if (!palabras.length) continue;
    const grupo = await prisma.grupoCiuo.findFirst({
      where: { AND: palabras.map((p) => ({ nombre: { contains: p, mode: "insensitive" as const } })) },
      select: { codigo: true },
    });
    if (grupo) codigos.add(grupo.codigo);
  }

  return [...codigos];
}

/**
 * Los oficios que se suman a roles[] por la amplitud elegida. Devuelve [] para
 * "solo" y para "abierto" (ahí no manda el rol sino las condiciones, §5).
 *
 * `yaDeclarados` son los canónicos y sinónimos que el perfil compilado ya
 * tiene: no tiene sentido repetirlos con peso más bajo.
 */
export async function rolesPorAmplitud(
  objetivos: ObjetivoParaAmplitud[],
  amplitud: Amplitud,
  yaDeclarados: string[] = []
): Promise<{ canonico: string; sinonimos: string[]; peso: number; porAmplitud: true }[]> {
  if (amplitud !== "parecidos" && amplitud !== "rubro") return [];
  if (!objetivos.length) return [];

  const codigos = await resolverCiuos(objetivos);
  if (!codigos.length) return [];

  const where =
    amplitud === "parecidos"
      ? { ciuo: { in: codigos } }
      : // "Mi rubro" es el subgrupo principal: los dos primeros dígitos (52xx
        // son todos los vendedores). Es el nivel de la jerarquía CIUO que la
        // persona reconoce como "lo mío", sin llegar al gran grupo entero.
        { OR: [...new Set(codigos.map((c) => c.slice(0, 2)))].map((p) => ({ ciuo: { startsWith: p } })) };

  const candidatos = await prisma.tituloCanonico.findMany({
    where,
    orderBy: [{ frecuencia: "desc" }, { formaLimpia: "asc" }],
    select: { formaLimpia: true, formaCruda: true },
    take: MAX_ROLES_EXTRA * 6, // se filtran hartos por largo
  });

  const ocupados = new Set(yaDeclarados.map((t) => limpiarNombre(t)));
  const roles: { canonico: string; sinonimos: string[]; peso: number; porAmplitud: true }[] = [];

  for (const candidato of candidatos) {
    if (roles.length >= MAX_ROLES_EXTRA) break;
    const patron = sirveComoPatron(candidato.formaLimpia || candidato.formaCruda || "");
    if (!patron || ocupados.has(patron)) continue;
    ocupados.add(patron);
    roles.push({ canonico: patron, sinonimos: [], peso: PESO_POR_AMPLITUD[amplitud], porAmplitud: true });
  }

  return roles;
}
