import "dotenv/config";
import { prisma } from "./lib/prisma";
import { asegurarPlataformasBase } from "./lib/platforms";
import { asegurarPlanesBase } from "./lib/plans";

// Ya no es un paso obligatorio — /api/platform-accounts se auto-repara solo
// con asegurarPlataformasBase() y asegurarPlanesBase(). Este script queda como
// atajo manual, por si alguna vez quieres sembrarlos sin pasar por la API.
async function main() {
  await asegurarPlataformasBase();
  console.log("Portales sembrados.");
  await asegurarPlanesBase();
  console.log("Planes sembrados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
