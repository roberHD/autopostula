import { MAX_BAJA, MAX_SUBE, UMBRAL_POSTULAR_POR_DEFECTO } from "@/lib/calibracion-umbral";

/**
 * Cuánto pesa un objetivo laboral, en palabras (2026-11-03).
 *
 * El peso de un objetivo pasa tal cual al rol del perfil compilado, y el scorer
 * puntúa un cargo que calza en el título con peso × 100. Con el umbral de
 * postular en 65, eso hace que un objetivo de peso 0,5 NUNCA se postule solo:
 * sus ofertas sacan 50 y van a «Por decidir». Estaba bien diseñado y era
 * invisible: el panel mostraba un "0,5" pelado, y el onboarding ponía 0,5 al
 * segundo objetivo («También me interesa…») sin mostrar nada. Una cuenta nueva
 * puso «Diseñadora de Ambientes» primero y ventas segundo, y vio todas sus
 * ofertas de vendedora en «Por decidir» sin entender por qué.
 *
 * Ahora la persona elige entre dos cosas que entiende, y el número queda adentro.
 */
export const PESO_LO_BUSCO = 1;
export const PESO_LO_ACEPTARIA = 0.5;

// El umbral puede moverse por cuenta (lib/calibracion-umbral.ts, hasta MAX_BAJA
// hacia abajo y MAX_SUBE hacia arriba). Los dos valores tienen que quedar del
// lado correcto en cualquier caso: "lo busco" siempre llega, "lo aceptaría"
// nunca. Si alguien cambia esos números sin pensar en esto, falla al cargar.
const UMBRAL_MAS_BAJO = (UMBRAL_POSTULAR_POR_DEFECTO - MAX_BAJA) / 100;
const UMBRAL_MAS_ALTO = (UMBRAL_POSTULAR_POR_DEFECTO + MAX_SUBE) / 100;
if (PESO_LO_BUSCO < UMBRAL_MAS_ALTO || PESO_LO_ACEPTARIA >= UMBRAL_MAS_BAJO) {
  throw new Error("lib/peso-objetivo.ts: los pesos ya no quedan a cada lado del umbral de postular");
}

/**
 * true si un objetivo con este peso se postula solo cuando el cargo calza en el
 * título. Sirve también para los pesos viejos que no son ni 1 ni 0,5 (cuentas
 * anteriores a este cambio, o el número que antes se escribía a mano).
 */
export function seBuscaDeVerdad(peso: number): boolean {
  return peso * 100 >= UMBRAL_POSTULAR_POR_DEFECTO;
}

export const TEXTO_PESO = {
  loBusco: "Lo busco",
  loAceptaria: "Lo aceptaría",
  explicacion:
    "«Lo busco» se postula solo cuando una oferta calza. «Lo aceptaría» te lo pregunto antes, en «Por decidir».",
} as const;
