"use client";

import { useEffect, useState } from "react";

/**
 * Aparece después de bajar media pantalla y devuelve al inicio.
 * Se corre hacia arriba solo si hay un aviso abierto (regla en globals.css).
 */
export default function VolverArriba() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function alScroll() {
      setVisible(window.scrollY > 500);
    }
    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <button
      type="button"
      className={`ap-arriba${visible ? " is-on" : ""}`}
      aria-label="Volver arriba"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => {
        const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: quieto ? "auto" : "smooth" });
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
