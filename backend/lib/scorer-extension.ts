// El scorer real de la extensión (extension/core.js, AP.puntuarOferta) cargado
// en Node, para volver a correrlo sobre decisiones guardadas
// (docs/revision-scorer-2026-09-30.md §6). Igual que
// extension/verificar-scorer.js: el código que corre en Chrome, no una copia.
//
// Solo para scripts: lee archivos del disco. Se corre desde backend/, con la
// extensión al lado (../extension).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export type BandaScorer = "postular" | "gris" | "descartar";
export type ResultadoScorer = { banda: BandaScorer; score: number; razones: unknown[] };
export type CamposOferta = {
  titulo: string;
  empresa?: string | null;
  ubicacion?: string | null;
  cuerpo?: string | null;
};

export function cargarScorerDeLaExtension(
  carpeta = path.resolve(process.cwd(), "..", "extension")
): (campos: CamposOferta, perfil: Record<string, unknown>) => ResultadoScorer {
  const documento = { documentElement: {} };
  const contexto: Record<string, unknown> = {
    window: { document: documento },
    document: documento,
    chrome: {
      runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {}, lastError: null },
      storage: {
        local: { get: (_k: unknown, cb: (d: object) => void) => cb({}), set: () => {} },
        sync: { get: (_k: unknown, cb: (d: object) => void) => cb({}), set: () => {} },
      },
    },
    MutationObserver: class {
      observe() {}
    },
    // Al cargar, core.js trata de arrancar como en una pestaña de portal (y
    // avisa que no puede): nada de eso le sirve al banco, así que se calla.
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(contexto);
  // Mismo orden que manifest.json: sin la lista de comunas no se reconoce
  // ninguna ubicación.
  for (const archivo of ["data/comunas-cl.js", "core.js"]) {
    vm.runInContext(fs.readFileSync(path.join(carpeta, archivo), "utf8"), contexto, { filename: archivo });
  }
  const AP = (contexto.window as { AP?: { puntuarOferta?: Function } }).AP;
  if (!AP || typeof AP.puntuarOferta !== "function") {
    throw new Error(`No se encontró AP.puntuarOferta en ${path.join(carpeta, "core.js")}`);
  }
  const puntuar = AP.puntuarOferta;
  return (campos, perfil) =>
    puntuar(
      {
        titulo: campos.titulo || "",
        empresa: campos.empresa || "",
        ubicacion: campos.ubicacion || "",
        cuerpo: campos.cuerpo || "",
      },
      perfil
    ) as ResultadoScorer;
}
