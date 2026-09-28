// La regla de precedencia de docs/estado-real-de-postulaciones.md §6.5.
// Sin imports de servidor: la verifica scripts/verificar-estado-real.ts.
//
//   rango: ENVIADO < VISTO < EN_PROCESO < ENTREVISTA < FINALISTA < FINALIZADO
//          (RECHAZADO es terminal y puede llegar desde cualquiera)
//
//   origen PORTAL  → solo aplica si el estado actual no lo contó la persona
//                    Y el rango nuevo es MAYOR que el actual (nunca baja)
//   origen USUARIO → siempre aplica, en cualquier dirección (se puede corregir)

const RANGO: Record<string, number> = {
  ENVIADO: 0,
  VISTO: 1,
  EN_PROCESO: 2,
  ENTREVISTA: 3,
  FINALISTA: 4,
  FINALIZADO: 5,
};

export type Origen = "PORTAL" | "USUARIO" | "SISTEMA";

/**
 * ¿Un cambio de estado que informa el portal se aplica sobre la postulación?
 * `actual` y `origenActual` son los de la postulación hoy; `nuevo`, lo que dice
 * el portal.
 */
export function portalPuedeCambiar(actual: string, origenActual: Origen, nuevo: string): boolean {
  if (actual === nuevo) return false;
  // Lo que contó la persona manda: que el portal siga diciendo "postulado"
  // no revierte "tuve entrevista".
  if (origenActual === "USUARIO") return false;
  // docs/revision-2026-09-16.md §8.2/§8.3: "Postulado" en el portal es la
  // evidencia de que una postulación que AutoPostula dejó a medias sí llegó.
  if (actual === "INCOMPLETA") return nuevo === "ENVIADO";
  // Un estado cerrado no se reabre porque el portal cambie el texto.
  if (actual === "RECHAZADO" || actual === "FINALIZADO") return false;
  if (nuevo === "RECHAZADO") return true;
  const a = RANGO[actual];
  const n = RANGO[nuevo];
  if (a === undefined || n === undefined) return false;
  return n > a;
}

/** Las respuestas de "¿Supiste algo?" y el estado que dejan. */
export const RESPUESTAS_PERSONA: Record<string, string | null> = {
  nada: null, // no cambia el estado: solo cuenta que se preguntó
  llamaron: "EN_PROCESO",
  entrevista: "ENTREVISTA",
  no_quede: "RECHAZADO",
};

// Cuándo preguntar (§6.1): desde los 5 días de enviada, nunca dos veces en 7
// días, y nunca más después de 3 "Nada todavía".
export const DIAS_PARA_PREGUNTAR = 5;
export const DIAS_ENTRE_PREGUNTAS = 7;
export const MAX_PREGUNTAS = 3;
export const ESTADOS_QUE_SE_PREGUNTAN = ["ENVIADO", "VISTO", "EN_PROCESO", "ENTREVISTA", "FINALISTA"];

/** Filtro de Prisma para las postulaciones por las que toca preguntar hoy. */
export function filtroSinNoticias(userId: string, ahora: Date = new Date()) {
  const desde = new Date(ahora.getTime() - DIAS_PARA_PREGUNTAR * 86_400_000);
  const ultima = new Date(ahora.getTime() - DIAS_ENTRE_PREGUNTAS * 86_400_000);
  return {
    userId,
    estadoActual: { in: ESTADOS_QUE_SE_PREGUNTAN as any },
    enviadaEn: { lte: desde },
    vecesConsultada: { lt: MAX_PREGUNTAS },
    OR: [{ ultimaConsulta: null }, { ultimaConsulta: { lte: ultima } }],
  };
}
