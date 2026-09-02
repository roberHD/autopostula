"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Check, MessageSquare, PenLine, Target, Heart } from "lucide-react";
import { quitarMarkdown } from "@/lib/text";

type Mensaje = { role: "user" | "assistant"; content: string };

type PerfilExtraido = {
  resumen: string;
  fortalezas: string[];
  objetivo: string;
  motivaciones: string;
  estiloDetalle: Record<string, string>;
  manualEscritura: string[];
};

const MINIMO_MENSAJES_PARA_FINALIZAR = 4;

// Atajos de respuesta rápida — no vienen del backend, son sugerencias fijas
// para no tener que tipear todo (mismas 4 que ya usaba el popup de la extensión).
const CHIPS_RESPUESTA_RAPIDA = ["Prefiero ir al grano", "Me gusta dar ejemplos", "Tono cercano", "Tono formal"];

const ETIQUETAS_ESTILO: { key: string; label: string }[] = [
  { key: "formalidad", label: "Formalidad" },
  { key: "longitud", label: "Longitud" },
  { key: "cercania", label: "Cercanía" },
  { key: "nivelTecnico", label: "Nivel técnico" },
  { key: "seguridad", label: "Seguridad" },
];

export default function ConversacionPage() {
  const [conversacion, setConversacion] = useState<Mensaje[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [resultado, setResultado] = useState<PerfilExtraido | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  // React 18 en desarrollo monta cada efecto dos veces a propósito (para pescar
  // efectos sin cleanup) -- sin este guard, la conversación vacía dispara dos
  // "enviarMensaje('')" en paralelo y quedan dos saludos de la IA duplicados.
  const yaInicializado = useRef(false);

  useEffect(() => {
    if (yaInicializado.current) return;
    yaInicializado.current = true;

    async function cargar() {
      try {
        const res = await fetch("/api/style/onboarding/mensaje");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          return;
        }
        setConversacion(
          (data.conversacion ?? []).map((m: Mensaje) =>
            m.role === "assistant" ? { ...m, content: quitarMarkdown(m.content) } : m
          )
        );
        setConfirmado(data.confirmado ?? false);
        if (data.resultado) {
          setResultado(data.resultado);
        } else if (!data.conversacion || data.conversacion.length === 0) {
          await enviarMensaje("");
        }
      } catch (err) {
        console.error("Error cargando conversación:", err);
        setMensaje("No se pudo cargar — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversacion]);

  async function enviarMensaje(texto: string) {
    setEnviando(true);
    setMensaje("");
    if (texto) {
      setConversacion((prev) => [...prev, { role: "user", content: texto }]);
    }
    try {
      const res = await fetch("/api/style/onboarding/mensaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setConversacion((prev) => [...prev, { role: "assistant", content: quitarMarkdown(data.pregunta) }]);
    } catch (err) {
      console.error("Error enviando mensaje:", err);
      setMensaje("No se pudo enviar — revisa la consola");
    } finally {
      setEnviando(false);
    }
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || enviando) return;
    const texto = input.trim();
    setInput("");
    await enviarMensaje(texto);
  }

  async function finalizar() {
    setFinalizando(true);
    setMensaje("");
    try {
      const res = await fetch("/api/style/onboarding/finalizar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setResultado(data);
      setConfirmado(true);
    } catch (err) {
      console.error("Error finalizando:", err);
      setMensaje("No se pudo generar el perfil — revisa la consola");
    } finally {
      setFinalizando(false);
    }
  }

  const mensajesUsuario = conversacion.filter((m) => m.role === "user").length;
  const puedeFinalizar = mensajesUsuario >= MINIMO_MENSAJES_PARA_FINALIZAR;
  const pct = Math.min(100, Math.round((mensajesUsuario / MINIMO_MENSAJES_PARA_FINALIZAR) * 100));

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Tu estilo profesional</h1>
        <p className="ap-page-sub">
          Conversemos un poco para que la IA aprenda a escribir como tú, no como un formulario genérico.
        </p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}

      {resultado ? (
        <div style={{ maxWidth: 920 }}>
          <div
            className="ap-assistant-card ap-animate-in"
            style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}
          >
            <div
              style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: "var(--accent)", color: "var(--accent-contrast)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Check size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Tu perfil de estilo está listo</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                La IA ya está usando esto para redactar tus postulaciones — no necesitas hacer nada más.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "2fr 1fr" }} className="ap-charts-row">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.05s" }}>
                <p className="ap-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageSquare size={15} /> Resumen
                </p>
                <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{resultado.resumen}</p>
              </div>

              {resultado.manualEscritura?.length > 0 && (
                <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.1s" }}>
                  <p className="ap-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PenLine size={15} /> Manual de escritura
                  </p>
                  <p className="ap-section-sub">Así es como la IA imita tu forma de escribir</p>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                    {resultado.manualEscritura.map((m, i) => (
                      <li key={i} style={{ fontSize: 13, lineHeight: 1.6 }}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {resultado.fortalezas?.length > 0 && (
                <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.05s" }}>
                  <p className="ap-section-title">Fortalezas que destaca</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {resultado.fortalezas.map((f, i) => (
                      <span
                        key={i}
                        className="ap-badge"
                        style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {resultado.objetivo && (
                <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.1s" }}>
                  <p className="ap-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Target size={15} /> Objetivo laboral
                  </p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)" }}>{resultado.objetivo}</p>
                </div>
              )}

              {resultado.motivaciones && (
                <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.15s" }}>
                  <p className="ap-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Heart size={15} /> Motivaciones
                  </p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)" }}>{resultado.motivaciones}</p>
                </div>
              )}

              {resultado.estiloDetalle && (
                <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.2s" }}>
                  <p className="ap-section-title">Cómo escribe</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ETIQUETAS_ESTILO.map(({ key, label }) =>
                      resultado.estiloDetalle[key] ? (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                          <span style={{ color: "var(--text-muted)" }}>{label}</span>
                          <span style={{ fontWeight: 500, textAlign: "right" }}>{resultado.estiloDetalle[key]}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            className="ap-button-ghost"
            style={{ marginTop: 20 }}
            onClick={() => {
              setResultado(null);
              setConfirmado(false);
            }}
          >
            Volver a conversar
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
          {/* Tarjeta de chat */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 480,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
            }}
          >
            {/* Header del chat */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--border)",
                padding: "14px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: "var(--accent)", color: "var(--accent-contrast)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Sparkles size={16} />
                </span>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }}>Asistente AutoPostula</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Conociéndote · {mensajesUsuario} de {MINIMO_MENSAJES_PARA_FINALIZAR} respuestas
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: 110 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: pct + "%", background: "var(--accent)", transition: "width .3s" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{pct}%</span>
              </div>
            </div>

            {/* Mensajes */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, maxHeight: 420 }}>
              {cargando && <p className="ap-section-sub">Cargando...</p>}
              {conversacion.map((m, i) => (
                <MessageBubble key={i} role={m.role} text={m.content} />
              ))}
              {enviando && <MessageBubble role="assistant" text="Escribiendo…" muted />}
              <div ref={finRef} />
            </div>

            {/* Chips + composer */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "14px 20px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {CHIPS_RESPUESTA_RAPIDA.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => enviarMensaje(chip)}
                    disabled={enviando}
                    style={{
                      borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-elevated-2)",
                      padding: "5px 12px", fontSize: 12, fontWeight: 500, color: "var(--text-muted)", cursor: "pointer",
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <form onSubmit={handleEnviar} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="ap-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu respuesta…"
                  disabled={enviando}
                  style={{ flex: 1 }}
                />
                <button
                  className="ap-button"
                  type="submit"
                  disabled={enviando || !input.trim()}
                  style={{ width: 38, height: 38, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  aria-label="Enviar"
                >
                  <Send size={16} />
                </button>
              </form>

              {puedeFinalizar && (
                <button
                  className="ap-button-ghost"
                  style={{ marginTop: 12 }}
                  disabled={finalizando}
                  onClick={finalizar}
                >
                  {finalizando ? "Generando tu perfil..." : "Finalizar y generar mi perfil"}
                </button>
              )}
            </div>
          </div>

          {/* Panel "lo que aprendí de ti" */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 18,
              }}
            >
              <div
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "var(--accent)", color: "var(--accent-contrast)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}
              >
                <Sparkles size={17} />
              </div>
              <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Lo que aprendí de ti</h3>

              {/* Todavía no hay un endpoint que devuelva hechos aprendidos a medida que
                  se conversa — solo al finalizar (ver "resultado" más arriba). Por eso
                  acá se muestra un estado de progreso genérico en vez de inventar datos. */}
              {mensajesUsuario === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  A medida que converses, la IA va afinando cómo escribe por ti.
                </p>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text)" }}>
                  <span
                    style={{
                      width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                      background: "var(--accent)", color: "var(--accent-contrast)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                  {mensajesUsuario} {mensajesUsuario === 1 ? "respuesta registrada" : "respuestas registradas"}
                </div>
              )}
            </div>
            <p style={{ padding: "0 4px", fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Tus respuestas no se comparten. Solo se usan para redactar postulaciones más parecidas a tu forma de escribir.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ role, text, muted }: { role: "user" | "assistant"; text: string; muted?: boolean }) {
  const isIa = role === "assistant";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, justifyContent: isIa ? "flex-start" : "flex-end" }}>
      {isIa && (
        <span
          style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: "var(--accent)", color: "var(--accent-contrast)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Sparkles size={13} />
        </span>
      )}
      <div
        style={{
          maxWidth: "80%",
          padding: "9px 14px",
          borderRadius: 14,
          borderBottomLeftRadius: isIa ? 4 : 14,
          borderBottomRightRadius: isIa ? 14 : 4,
          fontSize: 13.5,
          lineHeight: 1.5,
          background: isIa ? "var(--bg-elevated-2)" : "var(--accent)",
          color: isIa ? (muted ? "var(--text-muted)" : "var(--text)") : "var(--accent-contrast)",
        }}
      >
        {text}
      </div>
      {!isIa && (
        <span
          style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: "var(--bg-elevated-2)", color: "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10.5, fontWeight: 700,
          }}
        >
          Tú
        </span>
      )}
    </div>
  );
}
