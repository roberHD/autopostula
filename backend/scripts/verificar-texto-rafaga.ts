// Verificación del texto de la tarjeta del Inicio (docs/rafagas-y-ponerse-al-dia.md §3.5).
// Lógica pura, sin base de datos ni navegador. Es para correr a mano:
//   npx tsx scripts/verificar-texto-rafaga.ts
import {
  detalleConteos,
  duracionAproximada,
  MOTIVOS_PONERSE_AL_DIA,
  SIN_EXTENSION_PONERSE,
  textoEstimadoPonerse,
  textoMotivoPonerse,
  textoTarjetaRafaga,
  type ResumenRafaga,
} from "../lib/texto-rafaga";
import { motivoInactivo } from "../lib/estado-automatico";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

const base: ResumenRafaga = { postuladas: 0, observadas: 0, descartadas: 0, gris: 0, errores: 0 };

// Fechas en hora LOCAL (como las ve el navegador de la persona), así el
// resultado no depende de en qué zona horaria corra el script.
const ahora = new Date(2026, 8, 18, 15, 30); // vie 18-sep, 15:30
const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000).toISOString();

// ── detalleConteos: el mismo texto que la línea del popup ─────────────────
check("sin resumen (fila purgada) no dice nada", detalleConteos(null) === "");
check("el ejemplo del documento: 7 postulaciones · 14 descartadas", detalleConteos({ ...base, postuladas: 7, descartadas: 14 }) === "7 postulaciones · 14 descartadas");
check("singular: 1 postulación · 1 descartada", detalleConteos({ ...base, postuladas: 1, descartadas: 1 }) === "1 postulación · 1 descartada");
check("las grises se dicen: 2 por decidir", detalleConteos({ ...base, postuladas: 3, gris: 2, descartadas: 5 }) === "3 postulaciones · 2 por decidir · 5 descartadas");
check("solo observar: 'habría postulado a 5', no '0 postulaciones'", detalleConteos({ ...base, observadas: 5, descartadas: 8 }) === "habría postulado a 5 · 8 descartadas");
check("sin novedades igual lo dice", detalleConteos(base) === "0 postulaciones");
check("una búsqueda que no terminó se dice (1)", detalleConteos({ ...base, postuladas: 2, errores: 1 }) === "2 postulaciones · 1 búsqueda no terminó");
check("una búsqueda que no terminó se dice (2, plural)", detalleConteos({ ...base, errores: 2 }) === "0 postulaciones · 2 búsquedas no terminaron");

// ── textoTarjetaRafaga ───────────────────────────────────────────────────
let r = textoTarjetaRafaga(null, ahora);
check("nunca se puso al día: lo dice y le pide abrir Chrome", r.t === "Todavía no se puso al día" && r.d.includes("Abre Chrome"), r);

r = textoTarjetaRafaga({ en: new Date(2026, 8, 18, 9, 14).toISOString(), resumen: { ...base, postuladas: 7 } }, ahora);
check("hoy: 'Última puesta al día: hoy 09:14' y el detalle aparte", r.t === "Última puesta al día: hoy 09:14" && r.d === "7 postulaciones", r);

r = textoTarjetaRafaga({ en: new Date(2026, 8, 17, 21, 30).toISOString(), resumen: { ...base, postuladas: 2, descartadas: 4 } }, ahora);
check("ayer por la noche (18 h atrás): 'ayer 21:30'", r.t === "Última puesta al día: ayer 21:30" && r.d === "2 postulaciones · 4 descartadas", r);

// Por día calendario, no por 24 h: terminó anoche 23:50, son solo 15 h pero es "ayer".
r = textoTarjetaRafaga({ en: new Date(2026, 8, 17, 23, 50).toISOString(), resumen: base }, ahora);
check("por día calendario: anoche 23:50 (hace 15 h) sigue siendo 'ayer'", r.t === "Última puesta al día: ayer 23:50", r);

// Justo debajo del corte: hace 47 h → todavía muestra la última vez (no la advertencia).
r = textoTarjetaRafaga({ en: hace(47), resumen: { ...base, postuladas: 1 } }, ahora);
check("a las 47 h todavía cuenta la última vez", r.t.startsWith("Última puesta al día: ") && r.d === "1 postulación", r);
check("...y no dice 'hoy' ni 'ayer' cuando son 2 días calendario (dice el día de la semana)", /^Última puesta al día: (el [a-záéíóúñ]+|ayer|hoy) \d{2}:\d{2}$/.test(r.t), r);

// En el corte: 48 h → advertencia.
r = textoTarjetaRafaga({ en: hace(48), resumen: { ...base, postuladas: 9 } }, ahora);
check("a las 48 h: 'Hace 2 días que no se pone al día' + qué hacer", r.t === "Hace 2 días que no se pone al día" && r.d === "Abre Chrome en tu computador y se pone al día sola.", r);
check("la advertencia NO repite el resumen viejo (no celebra lo de hace 2 días)", !r.d.includes("postulacion"), r);

