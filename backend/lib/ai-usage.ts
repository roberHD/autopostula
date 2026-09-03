import { prisma } from "@/lib/prisma";

// Los tipos de conversacion_estilo tienen su propio balde (limiteMensajesConversacionMes)
// porque no tienen relacion con cuantas postulaciones se envian -- antes compartian
// el mismo contador que "responder_pregunta" y compania, y una sola conversacion
// larga en el onboarding dejaba a la persona sin cupo de IA para postular en todo el mes.
const TIPOS_CONVERSACION = new Set(["conversacion_estilo", "finalizar_conversacion_estilo"]);

/**
 * Revisa si el usuario puede hacer una llamada más de IA este mes, según su plan.
 * Si puede, registra el uso de una vez (para no tener que llamarlo dos veces).
 *
 * El conteo se hace por categoría (conversación vs. el resto de llamadas de IA),
 * no sobre el total de AiUsageLog del usuario -- cada categoría tiene su propio
 * límite y su propio contador, para que gastar el cupo de una no deje sin cupo
 * a la otra.
 *
 * Modo admin: los usuarios con rol ADMIN no tienen límite (pensado para cuentas de
 * prueba/desarrollo, nunca para usuarios normales). El rol no se expone en ningún
 * endpoint ni se puede setear desde el registro o la app -- solo a mano en la base
 * de datos. El uso se sigue registrando igual, para no perder las métricas.
 */
export async function checkAndLogAiUsage(userId: string, tipo: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rol: true },
  });

  if (user?.rol === "ADMIN") {
    await prisma.aiUsageLog.create({ data: { userId, tipo } });
    return { permitido: true, restantes: null, limite: null };
  }

  const esConversacion = TIPOS_CONVERSACION.has(tipo);

  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA" },
    include: { plan: true },
  });

  // Sin plan, trátalo como free bien restringido. El balde de conversación es
  // más chico porque son varios mensajes por sesión; el del resto es más
  // generoso porque una sola postulación puede disparar varias llamadas
  // (responder cada pregunta del formulario, analizar la oferta, etc).
  const limite = esConversacion
    ? subscripcion?.plan.limiteMensajesConversacionMes ?? 40
    : subscripcion?.plan.limiteLlamadasIaMes ?? 150;

  if (limite !== null) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const tiposDeLaCategoria = esConversacion
      ? Array.from(TIPOS_CONVERSACION)
      : undefined; // el resto de categorías junta todos los tipos que no son conversación

    const usadas = await prisma.aiUsageLog.count({
      where: {
        userId,
        creadoEn: { gte: inicioMes },
        tipo: tiposDeLaCategoria
          ? { in: tiposDeLaCategoria }
          : { notIn: Array.from(TIPOS_CONVERSACION) },
      },
    });

    if (usadas >= limite) {
      return { permitido: false, restantes: 0, limite };
    }
  }

  await prisma.aiUsageLog.create({ data: { userId, tipo } });

  return { permitido: true, restantes: null, limite };
}
