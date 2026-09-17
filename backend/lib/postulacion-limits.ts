import { prisma } from "@/lib/prisma";

/**
 * Cuántas postulaciones lleva el usuario este mes y cuántas le quedan según su
 * plan. Separado de checkAndLogAiUsage porque una postulación no es una llamada
 * de IA -- se cuenta directamente sobre Application, la fuente de verdad real.
 */
export async function obtenerEstadoPostulaciones(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rol: true },
  });

  if (user?.rol === "ADMIN") {
    return { permitido: true, restantes: null as number | null, limite: null as number | null };
  }

  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA" },
    include: { plan: true },
  });

  const limite = subscripcion?.plan.limitePostulacionesMes ?? 20;

  if (limite === null) {
    return { permitido: true, restantes: null, limite: null };
  }

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  // §8.3 (docs/revision-2026-09-16.md): INCOMPLETA es un intento que no llegó
  // a la empresa (el formulario se quedó a medio enviar) -- contarla acá
  // gastaba cupo real del mes por algo que nunca se envió, y de paso hacía
  // que el límite pareciera alcanzado antes de tiempo.
  const usadas = await prisma.application.count({
    where: { userId, enviadaEn: { gte: inicioMes }, estadoActual: { not: "INCOMPLETA" } },
  });

  return {
    permitido: usadas < limite,
    restantes: Math.max(0, limite - usadas),
    limite,
  };
}
