import "dotenv/config";
import { prisma } from "../lib/prisma";

// Repara avistamientos que quedaron con datos mal extraídos por un bug del
// adaptador (caso concreto: getEmpresaDeTarjeta de Laborum guardaba la fecha
// de publicación como nombre de empresa -- corregido en ef6d639).
//
// Hace falta un script aparte porque /api/extension/avistamientos hace
// `upsert` con `update: {}`: si la fila ya existe no se le toca nada, ni
// siquiera para corregirla. Esa decisión es correcta para no pisar
// `postulada: true` con `false`, pero implica que un bug de extracción queda
// grabado para siempre y reescanear no lo repara.
//
// La estrategia es BORRAR las filas contaminadas, no parcharlas: son
// avistamientos puros (nadie postuló), así que el próximo escaneo las vuelve
// a crear con el adaptador ya arreglado. Parchearlas a mano solo adivinaría.
//
// Uso:  npx tsx scripts/reparar-avistamientos.ts            (solo reporta)
//       npx tsx scripts/reparar-avistamientos.ts --aplicar  (borra de verdad)

// Textos que delatan que el campo `empresa` en realidad tiene otra cosa.
// Ampliar acá si aparece otro patrón de basura de algún portal.
const PATRONES_BASURA = ["ublicado", "ctualizado", "hace ", " ayer", " hoy"];

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const sospechosas = await prisma.jobOffer.findMany({
    where: { OR: PATRONES_BASURA.map((p) => ({ empresa: { contains: p, mode: "insensitive" as const } })) },
    select: {
      id: true,
      empresa: true,
      titulo: true,
      postulada: true,
      platform: { select: { nombre: true } },
      _count: { select: { applications: true, decisiones: true } },
    },
  });

  if (!sospechosas.length) {
    console.log("No hay avistamientos con datos contaminados. Nada que hacer.");
    return;
  }

  // Nunca se borra algo que tenga una postulación o una decisión colgando:
  // esas filas son historial real de una persona, no corpus desechable.
  const borrables = sospechosas.filter(
    (o) => !o.postulada && o._count.applications === 0 && o._count.decisiones === 0
  );
  const intocables = sospechosas.filter((o) => !borrables.includes(o));

  const porPortal = new Map<string, number>();
  for (const o of borrables) porPortal.set(o.platform.nombre, (porPortal.get(o.platform.nombre) ?? 0) + 1);

  console.log(`Filas con "empresa" contaminada: ${sospechosas.length}`);
  console.log(`  borrables (avistamiento puro):  ${borrables.length}`);
  for (const [p, n] of porPortal) console.log(`      ${p}: ${n}`);
  console.log(`  intocables (tienen postulación o decisión asociada): ${intocables.length}`);

  console.log("\nMuestra de lo que se borraría:");
  for (const o of borrables.slice(0, 5)) {
    console.log(`   ${o.platform.nombre.padEnd(12)} | empresa="${(o.empresa ?? "").slice(0, 34)}" | ${o.titulo.slice(0, 38)}`);
  }

  if (!aplicar) {
    console.log(`\n(simulación — no se borró nada)`);
    console.log(`Para aplicar:  npx tsx scripts/reparar-avistamientos.ts --aplicar`);
    console.log(`Después hay que volver a escanear el portal para que se recreen bien.`);
    return;
  }

  const { count } = await prisma.jobOffer.deleteMany({ where: { id: { in: borrables.map((o) => o.id) } } });
  console.log(`\nBorradas ${count} filas.`);
  console.log(`Ahora reescanea el portal en modo solo observar para que se recreen con el adaptador arreglado.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
