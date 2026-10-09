/**
 * El banco de casos (docs/revision-scorer-2026-09-30.md §6): el scorer contra lo
 * que decidió cada persona, en los tres grupos: "Por decidir", lo que iba a
 * postular sola y se revisó en el panel del portal, y los descartes
 * (docs/panel-de-revision-en-el-portal.md §9.3). Solo lectura y sin IA: no
 * escribe nada en la base.
 *
 *   npx tsx scripts/banco-de-casos.ts                      todas las cuentas
 *   npx tsx scripts/banco-de-casos.ts correo@ejemplo.com   una cuenta, y además vuelve a
 *                                                          correr el scorer de hoy sobre lo
 *                                                          que ya decidió (§6.2)
 *   ... --dias=30                                          solo lo de los últimos 30 días
 *
 * Usa la DATABASE_URL del .env (o la que se le pase delante). Se corre desde
 * backend/: el scorer se carga de ../extension/core.js, el mismo que corre en
 * Chrome. Para probar un cambio al scorer: se cambia core.js y se vuelve a
 * correr esto con un correo; "Empeoran" dice qué decisiones ya tomadas
 * quedarían peor.
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  analizarBanco,
  claveDeRazon,
  resumirReCorrida,
  type CasoParaReCorrer,
  type DecisionDelBanco,
  type DecisionDeTeSirve,
  type DescarteDelBanco,
  type InformeBanco,
} from "../lib/banco-de-casos";
import { calcularUmbralPostular, DIAS_DE_DECISIONES, UMBRAL_POSTULAR_POR_DEFECTO } from "../lib/calibracion-umbral";
import { cargarScorerDeLaExtension } from "../lib/scorer-extension";
import { perfilParaElScorer } from "../lib/perfil-scorer";
import { AMPLITUD_POR_DEFECTO, esAmplitud } from "../lib/amplitud";
import { formatearRazon } from "../lib/formatear-razon";

const args = process.argv.slice(2);
const correo = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase() || null;
const dias = Number(args.find((a) => a.startsWith("--dias="))?.slice("--dias=".length)) || 90;
const desde = new Date(Date.now() - dias * 86_400_000);

const pct = (a: number, total: number) => (total ? `${Math.round((a / total) * 100)}%` : "-");
const num = (n: number | null, decimales = 1) => (n == null ? "-" : n.toFixed(decimales).replace(".", ","));
const col = (v: unknown, ancho: number) => String(v).padStart(ancho);
const corto = (t: string, max = 60) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

function primeraRazon(razones: unknown): string {
  const r = Array.isArray(razones) ? razones[0] : null;
  return r ? formatearRazon(r) : "";
}

function imprimirInforme(informe: InformeBanco) {
  const g = informe.gris;
  console.log("\n── Por decidir: lo que dijo la persona contra el puntaje ──");
  console.log(`  ${g.conPuntaje} decisiones con puntaje${g.sinPuntaje ? ` (${g.sinPuntaje} sin puntaje: perfil sin compilar o "No era así")` : ""}`);
  if (!g.conPuntaje) return;
  console.log(`  Puntaje promedio de los sí: ${num(g.promedioSi)} · de los no: ${num(g.promedioNo)}`);
  console.log(`  Separación: ${num(g.separacion, 2)}  (0,5 = el puntaje no separa los sí de los no; 1 = los separa perfecto)`);

  if (g.porPuntaje.length) {
    console.log("\n  Las que dejó en duda el puntaje:");
    console.log("    tramo     sí    no   % sí");
    for (const t of g.porPuntaje) {
      console.log(`    ${`${t.desde}-${t.hasta}`.padEnd(7)}${col(t.si, 5)}${col(t.no, 6)}${col(pct(t.si, t.si + t.no), 7)}`);
    }
  }
  if (g.porTope.length) {
    console.log("\n  Las que dejó en duda un tope (el puntaje no importó):");
    for (const t of g.porTope) {
      console.log(`    ${t.razon.padEnd(24)} sí ${col(t.si, 4)}   no ${col(t.no, 4)}`);
    }
  }
  if (g.noAltos.length) {
    console.log('\n  Los "no" con más puntaje (casi se postulan solos):');
    for (const d of g.noAltos) console.log(`    ${col(d.scoreLocal, 3)}  ${corto(d.titulo)}${d.empresa ? " · " + d.empresa : ""} — ${primeraRazon(d.razones)}`);
  }
  if (g.siBajos.length) {
    console.log('\n  Los "sí" con menos puntaje (casi se descartan sin preguntar):');
    for (const d of g.siBajos) console.log(`    ${col(d.scoreLocal, 3)}  ${corto(d.titulo)}${d.empresa ? " · " + d.empresa : ""} — ${primeraRazon(d.razones)}`);
  }

  const ts = informe.teSirve;
  console.log("\n── Te sirve: lo que la extensión iba a postular sola, revisado en el panel del portal ──");
  if (!ts.revisadas) {
    console.log(`  Todavía no hay${ts.conPesoReducido ? ` (${ts.conPesoReducido} de tandas en que se marcó casi todo: no cuentan)` : ""}.`);
  } else {
    console.log(`  ${ts.revisadas} revisadas: ${ts.dejadas} las dejó marcadas, ${ts.quitadas} las quitó (${pct(ts.quitadas, ts.revisadas)})`);
    console.log("  Ojo: dejar una marcada puede ser no haberla mirado; quitarla es una decisión.");
    if (ts.conPesoReducido) console.log(`  Aparte, ${ts.conPesoReducido} de tandas en que se marcó casi todo (no cuentan).`);
    console.log("    tramo   dejó  quitó   % quitó");
    for (const t of ts.porPuntaje) {
      console.log(`    ${`${t.desde}-${t.hasta}`.padEnd(7)}${col(t.si, 5)}${col(t.no, 7)}${col(pct(t.no, t.si + t.no), 9)}`);
    }
    if (ts.quitadasAltas.length) {
      console.log("\n  Las que quitó con más puntaje (se habrían enviado igual con un corte más alto):");
      for (const d of ts.quitadasAltas) console.log(`    ${col(d.scoreLocal, 3)}  ${corto(d.titulo)}${d.empresa ? " · " + d.empresa : ""} — ${primeraRazon(d.razones)}`);
    }
  }

  const ds = informe.descartes;
  console.log("\n── Descartes ──");
  console.log(`  ${ds.total} descartes, ${ds.corregidos} corregidos (${pct(ds.corregidos, ds.total)})`);
  if (ds.rescatadosEnPanel) console.log(`  En el panel del portal se rescataron ${ds.rescatadosEnPanel} que la extensión había descartado.`);
  if (ds.porRazon.length) {
    console.log("    razón                     total  corregidos");
    for (const r of ds.porRazon) console.log(`    ${r.razon.padEnd(24)}${col(r.total, 7)}${col(r.corregidos, 12)}`);
  }
  if (ds.ejemplosCorregidos.length) {
    console.log('\n  Los que la persona corrigió (el scorer los descartó y sí le servían):');
    for (const d of ds.ejemplosCorregidos) {
      console.log(`    ${col(d.scoreLocal ?? "-", 3)}  ${corto(d.titulo)}${d.empresa ? " · " + d.empresa : ""} — ${d.razon ? formatearRazon(d.razon) : ""}`);
    }
  }
}

type FilaDecision = DecisionDelBanco & { userId: string; entradaScorer: unknown; decididoEn: Date | null };
type FilaTeSirve = DecisionDeTeSirve & { userId: string; entradaScorer: unknown; decididoEn: Date | null };
type FilaDescarte = DescarteDelBanco & { userId: string; entradaScorer: unknown };

async function leer(userId: string | null) {
  const decisiones = await prisma.decisionOferta.findMany({
    where: {
      ...(userId ? { userId } : {}),
      fuente: "BANDA_GRIS",
      veredicto: { in: ["SI", "NO"] },
      decididoEn: { gte: desde },
    },
    // La entrada siempre: sin ella no se sabe cuáles usa la calibración.
    select: {
      id: true, userId: true, tituloCrudo: true, empresa: true, scoreLocal: true,
      veredicto: true, razones: true, entradaScorer: true, decididoEn: true,
    },
  });
  // El tercer grupo: lo que la extensión iba a postular sola, revisado en el
  // panel del portal (sí = lo dejó marcado, no = lo quitó).
  const teSirve = await prisma.decisionOferta.findMany({
    where: {
      ...(userId ? { userId } : {}),
      fuente: "PANEL_REVISION",
      bandaMotor: "postular",
      veredicto: { in: ["SI", "NO"] },
      decididoEn: { gte: desde },
    },
    select: {
      id: true, userId: true, tituloCrudo: true, empresa: true, scoreLocal: true,
      veredicto: true, razones: true, entradaScorer: true, decididoEn: true, pesoReducido: true,
    },
  });
  // Descartes rescatados en el panel: el descarte queda corregido igual que con
  // "No era así", y además hay un "sí" del panel.
  const rescatadosEnPanel = await prisma.decisionOferta.count({
    where: {
      ...(userId ? { userId } : {}),
      fuente: "PANEL_REVISION",
      bandaMotor: "descartar",
      veredicto: "SI",
      decididoEn: { gte: desde },
    },
  });
  const descartes = await prisma.descarte.findMany({
    where: { ...(userId ? { userId } : {}), vistoEn: { gte: desde } },
    select: {
      id: true, userId: true, titulo: true, empresa: true, razon: true, scoreLocal: true,
      corregidoEn: true, entradaScorer: !!userId,
    },
  });
  return {
    decisiones: decisiones.map(
      (d): FilaDecision => ({
        id: d.id, userId: d.userId, titulo: d.tituloCrudo, empresa: d.empresa, scoreLocal: d.scoreLocal,
        veredicto: d.veredicto as "SI" | "NO", razones: d.razones, entradaScorer: d.entradaScorer ?? null,
        decididoEn: d.decididoEn,
      })
    ),
    teSirve: teSirve.map(
      (d): FilaTeSirve => ({
        id: d.id, userId: d.userId, titulo: d.tituloCrudo, empresa: d.empresa, scoreLocal: d.scoreLocal,
        veredicto: d.veredicto as "SI" | "NO", razones: d.razones, entradaScorer: d.entradaScorer ?? null,
        decididoEn: d.decididoEn, pesoReducido: d.pesoReducido,
      })
    ),
    rescatadosEnPanel,
    descartes: descartes.map(
      (d): FilaDescarte => ({
        id: d.id, userId: d.userId, titulo: d.titulo, empresa: d.empresa, razon: d.razon, scoreLocal: d.scoreLocal,
        corregido: !!d.corregidoEn, entradaScorer: d.entradaScorer ?? null,
      })
    ),
  };
}

// La calibración de verdad (/api/extension/perfil) usa solo las decisiones de
// los últimos 90 días que evaluó el scorer nuevo (las que traen entradaScorer):
// las de "Por decidir" y las de «te sirve» del panel, sin las de peso reducido.
function calibracionComoLaDeVerdad(decisiones: FilaDecision[], teSirve: FilaTeSirve[]) {
  const limite = Date.now() - DIAS_DE_DECISIONES * 86_400_000;
  const vale = (d: { entradaScorer: unknown; decididoEn: Date | null }) => d.entradaScorer != null && !!d.decididoEn && d.decididoEn.getTime() >= limite;
  return calcularUmbralPostular([...decisiones.filter(vale), ...teSirve.filter((d) => !d.pesoReducido && vale(d))]);
}

async function todasLasCuentas() {
  const { decisiones, teSirve, rescatadosEnPanel, descartes } = await leer(null);
  console.log(`Banco de casos — todas las cuentas — últimos ${dias} días`);
  imprimirInforme(analizarBanco(decisiones, descartes, { teSirve, rescatadosEnPanel }));

  // Por cuenta: la separación y el umbral se miran de a una, porque lo que
  // es relevante para una persona no lo es para otra (§7).
  const porCuenta = new Map<string, { gris: FilaDecision[]; teSirve: FilaTeSirve[] }>();
  const deLaCuenta = (id: string) => porCuenta.get(id) ?? porCuenta.set(id, { gris: [], teSirve: [] }).get(id)!;
  for (const d of decisiones) deLaCuenta(d.userId).gris.push(d);
  for (const d of teSirve) deLaCuenta(d.userId).teSirve.push(d);
  const total = (c: { gris: FilaDecision[]; teSirve: FilaTeSirve[] }) => c.gris.length + c.teSirve.length;
  const cuentas = [...porCuenta.entries()].filter(([, c]) => total(c) >= 10);
  if (!cuentas.length) return;
  const usuarios = await prisma.user.findMany({ where: { id: { in: cuentas.map(([id]) => id) } }, select: { id: true, email: true } });
  const correoDe = new Map(usuarios.map((u) => [u.id, u.email]));
  console.log("\n── Por cuenta (las con 10 decisiones o más) ──");
  console.log("    por decidir  separación  te sirve (quitó)  corte sugerido   cuenta");
  for (const [id, c] of cuentas.sort((a, b) => total(b[1]) - total(a[1]))) {
    const informe = analizarBanco(c.gris, [], { teSirve: c.teSirve });
    const { umbral } = calibracionComoLaDeVerdad(c.gris, c.teSirve);
    const ts = informe.teSirve;
    console.log(
      `    ${col(c.gris.length, 11)}${col(num(informe.gris.separacion, 2), 12)}${col(ts.revisadas ? `${ts.revisadas} (${pct(ts.quitadas, ts.revisadas)})` : "-", 18)}` +
        `${col(umbral ?? UMBRAL_POSTULAR_POR_DEFECTO, 16)}   ${correoDe.get(id) ?? id}`
    );
  }
}

async function unaCuenta(email: string) {
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (!user) {
    console.log(`No hay ninguna cuenta con el correo ${email}.`);
    return;
  }
  const { decisiones, teSirve, rescatadosEnPanel, descartes } = await leer(user.id);
  console.log(`Banco de casos — ${user.email} — últimos ${dias} días`);
  imprimirInforme(analizarBanco(decisiones, descartes, { teSirve, rescatadosEnPanel }));

  const filtros = await prisma.searchPreferences.findUnique({ where: { userId: user.id } });
  const amplitud = esAmplitud(filtros?.amplitud) ? filtros.amplitud : AMPLITUD_POR_DEFECTO;

  console.log("\n── Umbral para postular sola (§7) ──");
  const calibracion = calibracionComoLaDeVerdad(decisiones, teSirve);
  console.log(`  Decisiones que sirven para calibrar (últimos ${DIAS_DE_DECISIONES} días, scorer nuevo, sin topes): ${calibracion.decisiones}`);
  const acuerdo = `${calibracion.enTramo} decisiones desde ahí, ${Math.round((calibracion.acuerdo ?? 0) * 100)}% sí`;
  console.log(
    calibracion.umbral != null && calibracion.umbral > UMBRAL_POSTULAR_POR_DEFECTO
      ? `  Con ellas, el corte subiría a ${calibracion.umbral}: quitó varias de las que iba a enviar con menos puntaje (${acuerdo})`
      : calibracion.umbral != null
        ? `  Con ellas, el corte bajaría a ${calibracion.umbral} (${acuerdo})`
        : calibracion.noSepara
          ? `  Con ellas, el corte se queda en ${UMBRAL_POSTULAR_POR_DEFECTO}: quita mucho de lo que iba a enviar, pero en todos los puntajes (subirlo no lo arregla; el problema es lo que mide)`
          : `  Con ellas, el corte se queda en ${UMBRAL_POSTULAR_POR_DEFECTO}`
  );
  if (!filtros?.calibrarUmbral) console.log("  La cuenta tiene el ajuste apagado (Filtros de búsqueda).");
  else if (amplitud === "abierto") console.log('  La cuenta busca "cualquier trabajo": ahí el ajuste no se aplica.');
  else console.log(`  Guardado en la cuenta: ${filtros.umbralPostularCalibrado ?? `ninguno (usa ${UMBRAL_POSTULAR_POR_DEFECTO})`}${filtros.umbralCalibradoEn ? `, calculado el ${filtros.umbralCalibradoEn.toLocaleDateString("es-CL")}` : ""}`);

  // §6.2: el scorer de hoy (el core.js que hay en el disco) con el perfil de
  // hoy, sobre las ofertas que la persona ya decidió.
  console.log("\n── El scorer de hoy sobre lo ya decidido (§6.2) ──");
  const compilado = (filtros?.perfilCompilado as Record<string, unknown> | null) || null;
  if (!filtros || !compilado) {
    console.log("  La cuenta no tiene perfil compilado: no hay con qué volver a correrlo.");
    return;
  }
  if (!filtros.usarScorerLocal) console.log("  Ojo: la cuenta no tiene el scorer local activado.");
  if (filtros.perfilDesactualizado) console.log("  Ojo: el perfil está marcado como desactualizado (la extensión manda todo a Por decidir).");

  const [objetivos, cv] = await Promise.all([
    user.objetivoConfirmado
      ? prisma.objetivoLaboral.findMany({ where: { userId: user.id }, select: { ciuo: true, etiqueta: true } })
      : Promise.resolve([]),
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
  ]);
  const umbral = filtros.calibrarUmbral && amplitud !== "abierto" ? filtros.umbralPostularCalibrado : null;
  const perfil = await perfilParaElScorer(compilado, { objetivos, amplitud, cv: cv || {}, umbralPostular: umbral });
  const puntuar = cargarScorerDeLaExtension();

  const casos: CasoParaReCorrer[] = [];
  let mismaVersion = 0;
  const reCorrer = (entrada: unknown, base: Omit<CasoParaReCorrer, "ahora" | "scoreAhora">) => {
    if (!entrada || typeof entrada !== "object") return;
    const e = entrada as { titulo?: string; empresa?: string | null; ubicacion?: string | null; cuerpo?: string | null; versionPerfil?: number | null };
    if (!e.titulo) return;
    if (e.versionPerfil === filtros.versionPerfil) mismaVersion++;
    const r = puntuar({ titulo: e.titulo, empresa: e.empresa, ubicacion: e.ubicacion, cuerpo: e.cuerpo }, perfil);
    casos.push({ ...base, ahora: r.banda, scoreAhora: r.score });
  };
  for (const d of decisiones) {
    reCorrer(d.entradaScorer, { origen: "por_decidir", veredicto: d.veredicto, titulo: d.titulo, antes: "gris", scoreAntes: d.scoreLocal });
  }
  for (const d of teSirve) {
    reCorrer(d.entradaScorer, { origen: "te_sirve", veredicto: d.veredicto, titulo: d.titulo, antes: "postular", scoreAntes: d.scoreLocal });
  }
  for (const d of descartes) {
    // Un duplicado no lo descartó el scorer.
    if (claveDeRazon(d.razon) === "duplicado") continue;
    reCorrer(d.entradaScorer, {
      origen: d.corregido ? "no_era_asi" : "descarte",
      veredicto: d.corregido ? "SI" : null,
      titulo: d.titulo,
      antes: "descartar",
      scoreAntes: d.scoreLocal,
    });
  }
  if (!casos.length) {
    console.log("  Todavía no hay decisiones con lo que evaluó el scorer guardado (se guarda desde 2026-09-30).");
    return;
  }

  const resumen = resumirReCorrida(casos);
  console.log(`  Perfil de hoy: versión ${filtros.versionPerfil}. Casos evaluados con esa misma versión: ${mismaVersion} de ${casos.length}.`);
  console.log("                       postular   gris   descartar");
  for (const v of ["SI", "NO"] as const) {
    const fila = resumen.conVeredicto[v];
    console.log(`    Dijo que ${v === "SI" ? "sí" : "no"}${col(fila.postular, 13)}${col(fila.gris, 7)}${col(fila.descartar, 12)}`);
  }
  const sv = resumen.sinVeredicto;
  if (sv.postular + sv.gris + sv.descartar) {
    console.log(`  Descartes sin corregir: ${sv.postular} se postularían, ${sv.gris} irían a Por decidir, ${sv.descartar} seguirían descartados.`);
  }
  const linea = (c: CasoParaReCorrer) =>
    `    ${c.veredicto === "SI" ? "sí" : "no"}  ${c.antes} → ${c.ahora}  (${c.scoreAntes ?? "-"} → ${c.scoreAhora})  ${corto(c.titulo)}`;
  if (resumen.empeoran.length) {
    console.log("\n  Empeoran (quedan más lejos de lo que dijo la persona):");
    for (const c of resumen.empeoran.slice(0, 20)) console.log(linea(c));
  }
  if (resumen.mejoran.length) {
    console.log("\n  Mejoran:");
    for (const c of resumen.mejoran.slice(0, 20)) console.log(linea(c));
  }
}

async function main() {
  try {
    if (correo) await unaCuenta(correo);
    else await todasLasCuentas();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
