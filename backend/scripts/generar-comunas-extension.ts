import "dotenv/config";
import { writeFileSync } from "fs";
import { LISTA_LIMPIEZA_CL } from "./limpieza/cl";

// docs/revision-2026-09-16.md §2.1, punto 3: "la lista ya existe" -- genera
// extension/data/comunas-cl.js (AP.COMUNAS_CL) a partir de la MISMA lista de
// scripts/limpieza/cl.ts que ya usa el backend (parser de títulos y
// /api/regiones-comunas), para que las 346 comunas no vivan duplicadas en
// dos archivos que se puedan desincronizar.
//
// Uso manual, se corre cada vez que cambie scripts/limpieza/cl.ts:
//   npx tsx scripts/generar-comunas-extension.ts

const NOMBRE_REGION: Record<string, string> = {
  AP: "Arica y Parinacota",
  TA: "Tarapacá",
  AN: "Antofagasta",
  AT: "Atacama",
  CO: "Coquimbo",
  VA: "Valparaíso",
  RM: "Metropolitana de Santiago",
  OH: "O'Higgins",
  ML: "Maule",
  NB: "Ñuble",
  BI: "Biobío",
  AR: "La Araucanía",
  LR: "Los Ríos",
  LL: "Los Lagos",
  AI: "Aysén",
  MA: "Magallanes y la Antártica",
};

function main() {
  const comunas = LISTA_LIMPIEZA_CL.filter((t) => t.tipo === "comuna").map((t: any) => ({
    nombre: t.termino as string, // ya normalizado (minúsculas, sin tildes) -- ver scripts/limpieza/cl.ts
    region: t.region as string,
  }));

  const contenido =
    "// ═══════════════════════════════════════════════════════════════\n" +
    "//  AutoPostula — comunas de Chile (para el matching de ubicación del scorer)\n" +
    "//  GENERADO -- no editar a mano. Fuente: backend/scripts/limpieza/cl.ts\n" +
    "//  Regenerar con: npx tsx scripts/generar-comunas-extension.ts (desde backend/)\n" +
    "//  Se carga ANTES que core.js (ver manifest.json) -- expone AP.COMUNAS_CL.\n" +
    "// ═══════════════════════════════════════════════════════════════\n" +
    "(function() {\n" +
    "'use strict';\n" +
    "const AP = window.AP = window.AP || {};\n" +
    "// Array de {nombre, region} -- nombre ya normalizado (minúsculas, sin tildes).\n" +
    "AP.COMUNAS_CL = " + JSON.stringify(comunas) + ";\n" +
    "AP.NOMBRE_REGION_CL = " + JSON.stringify(NOMBRE_REGION) + ";\n" +
    "})();\n";

  const destino = "../extension/data/comunas-cl.js";
  writeFileSync(destino, contenido, "utf8");
  console.log(`Escritas ${comunas.length} comunas en ${destino}.`);
}

main();
