import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { getBaseUrl } from "./base-url";

// docs/rafagas-y-ponerse-al-dia.md §3.8: el enlace "Dejar de recibir estos avisos"
// del recordatorio no exige iniciar sesión -- quien recibe un correo que no quiere
// no tiene por qué recordar su contraseña para pararlo. Por eso el enlace lleva una
// firma (HMAC del id de la persona con el secreto del servidor) en vez de una
// sesión: sin el secreto no se puede darle de baja a otra persona con solo saber su id.
//
// La firma no vence a propósito: un correo de hace meses tiene que seguir pudiendo
// darse de baja.

const CONTEXTO = "recordatorio-rafaga-baja";

function secreto(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  // Sin secreto no se puede firmar el enlace de baja, y un correo sin baja no
  // debe salir: falla fuerte, igual que remitente() en lib/correo.ts.
  if (!s) throw new Error("Falta AUTH_SECRET -- sin él no se puede firmar el enlace de baja de los recordatorios.");
  return s;
}

export function firmarBaja(userId: string): string {
  return createHmac("sha256", secreto()).update(`${CONTEXTO}:${userId}`).digest("base64url");
}

export function verificarBaja(userId: string, token: string | null | undefined): boolean {
  if (!userId || !token) return false;
  let esperado: Buffer;
  try {
    esperado = Buffer.from(firmarBaja(userId));
  } catch {
    return false;
  }
  const recibido = Buffer.from(token);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

function query(userId: string): string {
  return new URLSearchParams({ u: userId, t: firmarBaja(userId) }).toString();
}

/** El enlace que ve la persona: una página que da de baja y dice que quedó hecho. */
export function urlBajaRecordatorios(userId: string): string {
  return `${getBaseUrl()}/recordatorios/baja?${query(userId)}`;
}

/** El que usa el cliente de correo con un clic (List-Unsubscribe-Post, RFC 8058). */
export function urlBajaUnClic(userId: string): string {
  return `${getBaseUrl()}/api/recordatorios/baja?${query(userId)}`;
}

/**
 * Apaga (o vuelve a prender) los recordatorios si la firma es válida. La misma
 * firma sirve para las dos cosas: la página de baja ofrece "volver a recibirlos"
 * por si el clic fue sin querer -- o lo hizo el antivirus del correo, que abre
 * los enlaces antes que la persona.
 */
export async function cambiarRecordatorios(
  userId: string,
  token: string | null | undefined,
  activos: boolean,
): Promise<"ok" | "invalido"> {
  if (!verificarBaja(userId, token)) return "invalido";
  // updateMany: si la cuenta ya no existe no revienta, y la respuesta no delata si existe.
  await prisma.user.updateMany({ where: { id: userId }, data: { recordatoriosActivos: activos } });
  return "ok";
}
