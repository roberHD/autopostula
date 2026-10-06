import { prisma } from "@/lib/prisma";
import { diaEnChile, inicioDelDiaChile } from "@/lib/tiempo";

/**
 * Monedas: se ganan usando AutoPostula y más adelante se canjean por
 * postulaciones extra (lib/extras.ts).
 *
 * 1 moneda por cada hora de reloj en la que la persona usó AutoPostula: con el
 * panel abierto y a la vista, o con la extensión encendida. Las dos avisan con
 * un "latido"; el que llega primero en esa hora la gana y el resto choca con la
 * clave única. Como mucho 24 al día, y la hora la pone el servidor, nunca el
 * navegador: adelantar el reloj del computador no da monedas.
 *
 * Además, 1 moneda al día por conversar 10 minutos con la IA de estilo
 * (Entrenar IA): ver premiarConversacion(), más abajo.
 *
 * El saldo es la suma del libro mayor, como en las postulaciones extra.
 */

// Lo que se podrá canjear. Por ahora solo se muestra, con "Próximamente": el
// canje todavía no existe. Cuando exista, cada canje anota CANJE en negativo
// acá y la misma cantidad de postulaciones extra con anotarExtra(), y ninguna
// moneda compra otra cosa (docs/creditos-y-pagina-nueva.md §3.1: un crédito
// sigue siendo una postulación).
export const CANJES = {
  canje_20: { monedas: 500, postulaciones: 20 },
  canje_50: { monedas: 1200, postulaciones: 50 },
} as const;

export type IdCanje = keyof typeof CANJES;

/** La hora de reloj en UTC, "AAAA-MM-DDTHH": lo que identifica cada moneda ganada. */
export function horaDeUso(ahora: Date = new Date()): string {
  return ahora.toISOString().slice(0, 13);
}

/** El saldo de la cuenta, nunca negativo (mismo criterio que saldoExtras). */
export async function saldoMonedas(userId: string): Promise<number> {
  const { _sum } = await prisma.movimientoMoneda.aggregate({
    where: { userId },
    _sum: { cantidad: true },
  });
  return Math.max(0, _sum.cantidad ?? 0);
}

/**
 * Anota la hora de uso actual. Devuelve true si esta llamada ganó la moneda, y
 * false si esa hora ya estaba anotada (el caso normal de un segundo latido).
 */
export async function anotarHoraDeUso(
  userId: string,
  origen: "panel" | "extension",
  ahora: Date = new Date()
): Promise<boolean> {
  try {
    await prisma.movimientoMoneda.create({
      data: {
        userId,
        cantidad: 1,
        motivo: "USO",
        clave: `uso:${userId}:${horaDeUso(ahora)}`,
        detalle: origen === "panel" ? "Una hora con el panel" : "Una hora con la extensión",
      },
    });
    return true;
  } catch (err) {
    // P2002: esa hora ya tenía su moneda. Es lo esperado, no un error.
    if ((err as { code?: string })?.code === "P2002") return false;
    throw err;
  }
}

// ── Conversación con la IA de estilo ─────────────────────────────
// 1 moneda al día (día de Chile) por conversar 10 minutos. Un minuto cuenta si
// la persona mandó un mensaje en él: dejar el chat abierto no suma, y diez
// mensajes en el mismo minuto son un minuto. Los minutos salen de AiUsageLog,
// que ya anota cada mensaje con su hora (tipo "conversacion_estilo"); el saludo
// con el que la IA abre una conversación vacía se anota con otro tipo
// ("conversacion_estilo_inicio") para que no cuente como un minuto de la persona.
export const MINUTOS_CONVERSACION_PARA_MONEDA = 10;
const TIPO_MENSAJE_CONVERSACION = "conversacion_estilo";

const claveConversacion = (userId: string, ahora: Date) => `conversacion:${userId}:${diaEnChile(ahora)}`;

/** Minutos distintos de hoy (en Chile) con al menos un mensaje de la persona. */
export async function minutosDeConversacionHoy(userId: string, ahora: Date = new Date()): Promise<number> {
  const mensajes = await prisma.aiUsageLog.findMany({
    where: { userId, tipo: TIPO_MENSAJE_CONVERSACION, creadoEn: { gte: inicioDelDiaChile(ahora) } },
    select: { creadoEn: true },
  });
  return new Set(mensajes.map((m) => m.creadoEn.toISOString().slice(0, 16))).size;
}

/** Cómo va la conversación de hoy, para el widget de Perfil. */
export async function conversacionDeHoy(userId: string, ahora: Date = new Date()) {
  const [minutos, premio] = await Promise.all([
    minutosDeConversacionHoy(userId, ahora),
    prisma.movimientoMoneda.findUnique({ where: { clave: claveConversacion(userId, ahora) }, select: { id: true } }),
  ]);
  return { minutos: Math.min(minutos, MINUTOS_CONVERSACION_PARA_MONEDA), ganada: !!premio };
}

/**
 * Se llama después de anotar cada mensaje de la persona. Al llegar a los 10
 * minutos del día anota la moneda, una sola vez por día: la clave lleva el día.
 */
export async function premiarConversacion(userId: string, ahora: Date = new Date()) {
  const minutos = await minutosDeConversacionHoy(userId, ahora);
  if (minutos < MINUTOS_CONVERSACION_PARA_MONEDA) return { minutos, ganada: false };
  try {
    await prisma.movimientoMoneda.create({
      data: {
        userId,
        cantidad: 1,
        motivo: "USO",
        clave: claveConversacion(userId, ahora),
        detalle: "10 minutos conversando con la IA",
      },
    });
    return { minutos: MINUTOS_CONVERSACION_PARA_MONEDA, ganada: true };
  } catch (err) {
    // P2002: la de hoy ya estaba ganada.
    if ((err as { code?: string })?.code === "P2002") return { minutos: MINUTOS_CONVERSACION_PARA_MONEDA, ganada: false };
    throw err;
  }
}
