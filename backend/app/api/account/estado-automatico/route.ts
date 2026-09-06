import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";

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
    prisma.subscription.findFirst({
      where: { userId: user.id, estado: "ACTIVA" },
      include: { plan: true },
    }),
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
  const loPermiteElPlan = user.rol === "ADMIN" ? true : (subscripcion?.plan.busquedaAutomatica ?? false);
  // Si ya se acabó el cupo de postulaciones del mes, no tiene sentido seguir
  // abriendo pestañas y escaneando ofertas -- la extensión corta el ciclo acá,
  // antes de llegar a postular de verdad (postular ya pasó en el portal externo
  // para cuando el backend se entera al guardar el registro, así que ese chequeo
  // solo no alcanza para el flujo automático).
  const busquedaAutomatica = loPermiteElPlan && user.busquedaAutomaticaActiva && estadoPostulaciones.permitido;

  return NextResponse.json({
    busquedaAutomatica,
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
