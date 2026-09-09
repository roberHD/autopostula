import { ImageResponse } from "next/og";

export const alt = "AutoPostula — Postula 80 veces al mes. Escribe una sola.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * La tarjeta que se ve cuando alguien manda el link por WhatsApp o lo pega
 * en LinkedIn. Sin esto, el enlace salía como un rectángulo gris sin nada.
 *
 * Misma identidad que todo lo demás: tinta, y el destacador citrón sobre la
 * línea que remata. Se genera en el servidor, así que no depende de que se
 * cargue ninguna fuente externa para verse bien.
 */
export default function Imagen() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1B1A2E",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 17,
              background: "#5A2FD6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24">
              <path
                d="M4 12.5l5.2 5.2L20 6.8"
                fill="none"
                stroke="#D6F24B"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span style={{ fontSize: 34, fontWeight: 700, color: "#ECECF3", letterSpacing: "-0.5px" }}>
            AutoPostula
          </span>
        </div>

        {/* El titular, con el destacador sobre la línea que remata */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 76, fontWeight: 800, color: "#ECECF3", letterSpacing: "-2.5px" }}>
            Postula 80 veces al mes.
          </span>
          <span
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: "#1B1A2E",
              background: "#D6F24B",
              letterSpacing: "-2.5px",
              padding: "2px 14px",
              borderRadius: 8,
              alignSelf: "flex-start",
            }}
          >
            Escribe una sola.
          </span>
        </div>

        {/* Los datos concretos, no adjetivos */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 26, color: "#9998AC" }}>
          <span>Computrabajo, Laborum y Trabajando.com</span>
          <span style={{ color: "#443F5E" }}>|</span>
          <span>20 postulaciones gratis al mes</span>
        </div>
      </div>
    ),
    size,
  );
}
