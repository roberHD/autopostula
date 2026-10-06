import { prisma } from "@/lib/prisma";

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
