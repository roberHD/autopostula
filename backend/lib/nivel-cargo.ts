// docs/revision-2026-09-16.md §2.7: con perfil de "Asistente de Ventas" se
// postuló a Gerente Comercial, Subgerente de ventas y Jefa Zonal -- el rol
// "ventas" calza, el nivel no se miraba. El scorer de la extensión descarta los
// títulos de jefatura/dirección salvo que el objetivo de la persona sea de ese
// nivel; esto le dice si lo es.
//
// Es determinista y sin IA: el nivel sale del código CIUO del objetivo (gran
// grupo 1 = directores y gerentes), no de lo que un modelo "crea" del CV.

// Mismos términos que busca AP.puntuarOferta en el título (extension/core.js,
// AP_NIVEL_DIRECTIVO) -- si se cambia uno, cambiar el otro.
const TERMINO_DIRECTIVO = /\b(?:sub)?(?:gerent[ea]|director[a]?|jef[ea]|jefatura)\b|\bhead of\b/i;

/**
 * ¿Los objetivos declarados incluyen cargos de jefatura o dirección?
 *  - true:  al menos uno es del gran grupo CIUO 1, o su nombre es de jefatura
 *           (los objetivos escritos libres no traen CIUO).
 *  - false: todos tienen CIUO y ninguno es del grupo 1.
 *  - null:  no se sabe (sin objetivos, o alguno libre sin CIUO). El scorer manda
 *           esos avisos a "Por decidir" en vez de descartarlos o postularlos.
 */
export function objetivosPermitenDirectivo(
  objetivos: { ciuo: string | null; etiqueta: string }[],
): boolean | null {
  if (!objetivos.length) return null;
  if (objetivos.some((o) => o.ciuo?.startsWith("1") || TERMINO_DIRECTIVO.test(o.etiqueta))) return true;
  if (objetivos.every((o) => !!o.ciuo)) return false;
  return null;
}
