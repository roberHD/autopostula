"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, MessageSquare, Puzzle, Globe, CheckCircle2 } from "lucide-react";
import { quitarMarkdown } from "@/lib/text";
import "../dashboard/theme.css";

type Mensaje = { role: "user" | "assistant"; content: string };

// Si el servidor revienta con un error no manejado (500 con body vacío o HTML
// en vez de JSON), res.json() tira un SyntaxError que antes quedaba como
// unhandledRejection en la consola sin ningún mensaje útil para la persona.
// Esto lo atrapa y devuelve un error legible en su lugar.
async function parsearRespuesta(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return { error: `El servidor respondió con un error inesperado (${res.status}) — intenta de nuevo en un momento.` };
  }
}

const PASOS = [
  { titulo: "Bienvenida", Icon: Sparkles },
  { titulo: "Tu CV", Icon: FileText },
  { titulo: "Conversación", Icon: MessageSquare },
  { titulo: "Extensión", Icon: Puzzle },
  { titulo: "Portales", Icon: Globe },
  { titulo: "Listo", Icon: CheckCircle2 },
];

export default function OnboardingPage() {
  const router = useRouter();
  // null = todavía revisando desde dónde retomar. Evita el flash de "Bienvenida"
  // antes de saltar al paso que realmente falta.
  const [paso, setPaso] = useState<number | null>(null);

  useEffect(() => {
    async function determinarInicio() {
      try {
        const [perfilRes, conversacionRes, portalesRes, extensionRes] = await Promise.all([
          fetch("/api/perfil"),
          fetch("/api/style/onboarding/mensaje"),
          fetch("/api/platform-accounts"),
          fetch("/api/account/extension-conectada"),
        ]);
        const perfil = perfilRes.ok ? await perfilRes.json() : null;
        const conversacion = conversacionRes.ok ? await conversacionRes.json() : null;
        const portales = portalesRes.ok ? await portalesRes.json() : null;
        const extension = extensionRes.ok ? await extensionRes.json() : null;

        const cvListo = !!perfil?.nombreArchivo;
        const conversacionLista = !!conversacion?.confirmado;
        const extensionLista = !!extension?.extensionConectada;
        const portalConectado = (portales?.cuentas || []).some((c: any) => c.activa);

        if (!cvListo) setPaso(0);
        else if (!conversacionLista) setPaso(2);
        else if (!extensionLista) setPaso(3);
        else if (!portalConectado) setPaso(4);
        else setPaso(5);
      } catch (e) {
        console.error("No se pudo determinar en qué paso del onboarding retomar:", e);
        setPaso(0);
      }
    }
    determinarInicio();
  }, []);

  async function terminar() {
    try {
      await fetch("/api/account/completar-onboarding", { method: "POST" });
    } catch (e) {
      console.error("No se pudo marcar el onboarding como completado:", e);
    }
    router.push("/dashboard");
  }

  // El onboarding siempre se ve en claro — es lo primero que ve una persona
  // recién registrada y no tiene relación con la preferencia oscuro/claro
  // que se elige más adelante en el dashboard (esa sigue viviendo solo ahí).
  if (paso === null) {
    return (
      <div className="ap-shell ap-onb-shell" data-theme="light" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="ap-shell ap-onb-shell" data-theme="light" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 620 }}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
          <div className="ap-onb-brand-mark">AP</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>AutoPostula</span>
        </div>

        {/* Indicador de pasos */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 10 }}>
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
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 24 }}>
          Paso {paso + 1} de {PASOS.length} · {PASOS[paso].titulo}
        </p>

        <div className="ap-card ap-onb-card ap-animate-in" key={paso} style={{ padding: 32 }}>
          {paso === 0 && <PasoBienvenida onSiguiente={() => setPaso(1)} onOmitir={() => setPaso(1)} />}
          {paso === 1 && <PasoCV onSiguiente={() => setPaso(2)} onOmitir={() => setPaso(2)} />}
          {paso === 2 && <PasoConversacion onSiguiente={() => setPaso(3)} onOmitir={() => setPaso(3)} />}
          {paso === 3 && <PasoExtension onSiguiente={() => setPaso(4)} />}
          {paso === 4 && <PasoPortal onSiguiente={() => setPaso(5)} onOmitir={() => setPaso(5)} />}
          {paso === 5 && <PasoListo onTerminar={terminar} />}
        </div>
      </div>
    </div>
  );
}

