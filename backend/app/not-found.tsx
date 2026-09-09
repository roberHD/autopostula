import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/Marca";
import "./landing.css";

export const metadata: Metadata = {
  title: "Esta página no existe",
  robots: { index: false, follow: true },
};

/**
 * 404 propio.
 *
 * Un 404 es un callejón sin salida: su único trabajo es sacarte de ahí. Por
 * eso no lleva ni ilustración ni chiste, sino las tres puertas que alguien
 * perdido realmente quiere, y la del medio depende de si ya tiene cuenta.
 */
export default function NoEncontrada() {
  return (
    <div className="lp" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 24px" }}>
      <div style={{ maxWidth: 520 }}>
        <Link href="/" className="ap-brand" style={{ marginBottom: 32 }}>
          <Marca tam={34} />
          <b>AutoPostula</b>
        </Link>

        <p className="ap-tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
          Error 404
        </p>

        <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)", marginBottom: 16 }}>
          Esta página no existe.
        </h1>

        <p style={{ fontSize: 16, color: "var(--text-muted)", lineHeight: 1.65, maxWidth: "46ch" }}>
          El enlace que seguiste apunta a algo que se movió o que nunca estuvo acá. No es culpa
          tuya y no perdiste nada: tus postulaciones siguen donde las dejaste.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
          <Link className="ap-btn ap-btn--primary" href="/dashboard">
            Ir a mi tablero
          </Link>
          <Link className="ap-btn ap-btn--ghost" href="/">
            Volver a la portada
          </Link>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 26 }}>
          ¿Llegaste buscando otra cosa? Escríbenos a{" "}
          <a href="mailto:hola@autopostula.cl" style={{ color: "var(--accent)", fontWeight: 600 }}>
            hola@autopostula.cl
          </a>
          .
        </p>
      </div>
    </div>
  );
}
