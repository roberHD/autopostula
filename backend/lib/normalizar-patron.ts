// docs/amplitud-de-busqueda.md §2.1-§2.2: el scorer (extension/core.js,
// apConstruirPatron) trata cada `patron` como UNA frase completa, en orden.
// La IA que compila el perfil a veces devuelve una lista separada por coma
// ("moda, vestuario, calzado, fashion") o una descripción ("retail genérico
// sin especialidad en moda/vestuario/calzado") en vez de un término -- eso
// nunca calza con ningún aviso real. Se normaliza acá, al guardar, para que
// el resultado no dependa de que la IA obedezca el prompt.

// Separa por coma, "/" o la palabra " o " (con espacios a los lados, para no
// partir "promotor" ni "comisiones").
const SEPARADOR_TERMINOS = /\s*,\s*|\s*\/\s*|\s+o\s+/i;

const MAX_PALABRAS_POR_TERMINO = 3;

/**
 * Un `patron` crudo de la IA puede ser una lista o una frase larga. Devuelve
 * los términos que de verdad sirven como patrón de búsqueda -- cortos, uno a
 * la vez.
 *
 * Todo o nada, a propósito -- no "los cortos que sobrevivan": una frase como
 * "retail genérico sin especialidad en moda/vestuario/calzado" (el veto real
 * de docs/amplitud-de-busqueda.md §1) parte por "/" en ["retail genérico sin
 * especialidad en moda", "vestuario", "calzado"]. Salvar los dos últimos y
 * descartar solo el primero (por largo) dejaría un veto sobre "vestuario" y
 * "calzado" -- exactamente lo CONTRARIO de la intención ("no quiero retail
 * genérico SIN esas especialidades"), y habría descartado la oferta que el
 * documento entero usa como ejemplo de que SÍ debía postularse. Si algún
 * fragmento no sirve como término, es señal de que esto no era una lista
 * plana sino una frase con esa lista adentro, y se descarta completa.
 */
export function normalizarPatron(patronCrudo: string | null | undefined): string[] {
  if (!patronCrudo) return [];
  const fragmentos = patronCrudo
    .split(SEPARADOR_TERMINOS)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!fragmentos.length) return [];
  const todosSonTerminos = fragmentos.every(
    (f) => f.split(/\s+/).filter(Boolean).length <= MAX_PALABRAS_POR_TERMINO
  );
  return todosSonTerminos ? fragmentos : [];
}

export type VetoCrudo = { patron?: string | null; razon?: string | null };
export type VetoNormalizado = { patron: string | null; razon: string };

/**
 * §2.2: un veto es "cargos que NO acepta" -- si el patrón no sobrevive a la
 * normalización, la intención (razon) no se pierde en silencio: se guarda
 * con patron=null para que Filtros de búsqueda la muestre como "esto no se
 * está aplicando" en vez de fingir que sigue filtrando.
 */
export function normalizarVetos(vetos: VetoCrudo[]): VetoNormalizado[] {
  return vetos.flatMap((v): VetoNormalizado[] => {
    const razon = v?.razon || "";
    const terminos = normalizarPatron(v?.patron);
    if (!terminos.length) {
      return razon ? [{ patron: null, razon }] : [];
    }
    return terminos.map((patron) => ({ patron, razon }));
  });
}

export type SenalCruda = { patron?: string | null; delta?: number | null };
export type SenalNormalizada = { patron: string; delta: number };

/** §2.1: una señal que no sobrevive a la normalización simplemente se cae -- no tiene razon que preservar. */
export function normalizarSenales(senales: SenalCruda[]): SenalNormalizada[] {
  return senales.flatMap((s): SenalNormalizada[] => {
    const delta = s?.delta || 0;
    return normalizarPatron(s?.patron).map((patron) => ({ patron, delta }));
  });
}
