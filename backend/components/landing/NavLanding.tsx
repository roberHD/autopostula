"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MarcaConNombre } from "@/components/Marca";

/** La barra se despega del fondo apenas se baja: aparece el borde y sube la opacidad. */
export default function NavLanding() {
  const [pegado, setPegado] = useState(false);

  useEffect(() => {
    function alScroll() {
      setPegado(window.scrollY > 8);
    }
    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <header className={`lp-nav${pegado ? " is-stuck" : ""}`}>
      <div className="lp-nav__in">
        <Link href="/" className="ap-brand">
          <MarcaConNombre />
        </Link>

        <nav className="lp-nav__links">
          <a className="lp-navlink lp-navlink--anchor" href="#diferencia">La diferencia</a>
          <a className="lp-navlink lp-navlink--anchor" href="#pasos">Cómo funciona</a>
          <a className="lp-navlink lp-navlink--anchor" href="#precios">Precios</a>
          <Link className="lp-navlink lp-navlink--fuerte" href="/login">Iniciar sesión</Link>
          <Link className="ap-btn ap-btn--primary ap-btn--sm" href="/registro">Crear cuenta</Link>
        </nav>
      </div>
    </header>
  );
}
