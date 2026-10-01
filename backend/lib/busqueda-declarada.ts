/**
 * Lo que la persona declaró que busca (SearchPreferences), en palabras.
 *
 * Lo usan la página Hoy ("Lo que buscas") y la IA que responde los formularios
 * de postulación (docs/extension-trabajando-2026-09-30.md): sin esto, la IA no
 * sabía que la persona busca part time y presencial en la Región Metropolitana,
 * y "¿Tiene disponibilidad para trabajar presencialmente en La Dehesa?" quedaba
 * sin respuesta, con la postulación detenida.
 */

export const JORNADA: Record<string, string> = { full_time: "Jornada completa", part_time: "Part time" };
export const MODALIDAD: Record<string, string> = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

export type UbicacionDeclarada = { regiones?: string[]; comunas?: string[]; todaLaRegion?: boolean; aceptaRemoto?: boolean };

export const NOMBRE_REGION: Record<string, string> = {
  AP: "Arica y Parinacota", TA: "Tarapacá", AN: "Antofagasta", AT: "Atacama", CO: "Coquimbo",
  VA: "Valparaíso", RM: "Región Metropolitana", OH: "O'Higgins", ML: "Maule", NB: "Ñuble",
  BI: "Biobío", AR: "La Araucanía", LR: "Los Ríos", LL: "Los Lagos", AI: "Aysén", MA: "Magallanes",
};

// Las regiones enteras si eligió "toda la región"; si no, sus comunas.
export function lugaresDeclarados(ubicacion: UbicacionDeclarada | null | undefined): string[] {
  if (!ubicacion) return [];
  return ubicacion.todaLaRegion
    ? (ubicacion.regiones ?? []).map((r) => NOMBRE_REGION[r] ?? r)
    : ubicacion.comunas ?? [];
}

type PreferenciasParaIA = {
  jornada?: string | null;
  modalidad?: string | null;
  ubicacionDeclarada?: unknown;
} | null;

// El bloque del prompt con lo que busca. Vacío si no declaró nada.
export function bloqueBusquedaDeclarada(preferencias: PreferenciasParaIA): string {
  if (!preferencias) return "";
  const ubicacion = (preferencias.ubicacionDeclarada ?? null) as UbicacionDeclarada | null;
  const lugares = lugaresDeclarados(ubicacion);
  const lineas = [
    "Jornada que busca: " + (JORNADA[preferencias.jornada ?? ""] ?? "cualquiera"),
    "Modalidad que busca: " + (MODALIDAD[preferencias.modalidad ?? ""] ?? "cualquiera"),
    lugares.length ? "Donde puede trabajar: " + lugares.join(", ") : "",
    ubicacion?.aceptaRemoto ? "Acepta trabajo remoto: si" : "",
  ].filter(Boolean);
  return "Lo que el candidato declaro que busca (lo eligio el mismo en AutoPostula):\n" + lineas.map((l) => "- " + l).join("\n") + "\n";
}
