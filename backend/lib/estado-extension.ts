// Un solo estado para la extensión (docs/estrategia-y-rediseno.md §6).
//
// Antes había cinco interruptores que no se conocían entre sí: tres en el
// popup (Activo, Solo observar, Revisar antes de enviar, guardados en el
// chrome.storage de ESE navegador) y dos en la cuenta (la pausa de la
// búsqueda automática y la red de seguridad del modo prueba). La misma
// persona podía ver "Activo" en el popup y "Pausada" en el panel, y ninguna
// de las dos pantallas mentía: miraban cosas distintas.
//
// Ahora manda la cuenta. Este archivo es lógica pura (sin base de datos) para
// que el panel, las rutas del servidor y la extensión digan lo mismo.

// Qué está haciendo la extensión, en una palabra:
//
//   "postulando" -- revisa las ofertas nuevas y envía las que calzan.
//   "observando" -- revisa y puntúa, pero no envía nada. Puede ser porque la
//                   persona lo pidió, o porque la cuenta todavía está en modo
//                   prueba (docs/revision-2026-09-16.md §1.2).
//   "pausada"    -- no hace nada, ni sola ni cuando entras a un portal.
export type ModoExtension = "postulando" | "observando" | "pausada";

export type EstadoExtension = {
  modo: ModoExtension;
  /** La persona la pausó (User.busquedaAutomaticaActiva en false). */
  pausada: boolean;
  /** La persona pidió que solo mire. */
  soloObservar: boolean;
  /** Mostrar las respuestas y pedir confirmación antes de enviar. */
  revisarAntes: boolean;
  /** Red de seguridad de la cuenta: en false, solo observa aunque no lo pida. */
  postulacionHabilitada: boolean;
  /** Está observando porque la cuenta está en modo prueba, no porque lo pidiera. */
  porModoPrueba: boolean;
};

type CamposUsuario = {
  busquedaAutomaticaActiva: boolean;
  soloObservar: boolean | null;
  revisarAntesDeEnviar: boolean | null;
  postulacionHabilitada: boolean;
};

// null en las columnas nuevas = la persona todavía no lo dijo desde la cuenta
// (ver schema.prisma, User.soloObservar): vale false hasta que la extensión
// suba lo que tenía guardado o la persona lo cambie en el panel.
export function estadoExtension(u: CamposUsuario): EstadoExtension {
  const pausada = !u.busquedaAutomaticaActiva;
  const soloObservar = u.soloObservar === true;
  const porModoPrueba = !u.postulacionHabilitada;
  const modo: ModoExtension = pausada ? "pausada" : soloObservar || porModoPrueba ? "observando" : "postulando";
  return {
    modo,
    pausada,
    soloObservar,
    revisarAntes: u.revisarAntesDeEnviar === true,
    postulacionHabilitada: u.postulacionHabilitada,
    // Solo cuenta como "es el modo prueba" si eso es lo ÚNICO que la frena:
    // quien además pidió solo observar no necesita que le expliquen la prueba.
    porModoPrueba: porModoPrueba && !soloObservar && !pausada,
  };
}

// Las mismas palabras en el panel y en el popup de la extensión. El popup no
// puede importar este archivo (es otro proyecto, sin build), así que las copia
// tal cual y extension/verificar-estado-extension.js compara los dos lados.
export const TEXTO_MODO: Record<ModoExtension, { titulo: string; detalle: string }> = {
  postulando: {
    titulo: "Postulando por ti",
    detalle: "Revisa las ofertas nuevas de tus portales y envía las que calzan.",
  },
  observando: {
    titulo: "Solo mirando",
    detalle: "Revisa y puntúa las ofertas, pero no envía ninguna.",
  },
  pausada: {
    titulo: "En pausa",
    detalle: "No revisa ni envía nada, ni siquiera cuando entras a un portal.",
  },
};

/** Lo que se dice debajo del estado cuando la cuenta todavía está en prueba. */
export const TEXTO_MODO_PRUEBA =
  "Tu cuenta está en modo prueba: mira y puntúa, pero no envía. Actívala cuando veas que acierta.";
