import { LISTA_LIMPIEZA_CL } from "@/scripts/limpieza/cl";

export type UbicacionDeclarada = { regiones?: string[]; comunas?: string[]; todaLaRegion?: boolean; aceptaRemoto?: boolean };

/**
 * De lo que la persona declaró en el selector de ubicación (onboarding y
 * Filtros) a la lista de comunas que usa el scorer de la extensión.
 *
 * docs/revision-2026-09-16.md §2.1: la ubicación se declara (opciones
 * cerradas, ver /api/regiones-comunas), no se infiere del CV con IA. Si declaró
 * "toda la región", se expande a las comunas reales de esa región usando la
 * misma lista que ya usa el parser de títulos (scripts/limpieza/cl.ts) -- una
 * sola fuente para las 346 comunas, no una copia aparte que se pueda
 * desincronizar.
 *
 * Una región elegida sin ninguna comuna también es "toda la región". Antes
 * quedaba como una lista vacía, y una lista vacía es "sin filtro de lugar": quien
 * elegía la Región Metropolitana y no marcaba comunas recibía ofertas de Viña
 * del Mar. Si eligió comunas, mandan las comunas: la región solo dice dónde
 * buscarlas en el selector.
 *
 * Vivía en lib/compilar-perfil.ts; está aparte para que el perfil que se le
 * sirve a la extensión (lib/perfil-scorer.ts) lo calcule en cada consulta sin
 * cargar el módulo de la IA.
 */
export function expandirUbicacionDeclarada(decl: UbicacionDeclarada): { comunas: string[]; aceptaRemoto: boolean } {
  const regiones = Array.isArray(decl.regiones) ? decl.regiones : [];
  const comunas = new Set(
    (Array.isArray(decl.comunas) ? decl.comunas : []).map((c) => c.toLowerCase().trim()).filter(Boolean)
  );
  const regionEntera = !!decl.todaLaRegion || comunas.size === 0;
  if (regionEntera && regiones.length) {
    for (const t of LISTA_LIMPIEZA_CL) {
      if (t.tipo === "comuna" && regiones.includes(t.region)) comunas.add(t.termino);
    }
  }
  return { comunas: [...comunas], aceptaRemoto: !!decl.aceptaRemoto };
}

/** ¿Es una declaración de verdad, o un objeto vacío/ajeno guardado en el campo? */
export function esUbicacionDeclarada(valor: unknown): valor is UbicacionDeclarada {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}
