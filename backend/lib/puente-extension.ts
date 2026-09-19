// Cómo el panel le habla a la extensión (solo en el navegador). extension/bridge.js
// corre en esta misma página y traduce eventos del DOM a mensajes de la
// extensión: la página dispara `autopostula:<algo>` y espera `autopostula:<algo>-resultado`.
// La página no manda ninguna dirección ni dato que la extensión vaya a usar tal
// cual: solo pide, y la extensión decide con su propia sesión (mismo criterio que
// `autopostula:conectar`).
//
// Lo usan "Ponerme al día ahora" (docs/rafagas-y-ponerse-al-dia.md §3.6) y la
// activación de la postulación (§4.1).

// bridge.js deja una marca en el DOM apenas carga, y además contesta a un ping
// por si la página se montó después. Si en 700 ms no contesta nadie, no hay
// extensión en este navegador (el caso típico: el celular).
export function extensionPresente(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.documentElement.dataset.autopostulaExtension) return resolve(true);
    let t: ReturnType<typeof setTimeout>;
    const terminar = (hay: boolean) => {
      window.removeEventListener("autopostula:extension-presente", alDetectar);
      clearTimeout(t);
      resolve(hay);
    };
    const alDetectar = () => terminar(true);
    t = setTimeout(() => terminar(false), 700);
    window.addEventListener("autopostula:extension-presente", alDetectar);
    window.dispatchEvent(new CustomEvent("autopostula:ping"));
  });
}

export type RespuestaExtension = { ok: boolean; motivo?: string };

// La extensión hace consultas al servidor antes de contestar, así que se le da
// margen: cortar antes diría "no respondió" de algo que sí empezó.
const ESPERA_RESPUESTA_MS = 15_000;

/** Dispara `autopostula:<evento>` y espera `autopostula:<evento>-resultado`. */
export function pedirALaExtension(evento: string): Promise<RespuestaExtension> {
  return new Promise((resolve) => {
    const nombreResultado = `autopostula:${evento}-resultado`;
    let t: ReturnType<typeof setTimeout>;
    const alResultado = (e: Event) => {
      clearTimeout(t);
      resolve(((e as CustomEvent).detail as RespuestaExtension | null) ?? { ok: false, motivo: "extension_no_responde" });
    };
    t = setTimeout(() => {
      window.removeEventListener(nombreResultado, alResultado);
      resolve({ ok: false, motivo: "extension_no_responde" });
    }, ESPERA_RESPUESTA_MS);
    window.addEventListener(nombreResultado, alResultado, { once: true });
    window.dispatchEvent(new CustomEvent(`autopostula:${evento}`));
  });
}
