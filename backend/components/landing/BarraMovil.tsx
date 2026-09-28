"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * En el celular el botón principal queda arriba y no vuelve nunca. Esta barra
 * aparece al pasar el primer pantallazo y se queda a mano. En computador no se
 * muestra: ahí el nav ya lleva el botón pegado arriba.
 */
export default function BarraMovil() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function alScroll() {
      setVisible(window.scrollY > window.innerHeight * 0.75);
    }
    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <div className={`lp-movil${visible ? " is-on" : ""}`}>
      <div className="lp-movil__in">
        <p className="lp-movil__txt">
          <b>20 postulaciones gratis</b>
          Sin tarjeta
        </p>
        <Link className="ap-btn ap-btn--primary" href="/registro">
          Crear cuenta gratis
        </Link>
      </div>
    </div>
  );
}
