// docs/revision-scorer-2026-09-30.md §7: desde qué puntaje postula sola cada
// cuenta, ajustado con sus propias decisiones.
//
// Lógica pura, sin base de datos: la usa /api/extension/perfil (que guarda el
// resultado en SearchPreferences una vez por semana) y la prueba
// scripts/verificar-banco-de-casos.ts.
//
// La regla es una sola: postula sola desde donde la persona aprueba 9 de cada
// 10 de lo que decidió, y el corte se mueve como mucho 10 puntos.
//   - BAJA con lo que decide en "Por decidir" (46 a 64): si de las dudosas más
//     parecidas a lo que busca aprueba casi todas, preguntarle es trabajo de más.
//   - SUBE con lo que quita en el panel del portal (docs/panel-de-revision-en-
//     el-portal.md §9.3): ahí ve lo que la extensión iba a postular sola (65 o
//     más), y desmarcar una es el error que gasta cupo. Antes de ese panel no
//     había veredicto sobre eso, y el corte solo podía bajar.

export const UMBRAL_POSTULAR_POR_DEFECTO = 65;
export const UMBRAL_GRIS_POR_DEFECTO = 45;

// "No se mueve con menos de 30 decisiones" y "nunca más de 10 puntos" (§7).
export const MIN_DECISIONES = 30;
export const MAX_BAJA = 10;
export const MAX_SUBE = 10;
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

/**
 * Un sí o un no con el puntaje que tenía la oferta. Vienen de "Por decidir" o
 * del panel del portal: ahí, las de «te sirve» que la persona dejó marcadas
 * (sí) o quitó (no). Cuál es cuál solo importa para el puntaje que traen.
 */
export type DecisionParaCalibrar = { scoreLocal: number | null; veredicto: string; razones: unknown };

export type Calibracion = {
  /** El corte nuevo, o null para seguir con el valor por defecto. */
  umbral: number | null;
  /** Decisiones que sirvieron para calcularlo: las de abajo del corte normal si bajó o se quedó, las de arriba si subió (o no pudo subir). */
  decisiones: number;
  /** Con el corte nuevo: cuántas decisiones caen en el tramo que se postularía solo, y qué parte fue "sí". */
  enTramo?: number;
  acuerdo?: number;
  /**
   * Quitó tanto de lo que iba a salir solo que habría que subirlo, pero subirlo
   * 10 puntos no alcanza: lo que quita está repartido en todos los puntajes. El
   * problema no es el corte, es lo que mide el puntaje (se queda el normal).
   */
  noSepara?: boolean;
};

function conVeredicto(d: DecisionParaCalibrar): boolean {
  return (
    (d.veredicto === "SI" || d.veredicto === "NO") &&
    typeof d.scoreLocal === "number" &&
    !(Array.isArray(d.razones) && d.razones.some(esTopeDelScorer))
  );
}

function acuerdoDe(decisiones: DecisionParaCalibrar[]): number {
  return decisiones.length ? decisiones.filter((d) => d.veredicto === "SI").length / decisiones.length : 1;
}

/** Las decisiones que dicen algo sobre bajar el corte: un sí o un no, en la banda gris, por puntaje y no por un tope. */
export function decisionesQueCalibran<T extends DecisionParaCalibrar>(
  decisiones: T[],
  umbralPostular = UMBRAL_POSTULAR_POR_DEFECTO,
  umbralGris = UMBRAL_GRIS_POR_DEFECTO
): T[] {
  return decisiones.filter(
    (d) => conVeredicto(d) && (d.scoreLocal as number) > umbralGris && (d.scoreLocal as number) < umbralPostular
  );
}

/**
 * Subir el corte (docs/panel-de-revision-en-el-portal.md §9.3). Mira lo que hoy
 * se postularía solo (desde el corte normal) con lo que dijo la persona: lo que
 * quitó o dejó marcado en el panel del portal y, si el corte ya estuvo más
 * arriba, lo que decidió de ese tramo en "Por decidir". null si no hay con qué
 * decidirlo (menos de 30) o si de eso aprueba 9 de cada 10: entonces no sube.
 *
 * Dejar una marcada puede ser no haberla mirado, así que los "sí" de ahí pesan
 * de más; por eso mismo, que igual no llegue al 90% es una señal clara.
 */
function calcularSubida(decisiones: DecisionParaCalibrar[], umbralPostular: number): Calibracion | null {
  const arriba = decisiones.filter((d) => conVeredicto(d) && (d.scoreLocal as number) >= umbralPostular);
  if (arriba.length < MIN_DECISIONES || acuerdoDe(arriba) >= MIN_ACUERDO) return null;
  const techo = umbralPostular + MAX_SUBE;
  const cortes = [...new Set(arriba.map((d) => d.scoreLocal as number))].filter((s) => s > umbralPostular && s <= techo).sort((a, b) => a - b);
  for (const corte of cortes) {
    const tramo = arriba.filter((d) => (d.scoreLocal as number) >= corte);
    if (tramo.length < MIN_EN_TRAMO) break;
    const acuerdo = acuerdoDe(tramo);
    if (acuerdo >= MIN_ACUERDO) return { umbral: corte, decisiones: arriba.length, enTramo: tramo.length, acuerdo };
  }
  return { umbral: null, decisiones: arriba.length, noSepara: true };
}

/**
 * Primero, si hay que subirlo (calcularSubida): no postular solo lo que la
 * persona quita pesa más que preguntarle de menos. Si no, el corte más bajo
 * (hasta 10 puntos bajo el normal) desde el cual la persona aprobó al menos el
 * 90% de lo que le preguntamos, con al menos 10 decisiones en ese tramo y 30 en
 * total. Si no hay uno así, null: se queda el normal.
 *
 * Solo se prueban puntajes que de verdad tuvo alguna decisión: si nadie decidió
 * nada con 55 a 57, bajar a 55 sería adivinar qué habría dicho ahí.
 */
export function calcularUmbralPostular(
  decisiones: DecisionParaCalibrar[],
  umbralPostular = UMBRAL_POSTULAR_POR_DEFECTO,
  umbralGris = UMBRAL_GRIS_POR_DEFECTO
): Calibracion {
  const subida = calcularSubida(decisiones, umbralPostular);
  if (subida) return subida;
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
