import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";
import { modoAutomatico, motivoInactivo, PRUEBA_TOTAL, type ModoAutomatico } from "@/lib/estado-automatico";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const [subscripcion, cv, cuentasActivas, estadoPostulaciones, objetivosLaborales] = await Promise.all([
    obtenerSubscripcionVigente(user.id),
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
    prisma.platformAccount.findMany({
      where: { userId: user.id, activa: true },
      include: { platform: true },
    }),
    obtenerEstadoPostulaciones(user.id),
    prisma.objetivoLaboral.findMany({ where: { userId: user.id }, orderBy: { orden: "asc" } }),
  ]);

  // docs/objetivo-laboral.md §8: una búsqueda por objetivo, no solo por el
  // cargoObjetivo del CV. Sin nada confirmado todavía, cae a un único
  // objetivo con el cargoObjetivo del CV -- mismo comportamiento de siempre.
  const objetivos = objetivosLaborales.length
    ? objetivosLaborales.map((o) => ({ etiqueta: o.etiqueta, peso: o.peso }))
    : cv?.cargoObjetivo
    ? [{ etiqueta: cv.cargoObjetivo, peso: 1 }]
    : [];

  // Mismo criterio que checkAndLogAiUsage y platform-accounts: las cuentas ADMIN
  // no dependen de tener un plan con el beneficio activo (útil para probar sin
  // tener que armar un Plan+Subscription real todavía).
  const modo = modoAutomatico({
    esAdmin: user.rol === "ADMIN",
    planIncluyeBusquedaAutomatica: subscripcion?.plan.busquedaAutomatica ?? false,
    pruebaRestantes: user.pruebaAutomaticaRestantes,
  });
  const loPermiteElPlan = modo === "premium";

  // docs/rafagas-y-ponerse-al-dia.md §4.1: una cuenta gratis con prueba corre
  // ráfagas -- pero solo la extensión NUEVA sabe marcar cuáles postulaciones
  // salieron de una ráfaga (desdeRafaga en POST /api/applications), que es lo
  // que gasta la prueba. Una extensión vieja (la de la tienda antes de esta
  // versión) postularía sola sin descontar nada, hasta el tope de 20 al mes: le
  // regalaría el plan Premium a quien no lo paga. Por eso la nueva pide
  // `?prueba=1` y la vieja sigue viendo `false`, como siempre.
  const clienteSabeLaPrueba = new URL(request.url).searchParams.get("prueba") === "1";
  const modoParaElCliente: ModoAutomatico = modo === "prueba" && !clienteSabeLaPrueba ? "manual" : modo;
  // Si ya se acabó el cupo de postulaciones del mes, no tiene sentido seguir
  // abriendo pestañas y escaneando ofertas -- la extensión corta el ciclo acá,
  // antes de llegar a postular de verdad (postular ya pasó en el portal externo
  // para cuando el backend se entera al guardar el registro, así que ese chequeo
  // solo no alcanza para el flujo automático).
  const busquedaAutomatica = modoParaElCliente !== "manual" && user.busquedaAutomaticaActiva && estadoPostulaciones.permitido;

  return NextResponse.json({
    busquedaAutomatica,
    // docs/rafagas-y-ponerse-al-dia.md §3.6: "Ponerme al día ahora" es solo
    // para quien su plan incluye la búsqueda automática -- en una cuenta gratis
    // el botón ni aparece, así que la extensión necesita saber si el plan lo
    // permite POR SEPARADO de si hoy está corriendo. `motivo` dice por qué no
    // corre (mismo veredicto que la barra del dashboard: lib/estado-automatico.ts)
    // para que el botón, si está bloqueado, explique qué hacer en vez de fallar
    // en silencio.
    //
    // `disponibleEnPlan` es SOLO del plan (Premium o admin): "Ponerme al día
    // ahora" no existe en el plan gratis, ni siquiera durante la prueba (§4).
    disponibleEnPlan: loPermiteElPlan,
    // premium | prueba | manual, y cuántas postulaciones de prueba le quedan
    // (solo mientras dura). El popup dibuja "Prueba automática: 3 de 5" con esto.
    modo,
    pruebaRestantes: modo === "prueba" ? user.pruebaAutomaticaRestantes : null,
    pruebaTotal: PRUEBA_TOTAL,
    motivo: motivoInactivo({
      modo: modoParaElCliente,
      pausadaPorTi: !user.busquedaAutomaticaActiva,
      cupoPermitido: estadoPostulaciones.permitido,
      portalesActivos: cuentasActivas.length,
    }),
    // Se mantiene por compatibilidad -- background.js viejo (o una versión
    // de la extensión que todavía no actualizó) sigue funcionando con esto.
    cargoObjetivo: cv?.cargoObjetivo ?? null,
    // Uno o más objetivos con su peso (docs/objetivo-laboral.md §8) -- el
    // principal es objetivos[0] cuando vienen de ObjetivoLaboral (orden asc).
    objetivos,
    // Nombres de JobPlatform (ej. "Computrabajo", "Laborum") — el automático
    // solo debe abrir pestañas de los portales que el usuario tiene conectados.
    plataformasConectadas: cuentasActivas.map((c) => c.platform.nombre),
    postulacionesRestantes: estadoPostulaciones.restantes,
  });
}
