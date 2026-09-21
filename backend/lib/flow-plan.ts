// Sin uso desde 2026-09-19 (docs/pase-prepagado.md): Premium son pases de pago
// único, ya no hay un plan mensual en Flow. Se conserva para volver al Cargo
// Automático cuando AutoPostula opere como empresa (es solo para empresas).
//
// Identificador fijo del plan de Flow -- se crea UNA vez (ver scripts/flow-crear-plan.ts)
// y de ahí en adelante todo el código solo lo referencia por este id.
export const FLOW_PLAN_ID = "autopostula_premium_mensual";
