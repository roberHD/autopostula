"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck, Eye, EyeOff } from "lucide-react";
import { MarcaAcceso, Mensaje } from "@/components/acceso/Piezas";

function FormularioReset() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Este enlace no trae el código de verificación. Pide uno nuevo desde “Recupera tu contraseña”.");
      return;
    }
    if (nuevaPassword.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (nuevaPassword !== confirmarPassword) {
      setError("Las dos contraseñas no son iguales. Revísalas y vuelve a intentar.");
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
        setError(data.error ?? "No pudimos cambiar tu contraseña. El enlace pudo haber vencido: pide uno nuevo.");
        return;
      }

      setExito(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      console.error("Error restableciendo contraseña:", err);
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return (
      <div style={{ textAlign: "center" }}>
        <span
          style={{
            width: 48, height: 48, borderRadius: 13, margin: "0 auto 16px",
            background: "var(--ok-soft)", color: "var(--ok)",
            display: "grid", placeItems: "center",
          }}
        >
          <CircleCheck size={22} />
        </span>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Contraseña cambiada</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Te llevamos a entrar con la nueva.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Crea una contraseña nueva</h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 22 }}>
        Con esta vas a entrar de ahora en adelante. Mínimo 8 caracteres.
      </p>

      {error && <Mensaje tipo="error">{error}</Mensaje>}

      <form onSubmit={handleSubmit}>
        <div className="ap-campo">
          <label className="ap-campo__lab" htmlFor="nueva">Contraseña nueva</label>
          <div style={{ position: "relative" }}>
            <input
              id="nueva"
              type={mostrar ? "text" : "password"}
              value={nuevaPassword}
              onChange={(ev) => setNuevaPassword(ev.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              minLength={8}
              style={{ paddingRight: 42 }}
              required
            />
            <button
              type="button"
              className="ap-campo__ojo"
              onClick={() => setMostrar((v) => !v)}
              aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="ap-campo">
          <label className="ap-campo__lab" htmlFor="confirmar">Repítela</label>
          <input
            id="confirmar"
            type={mostrar ? "text" : "password"}
            value={confirmarPassword}
            onChange={(ev) => setConfirmarPassword(ev.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          className="ap-btn ap-btn--primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={enviando}
        >
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="ap-tramite">
      <div className="ap-tramite__caja">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <MarcaAcceso />
        </div>

        <div className="ap-tramite__hoja">
          {/* useSearchParams() obliga a Next a envolver esto en <Suspense>:
              sin eso, "next build" falla al pre-renderizar la página. */}
          <Suspense fallback={<p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Cargando…</p>}>
            <FormularioReset />
          </Suspense>
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
