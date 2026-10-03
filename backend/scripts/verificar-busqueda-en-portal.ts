// Verificación de lib/busqueda-en-portal.ts (docs/primera-busqueda-guiada.md §10):
// el botón "Buscar en …" del panel tiene que abrir la misma página que revisa
// la extensión. Corre las dos versiones con los mismos casos: la del panel y la
// de extension/background.js tal cual (de normalizarParaUrl hasta el final de
// URL_BUSQUEDA_POR_PORTAL), con la tabla de comunas de la extensión.
// Sin base de datos ni navegador. Es para correr a mano, desde backend/:
//   npx tsx scripts/verificar-busqueda-en-portal.ts
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { filtrosDeLaCuenta, urlDeBusqueda, type FiltrosBusqueda } from "../lib/busqueda-en-portal";
import { LISTA_LIMPIEZA_CL } from "./limpieza/cl";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else console.log("✓ " + desc);
}

// ── La versión de la extensión ───────────────────────────────────────────
const carpeta = path.resolve(process.cwd(), "..", "extension");
const contexto: Record<string, unknown> = {};
contexto.self = contexto;
contexto.window = contexto;
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(carpeta, "data", "comunas-cl.js"), "utf8"), contexto, { filename: "comunas-cl.js" });

// Sin los "\r" de Windows: el corte busca el cierre del objeto.
const fondo = fs.readFileSync(path.join(carpeta, "background.js"), "utf8").replace(/\r\n/g, "\n");
const ini = fondo.indexOf("function normalizarParaUrl");
const objeto = fondo.indexOf("const URL_BUSQUEDA_POR_PORTAL");
const fin = fondo.indexOf("\n};\n", objeto) + 4;
check("background.js trae normalizarParaUrl y URL_BUSQUEDA_POR_PORTAL, en ese orden", ini > 0 && objeto > ini && fin > objeto);
vm.runInContext(
  fondo.slice(ini, fin) + "\nthis.URL_BUSQUEDA_POR_PORTAL = URL_BUSQUEDA_POR_PORTAL; this.normalizarParaUrl = normalizarParaUrl;",
  contexto,
  { filename: "background.js" }
);
const extension = contexto as unknown as {
  URL_BUSQUEDA_POR_PORTAL: Record<string, (slug: string, filtros: FiltrosBusqueda | null) => string>;
  normalizarParaUrl: (texto: string) => string;
};
function deLaExtension(portal: string, etiqueta: string, filtros: FiltrosBusqueda | null): string {
  return extension.URL_BUSQUEDA_POR_PORTAL[portal](extension.normalizarParaUrl(etiqueta), filtros);
}

// ── Los casos ────────────────────────────────────────────────────────────
const comunasDe = (region: string) =>
  LISTA_LIMPIEZA_CL.filter((t) => t.tipo === "comuna" && t.region === region).map((t) => t.termino);

const casos: { nombre: string; filtros: FiltrosBusqueda | null }[] = [
  { nombre: "sin filtros", filtros: null },
  { nombre: "nada elegido", filtros: { modalidad: "cualquiera", jornada: "cualquiera", comunas: [] } },
  { nombre: "Ñuñoa, part time", filtros: { modalidad: "cualquiera", jornada: "part_time", comunas: ["ñuñoa"] } },
  { nombre: "nunoa sin tilde, full time", filtros: { modalidad: "presencial", jornada: "full_time", comunas: ["nunoa"] } },
  { nombre: "tres comunas de la RM", filtros: { modalidad: "cualquiera", jornada: "part_time", comunas: ["providencia", "ñuñoa", "santiago centro"] } },
  { nombre: "toda la RM (con variantes y abreviaturas)", filtros: { modalidad: "cualquiera", jornada: "part_time", comunas: comunasDe("RM") } },
  { nombre: "comunas de dos regiones", filtros: { modalidad: "cualquiera", jornada: "cualquiera", comunas: ["ñuñoa", "viña del mar"] } },
  { nombre: "remoto, aunque tenga comuna", filtros: { modalidad: "remoto", jornada: "part_time", comunas: ["ñuñoa"] } },
  { nombre: "híbrido en Providencia", filtros: { modalidad: "hibrido", jornada: "full_time", comunas: ["providencia"] } },
  { nombre: "dos comunas de Valparaíso", filtros: { modalidad: "cualquiera", jornada: "cualquiera", comunas: ["valparaiso", "viña del mar"] } },
  { nombre: "Chillán (Ñuble)", filtros: { modalidad: "cualquiera", jornada: "part_time", comunas: ["chillan"] } },
  { nombre: "stgo y santiago cuentan como una", filtros: { modalidad: "cualquiera", jornada: "cualquiera", comunas: ["stgo", "santiago"] } },
  { nombre: "Temuco (Laborum sin ubicación fuera de la RM)", filtros: { modalidad: "cualquiera", jornada: "full_time", comunas: ["temuco"] } },
  { nombre: "una comuna que no existe", filtros: { modalidad: "cualquiera", jornada: "cualquiera", comunas: ["narnia"] } },
];
const etiquetas = ["Vendedora", "Vendedor/a part-time", "Ejecutivo(a) de ventas", "Cajero  Bodeguero", "Técnico en enfermería"];

