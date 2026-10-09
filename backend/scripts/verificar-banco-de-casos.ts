/**
 * Verificación del banco de casos y de la calibración del umbral
 * (docs/revision-scorer-2026-09-30.md §6 y §7), con el tercer grupo y la subida
 * del corte (docs/panel-de-revision-en-el-portal.md §9.3). Lógica pura, sin base de datos:
 *
 *   npx tsx scripts/verificar-banco-de-casos.ts
 *
 * Carga además el scorer real de la extensión (../extension/core.js), como lo
 * hace scripts/banco-de-casos.ts, y lo corre sobre el caso §2.1 del documento.
 */
import {
  calcularUmbralPostular,
  decisionesQueCalibran,
  esTopeDelScorer,
  tocaCalibrar,
  type DecisionParaCalibrar,
} from "../lib/calibracion-umbral";
import {
  analizarBanco,
  claveDeRazon,
  resumirReCorrida,
  separacion,
  type CasoParaReCorrer,
  type DecisionDelBanco,
} from "../lib/banco-de-casos";
import { cargarScorerDeLaExtension } from "../lib/scorer-extension";
import { limpiarEntradaScorer, puntajeONull } from "../lib/entrada";
import { esRazonPositiva, formatearRazon } from "../lib/formatear-razon";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (cond) console.log("✓ " + desc);
  else {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "\n    " + JSON.stringify(detalle) : ""));
  }
}

const rol = { tipo: "rol", rol: "vendedor", termino: "vendedor", campo: "titulo" };
const d = (scoreLocal: number | null, veredicto: "SI" | "NO", razones: unknown[] = [rol]): DecisionParaCalibrar => ({
  scoreLocal,
  veredicto,
  razones,
});
const repetir = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

