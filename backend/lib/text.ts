// Red de seguridad por si la IA desliza markdown en un chat que se muestra
// como texto plano (el prompt ya se lo prohíbe, pero no es 100% confiable).
export function quitarMarkdown(texto: string) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\n)\s*#+\s*/g, "$1")
    .replace(/(^|\n)\s*[-*•]\s+/g, "$1");
}
