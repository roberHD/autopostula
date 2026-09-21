import { prisma } from "./prisma";

// docs/rafagas-y-ponerse-al-dia.md §3.5: lo que muestra la tarjeta del Inicio
// es la última ráfaga que TERMINÓ -- una interrumpida no "puso al día" a nadie
// (mismo criterio que User.ultimaRafagaEn, ver schema.prisma). Se ordena por
// inicio porque las ráfagas corren de a una: la de inicio más reciente es la
// última, y (userId, inicio) ya tiene índice.
export async function resumenUltimaRafaga(userId: string) {
  return prisma.rafaga.findFirst({
    where: { userId, estado: "terminada" },
    orderBy: { inicio: "desc" },
    select: { postuladas: true, observadas: true, descartadas: true, gris: true, errores: true },
  });
}

// Mediana, no promedio: una sola ráfaga colgada hasta el seguro de 8 min por
// paso no debe correr la estimación de todas las demás.
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2);
}

// docs/rafagas-y-ponerse-al-dia.md §3.6: cuánto suele tardar "Ponerme al día
// ahora" -- la mediana de las últimas 5 ráfagas de ESA persona que terminaron
// (una interrumpida no dice cuánto tarda una ráfaga completa). null si todavía
// no hay ninguna: no se inventa una duración, y tampoco un número de ofertas.
export const RAFAGAS_PARA_ESTIMAR = 5;

export async function estimadoDuracionRafagaMs(userId: string): Promise<number | null> {
  const filas = await prisma.rafaga.findMany({
    where: { userId, estado: "terminada", duracionMs: { not: null } },
    orderBy: { inicio: "desc" },
    take: RAFAGAS_PARA_ESTIMAR,
    select: { duracionMs: true },
  });
  return mediana(filas.map((f) => f.duracionMs as number));
}
