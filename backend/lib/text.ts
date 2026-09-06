// Red de seguridad por si la IA desliza markdown en un chat que se muestra
// como texto plano (el prompt ya se lo prohíbe, pero no es 100% confiable).
export function quitarMarkdown(texto: string) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\n)\s*#+\s*/g, "$1")
    .replace(/(^|\n)\s*[-*•]\s+/g, "$1");
}

/**
 * Limpia un título de oferta que viene del scraping de un portal.
 *
 * La extensión guarda a veces el texto crudo del nodo, y ahí se cuelan
 * saltos de línea, sangría y hasta las etiquetas de estado que el portal
 * dibuja al lado del cargo ("Postulado", "Vista"). Con eso, un título de
 * 40 caracteres llega con 200 y rompe cualquier fila donde se muestre.
 *
 * Esto es una red de seguridad al leer: lo correcto de fondo es que la
 * extensión guarde el título limpio (ver docs). Mientras tanto, ninguna
 * pantalla debería mostrar el texto crudo.
 */
const ETIQUETAS_DE_PORTAL = /^(postulado|postulada|vista|visto|nuevo|nueva|destacado|destacada|urgente)$/i;

export function limpiarTitulo(titulo: string): string {
  const primeraLinea = titulo
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // Las etiquetas del portal vienen como líneas sueltas después del cargo.
    .filter((l) => !ETIQUETAS_DE_PORTAL.test(l))[0];

  return (primeraLinea ?? titulo).replace(/\s+/g, " ").trim();
}