function Header({ Icon, titulo, sub }: { Icon: typeof Sparkles; titulo: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <div className="ap-onb-icon">
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
  const [analizando, setAnalizando] = useState(false);
  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [subidoOk, setSubidoOk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function revisarCvExistente() {
      try {
        const res = await fetch("/api/perfil");
        if (res.ok) {
          const data = await parsearRespuesta(res);
          if (data?.nombreArchivo) setNombreArchivo(data.nombreArchivo);
        }
      } catch (e) {
        console.error("No se pudo revisar si ya había un CV cargado:", e);
      } finally {
        setCargandoEstado(false);
      }
    }
    revisarCvExistente();
  }, []);

  async function subirCv(file: File) {
    if (file.type !== "application/pdf") {
      setMensaje("El archivo debe ser un PDF");
      setSubidoOk(false);
      return;
    }
    setSubiendo(true);
    setMensaje("");
    setSubidoOk(false);
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await parsearRespuesta(res);
      if (!res.ok) { setMensaje(data.error || "No se pudo procesar el CV"); return; }
      setNombreArchivo(data.nombreArchivo);
      setSubidoOk(true);
      setSubiendo(false);

      setAnalizando(true);
      try {
        const resAI = await fetch("/api/cv/upload/analizar", { method: "POST" });
        const dataAI = await parsearRespuesta(resAI);
        if (resAI.ok && dataAI.disponible && dataAI.datos) {
          // Guardamos de una vez lo que la IA extrajo para que "Mi perfil" no
          // aparezca vacío después del onboarding — antes esta respuesta se
          // descartaba y solo quedaba guardado el archivo, no los datos.
          await fetch("/api/perfil", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataAI.datos),
          });
          setMensaje("Tu CV se subió y la IA completó tu perfil automáticamente.");
        } else {
          setMensaje(dataAI.error || "Tu CV se subió correctamente. Completa tus datos manualmente en tu perfil.");
        }
      } catch {
        setMensaje("Tu CV se subió correctamente, pero la IA no pudo leerlo. Completa tus datos manualmente.");
      } finally {
        setAnalizando(false);
      }
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
          {cargandoEstado
            ? "Revisando..."
            : subiendo
            ? "Subiendo..."
            : analizando
            ? "🤖 La IA está leyendo tu información..."
            : nombreArchivo
            ? `✓ ${nombreArchivo} — toca para reemplazar`
            : "Haz clic para elegir tu CV en PDF"}
        </span>
      </div>
      {mensaje && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: subidoOk
              ? "color-mix(in oklch, var(--status-finalizado) 14%, transparent)"
              : "color-mix(in oklch, var(--status-rechazado) 12%, transparent)",
            color: subidoOk ? "var(--status-finalizado)" : "var(--status-rechazado)",
          }}
        >
          {subidoOk && <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
          {mensaje}
        </div>
      )}
      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} />
    </>
  );
}

const MINIMO_MENSAJES_PARA_FINALIZAR = 4;

