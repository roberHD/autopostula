import "dotenv/config";
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.jobPlatform.upsert({
    where: { nombre: "Computrabajo" },
    update: {},
    create: {
      nombre: "Computrabajo",
      urlBase: "https://www.computrabajo.cl",
      adapterVersion: "v1",
    },
  });

  console.log("Portales sembrados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
