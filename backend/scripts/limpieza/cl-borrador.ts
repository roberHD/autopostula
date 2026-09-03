import type { TerminoLimpieza } from "./cl";

// BORRADOR -- pendiente de revisión de Roberto. A diferencia de cl.ts (su lista de
// comunas/malls, hecha a mano), esto es un primer intento mío para las categorías
// que pide docs/rediseno-filtrado-ofertas.md §7.3 pero que todavía no tienen datos
// reales: región, modalidad, tipo de contrato, marcadores de género y ruido de
// marketing. Son solo los ejemplos que el propio documento nombra explícitamente
// (más las opciones de modalidad que ya usa el resto de la app en
// app/dashboard/filtros/page.tsx) -- nada inventado desde cero.
//
// Por diseño (§12, "no se adivina qué falta, los datos dicen qué ruido es el más
// caro que sigue suelto") esto se completa DESPUÉS de correr el scrape (§7.1) y
// mirar qué ruido de alta frecuencia queda sin colapsar. Tratar esto como un punto
// de partida, no como la lista final.
export const LISTA_LIMPIEZA_CL_BORRADOR: TerminoLimpieza[] = [
  // -------------------------
  // REGIONES (nombre completo + alguna forma coloquial corta). Varias coinciden
  // literalmente con el nombre de su propia capital/comuna homónima (ej. "coquimbo",
  // "valparaiso") -- no es un problema: la categoría comuna se procesa primero, así
  // que si el título dice solo "Coquimbo" ya queda capturado como comuna y esta
  // entrada de región simplemente no encuentra nada que hacer.
  { termino: "arica y parinacota", tipo: "region", destino: "region", region: "AP" },
  { termino: "tarapaca", tipo: "region", destino: "region", region: "TA" },
  { termino: "antofagasta", tipo: "region", destino: "region", region: "AN" },
  { termino: "atacama", tipo: "region", destino: "region", region: "AT" },
  { termino: "coquimbo", tipo: "region", destino: "region", region: "CO" },
  { termino: "valparaiso", tipo: "region", destino: "region", region: "VA" },
  { termino: "region metropolitana", tipo: "region", destino: "region", region: "RM" },
  { termino: "metropolitana", tipo: "region", destino: "region", region: "RM" },
  // Abreviación "RM" -- se ve seguido en avisos reales (confirmado navegando
  // Computrabajo en vivo, ej. "Gestor/a Comercial en Terreno para la RM Pudahuel").
  // Con límites de palabra no hay riesgo de comerse subcadenas, así que entra pese
  // a ser corta.
  { termino: "rm", tipo: "region", destino: "region", region: "RM" },
  { termino: "ohiggins", tipo: "region", destino: "region", region: "OH" },
  { termino: "libertador bernardo ohiggins", tipo: "region", destino: "region", region: "OH" },
  { termino: "maule", tipo: "region", destino: "region", region: "ML" },
  { termino: "nuble", tipo: "region", destino: "region", region: "NB" },
  { termino: "biobio", tipo: "region", destino: "region", region: "BI" },
  { termino: "bio bio", tipo: "region", destino: "region", region: "BI" },
  { termino: "araucania", tipo: "region", destino: "region", region: "AR" },
  { termino: "la araucania", tipo: "region", destino: "region", region: "AR" },
  { termino: "los rios", tipo: "region", destino: "region", region: "LR" },
  { termino: "los lagos", tipo: "region", destino: "region", region: "LL" },
  { termino: "aysen", tipo: "region", destino: "region", region: "AI" },
  { termino: "aisen", tipo: "region", destino: "region", region: "AI" },
  { termino: "magallanes", tipo: "region", destino: "region", region: "MA" },
  { termino: "magallanes y la antartica chilena", tipo: "region", destino: "region", region: "MA" },

  // -------------------------
  // MODALIDAD (mismas opciones que OPCIONES_MODALIDAD en app/dashboard/filtros/page.tsx)
  // -------------------------
  { termino: "100% remoto", tipo: "modalidad", destino: "modalidad", valor: "remoto" },
  { termino: "trabajo remoto", tipo: "modalidad", destino: "modalidad", valor: "remoto" },
  { termino: "remoto", tipo: "modalidad", destino: "modalidad", valor: "remoto" },
  { termino: "hibrido", tipo: "modalidad", destino: "modalidad", valor: "hibrido" },
  { termino: "presencial", tipo: "modalidad", destino: "modalidad", valor: "presencial" },

  // -------------------------
  // TIPO DE CONTRATO (los que nombra el documento en §7.3, "Qué va en las listas")
  // -------------------------
  { termino: "plazo fijo", tipo: "contrato", destino: "contrato", valor: "plazo_fijo" },
  { termino: "reemplazo", tipo: "contrato", destino: "contrato", valor: "reemplazo" },
  { termino: "temporada", tipo: "contrato", destino: "contrato", valor: "temporada" },
  { termino: "indefinido", tipo: "contrato", destino: "contrato", valor: "indefinido" },
  { termino: "por honorarios", tipo: "contrato", destino: "contrato", valor: "honorarios" },
  { termino: "practica profesional", tipo: "contrato", destino: "contrato", valor: "practica" },

  // -------------------------
  // MARCADORES DE GÉNERO (los mismos ejemplos del documento, §7.3)
  // -------------------------
  { termino: "(o/a)", tipo: "genero", destino: "descartar" },
  { termino: "(a/o)", tipo: "genero", destino: "descartar" },
  { termino: "(a)", tipo: "genero", destino: "descartar" },
  { termino: "(o)", tipo: "genero", destino: "descartar" },
  { termino: "o/a", tipo: "genero", destino: "descartar" },
  { termino: "a/o", tipo: "genero", destino: "descartar" },
  { termino: "/a", tipo: "genero", destino: "descartar" },
  { termino: "/o", tipo: "genero", destino: "descartar" },

  // -------------------------
  // RUIDO DE MARKETING (los mismos ejemplos del documento, §7.3 -- "el que más
  // sorprende por volumen")
  // -------------------------
  { termino: "urgente", tipo: "marketing", destino: "descartar" },
  { termino: "postula ya", tipo: "marketing", destino: "descartar" },
  { termino: "gran oportunidad", tipo: "marketing", destino: "descartar" },
  { termino: "se necesita", tipo: "marketing", destino: "descartar" },
  { termino: "buscamos", tipo: "marketing", destino: "descartar" },
  { termino: "importante empresa", tipo: "marketing", destino: "descartar" },
  { termino: "con o sin experiencia", tipo: "marketing", destino: "descartar" },
  { termino: "ingreso inmediato", tipo: "marketing", destino: "descartar" },
];
