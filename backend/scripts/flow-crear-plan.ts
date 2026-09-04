import "dotenv/config";
import { flow } from "../lib/flow";
import { FLOW_PLAN_ID } from "../lib/flow-plan";
import { getBaseUrl } from "../lib/base-url";

// Corre esto UNA sola vez (npx tsx scripts/flow-crear-plan.ts), después de
// configurar FLOW_API_KEY y FLOW_SECRET_KEY en .env. Si ya existe, Flow
// debería devolver un error de negocio -- no es idempotente como los seed de
// Prisma, así que no se llama automáticamente desde la app.
//
// Usa getBaseUrl() (no NEXTAUTH_URL pelado) porque si solo seteaste AUTH_URL
// en el entorno donde corres esto, un origin mal resuelto quedaría grabado
// para siempre en el urlCallback del plan -- Flow jamás podría avisar los
// cobros y las suscripciones se verían impagas sin que nadie se entere.
async function main() {
  const origin = getBaseUrl();
  const plan = await flow.crearPlan({
    planId: FLOW_PLAN_ID,
    name: "AutoPostula Premium",
    amount: 3990,
    interval: 3, // mensual
    urlCallback: `${origin}/api/flow/webhook-cobro`,
  });
  console.log("Plan creado:", plan);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
