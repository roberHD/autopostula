// docs/pase-prepagado.md §4: catálogo de pases en código, no en la base. El
// monto que se cobra sale de acá, del servidor -- nunca del cliente.
export const PASES = {
  pase_30: { dias: 30, monto: 3990, nombre: "AutoPostula Premium · 30 días" },
  // Precio propuesto por la spec; el definitivo lo decide Roberto.
  pase_90: { dias: 90, monto: 9990, nombre: "AutoPostula Premium · 90 días" },
} as const;

export type IdPase = keyof typeof PASES;

export function esIdPase(valor: unknown): valor is IdPase {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(PASES, valor);
}

/** "3.990" -- el formato de miles que se usa en toda la app. */
export function formatoPesos(monto: number): string {
  return monto.toLocaleString("es-CL");
}
