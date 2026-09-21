// Regla de precedencia de los cambios de estado.
// docs/estado-real-de-postulaciones.md §3 y §6.5.
//
// La decisión de fondo (§3): **la persona es la fuente de verdad, el portal es
// una ayuda.** Si ella dijo "tengo entrevista" y al día siguiente Computrabajo
// sigue diciendo "postulado", el estado se queda en entrevista. Sin esto, el
// sistema le borraría al usuario lo que él mismo le contó — la peor forma
// posible de perder su confianza.
//
// Vive acá y no dentro del endpoint porque el reporte de la persona (§6.2) va
// a escribir por otro camino, y las dos rutas tienen que decidir igual.

import type { EstadoPostulacion, OrigenEstado } from "@/lib/generated/prisma/client";

// La escalera de avance. Solo estos estados se comparan entre sí.
//
// RECHAZADO queda fuera a propósito: es una salida, no un escalón — puede
// llegar desde cualquier punto. INCOMPLETA tampoco es un escalón: significa
// que la postulación nunca llegó a la empresa.
const RANGO: Partial<Record<EstadoPostulacion, number>> = {
  ENVIADO: 0,
  VISTO: 1,
  EN_PROCESO: 2,
  ENTREVISTA: 3,
  FINALISTA: 4,
  FINALIZADO: 5,
};

export type Decision = { aplica: boolean; motivo: string };

export function decidirCambioEstado(params: {
  actual: EstadoPostulacion;
  origenActual: OrigenEstado;
  nuevo: EstadoPostulacion;
  origen: OrigenEstado;
}): Decision {
  const { actual, origenActual, nuevo, origen } = params;

  if (actual === nuevo) {
    return { aplica: false, motivo: "sin-cambios" };
  }

  // La persona siempre manda, en cualquier dirección: también puede
  // corregirse (de ENTREVISTA a RECHAZADO, por ejemplo).
  if (origen === "USUARIO") {
    return { aplica: true, motivo: "lo-reporto-la-persona" };
  }

  // A partir de acá, el cambio viene de un escaneo de portal.

  // §3: el portal no pisa lo que reportó la persona.
  if (origenActual === "USUARIO") {
    return { aplica: false, motivo: "la-persona-ya-lo-reporto" };
  }

  // RECHAZADO es terminal: una vez rechazada, ningún escaneo la reabre.
  if (actual === "RECHAZADO") {
    return { aplica: false, motivo: "estado-terminal" };
  }

  // Desde INCOMPLETA cualquier estado aplica: que el portal la muestre en "Mis
  // postulaciones" es justamente la evidencia de que sí llegó
  // (docs/revision-2026-09-16.md §8.2).
  if (actual === "INCOMPLETA") {
    return { aplica: true, motivo: "el-portal-confirma-que-llego" };
  }

  // ENVIADO desde un estado que ya avanzó sería retroceder.
  // (Lo cubre la regla de rango de abajo, pero se nombra para que el motivo
  // que queda en el log sea entendible.)
  if (nuevo === "ENVIADO") {
    return { aplica: false, motivo: "no-se-retrocede" };
  }

  // RECHAZADO puede llegar desde cualquier escalón.
  if (nuevo === "RECHAZADO") {
    return { aplica: true, motivo: "rechazo-desde-el-portal" };
  }

  // INCOMPLETA no es algo que un portal pueda reportar.
  if (nuevo === "INCOMPLETA") {
    return { aplica: false, motivo: "el-portal-no-reporta-incompleta" };
  }

  const rangoActual = RANGO[actual];
  const rangoNuevo = RANGO[nuevo];
  if (rangoActual === undefined || rangoNuevo === undefined) {
    return { aplica: false, motivo: "estado-fuera-de-la-escalera" };
  }

  // Nunca baja: una postulación en EN_PROCESO no vuelve a VISTO porque el
  // portal cambió el texto de la fila.
  return rangoNuevo > rangoActual
    ? { aplica: true, motivo: "avanza" }
    : { aplica: false, motivo: "no-se-retrocede" };
}
