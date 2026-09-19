import "dotenv/config";
import { prisma } from "../lib/prisma";

// docs/revision-2026-09-16.md §8.1: extension/adapters/trabajando.js nunca
// hacía clic en el botón real de confirmación del sitio ("Confirma tu
// postulación al cargo" -> #botonPostularModalConfirmacion) -- asumía éxito
// apenas se hacía clic en el botón del formulario, y en trabajando.cl la
// postulación se quedaba sin confirmar mientras AutoPostula ya la registraba
// como ENVIADO. Confirmado en producción: trabajando.cl/mis-postulaciones
// decía "Aún no tienes postulaciones" con la cuenta del dueño, mientras
// AutoPostula mostraba 2 como enviadas. El bug lleva desde que se agregó el
// adaptador (commit 15ace8b) -- toda postulación ENVIADO de Trabajando de
// antes de este fix nace de ese mismo código roto, así que se tratan todas
// igual, no solo las dos que se verificaron a mano.
//
// Se marcan como INCOMPLETA (no se borran: son historial real de intentos de
// postulación) con una nota explicando qué pasó, para que la persona sepa
// que tiene que revisarlas y, si le interesa, postular de nuevo a mano.
//
// Uso:  npx tsx scripts/marcar-trabajando-no-confirmado.ts            (solo reporta)
//       npx tsx scripts/marcar-trabajando-no-confirmado.ts --aplicar  (aplica el cambio)

const NOTA =
  "AutoPostula la registró como enviada, pero el sitio nunca mostró la confirmación final " +
  '("Confirma tu postulación al cargo") -- un bug del adaptador (corregido) hacía que se ' +
  "diera por enviada sin completar ese paso. Es probable que la empresa nunca la haya recibido. " +
  "Revisa la oferta y, si te interesa, postula de nuevo a mano.";

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const afectadas = await prisma.application.findMany({
    where: { estadoActual: "ENVIADO", jobOffer: { platform: { nombre: "Trabajando" } } },
    select: {
      id: true,
      enviadaEn: true,
      jobOffer: { select: { titulo: true, empresa: true } },
      user: { select: { email: true } },
    },
    orderBy: { enviadaEn: "asc" },
  });

  if (!afectadas.length) {
    console.log("No hay postulaciones ENVIADO de Trabajando. Nada que hacer.");
    return;
  }

  console.log(`Postulaciones de Trabajando marcadas ENVIADO: ${afectadas.length}`);
  for (const a of afectadas) {
    console.log(
      `   ${a.enviadaEn.toISOString().slice(0, 10)} | ${a.user.email.padEnd(28)} | ${(a.jobOffer.empresa ?? "?").slice(0, 24).padEnd(24)} | ${a.jobOffer.titulo.slice(0, 40)}`
    );
  }

  if (!aplicar) {
    console.log(`\n(simulación — no se cambió nada)`);
    console.log(`Para aplicar:  npx tsx scripts/marcar-trabajando-no-confirmado.ts --aplicar`);
    return;
  }

  const { count } = await prisma.application.updateMany({
    where: { id: { in: afectadas.map((a) => a.id) } },
    data: { estadoActual: "INCOMPLETA", notaAtencion: NOTA },
  });
  console.log(`\nMarcadas ${count} postulaciones como INCOMPLETA.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
