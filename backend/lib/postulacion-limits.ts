import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";
import { saldoExtras } from "@/lib/extras";

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
    return { permitido: true, restantes: null as number | null, limite: null as number | null, delMes: null as number | null, extras: 0 };
  }

  const subscripcion = await obtenerSubscripcionVigente(userId);

  const limite = subscripcion?.plan.limitePostulacionesMes ?? 20;

  if (limite === null) {
    return { permitido: true, restantes: null, limite: null, delMes: null, extras: 0 };
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

  // docs/creditos-y-pagina-nueva.md §3: las postulaciones extra (compradas o
  // ganadas) se gastan DESPUÉS de las del plan. Primero se usa lo que ya venía
  // incluido; al revés sería cobrar dos veces lo mismo.
  const delMes = Math.max(0, limite - usadas);
  const extras = await saldoExtras(userId);

  return {
    permitido: delMes + extras > 0,
    restantes: delMes + extras,
    limite,
    // Separadas para poder decir "12 del mes + 20 extra" en vez de un 32 que no
    // explica de dónde sale.
    delMes,
    extras,
  };
}
