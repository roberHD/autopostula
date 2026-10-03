// Verificación de las palabras de la marca de cada oferta (docs/primera-busqueda-guiada.md §11):
// la extensión copia formatearRazon y esRazonPositiva de lib/formatear-razon.ts
// (AP.razonComoEnElPanel y AP.esRazonPositiva en extension/core.js), porque no
// puede importar este archivo. Esto corre las dos con las mismas razones y falla
// si alguna dice otra cosa: la marca tiene que decir lo mismo que "Por decidir"
// y "Lo último que hizo".
// Sin base de datos ni navegador. Desde backend/:
//   npx tsx scripts/verificar-razones-marca.ts
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { esRazonPositiva, formatearRazon } from "../lib/formatear-razon";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

// core.js real en un vm, como lib/scorer-extension.ts.
const carpeta = path.resolve(process.cwd(), "..", "extension");
const documento = { documentElement: {} };
const contexto: Record<string, unknown> = {
  window: { document: documento },
  document: documento,
  chrome: {
    runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {}, lastError: null },
    storage: {
      local: { get: (_k: unknown, cb: (d: object) => void) => cb({}), set: () => {} },
      sync: { get: (_k: unknown, cb: (d: object) => void) => cb({}), set: () => {} },
      onChanged: { addListener: () => {} },
    },
  },
  MutationObserver: class {
    observe() {}
  },
  console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  setTimeout,
  clearTimeout,
};
vm.createContext(contexto);
for (const archivo of ["data/comunas-cl.js", "core.js"]) {
  vm.runInContext(fs.readFileSync(path.join(carpeta, archivo), "utf8"), contexto, { filename: archivo });
}
const AP = (contexto.window as { AP: { razonComoEnElPanel: (r: unknown) => string; esRazonPositiva: (r: unknown) => boolean | null } }).AP;
check("core.js trae AP.razonComoEnElPanel y AP.esRazonPositiva", typeof AP.razonComoEnElPanel === "function" && typeof AP.esRazonPositiva === "function");

// Una razón de cada tipo que emite el scorer (extension/core.js, AP.puntuarOferta),
// con sus variantes.
const razones: unknown[] = [
  { tipo: "rol", rol: "vendedor", termino: "vendedora" },
  { tipo: "rol", rol: "vendedor", termino: "Vendedor" },
  { tipo: "rol", rol: "vendedor", termino: "vendedor", campo: "cuerpo" },
  { tipo: "rol", rol: "vendedor", termino: "ventas", campo: "empresa" },
  { tipo: "rol_fuera_del_titulo", rol: "vendedor", termino: "vendedor", campo: "empresa" },
  { tipo: "rol_fuera_del_titulo", rol: "vendedor", termino: "vendedor", campo: "cuerpo" },
  { tipo: "sin_rol" },
  { tipo: "veto", patron: "call center", razon: "No quieres call center", donde: "titulo" },
  { tipo: "veto", patron: "comision", razon: "Solo comisión", donde: "cuerpo" },
  { tipo: "ubicacion", ofertaEn: "maipu", buscadas: ["ñuñoa"] },
  { tipo: "ubicacion", ofertaEn: "Valparaíso", buscadas: ["ñuñoa"], region: "VA" },
  { tipo: "ubicacion", ofertaEn: "Metropolitana", buscadas: ["viña del mar"], region: "RM" },
  { tipo: "ubicacion", ofertaEn: null, buscadas: [] },
  { tipo: "ubicacion_desconocida", ofertaEn: "Gran Santiago" },
  { tipo: "ubicacion_desconocida", ofertaEn: null },
  { tipo: "nivel", termino: "jefe de tienda" },
  { tipo: "nivel", termino: "jefe de tienda", certeza: "desconocida" },
  { tipo: "duplicado", fecha: "2026-09-28T15:00:00.000Z" },
  { tipo: "duplicado", fecha: null },
  { tipo: "senal", patron: "part time", delta: 8 },
  { tipo: "senal", patron: "turno noche", delta: -10 },
  { tipo: "sin_senales" },
  { tipo: "jornada", declarada: "part_time" },
  { tipo: "jornada", declarada: "full_time" },
  { tipo: "jornada_desconocida", declarada: "part_time" },
  { tipo: "jornada_desconocida", declarada: "full_time" },
  { tipo: "requisito", que: "titulo" },
  { tipo: "requisito", que: "licencia" },
  { tipo: "requisito", que: "ingles" },
  { tipo: "modo_abierto" },
  { tipo: "sin_perfil" },
  { tipo: "inventado" },
  "No calza con tus filtros",
  null,
];

for (const r of razones) {
  const panel = formatearRazon(r);
  const marca = AP.razonComoEnElPanel(r);
  check(`texto igual al del panel: ${JSON.stringify(r)}`, panel === marca, { panel, marca });
  check(`a favor / en contra igual: ${JSON.stringify(r)}`, esRazonPositiva(r) === AP.esRazonPositiva(r), {
    panel: esRazonPositiva(r),
    marca: AP.esRazonPositiva(r),
  });
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
