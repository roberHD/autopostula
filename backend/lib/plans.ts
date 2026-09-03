import { prisma } from "@/lib/prisma";

// Números decididos para el lanzamiento del premium (2026-09-03): $3.990 CLP/mes,
// 80 postulaciones/mes (4x el free), portales ilimitados a la vez, búsqueda
// automática, perfil dinámico (calibración + seguir conversando con la IA de
// estilo), analítica avanzada, sin anuncios. El free no tiene fila propia --
// el resto del código lo trata como "sin Subscription" y usa sus propios
// defaults (ver checkAndLogAiUsage, obtenerEstadoPostulaciones, etc), pero acá
// sí se guarda una fila FREE explícita para poder asignarla a un Subscription
// real cuando alguien baje de premium a free (Stripe necesita un planId).
export const PLANES_BASE = [
  {
    tipo: "FREE" as const,
    nombre: "Free",
    precioMensual: 0,
    maxPlataformasActivas: 1,
    limitePostulacionesMes: 20,
    busquedaAutomatica: false,
    muestraAnuncios: true,
    guardaConversacionesIa: false,
    perfilDinamico: false,
    limiteLlamadasIaMes: 150,
    nivelAnaliticas: "BASICO" as const,
  },
  {
    tipo: "PREMIUM" as const,
    nombre: "Premium",
    precioMensual: 3990,
    maxPlataformasActivas: null,
    limitePostulacionesMes: 80,
    busquedaAutomatica: true,
    muestraAnuncios: false,
    guardaConversacionesIa: true,
    perfilDinamico: true,
    limiteLlamadasIaMes: 600,
    nivelAnaliticas: "AVANZADO" as const,
  },
];

// Idempotente y barato -- se puede llamar en cualquier request que necesite
// que los planes existan, igual que asegurarPlataformasBase(). Se identifica
// por `tipo` porque hoy solo hay un plan de cada tipo; el día que haya varios
// niveles premium esto pasa a necesitar un campo `slug` propio.
export async function asegurarPlanesBase() {
  const resultados = await Promise.all(
    PLANES_BASE.map(async (p) => {
      const existente = await prisma.plan.findFirst({ where: { tipo: p.tipo } });
      if (existente) {
        return prisma.plan.update({ where: { id: existente.id }, data: p });
      }
      return prisma.plan.create({ data: p });
    })
  );
  return resultados;
}
