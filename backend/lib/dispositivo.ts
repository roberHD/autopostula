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

/**
 * Lo mismo, pero en el servidor, con las cabeceras del pedido: Sec-CH-UA-Mobile
 * es el mismo dato que navigator.userAgentData.mobile (lo mandan Chrome y los
 * navegadores basados en él), y si no viene, el mismo user agent de arriba.
 * docs/optimizacion-2026-09-29.md §5: así el aviso del celular llega dibujado
 * desde el servidor en vez de aparecer después y empujar la página.
 */
export function sinSoporteExtensionSegunCabeceras(cabeceras: Headers): boolean {
  const movil = cabeceras.get("sec-ch-ua-mobile");
  if (movil === "?1") return true;
  if (movil === "?0") return false;
  return /Android|iPhone|iPad|iPod/i.test(cabeceras.get("user-agent") ?? "");
}
