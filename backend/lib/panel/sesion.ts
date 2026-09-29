import { cache } from "react";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Quién está mirando, una sola vez por request aunque lo pregunten varias
// partes de la misma página (docs/optimizacion-2026-09-29.md §1). null si no
// hay sesión válida: la página entonces deja que el navegador pida los datos,
// igual que antes, y la ruta de la API responde con su error de siempre.
export const idDeLaSesion = cache(async (): Promise<string | null> => (await getUsuarioSesion()).userId);

/**
 * Los datos que el servidor le pasa a una página del panel tienen que llegar
 * con la misma forma que si se hubieran pedido a la API: las fechas como texto.
 */
export function comoLoDevuelveLaApi<T>(valor: unknown): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}
