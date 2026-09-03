"use client";

import { useState } from "react";

const ACCENT = "oklch(0.53 0.2 280)";
const BG_LEFT = "oklch(0.985 0.003 275)";
const BORDER = "oklch(0.91 0.008 275)";
const TEXT_MUTED = "oklch(0.52 0.02 275)";

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
        setError(data.error ?? "No se pudo procesar la solicitud");
        return;
      }

      setEnviado(true);
    } catch (err) {
      console.error("Error solicitando recuperación de contraseña:", err);
      setError("No se pudo conectar con el servidor -- intenta de nuevo");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: BG_LEFT,
        padding: "40px 24px",
        fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 384 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              background: ACCENT,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            AP
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>AutoPostula</div>
            <div style={{ fontSize: 11, color: TEXT_MUTED }}>Autopostulación IA</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Recupera tu contraseña</h1>
        <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginBottom: 28, lineHeight: 1.5 }}>
          Ingresa tu correo y te enviamos un enlace para restablecerla.
        </p>

        {enviado ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: "color-mix(in oklch, #16A34A 12%, transparent)",
              color: "#16A34A",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Si el correo está registrado, te llegará un enlace para restablecer tu contraseña en unos minutos.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${BORDER}`,
                  fontSize: 13.5,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {error && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 14 }}>{error}</p>}

            <button
              type="submit"
              disabled={enviando}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "none",
                background: ACCENT,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: enviando ? "default" : "pointer",
                opacity: enviando ? 0.7 : 1,
                marginTop: 4,
                marginBottom: 16,
              }}
            >
              {enviando ? "Enviando..." : "Enviar enlace de recuperación"}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", fontSize: 13, color: TEXT_MUTED, marginTop: 16 }}>
          <a href="/login" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>
            ← Volver a iniciar sesión
          </a>
        </div>
      </div>
    </div>
  );
}
