import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const total = await prisma.jobOffer.count({ where: { origen: "AUTOMATICO" } });
  const ultimaHora = await prisma.jobOffer.count({
    where: { origen: "AUTOMATICO", cacheadaEn: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  const recientes = await prisma.jobOffer.findMany({
    where: { origen: "AUTOMATICO" },
    orderBy: { cacheadaEn: "desc" },
    take: 5,
    select: { titulo: true, empresa: true, cacheadaEn: true },
  });
  console.log(JSON.stringify({ total, ultimaHora, recientes }, null, 2));
}

main().finally(() => prisma.$disconnect());
