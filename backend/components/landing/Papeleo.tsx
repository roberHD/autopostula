"use client";
import { useEffect, useRef } from "react";

/**
 * El fondo de la landing: papeleo desvanecido que se mueve más lento que la
 * página. Cada pieza es un pedazo real del mundo del producto — una pregunta
 * que los portales hacen, un aviso chileno, una casilla de formulario. Si
 * fueran rectángulos genéricos daría lo mismo ponerlos, y sería decoración.
 *
 * Asoman desde los bordes: la mitad queda fuera de la pantalla para no
 * competir nunca con la columna de texto.
 */

type Pieza =
  | { tipo: "campo"; q: string; v: string }
  | { tipo: "aviso"; cargo: string; meta: string; chip: string }
  | { tipo: "casilla"; t: string };

const PIEZAS: Pieza[] = [
  { tipo: "campo", q: "¿Por qué te interesa este cargo?", v: "Trabajé 3 años en bodega en Maipú…" },
  { tipo: "aviso", cargo: "Ejecutivo/a de call center", meta: "Santiago Centro · Full time", chip: "Vista" },
  { tipo: "campo", q: "¿Cuál es tu pretensión de renta líquida?", v: "$560.000" },
  { tipo: "aviso", cargo: "Reponedor/a de sala", meta: "Ñuñoa · Part time", chip: "Por decidir" },
  { tipo: "casilla", t: "Tengo disponibilidad inmediata" },
  { tipo: "campo", q: "¿Cuántos años de experiencia tienes?", v: "3 años en logística y bodega" },
  { tipo: "aviso", cargo: "Jefe/a de turno", meta: "Lampa · Jornada completa", chip: "No calza" },
  { tipo: "casilla", t: "Licencia de conducir clase D vigente" },
  { tipo: "aviso", cargo: "Auxiliar de bodega y despacho", meta: "Pudahuel · Jornada completa", chip: "Enviada" },
  { tipo: "campo", q: "¿Por qué deberíamos contratarte?", v: "Manejo grúa horquilla y llevo el inventario al día…" },
  { tipo: "aviso", cargo: "Cajero/a part time", meta: "La Florida · 30 horas", chip: "Enviada" },
  { tipo: "casilla", t: "Puedo trabajar fines de semana" },
];

export default function Papeleo() {
  const nodos = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodos.current.forEach((el) => el?.classList.add("is-visible"));
      return;
    }

    let pendiente = false;
    function alScroll() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const alto = window.innerHeight;
        nodos.current.forEach((el) => {
          if (!el) return;
          const base = Number(el.dataset.base);
          const giro = el.dataset.giro;
          const desfase = y * Number(el.dataset.factor);
          const arriba = base - y + desfase;
          el.style.transform = `translateY(${desfase - y}px) rotate(${giro}deg)`;
          el.classList.toggle("is-visible", arriba > -260 && arriba < alto + 120);
        });
        pendiente = false;
      });
    }

    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <div className="lp-papeleo" aria-hidden="true">
      {PIEZAS.map((p, i) => {
        const izq = i % 2 === 0;
        const base = i * 620 + 340;
        const giro = izq ? "-1.2" : "1.2";
        return (
          <div
            className="lp-fantasma"
            key={i}
            ref={(el) => {
              nodos.current[i] = el;
            }}
            data-base={base}
            data-giro={giro}
            data-factor={(0.12 + (i % 4) * 0.05).toFixed(2)}
            style={{
              top: base,
              [izq ? "left" : "right"]: -120 + (i % 3) * 26,
              transform: `rotate(${giro}deg)`,
            }}
          >
            {p.tipo === "campo" && (
              <>
                <p className="lp-fantasma__q">{p.q}</p>
                <div className="lp-fantasma__campo">{p.v}</div>
              </>
            )}
            {p.tipo === "aviso" && (
              <div className="lp-fantasma__fila">
                <div>
                  <p className="lp-fantasma__cargo">{p.cargo}</p>
                  <p className="lp-fantasma__meta">{p.meta}</p>
                </div>
                <span className="lp-fantasma__chip">{p.chip}</span>
              </div>
            )}
            {p.tipo === "casilla" && (
              <div className="lp-fantasma__casilla">
                <i />
                {p.t}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
