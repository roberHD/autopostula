"use client";

import { useEffect, useState } from "react";
import { Zap, Lock, Mail, BadgeCheck } from "lucide-react";

export default function AjustesPage() {
  const [activa, setActiva] = useState(false);
  const [disponibleEnPlan, setDisponibleEnPlan] = useState(false);
  const [planNombre, setPlanNombre] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    try {
      const res = await fetch("/api/account/busqueda-automatica");
      const data = await res.json();
      if (!res.ok) { setMensaje(data.error ?? `Error ${res.status}`); return; }
      setActiva(data.activa);
      setDisponibleEnPlan(data.disponibleEnPlan);
      setPlanNombre(data.planNombre);
      setEmail(data.email);
    } catch (err) {
      console.error("Error cargando ajustes:", err);
      setMensaje("No se pudo cargar — revisa la consola");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function alternar() {
    if (!disponibleEnPlan || guardando) return;
    const nuevoValor = !activa;
    setActiva(nuevoValor); // optimista
    setGuardando(true);
    try {
      const res = await fetch("/api/account/busqueda-automatica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: nuevoValor }),
      });
      if (!res.ok) {
        setActiva(!nuevoValor); // revierte si falló
        const data = await res.json().catch(() => ({}));
        setMensaje(data.error ?? "No se pudo guardar el cambio");
      }
    } catch (err) {
      setActiva(!nuevoValor);
      console.error("Error guardando ajuste:", err);
      setMensaje("No se pudo guardar el cambio — revisa la consola");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Ajustes</h1>
        <p className="ap-page-sub">Preferencias de tu cuenta.</p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
        <p className="ap-section-title">Tu cuenta</p>
        {cargando ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Cargando...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Mail size={15} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Correo</p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{email ?? "—"}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "color-mix(in oklch, var(--accent) 14%, transparent)", color: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <BadgeCheck size={15} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Plan actual</p>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{planNombre ?? "Plan gratuito"}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
        <p className="ap-section-title">Búsqueda automática</p>

        {cargando ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Cargando...</p>
        ) : !disponibleEnPlan ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0" }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Lock size={15} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Disponible en un plan superior</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                Con búsqueda automática, AutoPostula revisa ofertas nuevas cada 2 horas y postula solo, sin que abras nada — sin este beneficio, sigues pudiendo postular manualmente cuando quieras.
              </p>
            </div>
          </div>
        ) : (
          <div className="ap-toggle-row" style={{ border: "none", padding: "6px 0" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "color-mix(in oklch, var(--accent) 14%, transparent)", color: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Zap size={15} />
              </div>
              <div>
                <p className="ap-toggle-label" style={{ fontWeight: 600 }}>
                  Postular automáticamente{planNombre ? ` (${planNombre})` : ""}
                </p>
                <p className="ap-toggle-desc">
                  {activa
                    ? "Activo — AutoPostula revisa ofertas nuevas cada 2 horas en tus portales conectados y postula por ti."
                    : "Pausado — solo vas a postular cuando lo hagas tú manualmente."}
                </p>
              </div>
            </div>
            <button
              className={"ap-switch " + (activa ? "ap-switch-on" : "ap-switch-off")}
              onClick={alternar}
              disabled={guardando}
              aria-pressed={activa}
              aria-label="Activar o pausar la búsqueda automática"
            >
              <span className="ap-switch-knob" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
