import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

// docs/revision-2026-09-28.md §17 y §19: límites de intentos.
//
// Antes no había ninguno: el login aceptó 15 contraseñas malas seguidas sin
// frenar, y el registro y "Olvidé mi contraseña" servían para mandar correos
// en masa desde el dominio. Se cuenta en Postgres (tabla limites_tasa) y no en
// memoria: en Vercel cada request puede caer en una instancia distinta.
//
// La clave no guarda la IP ni el correo tal cual: guarda un HMAC con el secreto
// del servidor. Sirve igual para contar, y la tabla no se vuelve una lista de
// IPs y correos de la gente (Ley 19.628 / 21.719).

export type Limite = { max: number; ventanaMs: number };

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export const LIMITES = {
  // Contraseñas malas: por IP (alguien probando muchas cuentas) y por cuenta
  // (alguien probando muchas contraseñas contra una).
  loginPorIp: { max: 30, ventanaMs: 15 * MINUTO },
  loginPorEmail: { max: 8, ventanaMs: 15 * MINUTO },
  // Cuentas nuevas desde una misma IP. Una familia o un liceo pueden compartir
  // IP: el tope es holgado, lo que frena es crear cientos.
  registroPorIp: { max: 10, ventanaMs: HORA },
  // "Olvidé mi contraseña": cada pedido manda un correo.
  resetPorEmail: { max: 3, ventanaMs: HORA },
  resetPorIp: { max: 10, ventanaMs: HORA },
  // Cada mensaje de soporte llega como correo a la casilla de soporte.
  soportePorUsuario: { max: 6, ventanaMs: HORA },
  // La conversación de estilo es gratis y no cuenta en el cupo de IA (§19).
  mensajesEstiloPorUsuario: { max: 40, ventanaMs: HORA },
  // "Armar el texto" de Computrabajo usa el modelo más caro (§19).
  perfilPortalPorUsuario: { max: 5, ventanaMs: 24 * HORA },
  // Subir un CV lo procesa entero en el servidor.
  subidaCvPorUsuario: { max: 15, ventanaMs: HORA },
} satisfies Record<string, Limite>;

function secreto(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET -- sin él no se pueden armar las claves de los límites de intentos.");
  return s;
}

/** La clave que se guarda: el tipo en claro y el valor (IP, correo, id) con HMAC. */
export function claveLimite(tipo: string, valor: string): string {
  const huella = createHmac("sha256", secreto()).update(`limite:${tipo}:${valor}`).digest("base64url").slice(0, 32);
  return `${tipo}:${huella}`;
}

/** ¿Ya se llegó al tope? Solo cuenta, no anota nada. */
export async function superaLimite(clave: string, limite: Limite): Promise<boolean> {
  const usados = await prisma.limiteTasa.count({
    where: { clave, creadoEn: { gte: new Date(Date.now() - limite.ventanaMs) } },
  });
  return usados >= limite.max;
}

/** Anota un intento. */
export async function anotarIntento(clave: string): Promise<void> {
  await prisma.limiteTasa.create({ data: { clave } });
}

/**
 * Anota el intento si todavía hay cupo y dice si se permite. Para lo que se
 * cuenta siempre (registros, correos); el login solo anota los fallidos y usa
 * las dos de arriba por separado.
 */
export async function permitirIntento(clave: string, limite: Limite): Promise<boolean> {
  if (await superaLimite(clave, limite)) return false;
  await anotarIntento(clave);
  return true;
}

/**
 * La IP de quien hace el pedido. En Vercel la pone la plataforma (x-vercel-forwarded-for
 * no se puede falsificar desde el cliente); en local no viene ninguna y todo cae
 * en la misma clave, que para desarrollo da igual.
 */
export function ipDe(request: Request | undefined | null): string {
  const h = request?.headers;
  const ip =
    h?.get("x-vercel-forwarded-for") ??
    h?.get("x-forwarded-for")?.split(",")[0] ??
    h?.get("x-real-ip") ??
    "desconocida";
  return ip.trim() || "desconocida";
}

/** Lo borra el purgado diario: más viejo que la ventana más larga, ya no cuenta para nada. */
export async function purgarLimites(): Promise<number> {
  const { count } = await prisma.limiteTasa.deleteMany({
    where: { creadoEn: { lt: new Date(Date.now() - 2 * 24 * HORA) } },
  });
  return count;
}
