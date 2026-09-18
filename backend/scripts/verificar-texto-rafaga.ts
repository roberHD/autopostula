// Verificación del texto de la tarjeta del Inicio (docs/rafagas-y-ponerse-al-dia.md §3.5).
// Lógica pura, sin base de datos ni navegador. Es para correr a mano:
//   npx tsx scripts/verificar-texto-rafaga.ts
import { detalleConteos, textoTarjetaRafaga, type ResumenRafaga } from "../lib/texto-rafaga";

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

console.log("\n" + (fallos === 0 ? "✓ Todo OK" : "✗ " + fallos + " fallo(s)"));
process.exit(fallos === 0 ? 0 : 1);
