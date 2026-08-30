"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Detalle = {
  id: string;
  titulo: string;
  empresa: string | null;
  portal: string;
  url: string | null;
  estadoActual: string;
  notaAtencion: string | null;
  enviadaEn: string;
  historial: { estado: string; cambiadoEn: string }[];
  respuestas: {
    pregunta: string;
    respuestaIa: string;
    respuestaFinal: string;
    fueEditada: boolean;
    tema: string | null;
  }[];
};

const ETIQUETA_ESTADO: Record<string, string> = {
  ENVIADO: "Enviada",
  VISTO: "Vista",
  EN_PROCESO: "En proceso",
  FINALISTA: "Finalista",
  FINALIZADO: "Finalizada",
  RECHAZADO: "Rechazada",
  INCOMPLETA: "Necesita tu atención",
};

const COLOR_ESTADO: Record<string, string> = {
  ENVIADO: "var(--status-enviado)",
  VISTO: "var(--status-visto)",
  EN_PROCESO: "var(--status-en-proceso)",
  FINALISTA: "var(--status-finalista)",
  FINALIZADO: "var(--status-finalizado)",
  RECHAZADO: "var(--status-rechazado)",
  INCOMPLETA: "#D97706",
};

export default function DetalleAplicacionPage() {
  const params = useParams();
  const id = params?.id as string;

  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!id) return;
    async function cargar() {
      try {
        const res = await fetch(`/api/applications/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          return;
        }
        setDetalle(data);
      } catch (err) {
        console.error("Error cargando detalle:", err);
        setMensaje("No se pudo cargar — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [id]);

  if (cargando) return <div className="ap-empty">Cargando...</div>;
  if (mensaje) return <p style={{ color: "var(--status-rechazado)", fontSize: 13 }}>{mensaje}</p>;
  if (!detalle) return null;

  return (
    <>
      <div className="ap-page-header">
        <p style={{ marginBottom: 6 }}>
          <a href="/dashboard/historial" style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
            ← Volver al historial
          </a>
        </p>
        <h1 className="ap-page-title">{detalle.titulo}</h1>
        <p className="ap-page-sub">
          {detalle.empresa ?? "Empresa no especificada"} · {detalle.portal}
        </p>
      </div>

      {detalle.estadoActual === "INCOMPLETA" && (
        <div
          className="ap-section"
          style={{
            background: "rgba(217,119,6,0.08)",
            border: "1px solid rgba(217,119,6,0.35)",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: "#D97706", marginBottom: 4 }}>
            Necesita tu atención
          </p>
          <p style={{ fontSize: 13, color: "var(--text)", marginBottom: detalle.url ? 10 : 0 }}>
            {detalle.notaAtencion ?? "No se pudo completar automáticamente."}
          </p>
          {detalle.url && (
            <a
              href={detalle.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12.5, fontWeight: 600, color: "#D97706" }}
            >
              Terminar en {detalle.portal} ↗
            </a>
          )}
        </div>
      )}

      <div className="ap-section">
        <p className="ap-section-title">Estado</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {detalle.historial.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className="ap-badge-dot"
                style={{ background: COLOR_ESTADO[h.estado] ?? "var(--text-muted)", width: 8, height: 8 }}
              />
              <span style={{ fontSize: 13, color: COLOR_ESTADO[h.estado] ?? "var(--text)" }}>
                {ETIQUETA_ESTADO[h.estado] ?? h.estado}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {new Date(h.cambiadoEn).toLocaleString("es-CL")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="ap-section">
        <p className="ap-section-title">Preguntas y respuestas</p>
        <p className="ap-section-sub">Lo que la IA respondió en este formulario</p>

        {detalle.respuestas.length === 0 && (
          <p className="ap-section-sub" style={{ marginBottom: 0 }}>
            No quedaron preguntas registradas para esta postulación (postulación directa, sin formulario).
          </p>
        )}

        {detalle.respuestas.map((r, i) => (
          <div key={i} className="ap-preview-card">
            <div className="ap-preview-q">{r.pregunta}</div>
            <div className="ap-preview-a">{r.respuestaFinal}</div>
            {r.fueEditada && (
              <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6 }}>
                Editada respecto a lo que sugirió la IA
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
