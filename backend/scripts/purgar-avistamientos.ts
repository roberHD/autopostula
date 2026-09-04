import "dotenv/config";
import { prisma } from "../lib/prisma";

// Retención de avistamientos (docs/rediseno-filtrado-ofertas.md §9.3): a
// diferencia de las postulaciones reales, un avistamiento sin postulación no
// tiene por qué conservarse para siempre -- crece con cada escaneo de cada
// usuario, órdenes de magnitud más rápido que las postulaciones. Se purgan
// los que pasaron el TTL y nunca se convirtieron en una postulación real.
//
// No se corre automáticamente -- pensado para un cron manual/periódico
// (ej. semanal), mismo patrón que clasificar-titulos.ts.
// Uso: npx tsx scripts/purgar-avistamientos.ts

const DIAS_TTL = 90;

async function main() {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_TTL);

  // No se borra si tiene decisiones asociadas (banda gris/historial) aunque
  // nunca se haya postulado -- esas filas siguen siendo la etiqueta de
  // entrenamiento del perfil del usuario (§8), no solo un avistamiento suelto.
  const resultado = await prisma.jobOffer.deleteMany({
    where: {
      postulada: false,
      cacheadaEn: { lt: limite },
      decisiones: { none: {} },
    },
  });

  console.log(`Purgados ${resultado.count} avistamiento(s) sin postulación de más de ${DIAS_TTL} días.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
