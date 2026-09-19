import { prisma } from "./prisma";
import { modoAutomatico, type ModoAutomatico } from "./estado-automatico";

// docs/rafagas-y-ponerse-al-dia.md §4.1: la prueba de 5 postulaciones
// automáticas del plan gratis. La parte pura (qué modo tiene una cuenta, cuántas
// son) vive en estado-automatico.ts para que también la lean los componentes
// del panel; acá lo que necesita la base de datos.

/** ¿El plan activo de esta cuenta incluye la búsqueda automática? */
export async function planIncluyeBusquedaAutomatica(userId: string): Promise<boolean> {
  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA" },
    include: { plan: true },
  });
  return subscripcion?.plan.busquedaAutomatica ?? false;
}

/**
 * El modo de una cuenta (premium / prueba / manual) a partir de su fila de
 * User. Para las rutas que ya tienen la suscripción cargada, basta llamar a
 * modoAutomatico() directo: esto solo ahorra la consulta del plan.
 */
export async function obtenerModoAutomatico(user: {
  id: string;
  rol: string;
  pruebaAutomaticaRestantes: number;
}): Promise<ModoAutomatico> {
  const esAdmin = user.rol === "ADMIN";
  return modoAutomatico({
    esAdmin,
    // Un admin no necesita plan: se evita la consulta.
    planIncluyeBusquedaAutomatica: esAdmin ? false : await planIncluyeBusquedaAutomatica(user.id),
    pruebaRestantes: user.pruebaAutomaticaRestantes,
  });
}

/**
 * Gasta una de las postulaciones de prueba con la postulación que acaba de
 * quedar registrada, y la marca como "de prueba" (es lo que hace posible "Ver
 * las 5"). Devuelve cuántas le quedan, o null si ya no le quedaba ninguna.
 *
 * El descuento está condicionado a `> 0` y va en una sola transacción con la
 * marca: dos ráfagas en paralelo (o dos dispositivos) no pueden bajarlo de 0,
 * y la postulación que se lleva el último cupo es la única que ve `0` -- la que
 * después manda el correo de "tu prueba terminó", una sola vez.
 *
 * null no es un error: la postulación ya se envió en el portal (no se puede
 * deshacer), así que igual queda registrada, solo que no como de prueba.
 */
export async function consumirPrueba(userId: string, applicationId: string): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const descuento = await tx.user.updateMany({
      where: { id: userId, pruebaAutomaticaRestantes: { gt: 0 } },
      data: { pruebaAutomaticaRestantes: { decrement: 1 } },
    });
    if (descuento.count === 0) return null;

    await tx.application.update({ where: { id: applicationId }, data: { esDePrueba: true } });
    const { pruebaAutomaticaRestantes } = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pruebaAutomaticaRestantes: true },
    });
    return pruebaAutomaticaRestantes;
  });
}
