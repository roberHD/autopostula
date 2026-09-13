import { prisma } from "./prisma";

// Retención de avistamientos (docs/rediseno-filtrado-ofertas.md §9.3). A
// diferencia de las postulaciones, un avistamiento suelto no tiene por qué
// conservarse para siempre: crece con cada escaneo de cada usuario, órdenes
// de magnitud más rápido que las postulaciones.
//
// Esto es además una promesa pública -- la política de privacidad (§2.5 y §7)
// dice que se eliminan a los 90 días. Si se cambia el plazo acá, hay que
// cambiarlo allá en el mismo commit.
export const DIAS_RETENCION_AVISTAMIENTOS = 90;

export async function purgarAvistamientos(): Promise<number> {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_RETENCION_AVISTAMIENTOS);

  const { count } = await prisma.jobOffer.deleteMany({
    where: {
      postulada: false,
      cacheadaEn: { lt: limite },
      // Una decisión (banda gris, triaje) es la etiqueta de entrenamiento del
      // perfil de alguien, no un avistamiento suelto: no se toca.
      decisiones: { none: {} },
      // Redundante con `postulada: false` mientras ese flag esté bien puesto,
      // pero Application -> JobOffer no tiene onDelete: una sola fila mal
      // marcada haría fallar el deleteMany entero, no solo esa oferta.
      applications: { none: {} },
    },
  });

  return count;
}
