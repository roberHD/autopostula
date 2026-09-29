// Lo que llega de afuera (la extensión, un formulario) se limpia acá antes de
// guardarse. docs/revision-2026-09-28.md §1 y §25.

// Las ofertas (JobOffer) son filas compartidas entre todas las cuentas, y la
// extensión de cualquier persona las actualiza. Antes se guardaba cualquier
// dirección: con una segunda cuenta se cambió el botón "Ver oferta" de otra
// persona para que llevara a una página falsa. Ahora solo entra https:// de los
// dominios de los tres portales; lo demás se descarta (queda null), sin
// rechazar el resto del reporte.
const DOMINIOS_POR_PORTAL: Record<string, string[]> = {
  Computrabajo: ["computrabajo.com", "computrabajo.cl"],
  Laborum: ["laborum.cl"],
  Trabajando: ["trabajando.cl"],
};
const TODOS_LOS_DOMINIOS = Object.values(DOMINIOS_POR_PORTAL).flat();

const LARGO_MAXIMO_URL = 2000;

/**
 * La URL tal cual si es https:// de un portal conocido (del portal indicado, si
 * se sabe cuál es), o null. Sin usuario ni contraseña en la dirección: una
 * `https://computrabajo.cl@otro-sitio.cl` apunta a otro sitio.
 */
export function urlDePortal(valor: unknown, portal?: string | null): string | null {
  if (typeof valor !== "string" || !valor || valor.length > LARGO_MAXIMO_URL) return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const dominios = (portal && DOMINIOS_POR_PORTAL[portal]) || TODOS_LOS_DOMINIOS;
  const host = url.hostname.toLowerCase();
  if (!dominios.some((d) => host === d || host.endsWith("." + d))) return null;
  return url.toString();
}

/** Texto recortado a `max` caracteres, o null si no es texto o viene vacío. */
export function textoCorto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio ? limpio.slice(0, max) : null;
}

/** Una lista de textos: solo los que son texto, cada uno recortado, y como mucho `maxItems`. */
export function listaDeTextos(valor: unknown, maxItems: number, maxLargo: number): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((v) => textoCorto(v, maxLargo))
    .filter((v): v is string => !!v)
    .slice(0, maxItems);
}

// ── Correos ─────────────────────────────────────────────────────────

// docs/revision-2026-09-28.md §18: el correo se guardaba tal cual venía, así que
// "Juan@Gmail.com" y "juan@gmail.com" eran dos cuentas distintas, y quien se
// registró con mayúscula no podía entrar escribiéndolo en minúscula.
export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const email = valor.trim().toLowerCase();
  // Lo mínimo para que sea una dirección: algo@algo.algo, sin espacios ni
  // caracteres de control, y de un largo razonable.
  if (email.length > 254 || !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z0-9-]{2,}$/.test(email)) return null;
  return email;
}

/**
 * La dirección "de fondo" de un correo, para reconocer a la misma persona detrás
 * de alias: en Gmail, `ju.an+algo@googlemail.com` y `juan@gmail.com` son la misma
 * casilla. En los demás dominios solo se quita el `+etiqueta`, que casi todos
 * los proveedores entregan a la misma casilla. No se usa para identificar
 * cuentas (cada dirección puede tener la suya), solo para no pagar dos veces
 * un premio por la misma persona (docs/revision-2026-09-28.md §20).
 */
export function emailCanonico(email: string): string {
  const [local, dominio] = email.trim().toLowerCase().split("@");
  if (!dominio) return email.trim().toLowerCase();
  const sinEtiqueta = local.split("+")[0];
  if (dominio === "gmail.com" || dominio === "googlemail.com") {
    return `${sinEtiqueta.replace(/\./g, "")}@gmail.com`;
  }
  return `${sinEtiqueta}@${dominio}`;
}

// ── Contraseñas ─────────────────────────────────────────────────────

export const LARGO_MINIMO_PASSWORD = 8;
// bcrypt solo mira los primeros 72 bytes; más allá de esto es solo trabajo de
// sobra para el servidor.
export const LARGO_MAXIMO_PASSWORD = 200;

/** null si sirve; si no, el motivo para mostrarle a la persona. */
export function problemaConPassword(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length < LARGO_MINIMO_PASSWORD) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`;
  }
  if (valor.length > LARGO_MAXIMO_PASSWORD) {
    return `La contraseña no puede pasar de ${LARGO_MAXIMO_PASSWORD} caracteres`;
  }
  return null;
}

// ── Ubicación declarada (onboarding y Filtros) ──────────────────────

export type UbicacionDeclarada = {
  regiones: string[];
  comunas: string[];
  todaLaRegion: boolean;
  aceptaRemoto: boolean;
};

/**
 * undefined si no vino (no se toca lo guardado), null si viene vacía a
 * propósito, y si no, la forma que usa UbicacionPicker con cada lista acotada.
 * Antes se guardaba cualquier JSON tal cual (docs/revision-2026-09-28.md §25).
 */
export function limpiarUbicacion(valor: unknown): UbicacionDeclarada | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  return {
    regiones: listaDeTextos(v.regiones, 16, 10),
    comunas: listaDeTextos(v.comunas, 60, 60),
    todaLaRegion: v.todaLaRegion === true,
    aceptaRemoto: v.aceptaRemoto === true,
  };
}
