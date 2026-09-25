import { prisma } from "@/lib/prisma";

/**
 * Postulaciones extra (docs/estrategia-y-rediseno.md §7).
 *
 * Se compran en paquetes o se ganan (invitando a alguien, dejando el perfil
 * listo) y se gastan DESPUÉS del cupo del mes: primero se usa lo que ya venía
 * incluido en el plan, y recién cuando eso se acaba se toca lo extra. Al revés
 * sería cobrarle a alguien algo que ya tenía pagado.
 *
 * El saldo es la suma del libro mayor, no un contador que se edita: cada
 * movimiento deja escrito de dónde salió.
 */

// El catálogo vive en el código, no en la base: el monto que se cobra sale del
// servidor, nunca del cliente (mismo criterio que lib/pases.ts).
export const PAQUETES = {
  extra_20: { postulaciones: 20, monto: 1990, nombre: "20 postulaciones extra" },
  extra_50: { postulaciones: 50, monto: 3990, nombre: "50 postulaciones extra" },
} as const;

export type IdPaquete = keyof typeof PAQUETES;

export function esIdPaquete(valor: unknown): valor is IdPaquete {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(PAQUETES, valor);
}

/** Cuántas postulaciones extra se ganan por cada cosa (§7). */
export const PREMIOS = {
  // Por cada persona que se registra con tu enlace Y verifica su correo.
  invitacion: 10,
  // Una sola vez: CV subido, objetivo confirmado y al menos un portal conectado.
  perfil: 5,
} as const;

/**
 * El saldo de la cuenta. Se ancla en 0: dos postulaciones enviadas al mismo
 * tiempo con una sola extra disponible pueden dejar la suma en -1, y lo que
 * corresponde ahí es cobrar cero, no mostrar una deuda.
 */
export async function saldoExtras(userId: string): Promise<number> {
  const { _sum } = await prisma.postulacionExtra.aggregate({
    where: { userId },
    _sum: { cantidad: true },
  });
  return Math.max(0, _sum.cantidad ?? 0);
}

/**
 * Anota un movimiento. `clave` es lo que lo hace idempotente: si ya existe, no
 * pasa nada y devuelve false -- dos avisos del mismo pago dan un solo paquete,
 * y el premio del mismo invitado se paga una sola vez.
 */
export async function anotarExtra(mov: {
  userId: string;
  cantidad: number;
  motivo: "COMPRA" | "PREMIO_INVITACION" | "PREMIO_PERFIL" | "USO" | "AJUSTE";
  clave: string;
  detalle?: string;
}): Promise<boolean> {
  try {
    await prisma.postulacionExtra.create({ data: mov });
    return true;
  } catch (err) {
    // P2002: ya estaba anotado. Es el caso esperado, no un error.
    if ((err as { code?: string })?.code === "P2002") return false;
    throw err;
  }
}

/**
 * Gasta una extra por una postulación que ya se envió. Solo se llama cuando el
 * cupo del mes se acabó; si no queda saldo tampoco se anota nada (la
 * postulación ya salió: cobrarla en negativo no la trae de vuelta).
 */
export async function gastarExtra(userId: string, applicationId: string): Promise<boolean> {
  if ((await saldoExtras(userId)) <= 0) return false;
  return anotarExtra({ userId, cantidad: -1, motivo: "USO", clave: `uso:${applicationId}` });
}

/**
 * El premio por dejar el perfil listo (§7). Se revisa cada vez que se mira el
 * estado de la cuenta, no en un solo momento: la persona puede completar lo que
 * falta semanas después, y el premio tiene que llegar igual.
 */
export async function premiarPerfilCompleto(userId: string): Promise<boolean> {
  const [cv, user, portales] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId }, select: { textoExtraido: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { objetivoConfirmado: true } }),
    prisma.platformAccount.count({ where: { userId, activa: true } }),
  ]);
  const listo = !!cv?.textoExtraido?.trim() && !!user?.objetivoConfirmado && portales > 0;
  if (!listo) return false;
  return anotarExtra({
    userId,
    cantidad: PREMIOS.perfil,
    motivo: "PREMIO_PERFIL",
    clave: `perfil:${userId}`,
    detalle: "Dejaste tu perfil listo para trabajar",
  });
}

/**
 * El premio por una invitación (§7). Se paga cuando el invitado verifica su
 * correo, no cuando se registra: sin eso, cualquiera se regala postulaciones
 * creando cuentas con direcciones inventadas.
 */
export async function premiarInvitacion(invitadoId: string): Promise<boolean> {
  const invitado = await prisma.user.findUnique({
    where: { id: invitadoId },
    select: { invitadoPorId: true, emailVerificado: true, email: true },
  });
  if (!invitado?.invitadoPorId || !invitado.emailVerificado) return false;
  // Invitarse a uno mismo con otro correo no paga.
  if (invitado.invitadoPorId === invitadoId) return false;
  return anotarExtra({
    userId: invitado.invitadoPorId,
    cantidad: PREMIOS.invitacion,
    motivo: "PREMIO_INVITACION",
    clave: `invitacion:${invitadoId}`,
    detalle: `Invitaste a ${invitado.email}`,
  });
}

// Letras y números sin los que se confunden al dictarlo por teléfono o leerlo
// en una captura: 0/O y 1/I/L fuera.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** El código propio para invitar. Se arma la primera vez que se pide. */
export async function obtenerCodigoInvitacion(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { codigoInvitacion: true } });
  if (user?.codigoInvitacion) return user.codigoInvitacion;

  for (let intento = 0; intento < 5; intento++) {
    const codigo = Array.from({ length: 6 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");
    try {
      const actualizado = await prisma.user.update({
        where: { id: userId },
        data: { codigoInvitacion: codigo },
        select: { codigoInvitacion: true },
      });
      return actualizado.codigoInvitacion!;
    } catch (err) {
      // P2002: ese código ya era de otra persona. Se prueba otro.
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }
  throw new Error("No se pudo generar un código de invitación");
}
