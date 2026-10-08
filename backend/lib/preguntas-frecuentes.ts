/**
 * Las preguntas frecuentes, en un solo lugar
 * (docs/pendientes-de-lanzamiento-2026-10-07.md §4.1).
 *
 * Las usan tres superficies y por eso no pueden vivir dentro de la landing:
 * la sección de la portada, la página propia /preguntas-frecuentes, y los datos
 * estructurados FAQPage que lee Google. Dos copias se desincronizan sola la
 * primera vez que cambia un precio.
 *
 * Son los miedos reales de quien busca trabajo, no una lista de funciones.
 */
export type Pregunta = { q: string; r: string };

export const PREGUNTAS: Pregunta[] = [
  {
    q: "¿Tengo que darles mi clave de Computrabajo?",
    r: "No, y no te la vamos a pedir nunca. La extensión trabaja dentro de tu propio navegador, con la sesión que tú ya iniciaste en el portal. Tus claves de los portales no pasan por AutoPostula ni quedan guardadas en ninguna parte.",
  },
  {
    q: "¿Me pueden bloquear la cuenta del portal?",
    r: "La extensión trabaja dentro del portal con tu sesión, una oferta a la vez y a un ritmo parecido al de una persona. No usa tu contraseña ni entra por otro lado.",
  },
  {
    q: "¿Por qué no postula a todas las ofertas?",
    r: "Porque postular a lo que no calza te hace perder tiempo a ti y al reclutador. Deja fuera lo que queda lejos de tus comunas, lo que es de otro nivel o de otro rubro, y lo que ya postulaste. Lo dudoso te lo pregunta.",
  },
  {
    q: "¿Puedo probarla sin que postule nada?",
    r: "Sí. La primera vez entra en modo mirar: marca las ofertas del portal una por una y te dice qué haría con cada una, pero no envía nada hasta que tú aprietes «Empezar a postular».",
  },
  {
    q: "¿Qué pasa si la IA responde mal?",
    r: "Puedes revisar cada respuesta antes de que se envíe y corregirla. Si le falta un dato tuyo, no lo inventa: deja la postulación pendiente hasta que lo completes.",
  },
  {
    q: "¿Cuánto cuesta?",
    r: "Gratis son 20 postulaciones al mes. Con un pase son 80 al mes: $3.990 por 30 días o $9.990 por 90 días, de pago único, sin cobro automático. Y si se te acaban las del mes, hay paquetes de 20 postulaciones por $1.990 o 50 por $3.990.",
  },
  {
    q: "¿Vencen las postulaciones que compro aparte?",
    r: "No. Las del plan se renuevan cada mes; las que compras en paquete no tienen fecha de vencimiento y quedan ahí hasta que las uses.",
  },
  {
    q: "¿Funciona en el celular?",
    r: "Desde el celular creas tu cuenta, subes tu CV, conversas con la IA, decides las ofertas que quedaron en Por decidir y ves tus postulaciones. Para postular necesitas Chrome en un computador.",
  },
  {
    q: "¿Tengo que dejar el computador prendido?",
    r: "No. Con un pase se pone al día sola cada vez que abres tu computador, y tú no tienes que hacer nada. Con el plan gratis, la extensión postula mientras estás en el portal.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    r: "No hay nada que cancelar: los pases son de pago único y no se renuevan solos. Cuando se cumple el plazo que compraste, tu cuenta vuelve al plan gratis sin que tengas que hacer nada, y nunca se te cobra de nuevo.",
  },
  {
    q: "¿Qué hacen con mi CV y mis datos?",
    r: "Tu CV se usa para completar los formularios de postulación, y nada más. Puedes descargar todo lo que tenemos tuyo o borrar tu cuenta cuando quieras, desde Ajustes. Las ofertas que la extensión vio y descartó se borran solas a los 90 días.",
  },
];

/** Los datos estructurados que lee Google. Mismo contenido, otro formato. */
export function datosEstructuradosFaq() {
  return {
    "@type": "FAQPage",
    mainEntity: PREGUNTAS.map(({ q, r }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: r },
    })),
  };
}