// ── Calibración (§7) ──────────────────────────────────────────────────
console.log("── Calibración del umbral (§7) ──");
{
  // 20 decisiones bajas y mezcladas + 10 "sí" entre 58 y 64.
  const bajas = repetir(20, (i) => d(46 + (i % 9), i % 2 ? "SI" : "NO"));
  const altasSi = repetir(10, (i) => d(58 + (i % 7), "SI"));

  const r29 = calcularUmbralPostular([...bajas.slice(0, 19), ...altasSi]);
  check("con 29 decisiones no se mueve", r29.umbral === null && r29.decisiones === 29, r29);

  const r30 = calcularUmbralPostular([...bajas, ...altasSi]);
  check("con 30, y 10 de 10 sí desde 58, baja a 58 (no a 55: nadie decidió nada entre 55 y 57)", r30.umbral === 58 && r30.enTramo === 10 && r30.acuerdo === 1, r30);

  const conUnNo = calcularUmbralPostular([...bajas, ...altasSi.slice(1), d(58, "NO")]);
  check("un no en el tramo (9 de 10): sigue bajando, el 90% alcanza", conUnNo.umbral === 58, conUnNo);

  const conDosNo = calcularUmbralPostular([...bajas, ...altasSi.slice(2), d(58, "NO"), d(59, "NO")]);
  check("dos no en el tramo (8 de 10): se queda en el normal", conDosNo.umbral === null, conDosNo);

  const nuncaBajoDe55 = calcularUmbralPostular(repetir(30, (i) => d(46 + (i % 19), "SI")));
  check("todo sí desde 46: baja solo hasta 55 (nunca más de 10 puntos)", nuncaBajoDe55.umbral === 55, nuncaBajoDe55);

  const conTopes = calcularUmbralPostular(repetir(40, (i) => d(50 + (i % 15), "SI", [{ tipo: "jornada_desconocida", declarada: "part_time" }, rol])));
  check("las que dejó en duda un tope no cuentan (la jornada, no el puntaje)", conTopes.umbral === null && conTopes.decisiones === 0, conTopes);

  const abierto = calcularUmbralPostular(repetir(40, () => d(60, "SI", [{ tipo: "modo_abierto" }])));
  check("las del modo abierto no cuentan", abierto.umbral === null && abierto.decisiones === 0, abierto);

  const fuera = decisionesQueCalibran([d(45, "SI"), d(46, "SI"), d(64, "NO"), d(65, "SI"), d(80, "NO"), d(null, "SI"), { scoreLocal: 60, veredicto: "PENDIENTE", razones: [] }]);
  check("solo cuentan sí/no con puntaje dentro de la banda (46 a 64)", fuera.length === 2, fuera);

  check("tope: veto en la descripción", esTopeDelScorer({ tipo: "veto", donde: "cuerpo" }));
  check("no es tope: veto en el título (ese descarta)", !esTopeDelScorer({ tipo: "veto", donde: "titulo" }));
  check("tope: nivel sin confirmar", esTopeDelScorer({ tipo: "nivel", termino: "jefe", certeza: "desconocida" }));
  check("tope: el cargo fuera del título", esTopeDelScorer({ tipo: "rol_fuera_del_titulo" }));
  check("no es tope: una razón vieja en texto", !esTopeDelScorer("calza con vendedor"));

  // Lo que iba a salir solo (65 o más), revisado en el panel del portal (§9.3 del panel).
  const altasTodasSi = repetir(30, (i) => d(65 + i, "SI"));
  const sinQuitar = calcularUmbralPostular(altasTodasSi);
  check("si deja marcado todo lo que iba a salir solo, el corte no sube", sinQuitar.umbral === null && !sinQuitar.noSepara, sinQuitar);

  // 10 de 65 a 69 (8 quitadas) y 25 "sí" de 70 en adelante.
  const bajasQuitadas = [65, 65, 66, 66, 67, 67, 69, 69].map((s) => d(s, "NO")).concat([d(68, "SI"), d(68, "SI")]);
  const altas25 = repetir(25, (i) => d(70 + i, "SI"));
  const sube = calcularUmbralPostular([...bajasQuitadas, ...altas25]);
  check("si quita las de menos puntaje, sube al primer corte desde el que deja 9 de 10 (68)", sube.umbral === 68 && sube.enTramo === 29 && sube.decisiones === 35, sube);

  const conPocas = calcularUmbralPostular([...bajasQuitadas, ...altas25.slice(0, 19)]);
  check("con 29 de esas no se mueve", conPocas.umbral === null && !conPocas.noSepara, conPocas);

  const tope = calcularUmbralPostular([...repetir(16, (i) => d(65 + i, "NO")), ...repetir(20, (i) => d(81 + i, "SI"))]);
  check("sube como mucho 10 puntos: si a 75 todavía quita de más, se queda el normal y avisa que el puntaje no separa", tope.umbral === null && tope.noSepara === true, tope);

  const repartidas = calcularUmbralPostular(repetir(40, (i) => d(65 + (i % 30), i % 4 === 0 ? "NO" : "SI")));
  check("si lo que quita está repartido en todos los puntajes, subir no lo arregla", repartidas.umbral === null && repartidas.noSepara === true, repartidas);

  const ganaSubir = calcularUmbralPostular([...repetir(30, (i) => d(58 + (i % 7), "SI")), ...bajasQuitadas, ...altas25]);
  check("si a la vez aprueba las dudosas altas y quita lo que sale solo, gana no enviar lo que quita (sube)", ganaSubir.umbral === 68, ganaSubir);

  // Lo que quitó en el panel cuando el corte estaba más bajo (58) también
  // cuenta para no dejarlo ahí.
  const conQuitadasAbajo = calcularUmbralPostular([...bajas, ...altasSi, d(58, "NO"), d(59, "NO"), d(60, "NO")]);
  check("lo que quitó en el panel con el corte más bajo cuenta para no bajarlo", conQuitadasAbajo.umbral === null, conQuitadasAbajo);

  const ahora = new Date("2026-10-10T12:00:00Z");
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000);
  check("apagado: no se calcula", !tocaCalibrar({ calibrarUmbral: false, umbralCalibradoEn: null }, ahora));
  check("nunca calculado: se calcula", tocaCalibrar({ calibrarUmbral: true, umbralCalibradoEn: null }, ahora));
  check("hace 3 días: todavía no", !tocaCalibrar({ calibrarUmbral: true, umbralCalibradoEn: hace(3) }, ahora));
  check("hace 7 días: sí (una vez por semana)", tocaCalibrar({ calibrarUmbral: true, umbralCalibradoEn: hace(7) }, ahora));
}

