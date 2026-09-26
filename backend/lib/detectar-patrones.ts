// Aprender de cómo la persona corrige a la IA.
// docs/banco-de-preguntas.md §6 (Parte D).
//
// Hoy el perfil de estilo sale solo de la conversación inicial: de lo que la
// persona DIJO que hacía. Esto mira lo que hace de verdad — cada vez que edita
// una respuesta antes de enviarla, deja una etiqueta gratis.
//
// Es determinista y sin IA a propósito: comparar dos textos no necesita un
// modelo, y un patrón que se deduce con una regla explicable es uno que se
// puede corregir cuando falla. Es el principio #3 aplicado acá: la corrección
// humana es la etiqueta, y no hay que pagarla.

/** Cuántas correcciones iguales hacen falta para preguntar (§6 sugiere 3). */
export const MINIMO_CORRECCIONES = 3;

export type Correccion = { respuestaIa: string; respuestaFinal: string };

export type TipoPatron = "acorta" | "alarga" | "sin_exclamaciones" | "menos_entusiasmo";

export type Patron = {
  tipo: TipoPatron;
  veces: number;
  patronDetectado: string;
  preguntaGenerada: string;
  opciones: { valor: string; etiqueta: string }[];
};

// Palabras que la IA usa para sonar entusiasta y que mucha gente saca porque no
// habla así. La lista es corta y explícita: es mejor detectar pocos patrones
// bien que inventar uno de una señal débil.
const PALABRAS_ENTUSIASTAS = [
  "apasionado", "apasionada", "proactivo", "proactiva", "dinámico", "dinámica",
  "entusiasta", "excelente", "increíble", "encantado", "encantada",
];

function normalizar(t: string) {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function contarExclamaciones(t: string) {
  return (t.match(/[!¡]/g) ?? []).length;
}

function contarEntusiastas(t: string) {
  const n = normalizar(t);
  return PALABRAS_ENTUSIASTAS.filter((p) => n.includes(normalizar(p))).length;
}

/**
 * Cada regla mira UNA corrección y dice si la ejemplifica.
 *
 * El umbral de largo es 15%: por debajo de eso, la diferencia suele ser un
 * typo o una palabra cambiada, no una decisión de escribir más corto.
 */
const REGLAS: {
  tipo: TipoPatron;
  aplica: (c: Correccion) => boolean;
  patronDetectado: string;
  preguntaGenerada: string;
  opciones: { valor: string; etiqueta: string }[];
}[] = [
  {
    tipo: "acorta",
    aplica: (c) =>
      c.respuestaIa.length > 0 &&
      c.respuestaFinal.length < c.respuestaIa.length * 0.85,
    patronDetectado: "Acorta las respuestas que escribe la IA",
    preguntaGenerada: "Notamos que sueles acortar las respuestas que escribimos. ¿Quieres que escribamos más corto siempre?",
    opciones: [
      { valor: "corta", etiqueta: "Sí, más corto" },
      { valor: "mantener", etiqueta: "Déjalo como está" },
      { valor: "muy_corta", etiqueta: "Aún más corto" },
    ],
  },
  {
    tipo: "alarga",
    aplica: (c) =>
      c.respuestaIa.length > 0 &&
      c.respuestaFinal.length > c.respuestaIa.length * 1.3,
    patronDetectado: "Alarga las respuestas que escribe la IA",
    preguntaGenerada: "Sueles agregarle cosas a lo que escribimos. ¿Quieres que escribamos más largo?",
    opciones: [
      { valor: "larga", etiqueta: "Sí, más largo" },
      { valor: "mantener", etiqueta: "Déjalo como está" },
    ],
  },
  {
    tipo: "sin_exclamaciones",
    aplica: (c) =>
      contarExclamaciones(c.respuestaIa) > 0 &&
      contarExclamaciones(c.respuestaFinal) < contarExclamaciones(c.respuestaIa),
    patronDetectado: "Saca los signos de exclamación",
    preguntaGenerada: "Sueles sacar los signos de exclamación de lo que escribimos. ¿Escribimos sin ellos?",
    opciones: [
      { valor: "sin_exclamaciones", etiqueta: "Sí, sin exclamaciones" },
      { valor: "mantener", etiqueta: "Déjalo como está" },
    ],
  },
  {
    tipo: "menos_entusiasmo",
    aplica: (c) =>
      contarEntusiastas(c.respuestaIa) > 0 &&
      contarEntusiastas(c.respuestaFinal) < contarEntusiastas(c.respuestaIa),
    patronDetectado: "Saca las palabras entusiastas (apasionado, proactivo, dinámico…)",
    preguntaGenerada: "Sueles cambiar palabras como «apasionado» o «proactivo» por algo más sobrio. ¿Escribimos con un tono más neutro?",
    opciones: [
      { valor: "sobrio", etiqueta: "Sí, más sobrio" },
      { valor: "mantener", etiqueta: "Déjalo como está" },
    ],
  },
];

/**
 * Los patrones que aparecen al menos `minimo` veces, del más frecuente al
 * menos. Una misma corrección puede alimentar varios patrones: acortar y sacar
 * exclamaciones son cosas distintas aunque pasen en la misma edición.
 */
export function detectarPatrones(
  correcciones: Correccion[],
  minimo: number = MINIMO_CORRECCIONES
): Patron[] {
  return REGLAS.map((regla) => {
    const veces = correcciones.filter(regla.aplica).length;
    return {
      tipo: regla.tipo,
      veces,
      patronDetectado: regla.patronDetectado,
      preguntaGenerada: regla.preguntaGenerada,
      opciones: regla.opciones,
    };
  })
    .filter((p) => p.veces >= minimo)
    .sort((a, b) => b.veces - a.veces);
}

/**
 * Traduce la respuesta de la persona a cambios sobre StyleProfile.
 * Devuelve `null` cuando eligió dejarlo como está: no hay nada que escribir.
 */
export function ajusteDeEstilo(valor: string): {
  longitudRespuesta?: string;
  instruccion?: string;
} | null {
  switch (valor) {
    case "corta":
      return { longitudRespuesta: "corta" };
    case "muy_corta":
      return { longitudRespuesta: "muy corta" };
    case "larga":
      return { longitudRespuesta: "larga" };
    case "sin_exclamaciones":
      return { instruccion: "No uses signos de exclamación." };
    case "sobrio":
      return {
        instruccion:
          "Usa un tono sobrio: evita palabras como «apasionado», «proactivo», «dinámico» o «entusiasta».",
      };
    default:
      return null;
  }
}
