"use client";

import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/style/onboarding/mensaje");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          return;
        }
        setConversacion(data.conversacion ?? []);
        setConfirmado(data.confirmado ?? false);
        if (!data.conversacion || data.conversacion.length === 0) {
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
      setConversacion((prev) => [...prev, { role: "assistant", content: data.pregunta }]);
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
        <div className="ap-section" style={{ maxWidth: 620 }}>
          <p className="ap-section-title">Tu perfil quedó listo</p>
          <p className="ap-section-sub" style={{ marginBottom: 16 }}>{resultado.resumen}</p>

          <p className="ap-label">Fortalezas</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {resultado.fortalezas?.map((f, i) => (
              <span
                key={i}
                className="ap-badge"
                style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
              >
                {f}
              </span>
            ))}
          </div>

          <p className="ap-label">Manual de escritura</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)", fontSize: 13, lineHeight: 1.7 }}>
            {resultado.manualEscritura?.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>

          <button
            className="ap-button-ghost"
            style={{ marginTop: 18 }}
            onClick={() => {
              setResultado(null);
              setConfirmado(false);
            }}
          >
            Volver a conversar
          </button>
        </div>
      ) : (
        <div className="ap-section" style={{ maxWidth: 620, display: "flex", flexDirection: "column" }}>
          <div style={{ maxHeight: 420, overflowY: "auto", marginBottom: 14, paddingRight: 4 }}>
            {cargando && <p className="ap-section-sub">Cargando...</p>}
            {conversacion.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "9px 13px",
                    borderRadius: 12,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    background: m.role === "user" ? "var(--accent)" : "var(--bg-elevated-2)",
                    color: m.role === "user" ? "var(--accent-contrast)" : "var(--text)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {enviando && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "9px 13px",
                    borderRadius: 12,
                    fontSize: 13,
                    background: "var(--bg-elevated-2)",
                    color: "var(--text-muted)",
                  }}
                >
                  Escribiendo…
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form onSubmit={handleEnviar} style={{ display: "flex", gap: 8 }}>
            <input
              className="ap-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu respuesta..."
              disabled={enviando}
              style={{ flex: 1 }}
            />
            <button className="ap-button" type="submit" disabled={enviando || !input.trim()}>
              Enviar
            </button>
          </form>

          {puedeFinalizar && (
            <button
              className="ap-button-ghost"
              style={{ marginTop: 12, alignSelf: "flex-start" }}
              disabled={finalizando}
              onClick={finalizar}
            >
              {finalizando ? "Generando tu perfil..." : "Finalizar y generar mi perfil"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
