// Lógica pura (sin base de datos) del estado de la búsqueda automática: la
// importan tanto las rutas del servidor como los componentes del panel.

// Qué tipo de búsqueda automática tiene una cuenta (docs/rafagas-y-ponerse-al-dia.md §4):
//
//   "premium" -- el plan (o ser admin) incluye las ráfagas: se ponen al día solas
//                cada vez que se abre el computador, y existe "Ponerme al día ahora".
//   "prueba"  -- plan gratis con postulaciones de prueba todavía por gastar: las
//                ráfagas corren hasta que envían las primeras 5 (§4.1). Una vez
//                por cuenta, no por mes.
//   "manual"  -- plan gratis con la prueba ya gastada: la persona entra al portal
//                y la extensión postula ahí; nada corre solo.
export type ModoAutomatico = "premium" | "prueba" | "manual";

/** Las postulaciones automáticas de prueba que tiene una cuenta gratis (§4.1). */
export const PRUEBA_TOTAL = 5;

export function modoAutomatico(e: {
  esAdmin: boolean;
  planIncluyeBusquedaAutomatica: boolean;
  pruebaRestantes: number;
}): ModoAutomatico {
  // Mismo criterio que checkAndLogAiUsage y platform-accounts: las cuentas ADMIN
  // no dependen de tener un plan armado, para poder probar sin montar Plan +
  // Subscription reales.
  if (e.esAdmin || e.planIncluyeBusquedaAutomatica) return "premium";
  return e.pruebaRestantes > 0 ? "prueba" : "manual";
}

// Por qué la búsqueda automática NO está corriendo, o null si está corriendo.
//
// Un solo veredicto para las dos superficies que lo muestran: la barra del
// dashboard (/api/dashboard/estado) y la extensión (/api/account/estado-automatico,
// que decide si ofrece "Ponerme al día ahora" y, si no, por qué -- §3.6). Si
// cada una lo calculara por su cuenta, el panel y el botón podrían decir cosas
// distintas de la misma cuenta.
//
// El orden es el de qué se le pide a la persona hacer primero: con la prueba
// gastada no hay nada que reanudar, y sin portales conectados no importa cuánto
// cupo quede.
//
// "prueba-terminada" reemplaza al antiguo "sin-plan": desde que el plan gratis
// tiene una prueba, ninguna cuenta gratis está "sin" búsqueda automática desde
// el principio -- la tiene, y se le acaba. Decir "tu plan no la incluye" a
// alguien que acaba de ver 5 postulaciones salir solas sería mentirle.
export type MotivoInactivo = "prueba-terminada" | "pausada" | "sin-cupo" | "sin-portales";

export function motivoInactivo(e: {
  modo: ModoAutomatico;
  pausadaPorTi: boolean;
  cupoPermitido: boolean;
  portalesActivos: number;
}): MotivoInactivo | null {
  if (e.modo === "manual") return "prueba-terminada";
  if (e.pausadaPorTi) return "pausada";
  if (!e.cupoPermitido) return "sin-cupo";
  if (e.portalesActivos === 0) return "sin-portales";
  return null;
}