// ── El banco (§6) ─────────────────────────────────────────────────────
console.log("\n── El banco de casos (§6) ──");
{
  check("separación: todos los sí sobre todos los no = 1", separacion([60, 62], [50, 55]) === 1);
  check("separación: al revés = 0", separacion([50], [60, 61]) === 0);
  check("separación: iguales = 0,5 (el puntaje no separa nada)", separacion([55, 55], [55]) === 0.5);
  check("separación: sin no, no hay con qué comparar", separacion([60], []) === null);

  const fila = (id: string, scoreLocal: number | null, veredicto: "SI" | "NO", razones: unknown[] = [rol]): DecisionDelBanco => ({
    id, titulo: "Oferta " + id, empresa: null, scoreLocal, veredicto, razones,
  });
  const informe = analizarBanco(
    [
      fila("a", 47, "NO"),
      fila("b", 48, "NO"),
      fila("c", 52, "SI"),
      fila("d", 63, "SI"),
      fila("e", 61, "NO"),
      fila("f", 80, "NO", [{ tipo: "ubicacion_desconocida", ofertaEn: "Gran Santiago" }, rol]),
      fila("g", 55, "SI", [{ tipo: "veto", donde: "cuerpo", patron: "comision", razon: "No quieres comisiones" }, rol]),
      fila("h", null, "SI", [{ tipo: "sin_rol" }]),
    ],
    [
      { id: "x", titulo: "Bodeguero", empresa: null, razon: { tipo: "sin_rol" }, scoreLocal: 0, corregido: false },
      { id: "y", titulo: "Vendedor", empresa: null, razon: { tipo: "sin_rol" }, scoreLocal: 30, corregido: true },
      { id: "z", titulo: "Cajero", empresa: null, razon: { tipo: "ubicacion", ofertaEn: "Lampa", buscadas: [] }, scoreLocal: 0, corregido: false },
      { id: "w", titulo: "Vendedor", empresa: null, razon: "fuera de las comunas que buscas", scoreLocal: null, corregido: false },
    ]
  );
  const g = informe.gris;
  check("cuenta las con puntaje y aparte las sin", g.conPuntaje === 7 && g.sinPuntaje === 1, g);
  check(
    "tramos de 5 puntos con las que dejó en duda el puntaje",
    JSON.stringify(g.porPuntaje) ===
      JSON.stringify([
        { desde: 45, hasta: 49, si: 0, no: 2 },
        { desde: 50, hasta: 54, si: 1, no: 0 },
        { desde: 60, hasta: 64, si: 1, no: 1 },
      ]),
    g.porPuntaje
  );
  check(
    "las que dejó en duda un tope van aparte, por el tope",
    g.porTope.length === 2 && g.porTope.some((t) => t.razon === "ubicacion_desconocida" && t.no === 1) && g.porTope.some((t) => t.razon === "veto en la descripción" && t.si === 1),
    g.porTope
  );
  // Sí: 52 y 63. No: 47, 48 y 61. De los 6 pares, solo 52 contra 61 queda al revés.
  check("la separación solo mira las del puntaje: 5 de 6 pares bien ordenados", g.separacion === 5 / 6, g.separacion);
  check('el "no" con más puntaje va primero (el que frenó la comuna)', g.noAltos[0]?.id === "f" && g.noAltos[1]?.id === "e", g.noAltos.map((x) => x.id));
  check('el "sí" con menos puntaje va primero', g.siBajos[0]?.id === "c", g.siBajos.map((x) => x.id));
  const ds = informe.descartes;
  check("descartes por razón, con los corregidos", ds.total === 4 && ds.corregidos === 1 && ds.porRazon[0].razon === "sin_rol" && ds.porRazon[0].total === 2 && ds.porRazon[0].corregidos === 1, ds.porRazon);
  check("las razones viejas en texto se agrupan juntas", claveDeRazon("cualquier cosa") === "(razón vieja, en texto)");
  check('"No era así" es la lista que más enseña', ds.ejemplosCorregidos.length === 1 && ds.ejemplosCorregidos[0].id === "y");
  check("sin panel del portal, el tercer grupo viene vacío", informe.teSirve.revisadas === 0 && informe.teSirve.porPuntaje.length === 0 && ds.rescatadosEnPanel === 0, informe.teSirve);

  // El tercer grupo (docs/panel-de-revision-en-el-portal.md §9.3).
  const conPanel = analizarBanco([], [{ id: "y", titulo: "Vendedor", empresa: null, razon: { tipo: "sin_rol" }, scoreLocal: 30, corregido: true }], {
    teSirve: [
      { ...fila("t1", 66, "NO"), pesoReducido: false },
      { ...fila("t2", 67, "SI"), pesoReducido: false },
      { ...fila("t3", 72, "SI") },
      { ...fila("t4", 88, "NO") },
      { ...fila("t5", 70, "NO"), pesoReducido: true },
    ],
    rescatadosEnPanel: 1,
  });
  const ts = conPanel.teSirve;
  check("te sirve: cuántas dejó marcadas y cuántas quitó, sin las de peso reducido", ts.revisadas === 4 && ts.dejadas === 2 && ts.quitadas === 2 && ts.conPesoReducido === 1, ts);
  check(
    "...por tramos de 5 puntos (sí = dejó, no = quitó)",
    JSON.stringify(ts.porPuntaje) ===
      JSON.stringify([
        { desde: 65, hasta: 69, si: 1, no: 1 },
        { desde: 70, hasta: 74, si: 1, no: 0 },
        { desde: 85, hasta: 89, si: 0, no: 1 },
      ]),
    ts.porPuntaje
  );
  check("...y las quitadas con más puntaje primero", ts.quitadasAltas.map((x) => x.id).join() === "t4,t1", ts.quitadasAltas.map((x) => x.id));
  check("descartes: cuántos de los corregidos se rescataron en el panel", conPanel.descartes.corregidos === 1 && conPanel.descartes.rescatadosEnPanel === 1, conPanel.descartes);
}

