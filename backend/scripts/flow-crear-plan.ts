import "dotenv/config";
import { flow } from "../lib/flow";
import { FLOW_PLAN_ID } from "../lib/flow-plan";

// Corre esto UNA sola vez (npx tsx scripts/flow-crear-plan.ts), después de
// configurar FLOW_API_KEY y FLOW_SECRET_KEY en .env. Si ya existe, Flow
// debería devolver un error de negocio -- no es idempotente como los seed de
// Prisma, así que no se llama automáticamente desde la app.
async function main() {
  const origin = process.env.NEXTAUTH_URL || "http://localhost:3000";
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
