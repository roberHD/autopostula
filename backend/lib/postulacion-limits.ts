import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";
import { saldoExtras } from "@/lib/extras";
import { inicioDelMesChile } from "@/lib/tiempo";
import { POSTULACIONES_GRATIS_AL_MES } from "@/lib/plan-gratis";

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

  // El plan gratis no tiene fila de Subscription (lib/plans.ts): sin pase, este es su límite.
  const limite = subscripcion?.plan.limitePostulacionesMes ?? POSTULACIONES_GRATIS_AL_MES;

  if (limite === null) {
    return { permitido: true, restantes: null, limite: null, delMes: null, extras: 0 };
  }

  // docs/revision-2026-09-28.md §15: el mes de Chile, no el del servidor (UTC).
  const inicioMes = inicioDelMesChile();

  // §8.3 (docs/revision-2026-09-16.md): INCOMPLETA es un intento que no llegó
  // a la empresa (el formulario se quedó a medio enviar) -- contarla acá
  // gastaba cupo real del mes por algo que nunca se envió, y de paso hacía
  // que el límite pareciera alcanzado antes de tiempo.
  //
  // docs/creditos-y-pagina-nueva.md §3.7: las de la prueba automática
  // (esDePrueba) tampoco cuentan -- van por su propio cupo de 5. Si contaran,
  // con 10 al mes la prueba más la primera página se comían el mes el día 1.
  const usadas = await prisma.application.count({
    where: { userId, enviadaEn: { gte: inicioMes }, estadoActual: { not: "INCOMPLETA" }, esDePrueba: false },
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
