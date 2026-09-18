import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  DIAS_RETENCION_AVISTAMIENTOS,
  DIAS_RETENCION_RAFAGAS,
  purgarAvistamientos,
  purgarRafagas,
} from "../lib/purgar-avistamientos";

// Corrida manual del mismo purgado que hace el cron diario
// (app/api/cron/purgar-avistamientos, programado en vercel.json). La lógica
// vive en lib/purgar-avistamientos.ts para que las dos vías no diverjan.
// Uso: npx tsx scripts/purgar-avistamientos.ts

async function main() {
  const count = await purgarAvistamientos();
  console.log(`Purgados ${count} avistamiento(s) sin postulación de más de ${DIAS_RETENCION_AVISTAMIENTOS} días.`);
  const rafagas = await purgarRafagas();
  console.log(`Purgadas ${rafagas} ráfaga(s) de más de ${DIAS_RETENCION_RAFAGAS} días.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
