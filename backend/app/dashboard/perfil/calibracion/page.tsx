"use client";

import { useEffect, useState } from "react";

type Pregunta = {
  id: string;
  tipo: string;
  texto: string;
  opciones: string[];
};

export default function CalibracionPage() {
  const [pendientes, setPendientes] = useState<Pregunta[]>([]);
  const [respondidas, setRespondidas] = useState(0);
  const [totalPreguntas, setTotalPreguntas] = useState(0);
  const [confianza, setConfianza] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    try {
      const res = await fetch("/api/style/calibracion");
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setPendientes(data.pendientes ?? []);
      setRespondidas(data.respondidas ?? 0);
      setTotalPreguntas(data.totalPreguntas ?? 0);
      setConfianza(data.confianzaPorcentaje ?? 0);
    } catch (err) {
      console.error("Error cargando calibración:", err);
      setMensaje("No se pudo cargar — revisa la consola");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function responder(preguntaId: string, opcionElegida: string) {
    setEnviando(true);
    setMensaje("");
    try {
      const res = await fetch("/api/style/calibracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preguntaId, opcionElegida }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setRespondidas(data.respondidas);
      setConfianza(data.confianzaPorcentaje);
      setPendientes((prev) => prev.filter((p) => p.id !== preguntaId));
    } catch (err) {
      console.error("Error guardando respuesta:", err);
      setMensaje("No se pudo guardar — revisa la consola");
    } finally {
      setEnviando(false);
    }
  }

  const preguntaActual = pendientes[0];

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Calibra tu estilo</h1>
        <p className="ap-page-sub">
          No hay respuestas correctas — solo muestran distintos estilos. Elige la que más se
          parezca a cómo tú lo dirías.
        </p>
      </div>

      <div className="ap-section" style={{ maxWidth: 560 }}>
        <div
          style={{
            background: "var(--bg-elevated-2)",
            borderRadius: 8,
            height: 8,
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: `${confianza}%`,
              background: "var(--status-finalizado)",
              height: "100%",
              transition: "width 0.3s",
            }}
          />
        </div>
        <p className="ap-section-sub" style={{ marginBottom: 0 }}>
          Confianza del perfil: {confianza}% · {respondidas}/{totalPreguntas} preguntas
        </p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      {!cargando && preguntaActual && (
        <div className="ap-section" style={{ maxWidth: 560 }}>
          <p className="ap-section-title">{preguntaActual.texto}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {preguntaActual.opciones.map((op, i) => (
              <button
                key={i}
                disabled={enviando}
                onClick={() => responder(preguntaActual.id, op)}
                className="ap-option-card"
                style={{ textAlign: "left" }}
              >
                {op}
              </button>
            ))}
          </div>
        </div>
      )}

      {!cargando && !preguntaActual && !mensaje && (
        <p className="ap-section-sub">¡Listo por ahora! Respondiste todas las preguntas disponibles.</p>
      )}
    </>
  );
}
