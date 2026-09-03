"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const ACCENT = "oklch(0.53 0.2 280)";
const BG_LEFT = "oklch(0.985 0.003 275)";
const BORDER = "oklch(0.91 0.008 275)";
const TEXT_MUTED = "oklch(0.52 0.02 275)";

function FormularioReset() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Enlace inválido -- falta el token. Solicita uno nuevo.");
      return;
    }
    if (nuevaPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (nuevaPassword !== confirmarPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nuevaPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No se pudo restablecer la contraseña");
        return;
      }

      setExito(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      console.error("Error restableciendo contraseña:", err);
      setError("No se pudo conectar con el servidor -- intenta de nuevo");
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div>
        <p style={{ fontSize: 13.5, color: "#dc2626", marginBottom: 16, lineHeight: 1.5 }}>
          Este enlace no es válido o le falta el token. Solicita uno nuevo desde la página de recuperación.
        </p>
        <a href="/login/forgot-password" style={{ color: ACCENT, fontWeight: 600, fontSize: 13.5, textDecoration: "none" }}>
          Solicitar un nuevo enlace →
        </a>
      </div>
    );
  }

  if (exito) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: 10, background: "color-mix(in oklch, #16A34A 12%, transparent)", color: "#16A34A", fontSize: 13, lineHeight: 1.5 }}>
        Contraseña actualizada -- te llevamos a iniciar sesión...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Nueva contraseña</label>
        <input
          type="password"
          value={nuevaPassword}
          onChange={(e) => setNuevaPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          required
          minLength={8}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, boxSizing: "border-box" }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Confirmar contraseña</label>
        <input
          type="password"
          value={confirmarPassword}
          onChange={(e) => setConfirmarPassword(e.target.value)}
          placeholder="Repite la contraseña"
          required
          minLength={8}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, boxSizing: "border-box" }}
        />
      </div>

      {error && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 14 }}>{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 600, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1 }}
      >
        {enviando ? "Guardando..." : "Restablecer contraseña"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      style={{
        display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center",
        background: BG_LEFT, padding: "40px 24px",
        fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 384 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: ACCENT, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>
            AP
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>AutoPostula</div>
            <div style={{ fontSize: 11, color: TEXT_MUTED }}>Autopostulación IA</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Restablece tu contraseña</h1>
        <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginBottom: 28, lineHeight: 1.5 }}>
          Elige una nueva contraseña para tu cuenta.
        </p>

        <Suspense fallback={<p style={{ fontSize: 13, color: TEXT_MUTED }}>Cargando...</p>}>
          <FormularioReset />
        </Suspense>
      </div>
    </div>
  );
}   