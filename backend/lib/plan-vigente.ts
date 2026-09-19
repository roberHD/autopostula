import { prisma } from "@/lib/prisma";

// docs/pase-prepagado.md §3: única fuente de verdad de "qué plan tiene esta
// persona ahora".
//
// Premium es un pase PAGADO cuyo período contiene el momento actual. NO depende
// de que un cron o un webhook haya actualizado `estado` a tiempo: antes era
// Flow quien cambiaba `estado` (por el webhook de cobro) cuando la suscripción
// vencía; con pases no hay nadie que lo cambie, y confiar en `estado` habría
// dejado a un pase de 30 días como Premium para siempre. El cron de avisos
// marca VENCIDA por orden, pero el acceso se decide siempre por fecha.
//
// El rol ADMIN sigue su propio camino en cada lugar (nunca pasó por acá).

/**
 * El pase Premium vigente ahora (la fila de Subscription con su Plan), o null
 * si no hay -- o sea, plan gratis. Con varios pases apilados devuelve el que
 * termina más tarde. Drop-in de `prisma.subscription.findFirst({ where: {
 * userId, estado: "ACTIVA" }, include: { plan: true } })`, que es lo que estaba
 * repetido en 14 lugares.
 */
export async function obtenerSubscripcionVigente(userId: string, ahora: Date = new Date()) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      estado: "ACTIVA",
      plan: { tipo: "PREMIUM" },
      periodoInicio: { lte: ahora },
      periodoFin: { gt: ahora },
    },
    include: { plan: true },
    orderBy: { periodoFin: "desc" },
  });
}

/**
 * Lo mismo con la forma del §3 de la spec. En FREE, `plan` es null: los
 * consumidores ya tienen sus propios valores por defecto para "sin plan" (20
 * postulaciones, 150 llamadas de IA, un portal), que son los del plan gratis.
 */
export async function obtenerPlanVigente(userId: string, ahora: Date = new Date()) {
  const pase = await obtenerSubscripcionVigente(userId, ahora);
  if (pase) return { tipo: "PREMIUM" as const, plan: pase.plan, venceEn: pase.periodoFin };
  return { tipo: "FREE" as const, plan: null, venceEn: null };
}

/**
 * Cuándo termina el último pase pagado que ya está acreditado (vigente o
 * futuro), o null si no hay ninguno. Es de donde arranca un pase nuevo (§2:
 * comprar con un pase vigente suma días, no los pisa).
 */
export async function finDelUltimoPase(
  userId: string,
  ahora: Date = new Date(),
  // Dentro de una transacción hay que leer con SU cliente: leer con el global
  // sale de la transacción y se salta el aislamiento que protege el apilado.
  cliente: Pick<typeof prisma, "subscription"> = prisma,
): Promise<Date | null> {
  const ultimo = await cliente.subscription.findFirst({
    where: { userId, estado: "ACTIVA", plan: { tipo: "PREMIUM" }, periodoFin: { gt: ahora } },
    orderBy: { periodoFin: "desc" },
    select: { periodoFin: true },
  });
  return ultimo?.periodoFin ?? null;
}