for (const portal of ["Computrabajo", "Laborum", "Trabajando"]) {
  for (const caso of casos) {
    const distintas: { etiqueta: string; panel: string | null; extension: string }[] = [];
    for (const etiqueta of etiquetas) {
      const panel = urlDeBusqueda(portal, etiqueta, caso.filtros);
      const ext = deLaExtension(portal, etiqueta, caso.filtros);
      if (panel !== ext) distintas.push({ etiqueta, panel, extension: ext });
    }
    check(`${portal}, ${caso.nombre}: la misma dirección que la extensión`, distintas.length === 0, distintas[0]);
  }
}

// Que los casos de verdad ejerciten los filtros (si no, comparar no prueba nada).
check(
  "Ñuñoa part time en Computrabajo filtra comuna y jornada",
  urlDeBusqueda("Computrabajo", "Vendedora", casos[2].filtros) === "https://cl.computrabajo.com/trabajo-de-vendedora-en-nunoa-jornada-part-time",
  urlDeBusqueda("Computrabajo", "Vendedora", casos[2].filtros)
);
check(
  "toda la RM en Laborum busca en la región",
  urlDeBusqueda("Laborum", "Vendedora", casos[5].filtros) === "https://www.laborum.cl/en-region-metropolitana/empleos-part-time-busqueda-vendedora.html",
  urlDeBusqueda("Laborum", "Vendedora", casos[5].filtros)
);
check(
  "toda la RM en Trabajando usa ?region=1",
  urlDeBusqueda("Trabajando", "Vendedora", casos[5].filtros) === "https://www.trabajando.cl/trabajo-empleo/vendedora?region=1",
  urlDeBusqueda("Trabajando", "Vendedora", casos[5].filtros)
);
check("un portal sin búsqueda da null", urlDeBusqueda("Bumeran", "Vendedora", null) === null);
check("una etiqueta vacía da null", urlDeBusqueda("Computrabajo", "  ", null) === null);

// ── filtrosDeLaCuenta: el perfil compilado manda, como en la extensión ──
const f1 = filtrosDeLaCuenta({
  modalidad: "presencial",
  jornada: "full_time",
  perfilCompilado: { modalidad: "hibrido", jornada: "part_time", ubicacion: { comunas: ["ñuñoa", 3] } },
});
check("el perfil compilado manda sobre los filtros viejos", f1.modalidad === "hibrido" && f1.jornada === "part_time", f1);
check("las comunas salen del perfil compilado (y solo los textos)", JSON.stringify(f1.comunas) === '["ñuñoa"]', f1);
const f2 = filtrosDeLaCuenta({ modalidad: "remoto", jornada: "cualquiera", perfilCompilado: null });
check("sin perfil compilado, los filtros de siempre y sin comunas", f2.modalidad === "remoto" && f2.jornada === "cualquiera" && f2.comunas!.length === 0, f2);
const f3 = filtrosDeLaCuenta(null);
check("sin preferencias, 'cualquiera'", f3.modalidad === "cualquiera" && f3.jornada === "cualquiera", f3);

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
