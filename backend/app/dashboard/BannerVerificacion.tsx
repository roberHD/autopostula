"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

// docs/verificacion-de-correo.md §7: banner persistente mientras
// emailVerificado sea null. Dice QUÉ se desbloquea, no solo que falta
// verificar -- y no tiene botón de cerrar a propósito: sigue ahí hasta que
// la persona de verdad confirme su correo.
export default function BannerVerificacion({ verificadoAlCargar }: { verificadoAlCargar: boolean }) {
  const [verificado, setVerificado] = useState(verificadoAlCargar);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (verificado) return null;

  async function reenviar() {
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/auth/reenviar-verificacion", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.yaVerificado) {
        setVerificado(true);
      } else if (res.ok) {
        setAviso("Te enviamos un nuevo enlace — revisa tu correo.");
      } else {
        setAviso(data.error ?? "No se pudo reenviar el correo.");
      }
    } catch {
      setAviso("No pudimos conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ap-cartel-maqueta" role="status">
      <Mail size={17} />
      <div>
        <p className="ap-cartel-maqueta__t">Confirma tu correo para conectar la extensión</p>
        <p className="ap-cartel-maqueta__d">
          Sin confirmarlo no puedes conectar la extensión ni postular a trabajos — el resto del
          dashboard funciona igual. Revisa tu bandeja de entrada (y spam).
          {" "}
          <button
            type="button"
            onClick={reenviar}
            disabled={enviando}
            style={{
              background: "none", border: "none", padding: 0, font: "inherit",
              color: "inherit", textDecoration: "underline", cursor: enviando ? "default" : "pointer",
            }}
          >
            {enviando ? "Enviando…" : "Reenviar correo"}
          </button>
          {aviso && <> — {aviso}</>}
        </p>
      </div>
    </div>
  );
}
