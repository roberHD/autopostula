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

/** Cuánto más lento que la página se mueve cada capa: la pieza i va en la capa i % 4. */
const FACTORES = [0.12, 0.17, 0.22, 0.27];

export default function Papeleo() {
  const capas = useRef<(HTMLDivElement | null)[]>([]);
  const nodos = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodos.current.forEach((el) => el?.classList.add("is-visible"));
      return;
    }

    // Bajo 901px el papeleo no se muestra (landing.css): ahí no se calcula nada.
    const ancho = window.matchMedia("(min-width: 901px)");

    // Donde el navegador sabe atar una animación al scroll (landing.css,
    // @supports animation-timeline), el desplazamiento lo hace él, fuera del
    // hilo principal y sincronizado con el scroll, y acá solo se decide qué
    // piezas se ven. Antes se movían las 12 piezas desde JS en cada cuadro: era
    // lo más caro de la página, y como el JS corre un cuadro después del scroll,
    // las piezas temblaban. Sin ese soporte (Firefox) se mueven desde acá, como
    // siempre, pero de a capa: 4 escrituras por cuadro en vez de 12.
    const movidoPorCss = CSS.supports("animation-timeline: scroll()");

    const piezas = nodos.current.flatMap((el, i) =>
      el ? [{ el, base: Number(el.dataset.base), factor: FACTORES[i % FACTORES.length], visible: false }] : [],
    );

    let pendiente = false;
    function alScroll() {
      if (pendiente || !ancho.matches) return;
      pendiente = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const alto = window.innerHeight;
        if (!movidoPorCss) {
          capas.current.forEach((capa, g) => {
            if (capa) capa.style.transform = `translateY(${y * FACTORES[g] - y}px)`;
          });
        }
        for (const p of piezas) {
          const arriba = p.base - y + y * p.factor;
          const visible = arriba > -260 && arriba < alto + 120;
          // Solo se toca la clase cuando cambia: cada cambio obliga a recalcular estilos.
          if (visible !== p.visible) {
            p.visible = visible;
            p.el.classList.toggle("is-visible", visible);
          }
        }
        pendiente = false;
      });
    }

    window.addEventListener("scroll", alScroll, { passive: true });
    window.addEventListener("resize", alScroll, { passive: true });
    ancho.addEventListener("change", alScroll);
    alScroll();
    return () => {
      window.removeEventListener("scroll", alScroll);
      window.removeEventListener("resize", alScroll);
      ancho.removeEventListener("change", alScroll);
    };
  }, []);

  // Las piezas van en 4 capas, una por velocidad: así se mueven 4 cosas por
  // cuadro y no 12. Las de una misma capa nunca se topan (van separadas por
  // 2.480 px, y a la misma velocidad), así que el orden no cambia nada.
  return (
    <div className="lp-papeleo" aria-hidden="true">
      {FACTORES.map((factor, g) => (
        <div
          className="lp-papeleo__capa"
          key={g}
          ref={(el) => {
            capas.current[g] = el;
          }}
          style={{ "--factor": factor } as React.CSSProperties}
        >
          {PIEZAS.map((p, i) => {
            if (i % FACTORES.length !== g) return null;
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
      ))}
    </div>
  );
}
