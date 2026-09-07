import "dotenv/config";
import { prisma } from "../lib/prisma";

// ¿Vale la pena sumar un tercer portal?
//
// La hipótesis a probar es "no todas las empresas publican en todos los
// portales". Si los portales que ya tenemos muestran mayormente a las MISMAS
// empresas, un tercero traería duplicados; si alcanzan empleadores distintos,
// sí expande el alcance real.
//
// Se mide sobre JobOffer, que desde §9.3 es el corpus de avistamientos: todo
// lo que la extensión vio, se haya postulado o no.
//
// Uso: npx tsx scripts/solapamiento-portales.ts [--dias 90]

const DIAS_POR_DEFECTO = 90;

// Computrabajo (y otros) permiten publicar sin identificar a la empresa. Esos
// avisos traen un texto genérico, no un nombre -- si se contaran, TODOS
// colapsarían al mismo string y el solapamiento saldría altísimo por un
// artefacto. Se excluyen del cálculo y se reportan aparte.
const GENERICOS = [
  "importante empresa",
  "empresa confidencial",
  "confidencial",
  "empresa del sector",
  "importante empresa del sector",
  "empresa lider",
  "reconocida empresa",
  "prestigiosa empresa",
  "empresa en crecimiento",
  "sin especificar",
];

// Las razones sociales varían entre portales para la misma empresa
// ("PROA CHILE SPA" vs "Proa Chile"), así que hay que sacarles la forma
// jurídica antes de comparar. Mismo criterio de normalización que AP.n en
// extension/core.js: minúsculas, sin tildes.
const SUFIJOS = /\b(spa|s\.p\.a|sa|s\.a|ltda|limitada|eirl|e\.i\.r\.l|srl|s\.r\.l|cia|compania|y cia|inc|corp)\b\.?/g;

function normalizar(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:()]/g, " ")
    .replace(SUFIJOS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function esGenerico(nombreNorm: string): boolean {
  return !nombreNorm || nombreNorm.length < 3 || GENERICOS.some((g) => nombreNorm.includes(g));
}

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "—";
}

async function main() {
  const i = process.argv.indexOf("--dias");
  const dias = i !== -1 ? Number(process.argv[i + 1]) || DIAS_POR_DEFECTO : DIAS_POR_DEFECTO;
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const ofertas = await prisma.jobOffer.findMany({
    where: { cacheadaEn: { gte: desde } },
    select: { empresa: true, titulo: true, postulada: true, platform: { select: { nombre: true } } },
  });

  if (!ofertas.length) {
    console.log(`No hay avistamientos en los últimos ${dias} días. ¿Corrió la extensión?`);
    return;
  }

  // ── Agrupar empresas por portal ──
  const porPortal = new Map<string, Set<string>>();
  const ofertasPorPortal = new Map<string, number>();
  let genericas = 0;
  let sinEmpresa = 0;

  for (const o of ofertas) {
    const portal = o.platform.nombre;
    ofertasPorPortal.set(portal, (ofertasPorPortal.get(portal) ?? 0) + 1);
    if (!o.empresa) { sinEmpresa++; continue; }
    const norm = normalizar(o.empresa);
    if (esGenerico(norm)) { genericas++; continue; }
    if (!porPortal.has(portal)) porPortal.set(portal, new Set());
    porPortal.get(portal)!.add(norm);
  }

  const portales = [...porPortal.keys()].sort();

  console.log(`\n═══ SOLAPAMIENTO DE EMPRESAS ENTRE PORTALES · últimos ${dias} días ═══\n`);
  console.log(`Avistamientos totales: ${ofertas.length}`);
  console.log(`  sin nombre de empresa: ${sinEmpresa} (${pct(sinEmpresa, ofertas.length)})`);
  console.log(`  con nombre genérico:   ${genericas} (${pct(genericas, ofertas.length)})  ← excluidos del cálculo`);

  if (sinEmpresa + genericas > ofertas.length * 0.5) {
    console.log(`\n  ⚠️  Más de la mitad de los avisos no identifica empresa.`);
    console.log(`      El resultado de abajo se calcula sobre la otra mitad — tómalo como`);
    console.log(`      indicativo, no como medición firme.`);
  }

  console.log(`\n── Por portal ──`);
  for (const p of portales) {
    console.log(`  ${p.padEnd(16)} ${String(ofertasPorPortal.get(p) ?? 0).padStart(5)} avisos · ${String(porPortal.get(p)!.size).padStart(4)} empresas distintas`);
  }

  if (portales.length < 2) {
    console.log(`\nSolo hay un portal con datos. Escanea en los dos antes de medir.`);
    return;
  }

  // ── Solapamiento por pares ──
  console.log(`\n── Solapamiento ──\n`);
  for (let a = 0; a < portales.length; a++) {
    for (let b = a + 1; b < portales.length; b++) {
      const A = porPortal.get(portales[a])!;
      const B = porPortal.get(portales[b])!;
      const comunes = [...A].filter((e) => B.has(e));
      const union = new Set([...A, ...B]).size;
      const menor = Math.min(A.size, B.size);

      console.log(`  ${portales[a]} ↔ ${portales[b]}`);
      console.log(`     empresas en ambos:  ${comunes.length}`);
      console.log(`     Jaccard:            ${pct(comunes.length, union)}   (compartidas / total únicas)`);
      console.log(`     del portal chico:   ${pct(comunes.length, menor)}   ← el número que decide`);

      const soloA = [...A].filter((e) => !B.has(e)).slice(0, 5);
      const soloB = [...B].filter((e) => !A.has(e)).slice(0, 5);
      if (soloA.length) console.log(`     solo en ${portales[a]}: ${soloA.join(" · ")}`);
      if (soloB.length) console.log(`     solo en ${portales[b]}: ${soloB.join(" · ")}`);

      const cobertura = comunes.length / menor;
      console.log("");
      if (cobertura >= 0.6) {
        console.log(`     → SOLAPAMIENTO ALTO. Los portales muestran mayormente a las mismas`);
        console.log(`       empresas. Un tercero probablemente traiga duplicados: no vale la`);
        console.log(`       pena todavía.`);
      } else if (cobertura <= 0.35) {
        console.log(`     → SOLAPAMIENTO BAJO. Cada portal alcanza empleadores distintos.`);
        console.log(`       Tu hipótesis se sostiene: un tercero expande alcance real.`);
      } else {
        console.log(`     → ZONA GRIS. Ni claramente sí ni claramente no. Acumula más`);
        console.log(`       avistamientos y vuelve a correrlo, o decide por otra vía.`);
      }
      console.log("");
    }
  }

  // ── Dato de contexto: ¿se está agotando el cupo? ──
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const postulacionesMes = await prisma.application.groupBy({
    by: ["userId"],
    where: { enviadaEn: { gte: inicioMes } },
    _count: { _all: true },
  });

  if (postulacionesMes.length) {
    const conteos = postulacionesMes.map((p) => p._count._all).sort((a, b) => b - a);
    console.log(`── Contexto: postulaciones este mes ──`);
    console.log(`  usuarios con actividad: ${conteos.length}`);
    console.log(`  máximo de un usuario:   ${conteos[0]}   (tope free 20 · premium 80)`);
    console.log(`  mediana:                ${conteos[Math.floor(conteos.length / 2)]}`);
    console.log(`\n  Si nadie se acerca al tope, el cuello NO son las ofertas y un tercer`);
    console.log(`  portal rinde poco aunque el solapamiento sea bajo.`);
  }

  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
