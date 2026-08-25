"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Sparkles, ShieldCheck, Rocket } from "lucide-react";

// Mismos tokens que /login — no se tocan, para que ambas pantallas se sientan
// como una sola experiencia de auth.
const ACCENT = "oklch(0.53 0.2 280)";
const BG_LEFT = "oklch(0.985 0.003 275)";
const BORDER = "oklch(0.91 0.008 275)";
const TEXT_MUTED = "oklch(0.52 0.02 275)";

export default function RegistroPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "No se pudo crear la cuenta");
      setEnviando(false);
      return;
    }

    // Cuenta creada, ahora inicia sesión automáticamente
    await signIn("credentials", { email, password, redirect: false });
    router.push("/dashboard");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <style>{`
        @media (max-width: 900px) {
          .ap-registro-panel { display: none !important; }
        }
      `}</style>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "40px 24px",
          background: BG_LEFT,
        }}
      >
        <div style={{ width: "100%", maxWidth: 384, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: ACCENT, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14,
              }}
            >
              AP
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>AutoPostula</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED }}>Autopostulación IA</div>
            </div>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Crea tu cuenta</h1>
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginBottom: 28, lineHeight: 1.5 }}>
            Empieza gratis y deja que la IA postule por ti en minutos.
          </p>

          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "11px 16px",
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              background: "#fff",
              fontSize: 13.5, fontWeight: 500,
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z" />
              <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.3 0-9.7-3.5-11.3-8.4l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C40.8 36 43.5 30.4 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
            </svg>
            Continuar con Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ fontSize: 12, color: TEXT_MUTED }}>o con tu correo</span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Nombre
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                required
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: `1px solid ${BORDER}`, fontSize: 13.5, boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: `1px solid ${BORDER}`, fontSize: 13.5, boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={mostrarPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  style={{
                    width: "100%", padding: "10px 40px 10px 14px", borderRadius: 10,
                    border: `1px solid ${BORDER}`, fontSize: 13.5, boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((v) => !v)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 4,
                  }}
                >
                  {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 14 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={enviando}
              style={{
                width: "100%", padding: 12, borderRadius: 10, border: "none",
                background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1,
              }}
            >
              {enviando ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: 13, color: TEXT_MUTED, marginTop: 24 }}>
            ¿Ya tienes una cuenta?{" "}
            <a href="/login" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>
              Inicia sesión
            </a>
          </p>
        </div>
      </div>

      <div
        className="ap-registro-panel"
        style={{
          flex: 1,
          background: ACCENT,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "40px 56px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14,
            }}
          >
            AP
          </div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>AutoPostula</span>
        </div>

        <div style={{ maxWidth: 420 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.25, marginBottom: 14 }}>
            Tu próximo empleo, sin llenar formularios a mano.
          </h2>
          <p style={{ fontSize: 14.5, opacity: 0.85, lineHeight: 1.6, marginBottom: 32 }}>
            Crea tu cuenta gratis, sube tu CV una vez y deja que la IA se encargue del resto.
          </p>

          {[
            { Icon: Rocket, titulo: "Listo en minutos", desc: "Sube tu CV, conecta Computrabajo y empieza a postular hoy mismo." },
            { Icon: Sparkles, titulo: "Respuestas a tu manera", desc: "La IA aprende tu forma de escribir para que cada postulación suene a ti." },
            { Icon: ShieldCheck, titulo: "Tú tienes el control", desc: "Revisa y edita cada respuesta antes de enviarla, siempre." },
          ].map(({ Icon, titulo, desc }) => (
            <div key={titulo} style={{ display: "flex", gap: 14, marginBottom: 22 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: "rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon size={17} />
              </div>
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{titulo}</p>
                <p style={{ fontSize: 12.5, opacity: 0.8, lineHeight: 1.5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, opacity: 0.65 }}>Más de 12.000 postulaciones enviadas con AutoPostula.</p>
      </div>
    </div>
  );
}
