import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";
import { inicioDelMesChile } from "@/lib/tiempo";

// Se siguen registrando en AiUsageLog para métricas, pero no cuentan para el
// límite de "resto de llamadas de IA" de acá -- tienen su propio control (tope
// duro de mensajes en fase 1, beneficio perfilDinamico en fase 2). Sin este
// filtro, loguearlas igual las metería de vuelta al mismo balde compartido que
// se separó a propósito.
// "conversacion_estilo_inicio" es el saludo con el que la IA abre una
// conversación vacía: se separó para que no cuente como un minuto de la
// persona en las monedas (lib/monedas.ts), y sigue fuera de este cupo.
const TIPOS_CONVERSACION = new Set(["conversacion_estilo", "conversacion_estilo_inicio", "finalizar_conversacion_estilo"]);

/**
 * Revisa si el usuario puede hacer una llamada más de IA este mes, según su plan.
 * Si puede, registra el uso de una vez (para no tener que llamarlo dos veces).
 *
 * La conversación con la IA de estilo (conversacion_estilo/finalizar_conversacion_estilo)
 * NO pasa por acá -- se controla con un tope duro de mensajes en la fase 1 (armar el
 * perfil por primera vez, gratis para todos) y con el beneficio perfilDinamico del plan
 * para la fase 2 (seguir profundizando un perfil ya armado, premium). Ver
 * app/api/style/onboarding/mensaje/route.ts. El límite acá es para el resto de llamadas
 * de IA (responder preguntas de postulaciones, analizar ofertas, etc), que sí tiene
 * sentido limitar por mes.
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

  const subscripcion = await obtenerSubscripcionVigente(userId);

  // Sin plan, trátalo como free bien restringido. El default subió de 20 a 150
  // porque una sola postulación ya dispara varias llamadas (responder cada
  // pregunta del formulario, analizar la oferta), no una sola.
  const limite = subscripcion?.plan.limiteLlamadasIaMes ?? 150;

  if (limite !== null) {
    // docs/revision-2026-09-28.md §15: el mes de Chile, no el del servidor (UTC).
    const inicioMes = inicioDelMesChile();

    const usadas = await prisma.aiUsageLog.count({
      where: {
        userId,
        creadoEn: { gte: inicioMes },
        tipo: { notIn: Array.from(TIPOS_CONVERSACION) },
      },
    });

    if (usadas >= limite) {
      return { permitido: false, restantes: 0, limite };
    }
  }

  await prisma.aiUsageLog.create({ data: { userId, tipo } });

  return { permitido: true, restantes: null, limite };
}
