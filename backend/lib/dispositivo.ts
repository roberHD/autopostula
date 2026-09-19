// docs/celular-y-escritorio.md §3.1: se detecta por CAPACIDAD, no por tamaño de
// pantalla. Lo que importa es si el navegador puede instalar la extensión, no si
// la ventana es angosta: un notebook con la ventana chica sí puede, y reducir la
// ventana en un computador no debe esconder el paso de la extensión.
//
// true = este navegador no puede instalar la extensión (teléfonos y tablets).
export function sinSoporteExtension(): boolean {
  if (typeof navigator === "undefined") return false;
  const movil = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (typeof movil === "boolean") return movil;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
