// Por qué la búsqueda automática NO está corriendo, o null si está corriendo.
//
// Un solo veredicto para las dos superficies que lo muestran: la barra del
// dashboard (/api/dashboard/estado) y la extensión (/api/account/estado-automatico,
// que decide si ofrece "Ponerme al día ahora" y, si no, por qué -- docs/rafagas-y-ponerse-al-dia.md
// §3.6). Si cada una lo calculara por su cuenta, el panel y el botón podrían
// decir cosas distintas de la misma cuenta.
//
// El orden es el de qué se le pide a la persona hacer primero: sin plan no hay
// nada que reanudar, y sin portales conectados no importa cuánto cupo quede.
export type MotivoInactivo = "sin-plan" | "pausada" | "sin-cupo" | "sin-portales";

export function motivoInactivo(e: {
  disponibleEnPlan: boolean;
  pausadaPorTi: boolean;
  cupoPermitido: boolean;
  portalesActivos: number;
}): MotivoInactivo | null {
  if (!e.disponibleEnPlan) return "sin-plan";
  if (e.pausadaPorTi) return "pausada";
  if (!e.cupoPermitido) return "sin-cupo";
  if (e.portalesActivos === 0) return "sin-portales";
  return null;
}
