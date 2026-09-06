"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useAvisos } from "@/components/Avisos";

const RESPUESTA =
  "Trabajé 3 años en bodega en Maipú, en recepción y picking. Tengo licencia D al día y manejo grúa horquilla. Vivo a 20 minutos de Quilicura, así que el turno de mañana me acomoda bien.";

type Fase = "reposo" | "leyendo" | "escribiendo" | "marcando" | "enviando" | "listo";

/**
 * El hero: un formulario real de Computrabajo que se llena solo.
 *
 * En vez de contar lo que hace el producto, lo muestra. Arranca cuando la
 * ficha entra en pantalla (no al montar, para que nadie se pierda la
 * animación si aterriza más abajo) y se puede repetir.
 */
export default function FichaDemo() {
  const { exito } = useAvisos();
  const ref = useRef<HTMLDivElement>(null);
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [fase, setFase] = useState<Fase>("reposo");
  const [escrito, setEscrito] = useState("");
  const [quieto, setQuieto] = useState(false);

  const limpiar = useCallback(() => {
    relojes.current.forEach(clearTimeout);
    relojes.current = [];
  }, []);

  const luego = useCallback((ms: number, fn: () => void) => {
    relojes.current.push(setTimeout(fn, ms));
  }, []);

  const correr = useCallback(() => {
    limpiar();
    setEscrito("");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setQuieto(true);
      setEscrito(RESPUESTA);
      setFase("listo");
      return;
    }

    setFase("leyendo");

    luego(1250, () => {
      setFase("escribiendo");

      // Se escribe carácter a carácter, con una pausa más larga en comas y
      // puntos: se siente redactado, no volcado de una.
      const escribir = (i: number) => {
        if (i > RESPUESTA.length) {
          setFase("marcando");
          luego(900, () => setFase("enviando"));
          luego(2000, () => {
            setFase("listo");
            exito(
              "Postulación enviada",
              "Operario/a de bodega en Quilicura. Queda en tu historial como Enviada.",
            );
          });
          return;
        }
        setEscrito(RESPUESTA.slice(0, i));
        const pausa = /[,.]/.test(RESPUESTA[i - 1] ?? "") ? 150 : 17;
        luego(pausa, () => escribir(i + 1));
      };
      escribir(1);
    });
  }, [exito, limpiar, luego]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      correr();
      return () => limpiar();
    }

    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0].isIntersecting) {
          obs.disconnect();
          luego(700, correr);
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      limpiar();
    };
    // Solo debe armarse una vez, al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marcado = fase === "marcando" || fase === "enviando" || fase === "listo";
  const enviada = fase === "listo";

  return (
    <div className="lp-ficha" ref={ref}>
      <div className="lp-ficha__bar">
        <span className="lp-dot" />
        <span className="lp-dot" />
        <span className="lp-dot" />
        <span className="lp-ficha__url">computrabajo.cl/postular/operario-bodega</span>
        <span className="lp-ficha__badge">
          <i />
          AutoPostula
        </span>
      </div>

      <div className="lp-ficha__body">
        <div className="lp-aviso">
          <span className="lp-aviso__logo">CT</span>
          <div>
            <p className="lp-aviso__t">Operario/a de bodega — turno mañana</p>
            <p className="lp-aviso__m ap-tnum">Quilicura, RM · Jornada completa · $560.000 líquido</p>
          </div>
        </div>

        <div className="lp-campo">
          <p className="lp-campo__q">¿Por qué te interesa este cargo?</p>
          <div className={`lp-campo__box${fase === "leyendo" || fase === "escribiendo" ? " is-live" : ""}`}>
            {fase === "leyendo" ? (
              <span className="lp-pensando">
                <span />
                <span />
                <span />
                Leyendo el aviso y tu perfil
              </span>
            ) : (
              <>
                {escrito}
                {fase === "escribiendo" && <span className="lp-caret" />}
              </>
            )}
          </div>
        </div>

        <div className={`lp-check${marcado ? " is-on" : ""}`}>
          <span className="lp-check__box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          Tengo disponibilidad inmediata
        </div>

        <div className="lp-ficha__foot">
          <button type="button" className="ap-btn ap-btn--primary ap-btn--sm" disabled={fase === "enviando" || enviada}>
            {fase === "enviando" ? (
              <>
                <span className="lp-spinner" />
                Enviando
              </>
            ) : enviada ? (
              "Enviada"
            ) : (
              "Postular"
            )}
          </button>

          <span className="lp-ficha__pie">
            {enviada ? "Guardada en tu historial" : "Respuesta generada desde tu perfil"}
          </span>

          {enviada && !quieto && (
            <button type="button" className="lp-replay" onClick={correr}>
              <RotateCcw size={12} />
              Ver de nuevo
            </button>
          )}
        </div>
      </div>

      <span className={`lp-stamp${enviada ? " is-on" : ""}`} aria-hidden="true">
        Enviado
      </span>
    </div>
  );
}
