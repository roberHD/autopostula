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
