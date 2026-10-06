"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { MarcaAcceso, Mensaje } from "@/components/acceso/Piezas";
import CasillasAceptacion from "@/components/CasillasAceptacion";

export default function FormAceptar({ destino }: { destino: string }) {
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [mayorDeEdad, setMayorDeEdad] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function aceptar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/consentimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aceptaTerminos, mayorDeEdad }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No pudimos guardarlo. Intenta de nuevo en unos segundos.");
        setEnviando(false);
        return;
      }
      // Navegación completa: el layout del panel vuelve a preguntar en el servidor.
      window.location.assign(destino);
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="ap-acceso">
      <div className="ap-acceso__forma">
        <div className="ap-acceso__caja">
          <MarcaAcceso />
          <h1>Antes de seguir</h1>
          <p className="ap-acceso__sub">
            Para usar AutoPostula necesitamos que aceptes los términos y la política de privacidad, que explican qué
            datos tuyos usamos y para qué. Solo te lo pedimos una vez, y de nuevo si los cambiamos.
          </p>

          {error && <Mensaje tipo="error">{error}</Mensaje>}

          <form onSubmit={aceptar}>
            <CasillasAceptacion
              aceptaTerminos={aceptaTerminos}
              mayorDeEdad={mayorDeEdad}
              onCambio={(c) => {
                if (c.aceptaTerminos !== undefined) setAceptaTerminos(c.aceptaTerminos);
                if (c.mayorDeEdad !== undefined) setMayorDeEdad(c.mayorDeEdad);
              }}
            />
            <button
              type="submit"
              className="ap-btn ap-btn--primary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={enviando || !aceptaTerminos || !mayorDeEdad}
            >
              {enviando ? "Guardando…" : "Aceptar y seguir"}
            </button>
          </form>

          <p className="ap-acceso__pie">
            ¿No estás de acuerdo?{" "}
            <button type="button" className="ap-acceso__enlace" onClick={() => signOut({ callbackUrl: "/" })}>
              Cerrar sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
