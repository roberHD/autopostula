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
  Lock,
} from "lucide-react";
import PestanasEntrenar from "../PestanasEntrenar";

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

// Mismo criterio que PALETA_PORTALES en el Resumen -- un color distinto
// por tipo de pregunta en vez de un solo acento repetido siete veces.
const COLOR_TIPO: Record<string, string> = {
  comparacion: "var(--chart-1)",
  historia: "var(--chart-2)",
  frase: "var(--chart-3)",
  vocabulario: "var(--chart-4)",
  formalidad: "var(--chart-5)",
  prioridad: "var(--chart-1)",
  escritura: "var(--chart-2)",
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
  const [bloqueado, setBloqueado] = useState(false);

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
      setBloqueado(data.bloqueado ?? false);
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
    if (bloqueado) return;
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
  const IconoActual = preguntaActual ? ICONO_TIPO[preguntaActual.tipo] ?? MessageSquareQuote : MessageSquareQuote;
  const colorActual = preguntaActual ? COLOR_TIPO[preguntaActual.tipo] ?? "var(--accent)" : "var(--accent)";

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Entrenar IA</h1>
        <p className="ap-page-sub">Elige entre respuestas para que la IA aprenda cómo lo dirías tú</p>
      </div>

      <PestanasEntrenar />

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      {!cargando && totalPreguntas > 0 && (
        <div className="ap-cal-barra">
          <div className="ap-cal-tramos">
            {Array.from({ length: totalPreguntas }).map((_, i) => (
              <span key={i} className="ap-cal-tramo" data-hecho={i < respondidas ? "1" : undefined} />
            ))}
          </div>
          <span className="ap-cal-cuenta">{respondidas} de {totalPreguntas} respondidas</span>
          <span className="ap-cal-cuenta" style={{ color: "var(--accent)" }}>
            Confianza {confianza}%
          </span>
        </div>
      )}

      <div className="ap-hoja">
        <div>
          {!cargando && preguntaActual && (
            <div className="ap-section ap-animate-in" key={preguntaActual.id} style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: `color-mix(in oklch, ${colorActual} 16%, transparent)`, color: colorActual,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <IconoActual size={17} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>
                  {ETIQUETA_TIPO[preguntaActual.tipo] ?? preguntaActual.tipo}
                </span>
              </div>

              <p className="ap-cal-pregunta">{preguntaActual.texto}</p>

              {bloqueado && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 12.5,
                    background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                  }}
                >
                  <Lock size={14} style={{ flexShrink: 0 }} />
                  Esta es una muestra — calibrar tu estilo completo es una función premium.
                </div>
              )}

              {preguntaActual.opciones.length === 2 ? (
                // Dos opciones: van lado a lado y a lo ancho, que es como
                // realmente se comparan dos formas de responder.
                <div className="ap-ab">
                  {preguntaActual.opciones.map((op, i) => {
                    const activa = seleccionada === op;
                    return (
                      <button
                        key={i}
                        className="ap-ab__op"
                        disabled={enviando || bloqueado}
                        data-activa={activa ? "1" : undefined}
                        data-apagada={enviando && !activa ? "1" : undefined}
                        onClick={() => responder(preguntaActual.id, op)}
                      >
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span className="ap-ab__letra">{i === 0 ? "A" : "B"}</span>
                          {activa && <CheckCircle2 size={16} color="var(--accent)" />}
                        </span>
                        <span className="ap-ab__texto">{op}</span>
                        <span className="ap-ab__pie">
                          {activa ? "Elegida" : "Así lo diría yo"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ap-cal-lista">
                  {preguntaActual.opciones.map((op, i) => {
                    const activa = seleccionada === op;
                    return (
                      <button
                        key={i}
                        className="ap-ab__op"
                        disabled={enviando || bloqueado}
                        data-activa={activa ? "1" : undefined}
                        data-apagada={enviando && !activa ? "1" : undefined}
                        onClick={() => responder(preguntaActual.id, op)}
                      >
                        <span className="ap-ab__texto">{op}</span>
                        {activa && <CheckCircle2 size={16} color="var(--accent)" style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              <p style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: "72ch" }}>
                Cada respuesta afina el manual de escritura que usa la IA al postular por ti. No hay
                respuestas correctas: solo las que más se parecen a como tú lo dirías.
              </p>
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

      </div>
    </div>
  );
}
