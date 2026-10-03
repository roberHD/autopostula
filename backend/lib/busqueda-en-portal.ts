import { LISTA_LIMPIEZA_CL } from "@/scripts/limpieza/cl";

/**
 * La búsqueda de cada portal, armada igual que la arma la extensión
 * (extension/background.js, URL_BUSQUEDA_POR_PORTAL y ubicacionDeBusqueda).
 *
 * La usa la primera búsqueda del panel (docs/primera-busqueda-guiada.md §10):
 * el botón "Buscar en Computrabajo" tiene que abrir la misma página que
 * revisaría la extensión sola -- con la comuna o la región y la jornada que la
 * persona pidió. Sin esos filtros, Computrabajo muestra todo Chile y lo primero
 * que ve alguien nuevo es una lista de "No calza: es en Antofagasta".
 *
 * Es una copia: la extensión no puede importar este archivo (es otro proyecto,
 * sin build). scripts/verificar-busqueda-en-portal.ts corre las dos versiones
 * con los mismos casos y falla si dejan de armar la misma dirección.
 */

export type FiltrosBusqueda = {
  modalidad?: string | null;
  jornada?: string | null;
  comunas?: string[] | null;
};

// Lo que guarda SearchPreferences, en lo que usa la búsqueda. El perfil
// compilado manda sobre los filtros viejos, como en la extensión
// (actualizarFiltrosDesdeBackend).
export function filtrosDeLaCuenta(preferencias: {
  modalidad?: string | null;
  jornada?: string | null;
  perfilCompilado?: unknown;
} | null): FiltrosBusqueda {
  const compilado = (preferencias?.perfilCompilado ?? null) as {
    modalidad?: string;
    jornada?: string;
    ubicacion?: { comunas?: unknown };
  } | null;
  const comunas = compilado?.ubicacion?.comunas;
  return {
    modalidad: compilado?.modalidad || preferencias?.modalidad || "cualquiera",
    jornada: compilado?.jornada || preferencias?.jornada || "cualquiera",
    comunas: Array.isArray(comunas) ? comunas.filter((c): c is string => typeof c === "string") : [],
  };
}

