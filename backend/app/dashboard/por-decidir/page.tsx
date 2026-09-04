"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Building2, TriangleAlert } from "lucide-react";
import { SwipeTriaje, type ItemSwipe } from "@/components/SwipeTriaje";

type DecisionGris = {
  id: string;
  tituloCrudo: string;
  url: string | null;
  empresa: string | null;
  plataforma: string | null;
  scoreLocal: number | null;
  razones: string[] | null;
  venceEn: string | null;
};

function diasRestantes(venceEn: string | null): string {
  if (!venceEn) return "";
  const dias = Math.ceil((new Date(venceEn).getTime() - Date.now()) / 86_400_000);
  if (dias <= 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

export default function PorDecidirPage() {
  const [pendientes, setPendientes] = useState<DecisionGris[] | null>(null);
  const [expiradasSinRevisar, setExpiradasSinRevisar] = useState(0);
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    try {
      const res = await fetch("/api/banda-gris");
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setPendientes(data.pendientes ?? []);
      setExpiradasSinRevisar(data.expiradasSinRevisar ?? 0);
    } catch (err) {
      console.error("Error cargando banda gris:", err);
      setMensaje("No se pudo cargar — revisa la consola");
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function decidir(item: ItemSwipe, veredicto: "SI" | "NO") {
    try {
      await fetch("/api/banda-gris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, veredicto }),
      });
    } catch (err) {
      console.error("Error guardando decisión:", err);
    }
  }

  const items: ItemSwipe[] =
    pendientes?.map((d) => ({
      id: d.id,
      titulo: d.tituloCrudo,
      url: d.url,
      empresa: d.empresa,
      plataforma: d.plataforma,
      razones: d.razones,
      venceEn: d.venceEn,
    })) ?? [];

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Por decidir</h1>
        <p className="ap-page-sub">
          Ofertas que el scorer no pudo ubicar con confianza — tu sí o no ayuda a que tu perfil aprenda.
        </p>
      </div>

      {mensaje && <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}

      {expiradasSinRevisar > 0 && (
        <div
          className="ap-section"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            borderColor: "color-mix(in oklch, var(--chart-4) 35%, transparent)",
          }}
        >
          <TriangleAlert size={16} color="var(--chart-4)" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 13 }}>
            Se te vencieron <strong>{expiradasSinRevisar}</strong> oferta{expiradasSinRevisar === 1 ? "" : "s"} sin revisar.
          </p>
        </div>
      )}

      <div className="ap-section ap-animate-in" style={{ maxWidth: 480, margin: "0 auto" }}>
        {pendientes === null ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Cargando...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No hay nada pendiente</p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Cuando el scorer encuentre una oferta ambigua, va a aparecer acá para que decidas.
            </p>
          </div>
        ) : (
          <SwipeTriaje
            items={items}
            onDecidir={decidir}
            onTerminar={cargar}
            pregunta={(titulo) => `¿Postularías a "${titulo}"?`}
            renderDetalle={(item) => (
              <div style={{ textAlign: "center" }}>
                {!!item.empresa && (
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                    <Building2 size={13} /> {String(item.empresa)}
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                  {!!item.url && (
                    <a
                      href={String(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                    >
                      Ver oferta <ExternalLink size={12} />
                    </a>
                  )}
                  {!!item.venceEn && (
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{diasRestantes(item.venceEn as string)}</span>
                  )}
                </div>
                {Array.isArray(item.razones) && item.razones.length > 0 && (
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }}>
                    {(item.razones as string[]).join(" · ")}
                  </p>
                )}
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
