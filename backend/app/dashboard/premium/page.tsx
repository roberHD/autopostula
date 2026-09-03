"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles, PartyPopper } from "lucide-react";

type Fila = { texto: string; free: string | boolean; premium: string | boolean };

const FILAS: Fila[] = [
  { texto: "Postulaciones por mes", free: "20", premium: "80" },
  { texto: "Portales conectados a la vez", free: "1", premium: "Todos" },
  { texto: "Búsqueda y postulación automática", free: false, premium: true },
  { texto: "Seguir conversando con la IA para afinar tu perfil", free: false, premium: true },
  { texto: "Calibración de estilo completa (6 preguntas)", free: false, premium: true },
  { texto: "Instrucciones personalizadas en Entrenar IA", free: false, premium: true },
  { texto: "Exportar tu historial a CSV", free: false, premium: true },
];

function Celda({ valor, destacar }: { valor: string | boolean; destacar?: boolean }) {
  if (typeof valor === "boolean") {
    return valor ? (
      <Check size={16} color="var(--chart-3)" strokeWidth={2.5} />
    ) : (
      <span style={{ color: "var(--text-muted)" }}>—</span>
    );
  }
  return <span style={{ fontWeight: 600, color: destacar ? "var(--chart-3)" : undefined }}>{valor}</span>;
}

export default function PremiumPage() {
  const [cargando, setCargando] = useState(true);
  const [esPremium, setEsPremium] = useState(false);
  const [planNombre, setPlanNombre] = useState<string | null>(null);
  const [redirigiendo, setRedirigiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/account/busqueda-automatica");
        const data = await res.json();
        setEsPremium(data.esPremium ?? false);
        setPlanNombre(data.planNombre);
      } catch (err) {
        console.error("Error cargando estado del plan:", err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function pasarAPremium() {
    setRedirigiendo(true);
    setMensaje("");
    try {
      const res = await fetch("/api/flow/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setMensaje(data.error ?? "No se pudo continuar — intenta de nuevo");
        setRedirigiendo(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      console.error("Error abriendo Flow:", err);
      setMensaje("No se pudo continuar — revisa la consola");
      setRedirigiendo(false);
    }
  }

  if (cargando) {
    return <div className="ap-empty">Cargando...</div>;
  }

  if (esPremium) {
    return (
      <>
        <div className="ap-page-header">
          <h1 className="ap-page-title">Premium</h1>
          <p className="ap-page-sub">Ya tienes todo lo que AutoPostula ofrece.</p>
        </div>
        <div
          className="ap-section ap-animate-in"
          style={{ textAlign: "center", padding: "48px 24px", marginBottom: 0 }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
              background: "var(--accent)", color: "var(--accent-contrast)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <PartyPopper size={26} />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
            Ya eres {planNombre ?? "Premium"}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 420, margin: "0 auto" }}>
            80 postulaciones al mes, búsqueda automática, calibración completa y todo lo demás ya
            está activo en tu cuenta. Puedes gestionar o cancelar tu suscripción desde Ajustes.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header" style={{ textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12,
            padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: "linear-gradient(90deg, color-mix(in oklch, var(--chart-1) 18%, transparent), color-mix(in oklch, var(--chart-3) 18%, transparent))",
            color: "var(--accent)",
          }}
        >
          <Sparkles size={13} /> AutoPostula Premium
        </div>
        <h1 className="ap-page-title" style={{ fontSize: 26 }}>Postula más rápido, sin límites de siempre</h1>
        <p className="ap-page-sub" style={{ maxWidth: 480, margin: "0 auto" }}>
          Deja que la IA busque y postule sola mientras tú te enfocas en las entrevistas.
        </p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, textAlign: "center", marginBottom: 16 }}>
          {mensaje}
        </p>
      )}

      <div className="ap-pricing-grid" style={{ maxWidth: 760, margin: "0 auto 28px" }}>
        {/* Free */}
        <div className="ap-section ap-animate-in" style={{ marginBottom: 0 }}>
          <p className="ap-section-title">Free</p>
          <p style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>$0</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Para empezar a postular</p>
        </div>

        {/* Premium -- borde degradado: div exterior con el gradiente de fondo
            + div interior sólido, para simular un borde de varios colores
            (un border-image con gradiente no deja redondear bien las esquinas). */}
        <div
          className="ap-gradient-border ap-animate-in"
          style={{ borderRadius: "var(--radius)", padding: "1.5px", animationDelay: "0.05s" }}
        >
          <div
            className="ap-section"
            style={{ marginBottom: 0, position: "relative", height: "100%", boxSizing: "border-box" }}
          >
            <span
              className="ap-gradient-accent"
              style={{
                position: "absolute", top: -11, right: 16,
                fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}
            >
              Recomendado
            </span>
            <p className="ap-section-title">Premium</p>
            <p style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
              $3.990 <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>/mes</span>
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Cancela cuando quieras</p>
            <button
              className="ap-gradient-accent"
              style={{
                width: "100%", border: "none", borderRadius: 8, padding: "9px 16px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
              disabled={redirigiendo}
              onClick={pasarAPremium}
            >
              {redirigiendo ? "Un momento..." : "✨ Pasar a Premium"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla comparativa */}
      <div className="ap-card ap-table-scroll" style={{ maxWidth: 760, margin: "0 auto" }}>
        <table className="ap-table" style={{ minWidth: 460 }}>
          <thead>
            <tr>
              <th>Función</th>
              <th style={{ textAlign: "center", width: 110 }}>Free</th>
              <th style={{ textAlign: "center", width: 110 }}>Premium</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((fila) => (
              <tr key={fila.texto}>
                <td>{fila.texto}</td>
                <td style={{ textAlign: "center" }}>
                  <Celda valor={fila.free} />
                </td>
                <td style={{ textAlign: "center" }}>
                  <Celda valor={fila.premium} destacar />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
