export type PreguntaCalibracion = {
  id: string;
  tipo: "comparacion" | "historia" | "frase" | "vocabulario" | "formalidad" | "prioridad" | "escritura";
  texto: string;
  opciones: string[];
};

// Banco fijo por ahora — no configurable por usuario. Empezamos con los dos tipos
// de mayor señal (comparación de respuestas y mini historias); el resto de tipos
// (frase, vocabulario, formalidad, prioridad, escritura) se agregan después sin
// tocar el modelo de datos, solo sumando entradas acá.
export const BANCO_CALIBRACION: PreguntaCalibracion[] = [
  {
    id: "comp_por_que_trabajar",
    tipo: "comparacion",
    texto: "¿Por qué quieres trabajar con nosotros?",
    opciones: [
      "Siempre doy el 100%, soy muy responsable y comprometido con mi trabajo.",
      "Me interesa porque disfruto atender personas y creo que mi experiencia en retail me permitiría aportar desde el primer día.",
    ],
  },
  {
    id: "hist_cliente_molesto",
    tipo: "historia",
    texto: "Un cliente llega muy molesto. ¿Qué harías primero?",
    opciones: [
      "Escucharlo sin interrumpir.",
      "Buscar rápidamente una solución.",
      "Explicarle por qué ocurrió.",
      "Pedir ayuda a un compañero.",
    ],
  },
  {
    id: "hist_equipo",
    tipo: "historia",
    texto: "En un equipo de trabajo...",
    opciones: [
      "Normalmente tomo la iniciativa.",
      "Prefiero apoyar cuando hace falta.",
      "Me acomodo según la situación.",
    ],
  },
  {
    id: "comp_aprender",
    tipo: "comparacion",
    texto: "Cuando aprendes algo nuevo en el trabajo...",
    opciones: [
      "Me gusta practicar inmediatamente, aprendo haciendo.",
      "Primero prefiero que me expliquen bien o leer antes de intentarlo.",
    ],
  },
  {
    id: "hist_presion",
    tipo: "historia",
    texto: "Tienes varias tareas urgentes al mismo tiempo. ¿Qué haces?",
    opciones: [
      "Ordeno por prioridad y voy una por una sin apurarme.",
      "Aviso de inmediato si algo no va a alcanzar a tiempo.",
      "Pido ayuda para repartir la carga.",
    ],
  },
  {
    id: "comp_logro",
    tipo: "comparacion",
    texto: "Cuéntanos de un logro del que te sientas orgulloso.",
    opciones: [
      "Logré cumplir todas mis metas mensuales durante seis meses seguidos, demostrando compromiso y constancia.",
      "Una vez ayudé a resolver un problema de stock que tenía complicado al local, y terminamos mejorando el proceso para todos.",
    ],
  },
];
