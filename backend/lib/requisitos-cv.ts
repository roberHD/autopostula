/**
 * Qué acredita el CV (docs/amplitud-de-busqueda.md §5).
 *
 * Solo lo usa el modo "cualquier trabajo": ahí no hay rol que filtre, así que
 * lo que protege a la persona de quemarse el cupo del mes es no postular a
 * avisos que piden un requisito excluyente que no tiene -- un título, una
 * licencia profesional, inglés.
 *
 * Es deterministico y conservador a propósito: se responde "lo tiene" ante
 * cualquier indicio razonable. Un falso "lo tiene" solo devuelve el
 * comportamiento actual (postula igual); un falso "no lo tiene" le esconde
 * ofertas a la persona, que es el error caro.
 *
 * No usa IA: el CV ya se leyó una vez al subirlo, esto son reglas sobre ese
 * texto. Vive en el backend porque el texto del CV nunca sale de ahí.
 */
export type RequisitosCandidato = {
  /** Título profesional o técnico de nivel superior. */
  titulo: boolean;
  /** Clases de licencia de conducir mencionadas: "a1".."a5", "b", "c", "d", "e", "f". */
  licencias: string[];
  /** Inglés de trabajo (intermedio o más). */
  ingles: boolean;
};

export const SIN_REQUISITOS: RequisitosCandidato = { titulo: false, licencias: [], ingles: false };

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const TITULO = [
  /\btitulo (profesional|tecnico|universitario)\b/,
  /\btitulad[oa]\b/,
  /\bingenier[oa]\b/,
  /\blicenciad[oa] en\b/,
  /\btecnico de nivel superior\b/,
  /\begresad[oa] de\b/,
  /\b(universidad|instituto profesional|centro de formacion tecnica)\b/,
];

// "licencia clase B", "licencia B", "licencia de conducir clase A-2".
const LICENCIA = /\blicencia(?: de conducir)?(?: clase)?\s*([abcdef])\s*-?\s*([1-5])?\b/g;

const INGLES = [
  /\bingles\b[^.\n]{0,30}\b(avanzado|intermedio|fluido|fluent|b2|c1|c2)\b/,
  /\bbilingue\b/,
  /\b(avanzado|intermedio)\b[^.\n]{0,20}\bingles\b/,
];

export function requisitosDelCandidato(cv: {
  textoExtraido?: string | null;
  habilidades?: unknown;
  resumenProfesional?: string | null;
}): RequisitosCandidato {
  const partes = [cv?.textoExtraido || "", cv?.resumenProfesional || ""];
  if (Array.isArray(cv?.habilidades)) partes.push(cv.habilidades.filter((h) => typeof h === "string").join(" "));
  const texto = normalizar(partes.join("\n"));
  if (!texto.trim()) return SIN_REQUISITOS;

  const licencias = new Set<string>();
  for (const match of texto.matchAll(LICENCIA)) {
    const clase = match[1];
    const numero = match[2];
    licencias.add(clase === "a" && numero ? `a${numero}` : clase);
  }

  return {
    titulo: TITULO.some((rx) => rx.test(texto)),
    licencias: [...licencias],
    ingles: INGLES.some((rx) => rx.test(texto)),
  };
}