r = textoTarjetaRafaga({ en: hace(24 * 5 + 3), resumen: null }, ahora);
check("a los 5 días: 'Hace 5 días que no se pone al día'", r.t === "Hace 5 días que no se pone al día", r);

// Fecha purgada pero user.ultimaRafagaEn sigue: >48 h, así que ni se mira el resumen.
r = textoTarjetaRafaga({ en: hace(24 * 100), resumen: null }, ahora);
check("100 días sin ponerse al día (fila ya purgada) no rompe", r.t === "Hace 100 días que no se pone al día", r);

// Reciente pero la fila se purgó / no llegó: no inventa detalle.
r = textoTarjetaRafaga({ en: hace(1), resumen: null }, ahora);
check("reciente sin resumen: muestra la hora y deja el detalle vacío", r.t.startsWith("Última puesta al día: hoy ") && r.d === "", r);

// Medianoche: nunca "24:05".
r = textoTarjetaRafaga({ en: new Date(2026, 8, 18, 0, 5).toISOString(), resumen: base }, ahora);
check("después de medianoche dice 00:05, no 24:05", r.t === "Última puesta al día: hoy 00:05", r);

// ── "Ponerme al día ahora" (§3.6) ────────────────────────────────────────
// La MISMA tabla que extension/verificar-rafagas.js prueba contra popup.js:
// el botón está en los dos lados y tienen que decir lo mismo.
const tabla: [number | null, string][] = [
  [null, "unos minutos"], [0, "unos minutos"], [30000, "menos de un minuto"], [60000, "un minuto"],
  [89000, "un minuto"], [90000, "unos 2 minutos"], [480000, "unos 8 minutos"], [3540000, "unos 59 minutos"],
  [3600000, "más de una hora"], [7200000, "más de una hora"],
];
for (const [ms, esperado] of tabla) {
  check(`duracionAproximada(${ms}) = "${esperado}"`, duracionAproximada(ms) === esperado, duracionAproximada(ms));
}
check('con estimación: "Suele tardar unos 8 minutos."', textoEstimadoPonerse(480000) === "Suele tardar unos 8 minutos.");
check('sin estimación no inventa un número: "Puede tardar unos minutos."', textoEstimadoPonerse(null) === "Puede tardar unos minutos.");

const motivosDeLaExtension = [
  "en_curso", "reciente", "sin_plan", "pausada", "sin_cupo", "sin_portales", "sin_objetivo",
  "sin_token", "sin_conexion", "extension_no_responde",
];
check(
  "cada motivo que puede devolver la extensión tiene su texto",
  motivosDeLaExtension.every((m) => (MOTIVOS_PONERSE_AL_DIA[m] ?? "").length > 10),
  motivosDeLaExtension.filter((m) => !MOTIVOS_PONERSE_AL_DIA[m]),
);
check("un motivo conocido devuelve su texto", textoMotivoPonerse("pausada") === MOTIVOS_PONERSE_AL_DIA.pausada);
check(
  "un motivo desconocido o ausente cae al texto genérico, nunca a una clave cruda",
  textoMotivoPonerse("algo_nuevo").startsWith("No se pudo poner al día ahora") &&
    textoMotivoPonerse(undefined).startsWith("No se pudo poner al día ahora"),
);
check(
  "sin extensión en este navegador (el celular) dice que esto corre en el computador",
  SIN_EXTENSION_PONERSE.includes("computador") && SIN_EXTENSION_PONERSE.includes("extensión"),
);

// ── motivoInactivo: el veredicto que comparten la barra del dashboard y la extensión ──
const ok = { disponibleEnPlan: true, pausadaPorTi: false, cupoPermitido: true, portalesActivos: 2 };
check("todo en orden → no hay motivo (está corriendo)", motivoInactivo(ok) === null);
check("sin plan → sin-plan", motivoInactivo({ ...ok, disponibleEnPlan: false }) === "sin-plan");
check("pausada por la persona → pausada", motivoInactivo({ ...ok, pausadaPorTi: true }) === "pausada");
check("sin cupo → sin-cupo", motivoInactivo({ ...ok, cupoPermitido: false }) === "sin-cupo");
check("sin portales → sin-portales", motivoInactivo({ ...ok, portalesActivos: 0 }) === "sin-portales");
check(
  "el orden es el de qué hacer primero: sin plan gana sobre todo lo demás",
  motivoInactivo({ disponibleEnPlan: false, pausadaPorTi: true, cupoPermitido: false, portalesActivos: 0 }) === "sin-plan",
);
check(
  "pausada gana sobre sin cupo y sin portales",
  motivoInactivo({ ...ok, pausadaPorTi: true, cupoPermitido: false, portalesActivos: 0 }) === "pausada",
);
check("sin cupo gana sobre sin portales", motivoInactivo({ ...ok, cupoPermitido: false, portalesActivos: 0 }) === "sin-cupo");

console.log("\n" + (fallos === 0 ? "✓ Todo OK" : "✗ " + fallos + " fallo(s)"));
process.exit(fallos === 0 ? 0 : 1);
