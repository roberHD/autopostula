// Verificación del texto de la tarjeta del Inicio (docs/rafagas-y-ponerse-al-dia.md §3.5).
// Lógica pura, sin base de datos ni navegador. Es para correr a mano:
//   npx tsx scripts/verificar-texto-rafaga.ts
import {
  detalleConteos,
  duracionAproximada,
  MOTIVOS_PONERSE_AL_DIA,
  RUTA_VER_LAS_DE_PRUEBA,
  SIN_EXTENSION_PONERSE,
  TEXTO_ACTIVADA_EMPEZO,
  TEXTO_ACTIVADA_MANUAL,
  TEXTO_ACTIVADA_SIN_EXTENSION,
  TEXTO_DESPUES_DE_LA_PRUEBA,
  TEXTO_PASAR_A_PREMIUM,
  textoEstimadoPonerse,
  textoMotivoActivacion,
  textoMotivoPonerse,
  textoPruebaEnCurso,
  textoPruebaTerminada,
  textoTarjetaRafaga,
  textoVerLasDePrueba,
  type ResumenRafaga,
} from "../lib/texto-rafaga";
import { modoAutomatico, motivoInactivo, PRUEBA_TOTAL } from "../lib/estado-automatico";
import { armarCorreoPruebaTerminada } from "../lib/correo";

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

// ── modoAutomatico: premium / prueba / manual (§4) ───────────────────────
const gratis = { esAdmin: false, planIncluyeBusquedaAutomatica: false };
check("la prueba son 5", PRUEBA_TOTAL === 5);
check("admin → premium, aunque no tenga plan armado ni prueba", modoAutomatico({ esAdmin: true, planIncluyeBusquedaAutomatica: false, pruebaRestantes: 0 }) === "premium");
check("plan con búsqueda automática → premium", modoAutomatico({ esAdmin: false, planIncluyeBusquedaAutomatica: true, pruebaRestantes: 5 }) === "premium");
check("premium no depende de la prueba (plan + 0 restantes → premium)", modoAutomatico({ esAdmin: false, planIncluyeBusquedaAutomatica: true, pruebaRestantes: 0 }) === "premium");
check("gratis con las 5 de la prueba → prueba", modoAutomatico({ ...gratis, pruebaRestantes: 5 }) === "prueba");
check("gratis con 1 restante → todavía prueba", modoAutomatico({ ...gratis, pruebaRestantes: 1 }) === "prueba");
check("gratis con 0 restantes → manual (la prueba terminó)", modoAutomatico({ ...gratis, pruebaRestantes: 0 }) === "manual");
check("un dato raro (negativo) tampoco da prueba", modoAutomatico({ ...gratis, pruebaRestantes: -1 }) === "manual");

// ── motivoInactivo: el veredicto que comparten la barra del dashboard y la extensión ──
const ok = { modo: "premium" as const, pausadaPorTi: false, cupoPermitido: true, portalesActivos: 2 };
check("todo en orden → no hay motivo (está corriendo)", motivoInactivo(ok) === null);
check("una cuenta en prueba, con todo en orden, también corre", motivoInactivo({ ...ok, modo: "prueba" }) === null);
check("prueba gastada (manual) → prueba-terminada, ya no 'sin-plan'", motivoInactivo({ ...ok, modo: "manual" }) === "prueba-terminada");
check("pausada por la persona → pausada", motivoInactivo({ ...ok, pausadaPorTi: true }) === "pausada");
check("una prueba en curso también se puede pausar", motivoInactivo({ ...ok, modo: "prueba", pausadaPorTi: true }) === "pausada");
check("sin cupo → sin-cupo", motivoInactivo({ ...ok, cupoPermitido: false }) === "sin-cupo");
check("sin portales → sin-portales", motivoInactivo({ ...ok, portalesActivos: 0 }) === "sin-portales");
check(
  "el orden es el de qué hacer primero: la prueba terminada gana sobre todo lo demás",
  motivoInactivo({ modo: "manual", pausadaPorTi: true, cupoPermitido: false, portalesActivos: 0 }) === "prueba-terminada",
);
check(
  "pausada gana sobre sin cupo y sin portales",
  motivoInactivo({ ...ok, pausadaPorTi: true, cupoPermitido: false, portalesActivos: 0 }) === "pausada",
);
check("sin cupo gana sobre sin portales", motivoInactivo({ ...ok, cupoPermitido: false, portalesActivos: 0 }) === "sin-cupo");

