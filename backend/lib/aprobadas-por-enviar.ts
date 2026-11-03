import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Las ofertas aprobadas que esperan enviarse (un «sí» en «Por decidir» o en el
 * panel del portal) y el portal en que están
 * (docs/aprobadas-y-portal-desconectado-2026-11-03.md).
 *
 * Error real del 2026-11-03: una cuenta gratis aprobó 24 ofertas en Trabajando
 * y después cambió a Laborum (el plan gratis usa un portal a la vez). Con
 * Trabajando desconectado, /api/extension/puede-postular decía que no a cada
 * una, la extensión las saltaba sin decir nada, y como el servidor le entrega
 * solo las 5 más recientes, las 5 eran siempre de Trabajando. «Por decidir» le
 * seguía mostrando ofertas de Trabajando y la dejaba aprobarlas.
 */

/** Cuánto se sigue intentando enviar una aprobada. Pasado eso, sigue siendo un «sí» para el perfil. */
export const DIAS_PARA_ENVIAR_APROBADA = 14;

/** Los portales que la cuenta tiene conectados, por su nombre ("Trabajando"). */
export async function portalesConectados(userId: string): Promise<string[]> {
  const cuentas = await prisma.platformAccount.findMany({
    where: { userId, activa: true },
    select: { platform: { select: { nombre: true } } },
  });
  return cuentas.map((c) => c.platform.nombre);
}

/**
 * Un «sí» que todavía se puede enviar: sin postulación, con enlace y portal (sin
 * eso no hay cómo), y decidido hace menos de DIAS_PARA_ENVIAR_APROBADA. Una fila
 * sin fecha (no debería haber) no se deja afuera: la extensión igual la cierra a
 * los 3 intentos fallidos. Con `portales`, solo los de esos portales.
 */
export function filtroAprobadasPorEnviar(
  userId: string,
  ahora: Date,
  portales?: readonly string[],
): Prisma.DecisionOfertaWhereInput {
  return {
    userId,
    fuente: { in: ["BANDA_GRIS", "PANEL_REVISION"] },
    veredicto: "SI",
    jobOfferId: null,
    url: { not: null },
    plataforma: portales ? { in: [...portales] } : { not: null },
    OR: [
      { decididoEn: null },
      { decididoEn: { gte: new Date(ahora.getTime() - DIAS_PARA_ENVIAR_APROBADA * 86_400_000) } },
    ],
  };
}

export type EsperaPorPortal = { portal: string; aprobadas: number; pendientes: number };

/**
 * Lo que espera en cada portal desconectado: aprobadas que no se van a enviar
 * mientras siga así, y tarjetas de «Por decidir» de ese portal. Solo los
 * portales con algo; vacío si no hay nada esperando.
 */
export async function esperandoEnPortalesDesconectados(
  userId: string,
  ahora = new Date(),
  conectados?: readonly string[],
): Promise<EsperaPorPortal[]> {
  const activos = conectados ?? (await portalesConectados(userId));
  const filas = await prisma.decisionOferta.findMany({
    where: {
      AND: [
        { userId, plataforma: { not: null, notIn: [...activos] } },
        {
          OR: [
            filtroAprobadasPorEnviar(userId, ahora),
            // Las mismas que cuenta el menú (lib/panel/listas.ts, contarPorDecidir).
            { fuente: "BANDA_GRIS", veredicto: "PENDIENTE", OR: [{ venceEn: null }, { venceEn: { gte: ahora } }] },
          ],
        },
      ],
    },
    select: { plataforma: true, veredicto: true },
  });

  const porPortal = new Map<string, EsperaPorPortal>();
  for (const f of filas) {
    if (!f.plataforma) continue;
    const espera = porPortal.get(f.plataforma) ?? { portal: f.plataforma, aprobadas: 0, pendientes: 0 };
    if (f.veredicto === "SI") espera.aprobadas++;
    else espera.pendientes++;
    porPortal.set(f.plataforma, espera);
  }
  return [...porPortal.values()].sort((a, b) => a.portal.localeCompare(b.portal));
}
