import { prisma } from "@/lib/prisma";

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

  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA" },
    include: { plan: true },
  });

  return subscripcion?.plan.perfilDinamico ?? false;
}