// ── La prueba de 5 postulaciones automáticas (§4.1) ──────────────────────
// Las mismas frases que extension/popup.js y el correo: verificar-rafagas.js las
// compara contra estas.
check('en curso: "Prueba automática: 3 de 5 postulaciones" (cuántas lleva, no cuántas quedan)', textoPruebaEnCurso(2, 5) === "Prueba automática: 3 de 5 postulaciones");
check("recién empezada: 0 de 5", textoPruebaEnCurso(5, 5) === "Prueba automática: 0 de 5 postulaciones");
check("a punto de terminar: 4 de 5", textoPruebaEnCurso(1, 5) === "Prueba automática: 4 de 5 postulaciones");
check("un dato raro nunca dibuja '7 de 5' ni un negativo", textoPruebaEnCurso(-2, 5) === "Prueba automática: 5 de 5 postulaciones" && textoPruebaEnCurso(9, 5) === "Prueba automática: 0 de 5 postulaciones");
check(
  "terminada: el texto del documento, con el total",
  textoPruebaTerminada(5) === "Tu prueba terminó: AutoPostula envió 5 postulaciones sin que entraras a ningún portal.",
);
check("las dos salidas se dicen sin rodeos (Premium, o entrar a mano a un portal)", TEXTO_DESPUES_DE_LA_PRUEBA.includes("Con Premium") && TEXTO_DESPUES_DE_LA_PRUEBA.includes("Computrabajo, Laborum o Trabajando"));
check('"Ver las 5" lleva al historial filtrado por la prueba', textoVerLasDePrueba(5) === "Ver las 5" && RUTA_VER_LAS_DE_PRUEBA === "/dashboard/historial?filtro=prueba");
check("el botón para pagar dice 'Pasar a Premium'", TEXTO_PASAR_A_PREMIUM === "Pasar a Premium");

// ── Al activar la postulación desde el panel (§4.1) ──────────────────────
check("empezó: dice que empezó y dónde se avisa", TEXTO_ACTIVADA_EMPEZO.startsWith("Empezó ahora") && TEXTO_ACTIVADA_EMPEZO.includes("ícono de la extensión"));
check("sin extensión en este navegador: dice cuándo empieza, no finge que empezó", TEXTO_ACTIVADA_SIN_EXTENSION.includes("abras Chrome") && !TEXTO_ACTIVADA_SIN_EXTENSION.startsWith("Empezó"));
check("prueba ya gastada: dice qué hacer en el plan gratis", TEXTO_ACTIVADA_MANUAL.includes("Entra a Computrabajo"));
check("un motivo común se explica igual que en el botón (sin_portales)", textoMotivoActivacion("sin_portales") === MOTIVOS_PONERSE_AL_DIA.sin_portales);
check("ya había una búsqueda en curso: se dice que esa no envía nada", textoMotivoActivacion("en_curso").includes("sin enviar nada") && textoMotivoActivacion("en_curso") !== MOTIVOS_PONERSE_AL_DIA.en_curso);
check(
  "no hay botón que apretar de nuevo: 'inténtalo de nuevo' se cambia por cuándo empieza",
  !textoMotivoActivacion("extension_no_responde").includes("inténtalo") && textoMotivoActivacion("extension_no_responde").includes("próxima vez que abras Chrome") &&
    !textoMotivoActivacion("sin_conexion").includes("inténtalo") && textoMotivoActivacion("sin_conexion").includes("próxima vez que abras Chrome"),
);
check("un motivo desconocido o ausente cae a cuándo empieza, nunca a una clave cruda", textoMotivoActivacion("algo_nuevo").startsWith("La primera búsqueda empieza") && textoMotivoActivacion(undefined).startsWith("La primera búsqueda empieza"));

// ── El correo de "tu prueba terminó" (§4.1) ──────────────────────────────
// Se arma sin mandar nada: lo que dice tiene que ser lo mismo que el panel y el popup.
{
  const { subject, html } = armarCorreoPruebaTerminada(5);
  const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  check("el asunto dice cuántas se enviaron", subject === "Tu prueba de AutoPostula terminó: 5 postulaciones enviadas", subject);
  check("el cuerpo trae la misma frase que el panel y el popup", texto.includes(textoPruebaTerminada(5)), texto);
  check("...y las dos salidas, con las mismas palabras", texto.includes(TEXTO_DESPUES_DE_LA_PRUEBA));
  check('"Ver las 5" y "Pasar a Premium" son los botones, con las mismas palabras', texto.includes(textoVerLasDePrueba(5)) && texto.includes(TEXTO_PASAR_A_PREMIUM));
  check(
    '"Ver las 5" lleva al historial filtrado, y "Pasar a Premium" a Premium',
    hrefs.length === 2 && hrefs[0].endsWith(RUTA_VER_LAS_DE_PRUEBA) && hrefs[1].endsWith("/dashboard/premium"),
    hrefs,
  );
  check("los enlaces son absolutos (un correo no tiene una página a la que ser relativo)", hrefs.every((h) => /^https?:\/\//.test(h)), hrefs);
}

console.log("\n" + (fallos === 0 ? "✓ Todo OK" : "✗ " + fallos + " fallo(s)"));
process.exit(fallos === 0 ? 0 : 1);
