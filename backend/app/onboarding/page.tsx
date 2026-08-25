"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, MessageSquare, Globe, CheckCircle2 } from "lucide-react";
import "../dashboard/theme.css";

type Mensaje = { role: "user" | "assistant"; content: string };

const PASOS = [
  { titulo: "Bienvenida", Icon: Sparkles },
  { titulo: "Tu CV", Icon: FileText },
  { titulo: "Conversación", Icon: MessageSquare },
  { titulo: "Portales", Icon: Globe },
  { titulo: "Listo", Icon: CheckCircle2 },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);

  async function terminar() {
    try {
      await fetch("/api/account/completar-onboarding", { method: "POST" });
    } catch (e) {
      console.error("No se pudo marcar el onboarding como completado:", e);
    }
    router.push("/dashboard");
  }

  return (
    <div className="ap-shell" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 620 }}>
        {/* Indicador de pasos */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {PASOS.map((p, i) => (
            <div
              key={p.titulo}
              style={{
                width: i === paso ? 22 : 8,
                height: 8,
                borderRadius: 999,
                background: i <= paso ? "var(--accent)" : "var(--bg-elevated-2)",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        <div className="ap-card ap-animate-in" key={paso} style={{ padding: 32 }}>
          {paso === 0 && <PasoBienvenida onSiguiente={() => setPaso(1)} onOmitir={terminar} />}
          {paso === 1 && <PasoCV onSiguiente={() => setPaso(2)} onOmitir={terminar} />}
          {paso === 2 && <PasoConversacion onSiguiente={() => setPaso(3)} onOmitir={terminar} />}
          {paso === 3 && <PasoPortal onSiguiente={() => setPaso(4)} onOmitir={terminar} />}
          {paso === 4 && <PasoListo onTerminar={terminar} />}
        </div>
      </div>
    </div>
  );
}

function Header({ Icon, titulo, sub }: { Icon: typeof Sparkles; titulo: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <div
        style={{
          width: 48, height: 48, borderRadius: "50%", margin: "0 auto 14px",
          background: "var(--accent)", color: "var(--accent-contrast)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={22} />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{titulo}</h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.5 }}>{sub}</p>
    </div>
  );
}

function Footer({ onSiguiente, onOmitir, siguienteTexto = "Continuar", deshabilitado = false }: {
  onSiguiente: () => void; onOmitir: () => void; siguienteTexto?: string; deshabilitado?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
      <button onClick={onOmitir} className="ap-button-ghost">
        Omitir por ahora
      </button>
      <button onClick={onSiguiente} disabled={deshabilitado} className="ap-button">
        {siguienteTexto}
      </button>
    </div>
  );
}

function PasoBienvenida({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  return (
    <>
      <Header
        Icon={Sparkles}
        titulo="¡Bienvenido a AutoPostula!"
        sub="En 4 pasos cortos dejamos todo listo para que la IA empiece a postular por ti con tu información real."
      />
      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} siguienteTexto="Empecemos" />
    </>
  );
}

function PasoCV({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function subirCv(file: File) {
    if (file.type !== "application/pdf") {
      setMensaje("El archivo debe ser un PDF");
      return;
    }
    setSubiendo(true);
    setMensaje("");
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setMensaje(data.error || "No se pudo procesar el CV"); return; }
      setNombreArchivo(data.nombreArchivo);
      fetch("/api/cv/upload/analizar", { method: "POST" }).catch(() => {});
      setMensaje("¡CV cargado! La IA lo está leyendo en segundo plano.");
    } catch {
      setMensaje("Error al subir el CV. Intenta de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <Header Icon={FileText} titulo="Sube tu CV" sub="La IA lo usa para responder formularios con tu experiencia real, no respuestas genéricas." />
      <div
        onClick={() => fileInputRef.current?.click()}
        className="ap-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subirCv(f); }}
        />
        <span style={{ fontSize: 20 }}>📄</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {subiendo ? "Subiendo..." : nombreArchivo ? `${nombreArchivo} — toca para reemplazar` : "Haz clic para elegir tu CV en PDF"}
        </span>
      </div>
      {mensaje && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>{mensaje}</p>}
      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} />
    </>
  );
}

function PasoConversacion({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [conversacion, setConversacion] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/style/onboarding/mensaje");
        const data = await res.json();
        if (data.conversacion?.length) {
          setConversacion(data.conversacion);
        } else {
          await enviar("");
        }
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

  async function enviar(texto: string) {
    setEnviando(true);
    if (texto) setConversacion((prev) => [...prev, { role: "user", content: texto }]);
    try {
      const res = await fetch("/api/style/onboarding/mensaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto }),
      });
      const data = await res.json();
      if (res.ok) setConversacion((prev) => [...prev, { role: "assistant", content: data.pregunta }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Header Icon={MessageSquare} titulo="Conversemos un poco" sub="Así la IA aprende a escribir como tú. Puedes seguir esta conversación más adelante desde el dashboard." />
      <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
        {cargando && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Cargando...</p>}
        {conversacion.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <div
              style={{
                maxWidth: "80%", padding: "8px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.4,
                background: m.role === "user" ? "var(--accent)" : "var(--bg-elevated-2)",
                color: m.role === "user" ? "var(--accent-contrast)" : "var(--text)",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {enviando && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Escribiendo...</p>}
        <div ref={finRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (input.trim()) { const t = input.trim(); setInput(""); enviar(t); } }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          className="ap-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu respuesta..."
          disabled={enviando}
          style={{ flex: 1 }}
        />
        <button className="ap-button" type="submit" disabled={enviando || !input.trim()}>Enviar</button>
      </form>
      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} />
    </>
  );
}

function PasoPortal({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [plataformas, setPlataformas] = useState<{ id: string; nombre: string }[]>([]);
  const [conectada, setConectada] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/platform-accounts");
        const data = await res.json();
        setPlataformas(data.plataformas ?? []);
        setConectada((data.cuentas ?? []).some((c: any) => c.activa));
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function conectar(platformId: string) {
    const res = await fetch("/api/platform-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId }),
    });
    if (res.ok) setConectada(true);
  }

  async function generarToken() {
    const res = await fetch("/api/account/token", { method: "POST" });
    const data = await res.json();
    setToken(data.apiToken);
  }

  return (
    <>
      <Header Icon={Globe} titulo="Conecta un portal" sub="Elige dónde quieres que la extensión postule por ti." />
      {cargando ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Cargando...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {plataformas.map((p) => (
            <div key={p.id} className="ap-toggle-row">
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.nombre}</span>
              {conectada ? (
                <span style={{ fontSize: 12, color: "var(--status-finalizado)" }}>Conectado ✓</span>
              ) : (
                <button className="ap-button-ghost" onClick={() => conectar(p.id)}>Conectar</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ap-section" style={{ marginBottom: 0 }}>
        <p className="ap-section-title">Token de la extensión</p>
        <p className="ap-section-sub">Cópialo en la configuración de la extensión para que empiece a funcionar.</p>
        <code style={{ display: "block", padding: "10px 12px", background: "var(--bg-elevated-2)", borderRadius: 8, fontSize: 12, wordBreak: "break-all", marginBottom: 10 }}>
          {token ?? "Todavía no generado"}
        </code>
        <button className="ap-button-ghost" onClick={generarToken}>{token ? "Regenerar" : "Generar token"}</button>
      </div>

      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} />
    </>
  );
}

function PasoListo({ onTerminar }: { onTerminar: () => void }) {
  return (
    <>
      <Header Icon={CheckCircle2} titulo="¡Todo listo!" sub="Ya puedes ir a tu dashboard — siempre puedes volver a completar tu perfil desde ahí." />
      <button onClick={onTerminar} className="ap-button" style={{ width: "100%" }}>
        Ir al dashboard
      </button>
    </>
  );
}
