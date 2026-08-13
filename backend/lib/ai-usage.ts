import { prisma } from "@/lib/prisma";

/**
 * Revisa si el usuario puede hacer una llamada más de IA este mes, según su plan.
 * Si puede, registra el uso de una vez (para no tener que llamarlo dos veces).
 */
export async function checkAndLogAiUsage(userId: string, tipo: string) {
  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA" },
    include: { plan: true },
  });

  const limite = subscripcion?.plan.limiteLlamadasIaMes ?? 20; // sin plan, trátalo como free bien restringido

  if (limite !== null) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const usadas = await prisma.aiUsageLog.count({
      where: { userId, creadoEn: { gte: inicioMes } },
    });

    if (usadas >= limite) {
      return { permitido: false, restantes: 0, limite };
    }
  }

  await prisma.aiUsageLog.create({ data: { userId, tipo } });

  return { permitido: true, restantes: null, limite };
}
