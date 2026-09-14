"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { MarcaAcceso, Mensaje } from "@/components/acceso/Piezas";

type Estado = "verificando" | "verificado" | "vencido" | "invalido";

// docs/verificacion-de-correo.md §7: los tres estados -- éxito, token vencido,
// token inválido -- cada uno con su salida. Un vencido no es un callejón:
// ofrece reenviar ahí mismo.
function Verificador() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [estado, setEstado] = useState<Estado>("verificando");
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado("invalido");
      setMensajeError("Este enlace no trae el código de verificación.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verificar-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setEstado("verificado");
        } else if (data.estado === "vencido") {
          setEstado("vencido");
          setMensajeError(data.error ?? "Este enlace ya venció.");
        } else {
          setEstado("invalido");
          setMensajeError(data.error ?? "Este enlace no es válido.");
        }
      } catch {
        setEstado("invalido");
        setMensajeError("No pudimos conectar con el servidor. Intenta de nuevo.");
      }
    })();
  }, [token]);

  async function reenviar() {
    setReenviando(true);
    setAvisoReenvio(null);
    try {
      const res = await fetch("/api/auth/reenviar-verificacion", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAvisoReenvio("Inicia sesión y pide el reenvío desde ahí.");
      } else if (!res.ok) {
        setAvisoReenvio(data.error ?? "No se pudo reenviar el correo.");
      } else {
        setAvisoReenvio("Te enviamos un nuevo enlace — revisa tu correo.");
      }
    } catch {
      setAvisoReenvio("No pudimos conectar con el servidor.");
    } finally {
      setReenviando(false);
    }
  }

  if (estado === "verificando") {
    return <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Verificando tu correo…</p>;
  }

  if (estado === "verificado") {
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
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Correo confirmado</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
          Ya puedes conectar la extensión y postular a trabajos.
        </p>
        <Link href="/dashboard" className="ap-btn ap-btn--primary" style={{ display: "inline-block", width: "100%" }}>
          Ir al dashboard
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>
        {estado === "vencido" ? "Este enlace venció" : "Enlace inválido"}
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 18 }}>
        {estado === "vencido"
          ? "Los enlaces de verificación duran 24 horas. Pide uno nuevo."
          : "Puede que ya lo hayas usado, o que esté mal copiado. Pide uno nuevo."}
      </p>

      {mensajeError && <Mensaje tipo="error">{mensajeError}</Mensaje>}

      <button
        type="button"
        className="ap-btn ap-btn--primary"
        style={{ width: "100%", marginTop: 8 }}
        onClick={reenviar}
        disabled={reenviando}
      >
        {reenviando ? "Enviando…" : "Reenviar correo de verificación"}
      </button>

      {avisoReenvio && <Mensaje tipo="info">{avisoReenvio}</Mensaje>}
    </>
  );
}

export default function VerificarPage() {
  return (
    <div className="ap-tramite">
      <div className="ap-tramite__caja">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <MarcaAcceso />
        </div>

        <div className="ap-tramite__hoja">
          {/* useSearchParams() obliga a envolver esto en <Suspense> -- sin
              eso, "next build" falla al pre-renderizar la página. */}
          <Suspense fallback={<p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Cargando…</p>}>
            <Verificador />
          </Suspense>
        </div>

        <p style={{ textAlign: "center", marginTop: 20 }}>
          <Link
            href="/dashboard"
            style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}
          >
            Ir al dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
