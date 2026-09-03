"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const ACCENT = "oklch(0.53 0.2 280)";
const BG_LEFT = "oklch(0.985 0.003 275)";
const BORDER = "oklch(0.91 0.008 275)";
const TEXT_MUTED = "oklch(0.52 0.02 275)";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Credenciales inválidas. Revisa tu correo y contraseña.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      console.error("Error iniciando sesión:", err);
      setError("Ocurrió un error al intentar iniciar sesión.");
    } finally {
      setCargando(false);
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

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Iniciar sesión</h1>
        <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginBottom: 28, lineHeight: 1.5 }}>
          Ingresa a tu cuenta para gestionar tus postulaciones automáticas.
        </p>

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

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Contraseña</label>
              <a
                href="/login/forgot-password"
                style={{ fontSize: 12, color: ACCENT, textDecoration: "none", fontWeight: 500 }}
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
            disabled={cargando}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: ACCENT,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: cargando ? "default" : "pointer",
              opacity: cargando ? 0.7 : 1,
              marginTop: 12,
              marginBottom: 16,
            }}
          >
            {cargando ? "Ingresando..." : "Iniciar sesión"}
          </button>

          <div style={{ textAlign: "center", fontSize: 13, color: TEXT_MUTED }}>
            ¿No tienes cuenta?{" "}
            <a href="/registro" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>
              Regístrate aquí
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}