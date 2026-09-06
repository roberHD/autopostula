import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";
import { limpiarTitulo } from "@/lib/text";

/**
 * Estado de la máquina, para la barra que va arriba de todo el dashboard.
 *
 * Junta en una sola llamada lo que hasta ahora estaba repartido: si la
 * búsqueda automática está corriendo, cuánto cupo queda del mes y cuál fue la
 * última postulación que se envió. La barra se muestra en todas las páginas,
 * así que tiene que ser una consulta y no tres.
 */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [user, subscripcion, cupo, ultima, portalesActivos] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { rol: true, busquedaAutomaticaActiva: true },
    }),
    prisma.subscription.findFirst({
      where: { userId, estado: "ACTIVA" },
      include: { plan: true },
    }),
    obtenerEstadoPostulaciones(userId),
    prisma.application.findFirst({
      where: { userId },
      orderBy: { enviadaEn: "desc" },
      select: {
        enviadaEn: true,
        estadoActual: true,
        jobOffer: { select: { titulo: true, empresa: true, platform: { select: { nombre: true } } } },
      },
    }),
    prisma.platformAccount.count({ where: { userId, activa: true } }),
  ]);

  // Mismo criterio que /api/account/estado-automatico: ADMIN no depende de
  // tener un plan armado, para poder probar sin montar Plan + Subscription.
  const disponibleEnPlan =
    user?.rol === "ADMIN" ? true : (subscripcion?.plan.busquedaAutomatica ?? false);

  const pausadaPorTi = user?.busquedaAutomaticaActiva === false;

  // "Postulando" solo si se cumplen las tres: el plan lo permite, no está
  // pausada a mano, y todavía queda cupo. Si falta una, la barra dice cuál.
  const activa = disponibleEnPlan && !pausadaPorTi && cupo.permitido && portalesActivos > 0;

  let motivo: string | null = null;
  if (!disponibleEnPlan) motivo = "sin-plan";
  else if (pausadaPorTi) motivo = "pausada";
  else if (!cupo.permitido) motivo = "sin-cupo";
  else if (portalesActivos === 0) motivo = "sin-portales";

  const usadas =
    cupo.limite === null ? null : Math.max(0, cupo.limite - (cupo.restantes ?? 0));

  return NextResponse.json({
    activa,
    motivo,
    disponibleEnPlan,
    pausadaPorTi,
    portalesActivos,
    cupo: { usadas, limite: cupo.limite, restantes: cupo.restantes },
    ultima: ultima
      ? {
          titulo: limpiarTitulo(ultima.jobOffer.titulo),
          empresa: ultima.jobOffer.empresa,
          portal: ultima.jobOffer.platform.nombre,
          estado: ultima.estadoActual,
          enviadaEn: ultima.enviadaEn.toISOString(),
        }
      : null,
  });
}
