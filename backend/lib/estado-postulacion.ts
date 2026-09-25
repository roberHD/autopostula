// Cómo se dice cada estado de una postulación en el panel
// (docs/estrategia-y-rediseno.md §5.4): en palabras de quien busca trabajo,
// no con el nombre que le da el portal. Lo usan la lista de Postulaciones, el
// detalle y el Hoy, así una misma postulación se llama igual en todos lados.
// Sin imports de servidor: lo leen páginas de cliente.

export const FRASE_ESTADO: Record<string, string> = {
  ENVIADO: "Enviada, sin novedades",
  VISTO: "La empresa vio tu CV",
  EN_PROCESO: "En proceso de selección",
  ENTREVISTA: "Tuviste entrevista",
  FINALISTA: "Quedaste finalista",
  FINALIZADO: "Proceso cerrado",
  RECHAZADO: "No quedaste",
  // No es un paso del avance: la postulación quedó a medias y la empresa
  // nunca la recibió (docs/revision-2026-09-16.md §3.4).
  INCOMPLETA: "No se envió",
};

export const COLOR_ESTADO: Record<string, string> = {
  ENVIADO: "var(--status-enviado)",
  VISTO: "var(--status-visto)",
  EN_PROCESO: "var(--status-en-proceso)",
  ENTREVISTA: "var(--ok)",
  FINALISTA: "var(--status-finalista)",
  FINALIZADO: "var(--status-finalizado)",
  RECHAZADO: "var(--status-rechazado)",
  INCOMPLETA: "var(--warn)",
};

// En la historia de una postulación: qué pasó en cada paso (en pasado).
export const PASO_ESTADO: Record<string, string> = {
  ENVIADO: "Enviada",
  VISTO: "La empresa vio tu CV",
  EN_PROCESO: "Pasó a proceso de selección",
  ENTREVISTA: "Tuviste entrevista",
  FINALISTA: "Quedaste finalista",
  FINALIZADO: "Se cerró el proceso",
  RECHAZADO: "No quedaste",
  INCOMPLETA: "No se pudo enviar",
};

/**
 * Los filtros de la lista se agrupan por lo que la persona quiere ver, no por
 * los siete estados del portal. "No se enviaron" solo aparece si hay alguna.
 */
export const GRUPOS_ESTADO: { valor: string; etiqueta: string; estados: string[] | null }[] = [
  { valor: "TODAS", etiqueta: "Todas", estados: null },
  { valor: "NOVEDADES", etiqueta: "Con novedades", estados: ["VISTO", "EN_PROCESO", "ENTREVISTA", "FINALISTA"] },
  { valor: "ESPERANDO", etiqueta: "Esperando respuesta", estados: ["ENVIADO"] },
  { valor: "NO_ENVIADAS", etiqueta: "No se enviaron", estados: ["INCOMPLETA"] },
  { valor: "CERRADAS", etiqueta: "Cerradas", estados: ["FINALIZADO", "RECHAZADO"] },
];

export function fraseEstado(estado: string): string {
  return FRASE_ESTADO[estado] ?? estado;
}

export function colorEstado(estado: string): string {
  return COLOR_ESTADO[estado] ?? "var(--text-muted)";
}

// Quién dijo cada paso de la historia (docs/estado-real-de-postulaciones.md §6.4).
export const QUIEN_LO_DIJO: Record<string, string> = {
  SISTEMA: "AutoPostula",
  PORTAL: "el portal",
  USUARIO: "tú",
};

// "¿Supiste algo?": lo que puede contar la persona, en el orden en que pasa.
// Las claves son las de RESPUESTAS_PERSONA (lib/estado-real.ts).
export const OPCIONES_PERSONA: { valor: string; etiqueta: string }[] = [
  { valor: "nada", etiqueta: "Nada todavía" },
  { valor: "llamaron", etiqueta: "Me llamaron" },
  { valor: "entrevista", etiqueta: "Tuve entrevista" },
  { valor: "no_quede", etiqueta: "No quedé" },
];