function PasoConversacion({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [conversacion, setConversacion] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [finalizado, setFinalizado] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  // React 18 en desarrollo monta cada efecto dos veces a propósito (para pescar
  // efectos sin cleanup) -- sin este guard, la conversación vacía dispara dos
  // "enviar('')" en paralelo y quedan dos saludos de la IA duplicados.
  const yaInicializado = useRef(false);

  useEffect(() => {
    if (yaInicializado.current) return;
    yaInicializado.current = true;

    async function cargar() {
      try {
        const res = await fetch("/api/style/onboarding/mensaje");
        const data = await parsearRespuesta(res);
        if (data.conversacion?.length) {
          setConversacion(
            data.conversacion.map((m: Mensaje) =>
              m.role === "assistant" ? { ...m, content: quitarMarkdown(m.content) } : m
            )
          );
        } else {
          await enviar("");
        }
        if (data.confirmado) setFinalizado(true);
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
      const data = await parsearRespuesta(res);
      if (res.ok) setConversacion((prev) => [...prev, { role: "assistant", content: quitarMarkdown(data.pregunta) }]);
    } finally {
      setEnviando(false);
    }
  }

  async function finalizar() {
    setFinalizando(true);
    try {
      const res = await fetch("/api/style/onboarding/finalizar", { method: "POST" });
      if (res.ok) setFinalizado(true);
    } finally {
      setFinalizando(false);
    }
  }

  const mensajesUsuario = conversacion.filter((m) => m.role === "user").length;
  const puedeFinalizar = mensajesUsuario >= MINIMO_MENSAJES_PARA_FINALIZAR;

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

      {finalizado ? (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: "color-mix(in oklch, var(--status-finalizado) 14%, transparent)",
            color: "var(--status-finalizado)",
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          Tu perfil de estilo quedó listo — la IA ya lo va a usar en tus postulaciones.
        </div>
      ) : puedeFinalizar ? (
        <div style={{ marginTop: 12 }}>
          <button className="ap-button" style={{ width: "100%" }} disabled={finalizando} onClick={finalizar}>
            {finalizando ? "Generando tu perfil..." : "✨ Ya tienes suficiente — Finalizar y generar mi perfil"}
          </button>
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
            Puedes seguir conversando si quieres, pero ya puedes terminar cuando quieras.
          </p>
        </div>
      ) : null}

      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} />
    </>
  );
}

function PasoExtension({ onSiguiente }: { onSiguiente: () => void }) {
  // null = todavía detectando si la extensión está instalada.
  const [extensionDetectada, setExtensionDetectada] = useState<boolean | null>(null);
  const [conectandoExt, setConectandoExt] = useState(false);
  const [extConectada, setExtConectada] = useState(false);
  const [errorConexion, setErrorConexion] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // bridge.js (extension/bridge.js) avisa con estos eventos si está instalada,
  // y si la conexión del token se completó o falló.
  useEffect(() => {
    function onDetectada() {
      setExtensionDetectada(true);
    }
    function onConectado() {
      setExtConectada(true);
      setConectandoExt(false);
      setErrorConexion(null);
      // Avisa al servidor para que retomar el onboarding más tarde (o un
      // reload en este mismo paso) no te mande de vuelta a un paso anterior.
      fetch("/api/account/extension-conectada", { method: "POST" }).catch((e) => {
        console.error("No se pudo guardar que la extensión quedó conectada:", e);
      });
    }
    function onError(e: Event) {
      const detail = (e as CustomEvent).detail;
      setConectandoExt(false);
      setErrorConexion(detail?.error ?? "No se pudo conectar la extensión.");
    }
    window.addEventListener("autopostula:extension-presente", onDetectada);
    window.addEventListener("autopostula:conectado", onConectado);
    window.addEventListener("autopostula:error-conexion", onError);
    // Si no llega el aviso de presencia en ~700ms, asumimos que no está instalada.
    const t = setTimeout(() => setExtensionDetectada((v) => (v === null ? false : v)), 700);
    return () => {
      window.removeEventListener("autopostula:extension-presente", onDetectada);
      window.removeEventListener("autopostula:conectado", onConectado);
      window.removeEventListener("autopostula:error-conexion", onError);
      clearTimeout(t);
    };
  }, []);

  async function generarToken(): Promise<string | null> {
    const res = await fetch("/api/account/token", { method: "POST" });
    const data = await parsearRespuesta(res);
    setToken(data.apiToken ?? null);
    return data.apiToken ?? null;
  }

  async function conectarExtension() {
    setConectandoExt(true);
    setErrorConexion(null);
    const t = token ?? (await generarToken());
    if (!t) {
      setConectandoExt(false);
      setErrorConexion("No se pudo generar el token.");
      return;
    }
    window.dispatchEvent(new CustomEvent("autopostula:conectar", { detail: { token: t } }));
    // Si bridge.js no contesta en unos segundos, no dejamos el botón pegado en "Conectando...".
    setTimeout(() => {
      setConectandoExt((sigueCargando) => {
        if (sigueCargando) setErrorConexion("La extensión no respondió a tiempo. Recarga la página e inténtalo de nuevo.");
        return false;
      });
    }, 4000);
  }

  return (
    <>
      <Header
        Icon={Puzzle}
        titulo="Instala la extensión"
        sub="Es la que hace las postulaciones por ti en Computrabajo — sin ella no hay nada que conectar."
      />

      {extConectada ? (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: "var(--status-finalizado)", fontWeight: 500 }}>
            Extensión conectada ✓
          </p>
        </div>
      ) : extensionDetectada ? (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p className="ap-section-title">Extensión detectada</p>
          <p className="ap-section-sub">Conéctala con un clic para continuar.</p>
          <button className="ap-button" onClick={conectarExtension} disabled={conectandoExt}>
            {conectandoExt ? "Conectando..." : "Conectar extensión"}
          </button>
          {errorConexion && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{errorConexion}</p>}
        </div>
      ) : (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p className="ap-section-title">Todavía no la detectamos</p>
          <p className="ap-section-sub">
            Instala la extensión de AutoPostula en tu navegador y vuelve a intentar.
          </p>
          <button className="ap-button-ghost" onClick={() => window.location.reload()}>
            Ya la instalé, verificar
          </button>
        </div>
      )}

      {/* Paso obligatorio a propósito: no hay botón "Omitir" ni "Siguiente" habilitado
          hasta que la extensión quede conectada. */}
      <button className="ap-button" style={{ width: "100%" }} disabled={!extConectada} onClick={onSiguiente}>
        Siguiente
      </button>
    </>
  );
}

function PasoPortal({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [plataformas, setPlataformas] = useState<{ id: string; nombre: string }[]>([]);
  const [conectada, setConectada] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/platform-accounts");
        const data = await parsearRespuesta(res);
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