// ── Volver a correr el scorer (§6.2) ─────────────────────────────────
console.log("\n── Volver a correr el scorer (§6.2) ──");
{
  const caso = (veredicto: "SI" | "NO" | null, antes: CasoParaReCorrer["antes"], ahora: CasoParaReCorrer["ahora"], titulo = "x"): CasoParaReCorrer => ({
    origen: veredicto === null ? "descarte" : antes === "descartar" ? "no_era_asi" : "por_decidir",
    veredicto, titulo, antes, ahora, scoreAntes: null, scoreAhora: 0,
  });
  const r = resumirReCorrida([
    caso("SI", "gris", "postular", "sí que ahora se postula"),
    caso("SI", "gris", "descartar", "sí que ahora se perdería"),
    caso("NO", "gris", "descartar", "no que ahora se descarta"),
    caso("NO", "gris", "gris"),
    caso("SI", "descartar", "gris", "No era así que ahora se pregunta"),
    caso("NO", "gris", "postular", "no que ahora se postularía solo"),
    caso(null, "descartar", "gris"),
    caso(null, "descartar", "descartar"),
  ]);
  check("matriz de lo que dijo contra la banda de hoy", r.conVeredicto.SI.postular === 1 && r.conVeredicto.SI.descartar === 1 && r.conVeredicto.SI.gris === 1 && r.conVeredicto.NO.postular === 1 && r.conVeredicto.NO.descartar === 1 && r.conVeredicto.NO.gris === 1, r.conVeredicto);
  check("los descartes sin corregir solo se cuentan", r.sinVeredicto.gris === 1 && r.sinVeredicto.descartar === 1, r.sinVeredicto);
  check("mejoran: el sí que se postula, el no que se descarta, el No era así que se pregunta", r.mejoran.length === 3, r.mejoran.map((c) => c.titulo));
  check('empeoran, y lo más grave primero: un "no" que se postularía solo', r.empeoran.length === 2 && r.empeoran[0].titulo === "no que ahora se postularía solo", r.empeoran.map((c) => c.titulo));

  // Las de «te sirve»: venían de postular.
  const teSirve = (veredicto: "SI" | "NO", ahora: CasoParaReCorrer["ahora"], titulo: string): CasoParaReCorrer => ({
    origen: "te_sirve", veredicto, titulo, antes: "postular", ahora, scoreAntes: 70, scoreAhora: 0,
  });
  const rt = resumirReCorrida([teSirve("NO", "gris", "quitada que ahora se pregunta"), teSirve("SI", "gris", "dejada que ahora se pregunta"), teSirve("NO", "postular", "quitada que se seguiría enviando")]);
  check("te sirve: la quitada que ahora se pregunta mejora; la dejada que ahora se pregunta empeora", rt.mejoran.map((c) => c.titulo).join() === "quitada que ahora se pregunta" && rt.empeoran.map((c) => c.titulo).join() === "dejada que ahora se pregunta", [rt.mejoran.map((c) => c.titulo), rt.empeoran.map((c) => c.titulo)]);
  check("...y la quitada que se seguiría enviando queda en la matriz como un no que se postula", rt.conVeredicto.NO.postular === 1, rt.conVeredicto);

  // El scorer de verdad, cargado como lo carga el banco.
  const puntuar = cargarScorerDeLaExtension();
  const perfil = {
    roles: [{ canonico: "vendedor", sinonimos: [], peso: 1.0 }],
    vetos: [],
    senales: [{ patron: "part time", delta: 25 }, { patron: "comisiones", delta: 25 }],
    ubicacion: { comunas: ["nunoa"], aceptaRemoto: false },
    jornada: "cualquiera",
    umbralPostular: 65,
    umbralGris: 45,
  };
  const r21 = puntuar(
    { titulo: "Bodeguero Part Time con comisiones", cuerpo: "El bodeguero coordina con el vendedor de turno", ubicacion: "Ñuñoa, R.Metropolitana" },
    perfil
  );
  const primera = r21.razones[0] as { tipo?: string };
  check("el scorer de la extensión carga en Node y el caso §2.1 queda en Por decidir", r21.banda === "gris" && primera?.tipo === "rol_fuera_del_titulo", r21);
  const conUmbral = puntuar({ titulo: "Vendedor de tienda", ubicacion: "Ñuñoa" }, { ...perfil, umbralPostular: 58 });
  check("respeta el umbral de la cuenta", conUmbral.banda === "postular", conUmbral);
}

