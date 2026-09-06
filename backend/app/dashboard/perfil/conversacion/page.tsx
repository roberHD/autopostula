"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Check, MessageSquare, PenLine, Target, Heart, Lock } from "lucide-react";
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
  // Fase 1 (armar el perfil la primera vez) es gratis para todos. Fase 2
  // (volver a conversar cuando ya hay un perfil confirmado, para seguir
  // profundizándolo) es premium — esto viene del GET para no dejar entrar al
  // chat solo para toparse con el 403 recién al escribir.
  const [puedeSeguirConversando, setPuedeSeguirConversando] = useState(true);
  const [sugerenciaFinalizar, setSugerenciaFinalizar] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
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
        setPuedeSeguirConversando(data.puedeSeguirConversando ?? true);
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
        if (data.requierePremium) setPuedeSeguirConversando(false);
        else if (res.status === 403) setBloqueada(true);
        return;
      }
      setConversacion((prev) => [...prev, { role: "assistant", content: quitarMarkdown(data.pregunta) }]);
      if (data.sugerenciaFinalizar) setSugerenciaFinalizar(true);
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
        if (data.requierePremium) setPuedeSeguirConversando(false);
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
  const puedeFinalizar = sugerenciaFinalizar || mensajesUsuario >= MINIMO_MENSAJES_PARA_FINALIZAR;
  const pct = Math.min(100, Math.round((mensajesUsuario / MINIMO_MENSAJES_PARA_FINALIZAR) * 100));

  return (
    <div className="ap-glow-bg">
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
        <div className="ap-hoja">
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

          <div className="ap-split">
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

          {puedeSeguirConversando ? (
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
          ) : (
            <div
              style={{
                marginTop: 20, padding: "10px 14px", borderRadius: 8, fontSize: 12.5,
                background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Lock size={14} style={{ flexShrink: 0 }} />
              Seguir profundizando tu perfil con más conversación es una función premium.
            </div>
          )}
        </div>
      ) : (
        <div className="ap-chat">
          <div className="ap-chat__cab">
            <span className="ap-chat__ico"><Sparkles size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <p className="ap-chat__quien">Asistente AutoPostula</p>
              <p className="ap-chat__estado">
                {mensajesUsuario === 0
                  ? "Empecemos: responde con tus palabras"
                  : `${mensajesUsuario} de ${MINIMO_MENSAJES_PARA_FINALIZAR} respuestas`}
              </p>
            </div>
            <div className="ap-chat__avance">
              <span className="ap-chat__avance-barra">
                <span
                  className="ap-chat__avance-relleno"
                  style={{ width: pct + "%" }}
                  data-lleno={pct >= 100 ? "1" : undefined}
                />
              </span>
              <span className="ap-chat__avance-pct">{pct}%</span>
            </div>
          </div>

          <div className="ap-chat__hilo">
            <div className="ap-chat__lista">
              {cargando && <Burbuja role="assistant" text="Cargando la conversación…" muted />}
              {conversacion.map((m, i) => (
                <Burbuja key={i} role={m.role} text={m.content} />
              ))}
              {enviando && <Burbuja role="assistant" escribiendo />}
              <div ref={finRef} />
            </div>
          </div>

          <div className="ap-chat__pie">
            <div className="ap-chat__pie-in">
              {bloqueada && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 11 }}>
                  Llegaste al máximo de mensajes de esta conversación. Finaliza tu perfil para seguir.
                </p>
              )}

              {!bloqueada && (
                <div className="ap-chips">
                  {CHIPS_RESPUESTA_RAPIDA.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="ap-chip"
                      onClick={() => enviarMensaje(chip)}
                      disabled={enviando}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleEnviar} className="ap-redactor">
                <input
                  className="ap-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu respuesta…"
                  disabled={enviando || bloqueada}
                />
                <button
                  className="ap-button ap-redactor__enviar"
                  type="submit"
                  disabled={enviando || bloqueada || !input.trim()}
                  aria-label="Enviar respuesta"
                >
                  <Send size={16} />
                </button>
              </form>

              {puedeFinalizar && (
                <button
                  className="ap-btn ap-btn--mark"
                  style={{ width: "100%", marginTop: 11 }}
                  disabled={finalizando}
                  onClick={finalizar}
                >
                  {finalizando ? "Generando tu perfil…" : "Finalizar y generar mi perfil"}
                </button>
              )}

              <p className="ap-nota-pie">
                {puedeFinalizar
                  ? "Puedes seguir conversando si quieres: mientras más cuentes, más tuyas suenan las respuestas."
                  : "Tus respuestas no se comparten. Solo se usan para redactar postulaciones parecidas a tu forma de escribir."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Burbuja({
  role, text, muted, escribiendo,
}: {
  role: "user" | "assistant";
  text?: string;
  muted?: boolean;
  escribiendo?: boolean;
}) {
  const esIa = role === "assistant";
  return (
    <div className="ap-burbuja" data-de={esIa ? "ia" : "tu"}>
      {esIa && <span className="ap-burbuja__quien"><Sparkles size={13} /></span>}
      <div className="ap-burbuja__texto" data-tenue={muted ? "1" : undefined}>
        {escribiendo ? (
          <span className="ap-escribiendo" aria-label="La IA está escribiendo">
            <i /><i /><i />
          </span>
        ) : (
          text
        )}
      </div>
      {!esIa && <span className="ap-burbuja__quien">Tú</span>}
    </div>
  );
}
