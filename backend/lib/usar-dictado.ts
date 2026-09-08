"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictado por voz con la Web Speech API del navegador.
 *
 * Se usa la API nativa y no un servicio de transcripción por tres razones:
 * el audio nunca sale del navegador, no hay costo por minuto, y el texto
 * aparece mientras la persona habla en vez de al terminar.
 *
 * El precio es que solo existe en navegadores basados en Chromium (y Safari
 * parcialmente). Por eso el hook expone `soportado`: quien lo use debe
 * esconder el botón cuando sea false, en lugar de ofrecer algo que no anda.
 */

// La API no está en los tipos del DOM, así que se declara lo mínimo que se usa.
type ResultadoVoz = {
  isFinal: boolean;
  0: { transcript: string };
};

type EventoResultado = {
  resultIndex: number;
  results: { length: number } & Record<number, ResultadoVoz>;
};

type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getConstructor(): (new () => Reconocedor) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocedor;
    webkitSpeechRecognition?: new () => Reconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type Dictado = {
  soportado: boolean;
  escuchando: boolean;
  alternar: () => void;
  detener: () => void;
};

/**
 * @param onTexto  Recibe el texto completo (lo que ya había + lo dictado) en
 *                 cada actualización, incluidas las parciales.
 * @param textoActual  Lo que hay escrito al momento de apretar el micrófono.
 *                     Se pasa como función para leer siempre el valor fresco
 *                     y no el capturado en el render en que se montó.
 */
export function usarDictado(
  onTexto: (texto: string) => void,
  textoActual: () => string,
  onError?: (mensaje: string) => void
): Dictado {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);

  const reconocedorRef = useRef<Reconocedor | null>(null);
  const baseRef = useRef("");      // lo que ya estaba escrito al empezar
  const finalRef = useRef("");     // lo dictado que el motor ya dio por definitivo
  const onTextoRef = useRef(onTexto);
  const onErrorRef = useRef(onError);

  // Los callbacks se guardan en refs para que el efecto que arma el
  // reconocedor no se vuelva a ejecutar en cada render del componente padre.
  useEffect(() => { onTextoRef.current = onTexto; }, [onTexto]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    setSoportado(getConstructor() !== null);
  }, []);

  const detener = useCallback(() => {
    reconocedorRef.current?.stop();
    setEscuchando(false);
  }, []);

  const alternar = useCallback(() => {
    if (escuchando) {
      detener();
      return;
    }

    const Constructor = getConstructor();
    if (!Constructor) return;

    const rec = new Constructor();
    rec.lang = "es-CL";
    rec.continuous = true;
    rec.interimResults = true;

    // Si ya hay texto, lo dictado se agrega detrás con un espacio, para no
    // pisar lo que la persona venía escribiendo a mano.
    const previo = textoActual();
    baseRef.current = previo ? previo.replace(/\s+$/, "") + " " : "";
    finalRef.current = "";

    rec.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const resultado = e.results[i];
        const texto = resultado[0].transcript;
        if (resultado.isFinal) finalRef.current += texto;
        else parcial += texto;
      }
      onTextoRef.current(baseRef.current + finalRef.current + parcial);
    };

    rec.onerror = (e) => {
      setEscuchando(false);
      if (e.error === "no-speech" || e.error === "aborted") return;
      const mensajes: Record<string, string> = {
        "not-allowed": "Tienes que darle permiso al micrófono desde el candado de la barra de direcciones.",
        "service-not-allowed": "El navegador bloqueó el micrófono para este sitio.",
        "audio-capture": "No encontramos un micrófono conectado.",
        network: "El dictado necesita conexión a internet.",
      };
      onErrorRef.current?.(mensajes[e.error] ?? "No pudimos escucharte — vuelve a intentar.");
    };

    // El motor se corta solo tras un silencio largo; hay que reflejarlo en la
    // UI o el botón queda pintado como si siguiera grabando.
    rec.onend = () => setEscuchando(false);

    reconocedorRef.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      onErrorRef.current?.("No pudimos abrir el micrófono — vuelve a intentar.");
    }
  }, [escuchando, detener, textoActual]);

  // Si se sale de la página mientras graba, el micrófono queda tomado.
  useEffect(() => {
    return () => { reconocedorRef.current?.abort(); };
  }, []);

  return { soportado, escuchando, alternar, detener };
}
