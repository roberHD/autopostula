// Los derechos que se pueden pedir desde el panel (lib/derechos.ts), con sus
// palabras. Aparte de lib/derechos.ts porque esto también se usa en el
// navegador, y aquel toca la base de datos y manda correos.
//
// Las descripciones siguen la Ley 19.628 modificada por la 21.719 (arts. 5 a
// 9, 8 bis y 8 ter), en palabras de quien la usa.

export const TIPOS_DERECHO = [
  "ACCESO",
  "RECTIFICACION",
  "SUPRESION",
  "OPOSICION",
  "PORTABILIDAD",
  "BLOQUEO",
  "DECISION_AUTOMATIZADA",
  "OTRO",
] as const;

export type TipoDerecho = (typeof TIPOS_DERECHO)[number];

export const DERECHOS: Record<TipoDerecho, { nombre: string; descripcion: string; ayuda: string }> = {
  ACCESO: {
    nombre: "Acceso",
    descripcion: "Saber qué datos tuyos tenemos y cómo los usamos.",
    ayuda: "Para una copia de todo, puedes usar «Descargar mis datos». Escríbenos aquí si quieres saber algo más.",
  },
  RECTIFICACION: {
    nombre: "Rectificación",
    descripcion: "Corregir datos que están incorrectos o desactualizados.",
    ayuda: "La mayoría se corrige en Perfil. Si es otro dato, dinos cuál y cómo debería quedar.",
  },
  SUPRESION: {
    nombre: "Supresión",
    descripcion: "Que borremos datos tuyos.",
    ayuda: "Para borrar todo, está «Eliminar mi cuenta». Si es algo en particular, dinos qué y por qué.",
  },
  OPOSICION: {
    nombre: "Oposición",
    descripcion: "Que dejemos de usar tus datos para algo en particular.",
    ayuda: "Dinos para qué uso te opones y por qué. Por ejemplo, algo de lo que hacemos por interés legítimo.",
  },
  PORTABILIDAD: {
    nombre: "Portabilidad",
    descripcion: "Recibir tus datos en un formato que otros sistemas puedan leer.",
    ayuda: "«Descargar mis datos» te da un JSON con todo al instante. Escríbenos si necesitas otra cosa.",
  },
  BLOQUEO: {
    nombre: "Bloqueo",
    descripcion: "Que suspendamos el uso de tus datos mientras resolvemos otra solicitud tuya.",
    ayuda: "Dinos qué solicitud de rectificación, supresión u oposición está pendiente.",
  },
  DECISION_AUTOMATIZADA: {
    nombre: "Decisiones automatizadas",
    descripcion: "Pedir una explicación o una revisión humana de algo que decidió el sistema.",
    ayuda: "Por ejemplo, una oferta que se descartó o a la que se postuló sola. Dinos cuál y qué te parece.",
  },
  OTRO: {
    nombre: "Otra consulta sobre mis datos",
    descripcion: "Cualquier otra cosa sobre tus datos personales.",
    ayuda: "Cuéntanos qué necesitas.",
  },
};

export const ESTADOS_DERECHO: Record<string, string> = {
  RECIBIDA: "Recibida",
  PRORROGADA: "Plazo extendido",
  RESPONDIDA: "Respondida",
  RECHAZADA: "Rechazada",
};

export const DETALLE_MIN = 10;
export const DETALLE_MAX = 4000;

/** Un número corto para nombrar la solicitud en los correos y en pantalla. */
export function numeroSolicitud(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
