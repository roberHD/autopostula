"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  /** Escalona la entrada respecto al bloque anterior (0 a 3). */
  retraso?: 0 | 1 | 2 | 3;
  className?: string;
  style?: React.CSSProperties;
  as?: "div" | "section" | "article" | "li";
};

/**
 * Revela un bloque cuando entra en pantalla, y de paso le pone la clase
 * `is-in` para que se disparen los detalles internos (el barrido de
 * destacador, las barras que crecen, las líneas que se dibujan).
 *
 * El bloque arranca VISIBLE y solo se "arma" (opacity 0) desde el efecto,
 * que corre en el cliente. Si el JS no carga, o si la persona pidió menos
 * movimiento, la página se ve completa igual -- nunca queda contenido
 * atrapado en opacity 0 esperando un observer que no llegó.
 */
export default function Revelar({
  children,
  retraso = 0,
  className = "",
  style,
  as: Tag = "div",
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    // Si ya está en pantalla al montar (lo que está sobre el pliegue), se
    // muestra de una: no tiene sentido esconder lo que ya se estaba viendo.
    const caja = el.getBoundingClientRect();
    if (caja.top < window.innerHeight * 0.9) {
      setVisible(true);
      return;
    }

    setArmado(true);
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0].isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -60px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`ap-rv${visible ? " is-in" : ""}${className ? ` ${className}` : ""}`}
      data-armado={armado ? "1" : undefined}
      data-retraso={retraso || undefined}
      style={style}
    >
      {children}
    </Tag>
  );
}
