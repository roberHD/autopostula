// docs/revision-scorer-2026-09-30.md §7: desde qué puntaje postula sola cada
// cuenta, ajustado con sus propias decisiones en "Por decidir".
//
// Lógica pura, sin base de datos: la usa /api/extension/perfil (que guarda el
// resultado en SearchPreferences una vez por semana) y la prueba
// scripts/verificar-banco-de-casos.ts.
//
// Solo puede BAJAR el corte, y como mucho 10 puntos. La persona solo decide lo
// que cae en la banda gris (46 a 64): de lo que el scorer postuló solo (65 o
// más) no hay veredicto, así que no hay con qué saber si habría que subirlo.
// Y lo que sí se puede ver es lo que importa: si de las dudosas más parecidas
// a lo que busca la persona aprueba casi todas, preguntarle es trabajo de más.

export const UMBRAL_POSTULAR_POR_DEFECTO = 65;
export const UMBRAL_GRIS_POR_DEFECTO = 45;

// "No se mueve con menos de 30 decisiones" y "nunca más de 10 puntos" (§7).
export const MIN_DECISIONES = 30;
export const MAX_BAJA = 10;
// Del tramo que pasaría a postularse solo: cuántas decisiones como mínimo, y
// qué parte tienen que ser "sí". Exigente a propósito: el perfil ya aprende de
// esas mismas decisiones (lib/compilar-perfil.ts), y una postulación enviada
// no se deshace.
export const MIN_EN_TRAMO = 10;
export const MIN_ACUERDO = 0.9;

// "Se recalcula una vez por semana, no en cada decisión", con las decisiones
// de los últimos tres meses: lo que la persona buscaba hace un año no cuenta.
export const DIAS_ENTRE_CALIBRACIONES = 7;
export const DIAS_DE_DECISIONES = 90;

/**
 * Las razones que dejan una oferta en "Por decidir" sin importar el puntaje
 * (extension/core.js AP.puntuarOferta, paso 9), y la del modo abierto, que no
 * puntúa el cargo. Un "no" a una oferta así puede ser por la jornada o por la
 * comuna, no por el puntaje: no dice nada sobre dónde poner el corte.
 */
export function esTopeDelScorer(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const x = r as { tipo?: unknown; certeza?: unknown; donde?: unknown };
  return (
    x.tipo === "ubicacion_desconocida" ||
    x.tipo === "jornada_desconocida" ||
    x.tipo === "rol_fuera_del_titulo" ||
    x.tipo === "modo_abierto" ||
    (x.tipo === "nivel" && x.certeza === "desconocida") ||
    (x.tipo === "veto" && x.donde === "cuerpo")
  );
}

export type DecisionParaCalibrar = { scoreLocal: number | null; veredicto: string; razones: unknown };

export type Calibracion = {
  /** El corte nuevo, o null para seguir con el valor por defecto. */
  umbral: number | null;
  /** Decisiones que sirvieron para calcularlo (banda gris, sin topes). */
  decisiones: number;
  /** Con el corte nuevo: cuántas decisiones caen en el tramo que se postularía solo, y qué parte fue "sí". */
  enTramo?: number;
  acuerdo?: number;
};

/** Las decisiones que dicen algo sobre el corte: un sí o un no, en la banda gris, por puntaje y no por un tope. */
export function decisionesQueCalibran<T extends DecisionParaCalibrar>(
  decisiones: T[],
  umbralPostular = UMBRAL_POSTULAR_POR_DEFECTO,
  umbralGris = UMBRAL_GRIS_POR_DEFECTO
): T[] {
  return decisiones.filter(
    (d) =>
      (d.veredicto === "SI" || d.veredicto === "NO") &&
      typeof d.scoreLocal === "number" &&
      d.scoreLocal > umbralGris &&
      d.scoreLocal < umbralPostular &&
      !(Array.isArray(d.razones) && d.razones.some(esTopeDelScorer))
  );
}

/**
 * El corte más bajo (hasta 10 puntos bajo el normal) desde el cual la persona
 * aprobó al menos el 90% de lo que le preguntamos, con al menos 10 decisiones
 * en ese tramo y 30 en total. Si no hay uno así, null: se queda el normal.
 *
 * Solo se prueban puntajes que de verdad tuvo alguna decisión: si nadie decidió
 * nada con 55 a 57, bajar a 55 sería adivinar qué habría dicho ahí.
 */
export function calcularUmbralPostular(
  decisiones: DecisionParaCalibrar[],
  umbralPostular = UMBRAL_POSTULAR_POR_DEFECTO,
  umbralGris = UMBRAL_GRIS_POR_DEFECTO
): Calibracion {
  const utiles = decisionesQueCalibran(decisiones, umbralPostular, umbralGris);
  if (utiles.length < MIN_DECISIONES) return { umbral: null, decisiones: utiles.length };

  const piso = Math.max(umbralGris + 1, umbralPostular - MAX_BAJA);
  const cortes = [...new Set(utiles.map((d) => d.scoreLocal as number))].filter((s) => s >= piso).sort((a, b) => a - b);
  for (const corte of cortes) {
    const tramo = utiles.filter((d) => (d.scoreLocal as number) >= corte);
    // Subir el corte solo achica el tramo: si ya no alcanza, no va a alcanzar.
    if (tramo.length < MIN_EN_TRAMO) break;
    const acuerdo = tramo.filter((d) => d.veredicto === "SI").length / tramo.length;
    if (acuerdo >= MIN_ACUERDO) return { umbral: corte, decisiones: utiles.length, enTramo: tramo.length, acuerdo };
  }
  return { umbral: null, decisiones: utiles.length };
}

/** Si toca volver a calcular: está prendido y pasó una semana desde la última vez (o nunca se calculó). */
export function tocaCalibrar(
  prefs: { calibrarUmbral: boolean; umbralCalibradoEn: Date | null },
  ahora: Date = new Date()
): boolean {
  if (!prefs.calibrarUmbral) return false;
  if (!prefs.umbralCalibradoEn) return true;
  return ahora.getTime() - prefs.umbralCalibradoEn.getTime() >= DIAS_ENTRE_CALIBRACIONES * 86_400_000;
}
