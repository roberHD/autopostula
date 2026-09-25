import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";
import { limpiarTitulo } from "@/lib/text";
import { resumenUltimaRafaga, estimadoDuracionRafagaMs } from "@/lib/rafagas";
import { modoAutomatico, motivoInactivo, PRUEBA_TOTAL } from "@/lib/estado-automatico";

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

  const [user, subscripcion, cupo, ultima, portalesActivos, rafaga, estimadoRafagaMs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { rol: true, busquedaAutomaticaActiva: true, ultimaRafagaEn: true, pruebaAutomaticaRestantes: true },
    }),
    obtenerSubscripcionVigente(userId),
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
    resumenUltimaRafaga(userId),
    estimadoDuracionRafagaMs(userId),
  ]);

  // Mismo veredicto que /api/account/estado-automatico (lib/estado-automatico.ts):
  // ADMIN no depende de tener un plan armado, y una cuenta gratis con prueba por
  // gastar corre ráfagas hasta enviar las 5 (docs/rafagas-y-ponerse-al-dia.md §4.1).
  const modo = modoAutomatico({
    esAdmin: user?.rol === "ADMIN",
    planIncluyeBusquedaAutomatica: subscripcion?.plan.busquedaAutomatica ?? false,
    pruebaRestantes: user?.pruebaAutomaticaRestantes ?? 0,
  });
  // Solo del plan: "Ponerme al día ahora" no existe en el plan gratis, ni en la prueba.
  const disponibleEnPlan = modo === "premium";

  const pausadaPorTi = user?.busquedaAutomaticaActiva === false;

  // "Postulando" solo si se cumplen las tres: el plan (o la prueba) lo permite,
  // no está pausada a mano, y todavía queda cupo. Si falta una, la barra dice cuál.
  const activa = modo !== "manual" && !pausadaPorTi && cupo.permitido && portalesActivos > 0;

  const motivo = motivoInactivo({ modo, pausadaPorTi, cupoPermitido: cupo.permitido, portalesActivos });

  // Lo usado del mes sale de lo que queda DEL MES, no del total: desde que
  // existen las postulaciones extra (docs/estrategia-y-rediseno.md §7) el total
  // puede ser mayor que el límite del plan, y esta resta daba negativo.
  const usadas =
    cupo.limite === null ? null : Math.max(0, cupo.limite - (cupo.delMes ?? cupo.restantes ?? 0));

  return NextResponse.json({
    activa,
    motivo,
    disponibleEnPlan,
    // premium | prueba | manual (§4.1). Con "prueba", cuántas le quedan de las 5.
    modo,
    pruebaRestantes: modo === "prueba" ? (user?.pruebaAutomaticaRestantes ?? 0) : null,
    pruebaTotal: PRUEBA_TOTAL,
    pausadaPorTi,
    portalesActivos,
    cupo: { usadas, limite: cupo.limite, restantes: cupo.restantes, delMes: cupo.delMes, extras: cupo.extras },
    // Cuándo se puso al día por última vez (hora del servidor) y qué encontró
    // -- lo lee la tarjeta del Inicio. `resumen` es null si la fila ya se purgó
    // (a los 90 días) pero la fecha sigue en el usuario.
    // Mediana de las últimas 5 ráfagas que terminaron (docs/rafagas-y-ponerse-al-dia.md
    // §3.6), para decirle a la persona cuánto suele tardar "Ponerme al día
    // ahora". null si todavía no hay ninguna: no se inventa una duración.
    estimadoRafagaMs,
    ultimaRafaga: user?.ultimaRafagaEn
      ? { en: user.ultimaRafagaEn.toISOString(), resumen: rafaga }
      : null,
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
