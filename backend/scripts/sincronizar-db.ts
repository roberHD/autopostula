/**
 * Repara la base local cuando el historial de _prisma_migrations quedó desfasado
 * respecto al esquema real (típico si en algún momento se usó "prisma db push"
 * en vez de "migrate dev"): "migrate deploy" falla intentando recrear columnas
 * que ya existen, y la app revienta con P2022 en las que sí faltan.
 *
 * Aplica el diff real DB → schema.prisma y luego marca todas las migraciones del
 * repo como aplicadas, dejando el historial coherente para futuros deploys.
 *
 *   npx tsx scripts/sincronizar-db.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const RAIZ = join(__dirname, "..");
const DIR_MIGRACIONES = join(RAIZ, "lib/migrations");

function npx(...args: string[]) {
  execFileSync("npx", args, { cwd: RAIZ, stdio: "inherit", shell: true });
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("Falta DATABASE_URL_UNPOOLED en .env");

  const sql = readFileSync(join(RAIZ, "scripts/sincronizar-esquema.sql"), "utf8");
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  console.log("→ Aplicando sincronizar-esquema.sql…");
  await cliente.query(sql);
  await cliente.end();
  console.log("✓ Esquema al día\n");

  const migraciones = readdirSync(DIR_MIGRACIONES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const nombre of migraciones) {
    console.log(`→ Marcando ${nombre} como aplicada`);
    npx("prisma", "migrate", "resolve", "--applied", nombre);
  }

  console.log("\n→ Estado final:");
  npx("prisma", "migrate", "status");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