// Mismo slug que normalizarParaUrl en la extensión.
export function slugDeBusqueda(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Comunas de la Región Metropolitana: las únicas en que Laborum filtra por
// comuna (necesita el prefijo de la región, y solo el de la RM está verificado).
const COMUNAS_RM = new Set([
  "santiago centro", "las condes", "providencia", "maipu", "quilicura",
  "huechuraba", "la florida", "pudahuel", "san bernardo", "nunoa", "colina",
  "puente alto", "estacion central", "cerrillos", "lo barnechea", "macul",
  "la reina", "vitacura", "lampa", "san miguel", "independencia", "renca",
  "recoleta", "quinta normal", "penalolen", "conchali", "el bosque",
  "la cisterna", "san joaquin", "pedro aguirre cerda", "talagante",
  "penaflor", "lo espejo", "melipilla", "la granja", "cerro navia", "buin",
  "la pintana", "padre hurtado", "san ramon", "calera de tango", "el monte",
  "lo prado", "pirque", "isla de maipo", "paine", "curacavi", "maria pinto",
  "san jose de maipo", "alhue",
]);

// La región como la escribe cada portal (verificado contra los sitios reales,
// ver background.js).
const REGION_TRABAJANDO: Record<string, number> = {
  AP: 473, TA: 2, AN: 3, AT: 4, CO: 5, VA: 6, RM: 1, OH: 7,
  ML: 8, NB: 556, BI: 9, AR: 10, LR: 472, LL: 11, AI: 12, MA: 13,
};
const REGION_COMPUTRABAJO: Record<string, string> = {
  AP: "arica-y-parinacota", TA: "tarapaca", AN: "antofagasta", AT: "atacama",
  CO: "coquimbo", VA: "valparaiso", RM: "rmetropolitana", OH: "libertador-b-o-higgins",
  ML: "maule", NB: "biobio", BI: "biobio", AR: "araucania", LR: "los-rios",
  LL: "los-lagos", AI: "aisen-del-gral-c-ibanez-del-campo", MA: "magallanes-y-antartica-chilena",
};

function sinTildes(texto: string): string {
  return (texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function comunaParaUrl(comuna: string): string {
  return comuna.trim().replace(/\s+/g, "-");
}

// La misma tabla que extension/data/comunas-cl.js (se genera de esta lista).
let regionesPorComuna: Map<string, Set<string>> | null = null;
function regionesDe(): Map<string, Set<string>> {
  if (regionesPorComuna) return regionesPorComuna;
  const mapa = new Map<string, Set<string>>();
  for (const t of LISTA_LIMPIEZA_CL) {
    if (t.tipo !== "comuna") continue;
    const clave = sinTildes(t.termino);
    if (!mapa.has(clave)) mapa.set(clave, new Set());
    mapa.get(clave)!.add(t.region);
  }
  regionesPorComuna = mapa;
  return mapa;
}

// "stgo" de santiago, "pac" de pedro aguirre cerda (ver esAbreviaturaDe en
// background.js, que explica cada condición).
function esAbreviaturaDe(corta: string, larga: string): boolean {
  if (larga.startsWith(corta + " ")) return false;
  const palabrasLarga = larga.split(/\s+/);
  const pareceAbreviatura =
    corta.includes(".") || corta.split(/[\s.]+/).some((p) => p && p.length <= 4 && !palabrasLarga.includes(p));
  if (!pareceAbreviatura) return false;
  const a = corta.replace(/[^a-z]/g, "");
  const b = larga.replace(/[^a-z]/g, "");
  if (!a || a.length >= b.length || a[0] !== b[0]) return false;
  let i = 0;
  for (const letra of b) if (letra === a[i]) i++;
  return i === a.length;
}

// Una sola comuna -> esa comuna; varias de una región -> la región; de varias
// regiones, o remoto -> sin ubicación. Devuelve { comuna, region }, { region } o null.
export function ubicacionDeBusqueda(filtros: FiltrosBusqueda | null): { comuna?: string; region: string | null } | null {
  if (!filtros || filtros.modalidad === "remoto") return null;
  const tabla = regionesDe();
  const claves = new Set<string>();
  for (const nombre of filtros.comunas || []) {
    const clave = sinTildes(nombre);
    if (tabla.has(clave)) claves.add(clave);
  }
  const todas = [...claves];
  const comunas = todas.filter((c) => !todas.some((otra) => otra !== c && esAbreviaturaDe(c, otra)));
  if (!comunas.length) return null;
  const comunes = [...tabla.get(comunas[0])!].filter((r) => comunas.every((c) => tabla.get(c)!.has(r)));
  const region = comunes.length === 1 ? comunes[0] : null;
  if (comunas.length === 1) return { comuna: comunas[0], region };
  return region ? { region } : null;
}

const CONSTRUIR: Record<string, (slug: string, filtros: FiltrosBusqueda | null) => string> = {
  Computrabajo: (slug, filtros) => {
    let url = "https://cl.computrabajo.com/trabajo-de-" + slug;
    const donde = ubicacionDeBusqueda(filtros);
    if (donde && donde.comuna) url += "-en-" + comunaParaUrl(donde.comuna);
    else if (donde && donde.region && REGION_COMPUTRABAJO[donde.region]) url += "-en-" + REGION_COMPUTRABAJO[donde.region];
    if (filtros) {
      if (filtros.modalidad === "remoto") url += "-en-remoto";
      else if (filtros.modalidad === "hibrido") url += "-hibrido";
      if (filtros.jornada === "part_time") url += "-jornada-part-time";
    }
    return url;
  },
  Laborum: (slug, filtros) => {
    let prefijo = "";
    const donde = ubicacionDeBusqueda(filtros);
    if (donde && donde.comuna && COMUNAS_RM.has(donde.comuna)) {
      prefijo = "en-region-metropolitana/" + comunaParaUrl(donde.comuna) + "/";
    } else if (donde && donde.region === "RM") {
      prefijo = "en-region-metropolitana/";
    }
    let archivo = "empleos-";
    if (filtros && filtros.jornada === "part_time") archivo += "part-time-";
    else if (filtros && filtros.jornada === "full_time") archivo += "full-time-";
    if (filtros && filtros.modalidad === "remoto") archivo += "modalidad-remoto-";
    else if (filtros && filtros.modalidad === "hibrido") archivo += "modalidad-hibrido-";
    archivo += "busqueda-" + slug + ".html";
    return "https://www.laborum.cl/" + prefijo + archivo;
  },
  Trabajando: (slug, filtros) => {
    let url = "https://www.trabajando.cl/trabajo-empleo/" + slug;
    const donde = ubicacionDeBusqueda(filtros);
    if (donde && donde.comuna) url += "?ubicacion=" + comunaParaUrl(donde.comuna);
    else if (donde && donde.region && REGION_TRABAJANDO[donde.region]) url += "?region=" + REGION_TRABAJANDO[donde.region];
    return url;
  },
};

/** La dirección de la búsqueda de `etiqueta` en `portal`, o null si ese portal no tiene búsqueda. */
export function urlDeBusqueda(portal: string, etiqueta: string, filtros: FiltrosBusqueda | null): string | null {
  const construir = CONSTRUIR[portal];
  const slug = slugDeBusqueda(etiqueta);
  if (!construir || !slug) return null;
  return construir(slug, filtros);
}

