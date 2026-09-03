"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

const OPCIONES_TONO = [
  { valor: "formal", titulo: "Formal", desc: "Serio y protocolar" },
  { valor: "profesional_cercano", titulo: "Profesional cercano", desc: "Equilibrado y humano" },
  { valor: "entusiasta", titulo: "Entusiasta", desc: "Enérgico y proactivo" },
];

const OPCIONES_LONGITUD = [
  { valor: "corta", titulo: "Corta" },
  { valor: "media", titulo: "Media" },
  { valor: "detallada", titulo: "Detallada" },
];

type Respuesta = { pregunta: string; respuesta: string };

export default function EntrenarIAPage() {
  const [tono, setTono] = useState("profesional_cercano");
  const [longitudRespuesta, setLongitudRespuesta] = useState("media");
  const [instrucciones, setInstrucciones] = useState("");
  const [usarPerfil, setUsarPerfil] = useState(true);
  const [evitarRepetidas, setEvitarRepetidas] = useState(true);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [instruccionesBloqueadas, setInstruccionesBloqueadas] = useState(false);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/style/entrenamiento");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          return;
        }
        setTono(data.tono);
        setLongitudRespuesta(data.longitudRespuesta);
        setInstrucciones(data.instrucciones);
        setUsarPerfil(data.usarPerfil);
        setEvitarRepetidas(data.evitarRepetidas);
        setInstruccionesBloqueadas(data.instruccionesBloqueadas ?? false);
      } catch (err) {
        console.error("Error cargando entrenamiento:", err);
        setMensaje("No se pudo cargar — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    setGuardado(false);
    try {
      const res = await fetch("/api/style/entrenamiento", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tono, longitudRespuesta, instrucciones, usarPerfil, evitarRepetidas }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setGuardado(true);
    } catch (err) {
      console.error("Error guardando entrenamiento:", err);
      setMensaje("No se pudo guardar — revisa la consola");
    } finally {
      setGuardando(false);
    }
  }

  async function generarPreview() {
    setGenerando(true);
    setMensaje("");
    try {
      const res = await fetch("/api/ai/preview-entrenamiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tono, longitudRespuesta, instrucciones }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setRespuestas(data.respuestas ?? []);
    } catch (err) {
      console.error("Error generando preview:", err);
      setMensaje("No se pudo generar el preview — revisa la consola");
    } finally {
      setGenerando(false);
    }
  }

  if (cargando) {
    return <div className="ap-empty">Cargando...</div>;
  }

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Entrenar IA</h1>
        <p className="ap-page-sub">Ajusta el tono y las respuestas de tu asistente</p>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>
          {mensaje}
        </p>
      )}

      <div className="ap-two-col">
        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
            <p className="ap-section-title">Tono de las respuestas</p>
            <p className="ap-section-sub">Define cómo se expresa tu asistente al responder formularios</p>
            <div className="ap-option-group">
              {OPCIONES_TONO.map((o) => (
                <button
                  key={o.valor}
                  className={"ap-option-card" + (tono === o.valor ? " ap-option-card-active" : "")}
                  onClick={() => setTono(o.valor)}
                >
                  <div className="ap-option-title">{o.titulo}</div>
                  <div className="ap-option-desc">{o.desc}</div>
                </button>
              ))}
            </div>

            <p className="ap-section-title" style={{ marginTop: 4 }}>Extensión de las respuestas</p>
            <div className="ap-option-group" style={{ marginBottom: 0 }}>
              {OPCIONES_LONGITUD.map((o) => (
                <button
                  key={o.valor}
                  className={"ap-option-card" + (longitudRespuesta === o.valor ? " ap-option-card-active" : "")}
                  onClick={() => setLongitudRespuesta(o.valor)}
                  style={{ flex: "0 0 auto", minWidth: 90, textAlign: "center" }}
                >
                  <div className="ap-option-title">{o.titulo}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
            <p className="ap-section-title">Instrucciones personalizadas</p>
            <p className="ap-section-sub">Indícale a la IA cómo quieres que te represente</p>
            {instruccionesBloqueadas && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 10, padding: "10px 14px", borderRadius: 8, fontSize: 12.5,
                  background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                }}
              >
                <Lock size={14} style={{ flexShrink: 0 }} />
                Escribir instrucciones propias es una función premium — el tono y la extensión de arriba siguen libres.
              </div>
            )}
            <textarea
              className="ap-textarea"
              value={instrucciones}
              onChange={(e) => setInstrucciones(e.target.value)}
              disabled={instruccionesBloqueadas}
              placeholder="Ej: Responde en primera persona, con tono cercano pero profesional. Destaca mi experiencia en..."
            />
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <button className="ap-button" disabled={guardando} onClick={guardar}>
                {guardando ? "Guardando..." : "Guardar entrenamiento"}
              </button>
              {guardado && (
                <span style={{ fontSize: 12, color: "var(--status-finalizado)" }}>
                  Los cambios se aplican a las próximas postulaciones.
                </span>
              )}
            </div>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p className="ap-section-title" style={{ marginBottom: 0 }}>Respuestas de ejemplo</p>
                <p className="ap-section-sub" style={{ marginBottom: 0 }}>
                  Así respondería tu asistente con la configuración actual
                </p>
              </div>
              <button className="ap-button-ghost" disabled={generando} onClick={generarPreview}>
                {generando ? "Generando..." : "Regenerar"}
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              {respuestas.length === 0 && !generando && (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Haz clic en "Regenerar" para ver cómo respondería tu asistente ahora mismo.
                </p>
              )}
              {respuestas.map((r, i) => (
                <div key={i} className="ap-preview-card ap-animate-in" style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className="ap-preview-q">{r.pregunta}</div>
                  <div className="ap-preview-a">{r.respuesta}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.15s" }}>
            <p className="ap-section-title">Cómo funciona</p>
            <p className="ap-section-sub" style={{ marginBottom: 0 }}>
              Tu asistente combina tu perfil, tu experiencia y estas instrucciones para redactar
              respuestas únicas en cada formulario. Cuanto más lo entrenes, más se parecerá a ti.
            </p>
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.2s" }}>
            <p className="ap-section-title">Fuentes de contexto</p>
            <div className="ap-toggle-row">
              <div>
                <div className="ap-toggle-label">Usar mi perfil</div>
                <div className="ap-toggle-desc">Experiencia, habilidades y datos personales</div>
              </div>
              <button
                className={"ap-switch " + (usarPerfil ? "ap-switch-on" : "ap-switch-off")}
                onClick={() => setUsarPerfil(!usarPerfil)}
              >
                <span className="ap-switch-knob" />
              </button>
            </div>
            <div className="ap-toggle-row">
              <div>
                <div className="ap-toggle-label">Evitar respuestas repetidas</div>
                <div className="ap-toggle-desc">Varía la redacción entre postulaciones</div>
              </div>
              <button
                className={"ap-switch " + (evitarRepetidas ? "ap-switch-on" : "ap-switch-off")}
                onClick={() => setEvitarRepetidas(!evitarRepetidas)}
              >
                <span className="ap-switch-knob" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
