// Verificación de la tarjeta "Probemos" de Hoy (docs/primera-busqueda-guiada.md §10).
// Lógica pura, sin base de datos ni navegador. Es para correr a mano, desde backend/:
//   npx tsx scripts/verificar-primera-busqueda.ts
import {
  pasosPrimeraBusqueda,
  textoAlActivar,
  textoBusqueda,
  textoLoQueMiro,
  type EntradaPasos,
} from "../lib/primera-busqueda";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

const base: EntradaPasos = { enMovil: false, extensionAqui: false, extensionConectada: false, yaMiro: false };
const resumen = (e: EntradaPasos) => pasosPrimeraBusqueda(e).map((p) => `${p.clave}:${p.estado}`).join(" ");

// ── En el computador ─────────────────────────────────────────────────────
check("recién llegada, sin extensión: instalar ahora, el resto después",
  resumen(base) === "instalar:ahora conectar:despues mirar:despues decidir:despues", resumen(base));
check("todavía detectando la extensión: igual el primer paso es instalar",
  resumen({ ...base, extensionAqui: null }).startsWith("instalar:ahora"), resumen({ ...base, extensionAqui: null }));
check("instalada en este navegador pero sin conectar: conectar ahora",
  resumen({ ...base, extensionAqui: true }) === "instalar:hecho conectar:ahora mirar:despues decidir:despues", resumen({ ...base, extensionAqui: true }));
check("conectada (desde Portales u otro navegador): mirar ahora",
  resumen({ ...base, extensionConectada: true }) === "instalar:hecho conectar:hecho mirar:ahora decidir:despues", resumen({ ...base, extensionConectada: true }));
check("ya miró: decidir ahora",
  resumen({ ...base, extensionAqui: true, extensionConectada: true, yaMiro: true }) === "instalar:hecho conectar:hecho mirar:hecho decidir:ahora");
check("ya miró aunque el servidor no supiera que estaba conectada: no le pide conectarla de nuevo",
  resumen({ ...base, yaMiro: true }) === "instalar:hecho conectar:hecho mirar:hecho decidir:ahora", resumen({ ...base, yaMiro: true }));
check("hay un solo paso 'ahora'", pasosPrimeraBusqueda({ ...base, extensionAqui: true }).filter((p) => p.estado === "ahora").length === 1);

// ── En el celular ────────────────────────────────────────────────────────
const movil: EntradaPasos = { ...base, enMovil: true, extensionAqui: false };
check("celular, sin nada: seguir en el computador",
  resumen(movil) === "computador:ahora mirar:despues decidir:despues", resumen(movil));
check("celular, ya conectada en el computador: mirar ahora (se hace allá)",
  resumen({ ...movil, extensionConectada: true }) === "computador:hecho mirar:ahora decidir:despues");
check("celular, ya miró: decidir desde el celular",
  resumen({ ...movil, extensionConectada: true, yaMiro: true }) === "computador:hecho mirar:hecho decidir:ahora");

// ── Lo que encontró ──────────────────────────────────────────────────────
let t = textoLoQueMiro({ porDecidir: 6, descartadas: 11, habriaPostulado: null });
check("sin ráfaga: lo que se sabe, con su razón", t === "Ya revisó ofertas para ti: te dejó 6 ofertas para que decidas y descartó 11 que no calzaban, cada una con su razón.", t);
t = textoLoQueMiro({ porDecidir: 6, descartadas: 11, habriaPostulado: 3 });
check("con una ráfaga: también a cuántas habría postulado", t === "Ya revisó ofertas para ti: habría postulado a 3, te dejó 6 ofertas para que decidas y descartó 11 que no calzaban, cada una con su razón.", t);
t = textoLoQueMiro({ porDecidir: 1, descartadas: 1, habriaPostulado: null });
check("singular", t === "Ya revisó ofertas para ti: te dejó 1 oferta para que decidas y descartó 1 que no calzaba, cada una con su razón.", t);
t = textoLoQueMiro({ porDecidir: 0, descartadas: 4, habriaPostulado: 0 });
check("solo descartes (y un 0 de la ráfaga no se dice)", t === "Ya revisó ofertas para ti: descartó 4 que no calzaban, cada una con su razón.", t);
t = textoLoQueMiro({ porDecidir: 0, descartadas: 0, habriaPostulado: null });
check("sin cifras no inventa ninguna", t === "Ya revisó ofertas para ti.", t);

// ── Al activar, según el plan ────────────────────────────────────────────
check("prueba: dice cuántas envía sola", textoAlActivar("prueba", 5).includes("primeras 5"));
check("premium: se pone al día sola", textoAlActivar("premium", 5).includes("cada vez que abres Chrome"));
check("manual: postula cuando entra a un portal", textoAlActivar("manual", 5).includes("cada vez que entres"));
check("sin saber el plan, no promete nada que no sea cierto", !/\d/.test(textoAlActivar(null, 5)));

// ── La búsqueda, en palabras ─────────────────────────────────────────────
t = textoBusqueda({ objetivo: "Vendedora", lugares: ["Ñuñoa"], jornada: "Part time" });
check("objetivo, comuna y jornada", t === "“Vendedora”, en Ñuñoa, part time", t);
t = textoBusqueda({ objetivo: "Vendedora", lugares: ["Ñuñoa", "Providencia", "Macul"], jornada: null });
check("varias comunas", t === "“Vendedora”, en Ñuñoa, Providencia y Macul", t);
t = textoBusqueda({ objetivo: "Cajero", lugares: [], jornada: null });
check("solo el objetivo", t === "“Cajero”", t);

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