// ── Lo que llega de la extensión, y cómo se muestra ──────────────────
console.log("\n── Lo que llega de la extensión ──");
{
  const e = limpiarEntradaScorer({ titulo: "  Vendedor  ", empresa: "", ubicacion: "Ñuñoa", cuerpo: "x".repeat(5000), versionPerfil: 7, otra: "no" });
  check("se recorta y se queda solo con lo conocido", !!e && e.titulo === "Vendedor" && e.empresa === null && e.cuerpo?.length === 4000 && e.versionPerfil === 7 && !("otra" in e), e);
  check("sin título no se guarda", limpiarEntradaScorer({ empresa: "x" }) === undefined);
  check("lo que no es objeto no se guarda", limpiarEntradaScorer("hola") === undefined && limpiarEntradaScorer([1]) === undefined);
  check("una versión que no es entero queda en null", limpiarEntradaScorer({ titulo: "x", versionPerfil: "7" })?.versionPerfil === null);
  check("el puntaje se redondea; lo que no es número queda en null", puntajeONull(57.6) === 58 && puntajeONull("60") === null && puntajeONull(NaN) === null);

  check("el cargo fuera del título va en contra", esRazonPositiva({ tipo: "rol_fuera_del_titulo", rol: "vendedor", termino: "vendedor", campo: "cuerpo" }) === false);
  check(
    "y dice dónde aparece",
    formatearRazon({ tipo: "rol_fuera_del_titulo", rol: "vendedor", termino: "vendedor", campo: "cuerpo" }) === "El título es de otro cargo: vendedor solo aparece en la descripción"
  );
  check('el rol que calzó en la descripción no dice "Es de vendedor"', formatearRazon({ tipo: "rol", rol: "vendedor", termino: "vendedor", campo: "cuerpo" }) === "La descripción habla de vendedor, lo que buscas");
  check("la comuna ilegible va en contra y cita lo que dice el aviso", esRazonPositiva({ tipo: "ubicacion_desconocida", ofertaEn: "Gran Santiago" }) === false && formatearRazon({ tipo: "ubicacion_desconocida", ofertaEn: "Gran Santiago" }).includes('"Gran Santiago"'));
  check("sin perfil: ni a favor ni en contra, pero con texto", esRazonPositiva({ tipo: "sin_perfil" }) === null && formatearRazon({ tipo: "sin_perfil" }) !== "Sin razón registrada");
  check(
    "un descarte por región dice que es una región",
    formatearRazon({ tipo: "ubicacion", ofertaEn: "Valparaíso", region: "VA", buscadas: [] }) === "Es en la región de Valparaíso, y no buscas ahí" &&
      formatearRazon({ tipo: "ubicacion", ofertaEn: "Metropolitana de Santiago", region: "RM", buscadas: [] }) === "Es en la Región Metropolitana, y no buscas ahí"
  );
  check("y uno por comuna sigue igual", formatearRazon({ tipo: "ubicacion", ofertaEn: "Lampa", buscadas: [] }) === "Queda en Lampa, fuera de tus comunas");
}

console.log("\n" + (fallos === 0 ? "Todo OK (0 fallos)." : `${fallos} fallo(s).`));
process.exit(fallos === 0 ? 0 : 1);
