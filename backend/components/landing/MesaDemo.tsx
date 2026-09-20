"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * El hero: AutoPostula revisando una página de resultados del portal.
 *
 * Antes acá había una ficha que se llenaba sola. Mostraba que escribe, que es
 * justo lo que vende toda la competencia; esto muestra que DECIDE, que es lo
 * que ninguna otra muestra. Las razones son las que el motor ya usa hoy:
 * comunas, nivel del cargo y avisos repetidos.
 */

type Veredicto = "sirve" | "decide" | "fuera";

const OFERTAS: { t: string; m: string; v: Veredicto; razon: string }[] = [
  {
    t: "Operario/a de bodega — turno mañana",
    m: "Comercial Norte · Cerrillos · $650.000 líquido",
    v: "sirve",
    razon: "Postula con tus respuestas",
  },
  { t: "Jefe/a de bodega", m: "Importadora Sur · Pudahuel", v: "fuera", razon: "Es jefatura" },
  {
    t: "Auxiliar de bodega y despacho",
    m: "Logística Sur · Maipú",
    v: "decide",
    razon: "Parecido: es de despacho",
  },
  { t: "Bodeguero/a", m: "Frío Austral · Puerto Montt", v: "fuera", razon: "Fuera de tus comunas" },
  {
    t: "Reponedor/a de bodega",
    m: "Supermercados del Valle · Estación Central",
    v: "sirve",
    razon: "Postula con tus respuestas",
  },
  {
    t: "Operario/a de bodega",
    m: "Distribuidora Andina · Quilicura",
    v: "fuera",
    razon: "Ya postulaste el 12 sep",
  },
];

const TOTAL = 20;
const FINAL = { sirven: 4, decides: 3, fuera: 13 };
const CERO = { sirven: 0, decides: 0, fuera: 0 };

const ETIQUETA: Record<Veredicto, string> = {
  sirve: "Te sirve",
  decide: "Por decidir",
  fuera: "No calza",
};

export default function MesaDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([]);

  // En reposo se ve el resultado, no una caja vacía esperando el scroll.
  const [leyendo, setLeyendo] = useState(-1);
  const [vistas, setVistas] = useState(OFERTAS.length);
  const [contador, setContador] = useState(TOTAL);
  const [pilas, setPilas] = useState(FINAL);
  const [corriendo, setCorriendo] = useState(false);

  const limpiar = useCallback(() => {
    relojes.current.forEach(clearTimeout);
    relojes.current = [];
  }, []);
  const luego = useCallback((ms: number, fn: () => void) => {
    relojes.current.push(setTimeout(fn, ms));
  }, []);

  const correr = useCallback(() => {
    limpiar();
    setCorriendo(true);
    setLeyendo(-1);
    setVistas(0);
    setContador(0);
    setPilas(CERO);

    let t = 450;
    OFERTAS.forEach((_, i) => {
      luego(t, () => setLeyendo(i));
      luego(t + 520, () => {
        setLeyendo(-1);
        setVistas(i + 1);
        setContador(i + 1);
      });
      t += 720;
    });

    // Las 14 que no caben en el cuadro se cuentan de corrido.
    for (let k = OFERTAS.length + 1; k <= TOTAL; k++) {
      const n = k;
      luego(t + (k - OFERTAS.length) * 55, () => setContador(n));
    }
    t += (TOTAL - OFERTAS.length) * 55 + 250;

    (Object.keys(FINAL) as (keyof typeof FINAL)[]).forEach((clave) => {
      for (let n = 1; n <= FINAL[clave]; n++) {
        const valor = n;
        luego(t + n * 45, () => setPilas((p) => ({ ...p, [clave]: valor })));
      }
    });

    luego(t + 700, () => setCorriendo(false));
  }, [limpiar, luego]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (typeof IntersectionObserver === "undefined") {
      correr();
      return () => limpiar();
    }

    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0].isIntersecting) {
          obs.disconnect();
          luego(800, correr);
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      limpiar();
    };
    // Solo debe armarse una vez, al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`lp-mesa${corriendo ? " is-corriendo" : ""}`} ref={ref}>
      <div className="lp-mesa__bar">
        <span className="lp-dot" />
        <span className="lp-dot" />
        <span className="lp-dot" />
        <span className="lp-mesa__url">computrabajo.cl/empleos-de-operario-de-bodega</span>
        <span className="lp-mesa__estado">
          <i />
          {corriendo ? "Revisando" : "Listo"}
        </span>
      </div>

      <div className="lp-mesa__head">
        <p className="lp-mesa__t">Operario/a de bodega · R. Metropolitana</p>
        <p className="lp-mesa__c ap-tnum">
          Revisadas {contador} de {TOTAL}
        </p>
      </div>

      <ul className="lp-mesa__lista">
        {OFERTAS.map((o, i) => (
          <li
            className={[
              "lp-of",
              o.v === "fuera" ? "lp-of--fuera" : "",
              i >= vistas ? "is-pendiente" : "",
              leyendo === i ? "is-leyendo" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={o.t + o.m}
          >
            <div>
              <p className="lp-of__t">{o.t}</p>
              <p className="lp-of__m">{o.m}</p>
            </div>
            <div className="lp-veredicto">
              <span className={`lp-veredicto__v lp-v--${o.v}`}>
                <i />
                {ETIQUETA[o.v]}
              </span>
              <span className="lp-veredicto__r">{o.razon}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="lp-mesa__pie">
        <div className="lp-pila">
          <p className="lp-pila__n ap-tnum">
            <i style={{ background: "var(--ok)" }} />
            {pilas.sirven}
          </p>
          <p className="lp-pila__l">te sirven</p>
          <p className="lp-pila__d">Postula con tus respuestas</p>
        </div>
        <div className="lp-pila">
          <p className="lp-pila__n ap-tnum">
            <i style={{ background: "var(--warn)" }} />
            {pilas.decides}
          </p>
          <p className="lp-pila__l">las decides tú</p>
          <p className="lp-pila__d">Te esperan en Por decidir</p>
        </div>
        <div className="lp-pila">
          <p className="lp-pila__n ap-tnum">
            <i style={{ background: "var(--text-muted)" }} />
            {pilas.fuera}
          </p>
          <p className="lp-pila__l">no calzan</p>
          <p className="lp-pila__d">Cada una con su razón</p>
        </div>
      </div>

      <div className="lp-mesa__foot">
        <span className="lp-mesa__nota">Ejemplo con ofertas inventadas</span>
        <button
          className="lp-repetir"
          type="button"
          onClick={correr}
          disabled={corriendo}
          hidden={corriendo}
        >
          Ver de nuevo
        </button>
      </div>
    </div>
  );
}
