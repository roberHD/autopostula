"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { MarcaAcceso, Mensaje } from "@/components/acceso/Piezas";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No pudimos enviar el correo. Intenta de nuevo en unos segundos.");
        return;
      }

      setEnviado(true);
    } catch (err) {
      console.error("Error solicitando recuperación de contraseña:", err);
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    // Es un trámite, no un momento de venta: una tarjeta al centro y nada más.
    <div className="ap-tramite">
      <div className="ap-tramite__caja">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <MarcaAcceso />
        </div>

        <div className="ap-tramite__hoja">
          {enviado ? (
            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  width: 48, height: 48, borderRadius: 13, margin: "0 auto 16px",
                  background: "var(--ok-soft)", color: "var(--ok)",
                  display: "grid", placeItems: "center",
                }}
              >
                <MailCheck size={22} />
              </span>
              <h1 style={{ fontSize: 22, marginBottom: 8 }}>Revisa tu correo</h1>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Si <b style={{ color: "var(--text)" }}>{email}</b> tiene una cuenta, te llegó un enlace
                para crear una contraseña nueva. Vence en una hora.
              </p>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6 }}>
                ¿No llegó? Mira en spam, o{" "}
                <button
                  type="button"
                  onClick={() => setEnviado(false)}
                  style={{
                    background: "none", border: "none", padding: 0, font: "inherit",
                    color: "var(--accent)", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  prueba con otro correo
                </button>.
              </p>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, marginBottom: 8 }}>Recupera tu contraseña</h1>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 22 }}>
                Escribe el correo de tu cuenta y te mandamos un enlace para crear una nueva.
              </p>

              {error && <Mensaje tipo="error">{error}</Mensaje>}

              <form onSubmit={handleSubmit}>
                <div className="ap-campo">
                  <label className="ap-campo__lab" htmlFor="correo">Correo electrónico</label>
                  <input
                    id="correo"
                    type="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="ap-btn ap-btn--primary"
                  style={{ width: "100%", marginTop: 8 }}
                  disabled={enviando}
                >
                  {enviando ? "Enviando…" : "Enviarme el enlace"}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", marginTop: 20 }}>
          <Link
            href="/login"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, color: "var(--text-muted)", textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Volver a entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
