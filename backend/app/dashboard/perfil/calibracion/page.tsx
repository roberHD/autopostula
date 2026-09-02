"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  MessageSquareQuote,
  BookOpen,
  Quote,
  Type,
  SlidersHorizontal,
  ListOrdered,
  PenLine,
  CheckCircle2,
} from "lucide-react";

type Pregunta = {
  id: string;
  tipo: string;
  texto: string;
  opciones: string[];
};

const ICONO_TIPO: Record<string, typeof MessageSquareQuote> = {
  comparacion: MessageSquareQuote,
  historia: BookOpen,
  frase: Quote,
  vocabulario: Type,
  formalidad: SlidersHorizontal,
  prioridad: ListOrdered,
  escritura: PenLine,
};

const ETIQUETA_TIPO: Record<string, string> = {
  comparacion: "Comparación de respuestas",
  historia: "Mini historia",
  frase: "Frase identificativa",
  vocabulario: "Vocabulario",
  formalidad: "Formalidad",
  prioridad: "Prioridades",
  escritura: "Estilo de escritura",
};

export default function CalibracionPage() {
  const [pendientes, setPendientes] = useState<Pregunta[]>([]);
  const [respondidas, setRespondidas] = useState(0);
  const [totalPreguntas, setTotalPreguntas] = useState(0);
  const [confianza, setConfianza] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

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
    setSeleccionada(opcionElegida);
    setEnviando(true);
    setMensaje("");

    // Pequeña pausa para que se note la selección antes de pasar a la siguiente pregunta.
    await new Promise((r) => setTimeout(r, 380));

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
      setSeleccionada(null);
    }
  }

  const preguntaActual = pendientes[0];
  const circunferencia = 97.4;
  const IconoActual = preguntaActual ? ICONO_TIPO[preguntaActual.tipo] ?? MessageSquareQuote : MessageSquareQuote;

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Calibra tu estilo</h1>
        <p className="ap-page-sub">
          No hay respuestas correctas — solo muestran distintos estilos. Elige la que más se
          parezca a cómo tú lo dirías.
        </p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      {!cargando && totalPreguntas > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {Array.from({ length: totalPreguntas }).map((_, i) => (
              <span
                key={i}
                style={{
                  height: 6, flex: 1, borderRadius: 999,
                  background: i < respondidas ? "var(--accent)" : "var(--border)",
                  transition: "background .3s",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", flexShrink: 0 }}>
            {respondidas} / {totalPreguntas}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "2fr 1fr" }} className="ap-charts-row">
        <div>
          {!cargando && preguntaActual && (
            <div className="ap-section ap-animate-in" key={preguntaActual.id} style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: "var(--bg-elevated-2)", color: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <IconoActual size={17} />
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {ETIQUETA_TIPO[preguntaActual.tipo] ?? preguntaActual.tipo}
                </span>
              </div>

              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, lineHeight: 1.4 }}>
                {preguntaActual.texto}
              </p>

              {preguntaActual.opciones.length === 2 ? (
                // Exactamente 2 opciones (típico de "comparación") — tarjetas A/B lado a
                // lado, como en la maqueta. Con más o menos opciones no calza este layout,
                // así que esas siguen con la lista vertical de abajo.
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {preguntaActual.opciones.map((op, i) => {
                    const activa = seleccionada === op;
                    return (
                      <button
                        key={i}
                        disabled={enviando}
                        onClick={() => responder(preguntaActual.id, op)}
                        style={{
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          padding: 16,
                          borderRadius: "var(--radius)",
                          border: "1px solid " + (activa ? "var(--accent)" : "var(--border)"),
                          background: activa ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elevated-2))" : "var(--bg-elevated)",
                          opacity: enviando && !activa ? 0.5 : 1,
                          cursor: enviando ? "default" : "pointer",
                          transition: "background 0.2s, border-color 0.2s, opacity 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span
                            style={{
                              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                              background: activa ? "var(--accent)" : "var(--bg-elevated-2)",
                              color: activa ? "var(--accent-contrast)" : "var(--text-muted)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700,
                            }}
                          >
                            {i === 0 ? "A" : "B"}
                          </span>
                          {activa && <CheckCircle2 size={16} color="var(--accent)" style={{ flexShrink: 0 }} />}
                        </div>
                        <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>{op}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {preguntaActual.opciones.map((op, i) => {
                    const activa = seleccionada === op;
                    return (
                      <button
                        key={i}
                        disabled={enviando}
                        onClick={() => responder(preguntaActual.id, op)}
                        className="ap-option-card"
                        style={{
                          textAlign: "left",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          borderColor: activa ? "var(--accent)" : undefined,
                          background: activa
                            ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elevated-2))"
                            : undefined,
                          opacity: enviando && !activa ? 0.5 : 1,
                          transition: "background 0.2s, border-color 0.2s, opacity 0.2s",
                        }}
                      >
                        <span>{op}</span>
                        {activa && <CheckCircle2 size={16} color="var(--accent)" style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!cargando && !preguntaActual && !mensaje && (
            <div className="ap-section ap-animate-in" style={{ marginBottom: 0, textAlign: "center", padding: "40px 20px" }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: "50%", margin: "0 auto 14px",
                  background: "var(--accent)", color: "var(--accent-contrast)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Sparkles size={22} />
              </div>
              <p style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 6 }}>¡Listo por ahora!</p>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Respondiste todas las preguntas disponibles. Vuelve más adelante para seguir afinando tu estilo.
              </p>
            </div>
          )}
        </div>

        <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.1s" }}>
          <p className="ap-section-title">Confianza del perfil</p>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
            <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
              <svg viewBox="0 0 36 36" width={76} height={76} className="ap-donut-draw">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg-elevated-2)" strokeWidth="4" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none"
                  stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${(confianza / 100) * circunferencia} ${circunferencia}`}
                  style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
              </svg>
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 600 }}>
                {confianza}%
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {respondidas} de {totalPreguntas} preguntas respondidas
            </p>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Cada respuesta afina el manual de escritura que usa la IA al postular por ti — sin
              respuestas "correctas", solo las que más se parecen a como tú lo dirías.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
