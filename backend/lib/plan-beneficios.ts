import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";

/**
 * "Perfil dinámico" = poder seguir conversando con la IA de estilo después de
 * ya tener un perfil armado (fase 2), para profundizarlo con el tiempo.
 * Armar el perfil por primera vez (fase 1) es gratis para todos -- esto solo
 * gatea seguir después de eso.
 */
export async function usuarioTienePerfilDinamico(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rol: true },
  });
  if (user?.rol === "ADMIN") return true;

  const subscripcion = await obtenerSubscripcionVigente(userId);

  return subscripcion?.plan.perfilDinamico ?? false;
}

// Analítica avanzada (nivelAnaliticas) -- hoy solo gatea exportar el historial
// de postulaciones a CSV. El dashboard de "Resumen" (tasa de respuesta, match
// promedio, actividad semanal, por portal) queda gratis para todos por ahora
// -- separar eso en básico/avanzado es un rediseño más grande, pendiente.
export async function usuarioTieneAnaliticaAvanzada(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rol: true },
  });
  if (user?.rol === "ADMIN") return true;

  const subscripcion = await obtenerSubscripcionVigente(userId);

  return subscripcion?.plan.nivelAnaliticas === "AVANZADO";
}
