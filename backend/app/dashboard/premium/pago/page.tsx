"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, Lock, CreditCard } from "lucide-react";
import { PASES, esIdPase, formatoPesos, type IdPase } from "@/lib/pases";

// docs/pase-prepagado.md §5.1, §8: Premium es un pase de pago único de 30 o 90
// días, sin renovación automática. Esta pantalla ya no pide datos bancarios ni
// una autorización de cargo mensual: el pago se hace en Flow (tarjeta o
// transferencia) y AutoPostula no ve esos datos.
const DESCRIPCION: Record<IdPase, string> = {
  pase_30: "Para una búsqueda corta",
  pase_90: "Para buscar con calma",
};

export default function PagoPremiumPage() {
  const router = useRouter();
  const [pase, setPase] = useState<IdPase>("pase_30");
  const [entiende, setEntiende] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState("");
  const [requiereVerificacion, setRequiereVerificacion] = useState(false);

  // Los correos de vencimiento traen el pase en la URL (?pase=pase_90). Se lee
  // acá y no con useSearchParams para no obligar a envolver la página en Suspense.
  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get("pase");
    if (esIdPase(pedido)) setPase(pedido);
  }, []);

  const elegido = PASES[pase];

  async function pagar() {
    if (!entiende || pagando) return;
    setPagando(true);
    setError("");
    setRequiereVerificacion(false);
    try {
      const res = await fetch("/api/flow/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setRequiereVerificacion(!!data.requiereVerificacion);
        setError(data.error ?? "No se pudo iniciar el pago — intenta de nuevo en un momento.");
        setPagando(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      console.error("Error iniciando el pago:", err);
      setError("No pudimos conectar con el servidor. Intenta de nuevo.");
      setPagando(false);
    }
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <button
          className="ap-button-ghost"
          onClick={() => router.push("/dashboard/premium")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}
        >
          <ArrowLeft size={14} /> Volver a Premium
        </button>
        <h1 className="ap-page-title">Pagar tu pase Premium</h1>
        <p className="ap-page-sub">
          Pago único, sin renovación automática: pagas solo cuando lo necesitas.
        </p>
      </div>

      <div className="ap-fila-2">
        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
            <p className="ap-section-title">Elige tu pase</p>
            <p className="ap-section-sub">
              Si ya tienes Premium, el nuevo pase empieza cuando termina el que tienes: no pierdes días.
            </p>
            <div className="ap-option-group">
              {(Object.keys(PASES) as IdPase[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPase(id)}
                  className={"ap-option-card" + (pase === id ? " ap-option-card-active" : "")}
                  aria-pressed={pase === id}
                >
                  <span className="ap-option-title">
                    {PASES[id].dias} días · ${formatoPesos(PASES[id].monto)}
                  </span>
                  <span className="ap-option-desc">{DESCRIPCION[id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
            <label className="ap-autoriza">
              <input type="checkbox" checked={entiende} onChange={(e) => setEntiende(e.target.checked)} />
              <span>
                Entiendo que es un <b>pago único de ${formatoPesos(elegido.monto)}</b> por {elegido.dias} días
                de Premium. <b>No se renueva solo</b>: al terminar vuelvo al plan gratuito y no se me cobra
                nada más.
              </span>
            </label>
          </div>
        </div>

        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s" }}>
            <p className="ap-section-title">Tu pase</p>
            <div className="ap-resumen-fila">
              <span>AutoPostula Premium</span>
              <b>{elegido.dias} días</b>
            </div>
            <div className="ap-resumen-fila ap-resumen-fila--tenue">
              <span>Cobro</span>
              <span>Único</span>
            </div>
            <div className="ap-resumen-fila ap-resumen-fila--total">
              <span>Total hoy</span>
              <b>${formatoPesos(elegido.monto)}</b>
            </div>

            {error && (
              <p role="alert" style={{ fontSize: 12.5, color: "var(--status-rechazado)", margin: "12px 0" }}>
                {error}
                {requiereVerificacion && " Revisa tu correo y confirma tu dirección antes de pagar."}
              </p>
            )}

            <button className="ap-gradient-accent ap-boton-pagar" disabled={!entiende || pagando} onClick={pagar}>
              <Lock size={13} /> {pagando ? "Llevándote a Flow…" : "Pagar con Flow"}
            </button>

            <p className="ap-nota-pago">
              <ShieldCheck size={13} /> Sin renovación automática. Te avisamos por correo antes de que termine.
            </p>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.15s" }}>
            <p className="ap-section-title">Pago seguro con Flow</p>
            <p className="ap-section-sub" style={{ marginBottom: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <CreditCard size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              Te llevamos a Flow para pagar con tarjeta o transferencia. Tus datos de pago no pasan por
              AutoPostula. Al volver, tu Premium queda activo en cuanto Flow confirma el pago.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
