// Verificación del estado único de la extensión (docs/estrategia-y-rediseno.md
// §6). Lógica pura, sin base de datos ni navegador:
//   npx tsx scripts/verificar-estado-extension.ts
//
// El lado de la extensión (que el popup diga lo mismo que esto) lo prueba
// extension/verificar-estado-extension.js.
import { estadoExtension, TEXTO_MODO, TEXTO_MODO_PRUEBA } from "../lib/estado-extension";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

const base = {
  busquedaAutomaticaActiva: true,
  soloObservar: null as boolean | null,
  revisarAntesDeEnviar: null as boolean | null,
  postulacionHabilitada: true,
};

// ── Los tres modos ──
check("cuenta lista y sin pedir nada raro: postulando", estadoExtension(base).modo === "postulando");
check("pidió solo observar: observando", estadoExtension({ ...base, soloObservar: true }).modo === "observando");
check("cuenta en modo prueba: observando aunque no lo haya pedido", estadoExtension({ ...base, postulacionHabilitada: false }).modo === "observando");
check("pausada: pausada", estadoExtension({ ...base, busquedaAutomaticaActiva: false }).modo === "pausada");

// ── Precedencia: la pausa le gana a todo ──
// Si no, alguien que pausó desde el panel vería "solo mirando" y creería que
// la extensión sigue revisando ofertas.
check(
  "pausada le gana a solo observar y al modo prueba",
  estadoExtension({ busquedaAutomaticaActiva: false, soloObservar: true, revisarAntesDeEnviar: true, postulacionHabilitada: false }).modo === "pausada",
);

// ── Por qué está observando ──
// Solo se dice "es el modo prueba" cuando eso es lo ÚNICO que la frena: a
// quien además pidió solo observar no hay que explicarle la prueba.
check("modo prueba solo: se explica", estadoExtension({ ...base, postulacionHabilitada: false }).porModoPrueba);
check("modo prueba + lo pidió: no se explica la prueba", !estadoExtension({ ...base, soloObservar: true, postulacionHabilitada: false }).porModoPrueba);
check("pausada: no se explica la prueba", !estadoExtension({ busquedaAutomaticaActiva: false, soloObservar: null, revisarAntesDeEnviar: null, postulacionHabilitada: false }).porModoPrueba);

// ── null = todavía no lo dijo desde la cuenta ──
// Las columnas nuevas nacen en null para que la extensión pueda subir una vez
// lo que tenía guardado ese navegador; mientras tanto valen false.
check("soloObservar en null vale false", estadoExtension(base).soloObservar === false);
check("revisarAntesDeEnviar en null vale false", estadoExtension(base).revisarAntes === false);
check("revisarAntesDeEnviar en true se respeta", estadoExtension({ ...base, revisarAntesDeEnviar: true }).revisarAntes === true);

// ── Los textos ──
// Son lo único que ve la persona: si alguno queda vacío, el panel y el popup
// muestran un estado sin explicación.
for (const modo of ["postulando", "observando", "pausada"] as const) {
  check(`el modo ${modo} tiene título y detalle`, !!TEXTO_MODO[modo].titulo && !!TEXTO_MODO[modo].detalle);
}
check("la explicación del modo prueba dice qué hacer", TEXTO_MODO_PRUEBA.includes("Actívala"));

console.log(fallos ? `\n${fallos} verificaciones fallaron` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
