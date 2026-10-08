"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, MessageSquare, Puzzle, Globe, CheckCircle2, Target, Search, Plus, X, Download, Mic, Square } from "lucide-react";
import { quitarMarkdown } from "@/lib/text";
import { SwipeTriaje, type ItemSwipe } from "@/components/SwipeTriaje";
import { Marca } from "@/components/Marca";
import { Skel } from "@/components/Esqueleto";
import { useAvisos } from "@/components/Avisos";
import UbicacionPicker, { ubicacionVacia, type UbicacionValor } from "@/components/UbicacionPicker";
import { LLAVE_INTENCION_PREMIUM, URL_CHROME_WEB_STORE } from "@/lib/enlaces";
import { sinSoporteExtension } from "@/lib/dispositivo";
import { valorFormateado } from "@/lib/formato-perfil";
import AutorizacionCv from "@/components/AutorizacionCv";
import { usarDictado } from "@/lib/usar-dictado";
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
  { titulo: "¿Qué buscas?", Icon: Search },
  { titulo: "Preferencias", Icon: Target },
  { titulo: "Conversación", Icon: MessageSquare },
  { titulo: "Extensión", Icon: Puzzle },
  { titulo: "Portales", Icon: Globe },
  { titulo: "Listo", Icon: CheckCircle2 },
];

// Recuerda hasta dónde se avanzó manualmente (Siguiente/Omitir), para que un
// reload -- como el que dispara "Ya la instalé, verificar" en el paso de la
// extensión -- no regrese a un paso anterior que se saltó a propósito sin
// confirmarlo (ej: Conversación con "Omitir por ahora"). determinarInicio()
// solo recalcula hacia ADELANTE del servidor; esto evita que retroceda.
//
// _v2 (docs/objetivo-laboral.md §7.2): al insertar el paso "¿Qué buscas?" en
// la posición 2, todos los índices de ahí en adelante se corrieron. Un valor
// viejo en esta llave (de antes del cambio) apuntaría al paso equivocado --
// "Conversación" (3) aterrizaría en "Preferencias". Cambiar la llave hace
// que el valor viejo se ignore solo; determinarInicio() recalcula desde el
// servidor, que es la fuente confiable.
const LLAVE_PASO_GUARDADO = "ap_onboarding_paso_v2";

function guardarPaso(paso: number) {
  try {
    localStorage.setItem(LLAVE_PASO_GUARDADO, String(paso));
  } catch {
    // localStorage puede fallar en privado/incógnito -- no es crítico, solo
    // se pierde el "recordar por dónde iba" en ese caso.
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  // null = todavía revisando desde dónde retomar. Evita el flash de "Bienvenida"
  // antes de saltar al paso que realmente falta.
  const [paso, setPasoState] = useState<number | null>(null);

  function irAPaso(n: number) {
    guardarPaso(n);
    setPasoState(n);
  }

  useEffect(() => {
    async function determinarInicio() {
      try {
        const [perfilRes, objetivoRes, triajeRes, conversacionRes, portalesRes, extensionRes] = await Promise.all([
          fetch("/api/perfil"),
          fetch("/api/objetivos"),
          fetch("/api/onboarding/triaje"),
          fetch("/api/style/onboarding/mensaje"),
          fetch("/api/platform-accounts"),
          fetch("/api/account/extension-conectada"),
        ]);
        const perfil = perfilRes.ok ? await perfilRes.json() : null;
        const objetivo = objetivoRes.ok ? await objetivoRes.json() : null;
        const triaje = triajeRes.ok ? await triajeRes.json() : null;
        const conversacion = conversacionRes.ok ? await conversacionRes.json() : null;
        const portales = portalesRes.ok ? await portalesRes.json() : null;
        const extension = extensionRes.ok ? await extensionRes.json() : null;

        const cvListo = !!perfil?.nombreArchivo;
        const objetivoListo = !!objetivo?.objetivoConfirmado;
        // No hay una bandera explícita de "triaje completado" -- se considera
        // hecho con ~15 decisiones (holgado respecto a las ~20 que se ofrecen
        // por ronda) para no exigir que respondiera absolutamente todas.
        const triajeListo = (triaje?.totalDecisiones ?? 0) >= 15;
        const conversacionLista = !!conversacion?.confirmado;
        const extensionLista = !!extension?.extensionConectada;
        const portalConectado = (portales?.cuentas || []).some((c: any) => c.activa);

        let calculado = 0;
        if (!cvListo) calculado = 0;
        else if (!objetivoListo) calculado = 2;
        else if (!triajeListo) calculado = 3;
        else if (!conversacionLista) calculado = 4;
        // §3.3 (docs/celular-y-escritorio.md): en un aparato que no puede
        // instalarla, "falta la extensión" no se resuelve ahí -- mandarlo al
        // paso 5 lo dejaba en un bucle (entra, ve el muro, vuelve a entrar).
        // Se sigue a Portales y a Listo; la extensión queda como pendiente
        // visible en el panel, no como tope del onboarding.
        else if (!extensionLista && !sinSoporteExtension()) calculado = 5;
        else if (!portalConectado) calculado = 6;
        else calculado = 7;

        let guardado = -1;
        try {
          guardado = Number(localStorage.getItem(LLAVE_PASO_GUARDADO) ?? -1);
        } catch {
          // ver comentario en guardarPaso()
        }

        const inicio = Number.isFinite(guardado) && guardado > calculado ? guardado : calculado;
        guardarPaso(inicio);
        setPasoState(inicio);
      } catch (e) {
        console.error("No se pudo determinar en qué paso del onboarding retomar:", e);
        setPasoState(0);
      }
    }
    determinarInicio();
  }, []);

  async function terminar(destino = "/dashboard") {
    try {
      await fetch("/api/account/completar-onboarding", { method: "POST" });
    } catch (e) {
      console.error("No se pudo marcar el onboarding como completado:", e);
    }
    try {
      localStorage.removeItem(LLAVE_PASO_GUARDADO);
    } catch {
      // ver comentario en guardarPaso()
    }
    router.push(destino);
  }

  // El onboarding siempre se ve en claro — es lo primero que ve una persona
  // recién registrada y no tiene relación con la preferencia oscuro/claro
  // que se elige más adelante en el dashboard (esa sigue viviendo solo ahí).
  if (paso === null) {
    return (
      <div className="ap-shell ap-onb-shell" data-theme="light" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 620 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
            <Marca tam={32} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>AutoPostula</span>
          </div>
          <div className="ap-onb-rail" aria-hidden="true">
            {PASOS.map((p) => <div key={p.titulo} className="ap-onb-tramo" />)}
          </div>
          <div className="ap-card ap-onb-card" style={{ padding: 32, display: "grid", gap: 14, justifyItems: "center" }}>
            <Skel ancho={46} alto={46} radio={13} variante="block" />
            <Skel ancho={220} variante="title" />
            <Skel ancho={300} />
            <Skel ancho={260} />
          </div>
          <p className="ap-sr">Buscando en qué paso quedaste</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-shell ap-onb-shell" data-theme="light" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 620 }}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
          <Marca tam={32} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>AutoPostula</span>
        </div>

        {/* Rail de progreso: un tramo por paso, el actual se ensancha */}
        <div className="ap-onb-rail" aria-hidden="true">
          {PASOS.map((p, i) => (
            <div
              key={p.titulo}
              className="ap-onb-tramo"
              data-estado={i < paso ? "hecho" : i === paso ? "actual" : undefined}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            gap: 12, marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{PASOS[paso].titulo}</span>
          <span className="ap-tnum" style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>
            Paso {paso + 1} de {PASOS.length}
          </span>
        </div>

        <div
          className="ap-card ap-onb-card ap-animate-in"
          key={paso}
          style={{ padding: 32, ["--ap-onb-avance" as string]: `${((paso + 1) / PASOS.length) * 100}%` }}
        >
          {paso === 0 && <PasoBienvenida onSiguiente={() => irAPaso(1)} onOmitir={() => irAPaso(1)} />}
          {paso === 1 && <PasoCV onSiguiente={() => irAPaso(2)} onOmitir={() => irAPaso(2)} />}
          {paso === 2 && <PasoObjetivo onSiguiente={() => irAPaso(3)} onOmitir={() => irAPaso(3)} />}
          {paso === 3 && <PasoTriaje onSiguiente={() => irAPaso(4)} onOmitir={() => irAPaso(4)} />}
          {paso === 4 && <PasoConversacion onSiguiente={() => irAPaso(5)} onOmitir={() => irAPaso(5)} />}
          {paso === 5 && <PasoExtension onSiguiente={() => irAPaso(6)} onOmitir={() => irAPaso(6)} />}
          {paso === 6 && <PasoPortal onSiguiente={() => irAPaso(7)} onOmitir={() => irAPaso(7)} />}
          {paso === 7 && <PasoListo onTerminar={terminar} />}
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

// La pregunta va acá y no en un paso propio: el paso de bienvenida era solo un
// botón "Empecemos", así que la pregunta le da algo que hacer sin alargar el
// onboarding a nueve pasos. Y al ser lo primero, se responde antes de que nadie
// abandone a mitad de camino.
const CANALES = [
  { id: "instagram", etiqueta: "Instagram" },
  { id: "tiktok", etiqueta: "TikTok" },
  { id: "facebook", etiqueta: "Facebook" },
  { id: "buscador", etiqueta: "Buscando en Google" },
  { id: "youtube", etiqueta: "YouTube" },
  { id: "recomendacion", etiqueta: "Me lo recomendaron" },
  { id: "chrome_store", etiqueta: "La tienda de Chrome" },
  { id: "otro", etiqueta: "Otro" },
];

function PasoBienvenida({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [canal, setCanal] = useState<string | null>(null);
  const [otro, setOtro] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function continuar() {
    // Sin respuesta se sigue igual: es un dato para nosotros, no un peaje.
    if (!canal) { onSiguiente(); return; }
    setGuardando(true);
    try {
      await fetch("/api/account/como-nos-conocio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, otro: canal === "otro" ? otro : undefined }),
      });
    } catch {
      // Que esto falle no puede dejar a nadie atascado en la bienvenida.
    } finally {
      setGuardando(false);
      onSiguiente();
    }
  }

  return (
    <>
      <Header
        Icon={Sparkles}
        titulo="¡Bienvenido a AutoPostula!"
        sub="En unos minutos dejamos todo listo para que la IA empiece a postular por ti con tu información real."
      />

      <div className="ap-section" style={{ marginBottom: 18 }}>
        <p className="ap-section-title">Antes de empezar, ¿cómo llegaste acá?</p>
        <p className="ap-section-sub">
          Nos sirve para saber dónde nos encuentra la gente. Si prefieres no decirlo, puedes seguir igual.
        </p>
        <div className="ap-canales">
          {CANALES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCanal(canal === c.id ? null : c.id)}
              className={"ap-option-card" + (canal === c.id ? " ap-option-card-active" : "")}
              aria-pressed={canal === c.id}
            >
              <span className="ap-option-title">{c.etiqueta}</span>
            </button>
          ))}
        </div>
        {canal === "otro" && (
          <input
            className="ap-input"
            style={{ marginTop: 12 }}
            value={otro}
            onChange={(e) => setOtro(e.target.value)}
            placeholder="¿Dónde lo viste?"
            maxLength={120}
            autoFocus
          />
        )}
      </div>

      <Footer
        onSiguiente={continuar}
        onOmitir={onOmitir}
        siguienteTexto={guardando ? "Un momento…" : "Empecemos"}
      />
    </>
  );
}

type CampoLeido = "nombre" | "telefono" | "comuna" | "expectativaRenta";
const CAMPOS_LEIDOS: { key: CampoLeido; label: string; placeholder: string; ayuda?: string }[] = [
  { key: "nombre", label: "Nombre completo", placeholder: "Ej: Camila Soto Pérez" },
  { key: "telefono", label: "Teléfono", placeholder: "+56 9 1234 5678" },
  { key: "comuna", label: "Comuna donde vives", placeholder: "Ej: Maipú" },
  {
    key: "expectativaRenta",
    label: "Pretensión de renta",
    placeholder: "Ej: $650.000 líquidos",
    ayuda: "Muchos formularios la preguntan. Si la dejas vacía, la IA no inventa una y puede que el envío quede a medias.",
  },
];

function PasoCV({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [subidoOk, setSubidoOk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ley 21.719, art. 16 (lib/consentimiento.ts): autorización expresa para los
  // datos sensibles del CV antes de subirlo.
  const [autoriza, setAutoriza] = useState(false);
  const [marcaAutoriza, setMarcaAutoriza] = useState(false);
  // §4.2 (docs/revision-2026-09-16.md): "La IA completó tu perfil" sin mostrar
  // qué leyó dejó a una cuenta con el nombre "Roberto Hidalgo Andrés Bizama" y
  // sin cómo verlo. Acá se muestran los datos que más se usan al responder y se
  // pueden corregir -- incluida la pretensión de renta, una de las preguntas
  // más comunes de los formularios, que el CV casi nunca trae.
  const [datosLeidos, setDatosLeidos] = useState<Record<CampoLeido, string> | null>(null);
  const [datosEditados, setDatosEditados] = useState(false);

  function mostrarDatos(perfil: Record<string, unknown> | null | undefined) {
    const texto = (v: unknown) => (typeof v === "string" ? v : "");
    setDatosLeidos({
      nombre: texto(perfil?.nombre),
      telefono: texto(perfil?.telefono),
      comuna: texto(perfil?.comuna),
      expectativaRenta: texto(perfil?.expectativaRenta),
    });
    setDatosEditados(false);
  }

  // Solo se manda lo que la persona tocó, y nunca un campo vacío que borre lo
  // que la IA había leído.
  async function guardarDatosLeidos() {
    if (!datosLeidos || !datosEditados) return;
    const cambios: Record<string, string> = {};
    for (const campo of CAMPOS_LEIDOS) {
      if (datosLeidos[campo.key].trim()) cambios[campo.key] = datosLeidos[campo.key].trim();
    }
    try {
      await fetch("/api/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
    } catch (e) {
      console.error("No se pudieron guardar las correcciones del perfil:", e);
    }
  }

  useEffect(() => {
    async function revisarCvExistente() {
      try {
        const res = await fetch("/api/perfil");
        if (res.ok) {
          const data = await parsearRespuesta(res);
          setAutoriza(!!data?.autorizaDatosSensibles);
          if (data?.nombreArchivo) {
            setNombreArchivo(data.nombreArchivo);
            mostrarDatos(data);
          }
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
    if (!autoriza && !marcaAutoriza) {
      setMensaje("Marca la autorización de abajo para poder subir tu CV.");
      setSubidoOk(false);
      return;
    }
    setSubiendo(true);
    setMensaje("");
    setSubidoOk(false);
    try {
      const formData = new FormData();
      formData.append("cv", file);
      if (!autoriza && marcaAutoriza) formData.append("autorizaDatosSensibles", "true");
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await parsearRespuesta(res);
      if (!res.ok) { setMensaje(data.error || "No se pudo procesar el CV"); return; }
      setAutoriza(true);
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
          setMensaje("Tu CV se subió y la IA completó tu perfil. Revisa abajo lo que leyó.");
          mostrarDatos(dataAI.datos);
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
        onClick={() => {
          if (!autoriza && !marcaAutoriza) {
            setMensaje("Marca la autorización de abajo para poder subir tu CV.");
            setSubidoOk(false);
            return;
          }
          fileInputRef.current?.click();
        }}
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
      {!cargandoEstado && (
        <div style={{ marginTop: 12 }}>
          <AutorizacionCv
            autoriza={autoriza}
            hayCv={!!nombreArchivo}
            marcada={marcaAutoriza}
            onMarcar={(v) => { setMarcaAutoriza(v); if (v) setMensaje(""); }}
            onCambio={(ahora, cvBorrado) => {
              setAutoriza(ahora);
              setMarcaAutoriza(false);
              if (cvBorrado) {
                setNombreArchivo(null);
                setDatosLeidos(null);
                setSubidoOk(false);
                setMensaje("Borramos tu CV. Puedes volver a subirlo cuando quieras.");
              }
            }}
          />
        </div>
      )}
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
      {datosLeidos && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Esto es lo que leímos de tu CV</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            Corrige lo que esté mal: son los datos con los que se responden los formularios.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CAMPOS_LEIDOS.map((campo) => (
              <div key={campo.key}>
                <label className="ap-label" style={{ display: "block", marginBottom: 4 }}>{campo.label}</label>
                <input
                  className="ap-input"
                  value={datosLeidos[campo.key]}
                  placeholder={campo.placeholder}
                  onChange={(e) => {
                    setDatosLeidos({ ...datosLeidos, [campo.key]: valorFormateado(campo.key, e.target) });
                    setDatosEditados(true);
                  }}
                />
                {campo.ayuda && (
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>{campo.ayuda}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <Footer
        onSiguiente={async () => { await guardarDatosLeidos(); onSiguiente(); }}
        onOmitir={onOmitir}
      />
    </>
  );
}

// docs/objetivo-laboral.md §4: el CV describe de dónde viene la persona, no
// a dónde va -- para quien se está cambiando de rubro (el caso que motiva
// todo este paso) el CV es la peor fuente posible. Este paso confirma o
// corrige eso ANTES de que el triaje (paso siguiente) lo use para elegir
// qué títulos mostrar.
type ObjetivoForm = { ciuo: string | null; etiqueta: string; peso: number };
type ResultadoCatalogo = { ciuo: string; etiqueta: string; grupo: string | null };

function PasoObjetivo({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [cargando, setCargando] = useState(true);
  const [sugerenciaCv, setSugerenciaCv] = useState<string | null>(null);
  const [objetivos, setObjetivos] = useState<ObjetivoForm[]>([]);
  const [modo, setModo] = useState<"sugerencia" | "editar">("editar");
  const [indiceEditando, setIndiceEditando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ResultadoCatalogo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // §2.1 (docs/revision-2026-09-16.md): la ubicación se declara acá, en el
  // mismo paso -- nunca se infería del CV, y cuando se hacía con IA (más
  // abajo, antes de este cambio) salía mal: agregaba la comuna del trabajo
  // ANTERIOR de la persona (la que quería evitar) y omitía las que sí pidió.
  const [ubicacion, setUbicacion] = useState<UbicacionValor>(ubicacionVacia());

  useEffect(() => {
    async function cargar() {
      try {
        const [res, resPrefs] = await Promise.all([
          fetch("/api/objetivos"),
          fetch("/api/preferencias-busqueda"),
        ]);
        const data = await parsearRespuesta(res);
        setSugerenciaCv(data.sugerenciaCv ?? null);
        if (Array.isArray(data.objetivos) && data.objetivos.length) {
          // Ya había algo confirmado (retomando el onboarding, o volviendo a
          // este paso) -- se edita directo, no se vuelve a mostrar la
          // sugerencia del CV como si fuera nueva.
          setObjetivos(data.objetivos.map((o: any) => ({ ciuo: o.ciuo ?? null, etiqueta: o.etiqueta, peso: o.peso })));
          setModo("editar");
        } else if (data.sugerenciaCv) {
          setObjetivos([{ ciuo: null, etiqueta: data.sugerenciaCv, peso: 1 }]);
          setModo("sugerencia");
        } else {
          setObjetivos([{ ciuo: null, etiqueta: "", peso: 1 }]);
          setModo("editar");
        }
        try {
          const prefs = await parsearRespuesta(resPrefs);
          if (prefs?.ubicacionDeclarada) setUbicacion({ ...ubicacionVacia(), ...prefs.ubicacionDeclarada });
        } catch {
          // Sin preferencias todavía -- se queda con ubicacionVacia().
        }
      } catch (e) {
        console.error("Error cargando objetivo:", e);
        setObjetivos([{ ciuo: null, etiqueta: "", peso: 1 }]);
        setModo("editar");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  // Autocompletado contra el catálogo, con debounce simple -- ver
  // /api/catalogo/buscar. indiceEditando marca CUÁL de los campos de
  // objetivo está recibiendo la búsqueda.
  useEffect(() => {
    if (indiceEditando === null || busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/catalogo/buscar?q=" + encodeURIComponent(busqueda.trim()));
        const data = await parsearRespuesta(res);
        setResultados(data.resultados ?? []);
      } catch (e) {
        console.error("Error buscando en el catálogo:", e);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, indiceEditando]);

  function elegirResultado(r: ResultadoCatalogo) {
    if (indiceEditando === null) return;
    const copia = [...objetivos];
    copia[indiceEditando] = { ...copia[indiceEditando], ciuo: r.ciuo, etiqueta: r.etiqueta };
    setObjetivos(copia);
    setIndiceEditando(null);
    setBusqueda("");
    setResultados([]);
  }

  async function guardar() {
    const limpios = objetivos.map((o) => ({ ...o, etiqueta: o.etiqueta.trim() })).filter((o) => o.etiqueta);
    if (!limpios.length) {
      setError("Escribe o elige al menos un objetivo.");
      return;
    }
    if (!ubicacion.regiones.length) {
      setError("Elige al menos una región donde quieres trabajar.");
      return;
    }
    if (!ubicacion.todaLaRegion && !ubicacion.comunas.length && !ubicacion.aceptaRemoto) {
      setError("Elige comunas específicas, marca \"toda la región\", o acepta remoto.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/objetivos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivos: limpios, ubicacionDeclarada: ubicacion }),
      });
      const data = await parsearRespuesta(res);
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar");
        return;
      }
      onSiguiente();
    } catch (e) {
      console.error("Error guardando objetivo:", e);
      setError("No se pudo guardar — revisa la consola");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <Header Icon={Search} titulo="¿Qué buscas?" sub="Cargando..." />;
  }

  return (
    <>
      <Header
        Icon={Search}
        titulo="¿Qué buscas?"
        sub="Tu CV describe de dónde vienes. Esto es a dónde vas — puede ser distinto, sobre todo si te estás cambiando de rubro."
      />

      <div style={{ marginBottom: 20, paddingBottom: 18, borderBottom: "1px solid var(--border)" }}>
        <label className="ap-label" style={{ marginBottom: 6, display: "block" }}>¿Dónde quieres trabajar?</label>
        <UbicacionPicker valor={ubicacion} onChange={setUbicacion} />
      </div>

      {error && <p style={{ fontSize: 12.5, color: "var(--status-rechazado)", marginBottom: 12 }}>{error}</p>}

      {modo === "sugerencia" && sugerenciaCv ? (
        <div>
          <p style={{ fontSize: 14, marginBottom: 16, textAlign: "center" }}>
            Por tu CV, parece que buscas <strong>{sugerenciaCv}</strong>
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="ap-button-ghost" style={{ flex: 1 }} onClick={() => setModo("editar")}>
              Busco otra cosa
            </button>
            <button className="ap-button" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
              {guardando ? "Armando tu búsqueda…" : "Sí, es eso"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {objetivos.map((o, i) => (
            <div key={i} style={{ marginBottom: 14, position: "relative" }}>
              <label className="ap-label">{i === 0 ? "Objetivo principal" : "También me interesa"}</label>
              <div style={{ position: "relative" }}>
                <input
                  className="ap-input"
                  value={o.etiqueta}
                  placeholder="Ej: vendedor, desarrollador de software..."
                  onChange={(e) => {
                    const copia = [...objetivos];
                    copia[i] = { ...copia[i], etiqueta: e.target.value, ciuo: null };
                    setObjetivos(copia);
                    setIndiceEditando(i);
                    setBusqueda(e.target.value);
                  }}
                  onFocus={() => { setIndiceEditando(i); setBusqueda(o.etiqueta); }}
                />
                {o.ciuo && (
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--status-finalizado)" }}>
                    ✓ del catálogo
                  </span>
                )}
              </div>
              {indiceEditando === i && resultados.length > 0 && (
                <div className="ap-card" style={{ marginTop: 4, maxHeight: 180, overflowY: "auto", padding: 6, position: "absolute", zIndex: 10, width: "100%" }}>
                  {resultados.map((r) => (
                    <button
                      key={r.ciuo}
                      type="button"
                      onClick={() => elegirResultado(r)}
                      className="ap-button-ghost"
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 13, border: "none" }}
                    >
                      {r.etiqueta}
                      {r.grupo && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> — {r.grupo}</span>}
                    </button>
                  ))}
                </div>
              )}
              {objetivos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setObjetivos(objetivos.filter((_, j) => j !== i))}
                  className="ap-button-ghost"
                  style={{ fontSize: 11.5, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <X size={12} /> Quitar
                </button>
              )}
            </div>
          ))}

          {objetivos.length < 2 && (
            <button
              type="button"
              className="ap-button-ghost"
              style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}
              onClick={() => setObjetivos([...objetivos, { ciuo: null, etiqueta: "", peso: 0.5 }])}
            >
              <Plus size={14} /> También me interesa...
            </button>
          )}

          <Footer onSiguiente={guardar} onOmitir={onOmitir} siguienteTexto={guardando ? "Armando tu búsqueda…" : "Continuar"} deshabilitado={guardando} />
          {/* §4.2: guardar arma tu búsqueda con IA y tarda ~10 s; sin aviso parecía colgado. */}
          {guardando && (
            <p role="status" style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right", marginTop: 8 }}>
              Estamos armando tu búsqueda con lo que elegiste. Toma unos 10 segundos, no cierres esta página.
            </p>
          )}
        </>
      )}
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
  const [error, setError] = useState<string | null>(null);
  // La IA misma avisa cuando ya tiene suficiente info (en vez de esperar a
  // que se cumpla el mínimo de mensajes) y esto también se activa cuando se
  // llega al tope duro de la fase 1 — en ambos casos hay que dejar de
  // escribir y empujar hacia finalizar.
  const [sugerenciaFinalizar, setSugerenciaFinalizar] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
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
    setError(null);
    if (texto) setConversacion((prev) => [...prev, { role: "user", content: texto }]);
    try {
      const res = await fetch("/api/style/onboarding/mensaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto }),
      });
      const data = await parsearRespuesta(res);
      if (res.ok) {
        setConversacion((prev) => [...prev, { role: "assistant", content: quitarMarkdown(data.pregunta) }]);
        if (data.sugerenciaFinalizar) setSugerenciaFinalizar(true);
      } else {
        setError(data.error ?? "No se pudo enviar el mensaje.");
        if (res.status === 403) setBloqueada(true);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function finalizar() {
    setFinalizando(true);
    setError(null);
    try {
      const res = await fetch("/api/style/onboarding/finalizar", { method: "POST" });
      const data = await parsearRespuesta(res);
      if (res.ok) {
        setFinalizado(true);
      } else {
        setError(data.error ?? "No se pudo generar el perfil.");
      }
    } finally {
      setFinalizando(false);
    }
  }

  const mensajesUsuario = conversacion.filter((m) => m.role === "user").length;
  const puedeFinalizar = sugerenciaFinalizar || mensajesUsuario >= MINIMO_MENSAJES_PARA_FINALIZAR;

  // Dictado por voz, igual que en la conversación de Entrenar IA
  // (app/dashboard/perfil/conversacion/page.tsx): el texto aparece en el campo
  // mientras la persona habla, y lo revisa antes de enviarlo. Lee el campo por
  // ref y no por closure: si leyera la variable del render, al apretar el
  // micrófono tomaría un valor viejo.
  const inputRef = useRef("");
  useEffect(() => { inputRef.current = input; }, [input]);
  const dictado = usarDictado(
    setInput,
    useCallback(() => inputRef.current, []),
    useCallback((m: string) => setError(m), [])
  );

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
      {!finalizado && !bloqueada && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) { dictado.detener(); const t = input.trim(); setInput(""); enviar(t); }
          }}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            className="ap-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={dictado.soportado ? "Escribe o dicta tu respuesta..." : "Escribe tu respuesta..."}
            disabled={enviando}
            style={{ flex: 1 }}
          />
          {dictado.soportado && (
            <button
              type="button"
              className={"ap-redactor__mic" + (dictado.escuchando ? " ap-redactor__mic--activo" : "")}
              onClick={dictado.alternar}
              disabled={enviando}
              aria-label={dictado.escuchando ? "Detener el dictado" : "Dictar por voz"}
              aria-pressed={dictado.escuchando}
              title={dictado.escuchando ? "Detener el dictado" : "Dictar por voz"}
            >
              {dictado.escuchando ? <Square size={14} /> : <Mic size={16} />}
            </button>
          )}
          <button className="ap-button" type="submit" disabled={enviando || !input.trim()}>Enviar</button>
        </form>
      )}
      {dictado.escuchando && (
        <p className="ap-dictando">
          <span className="ap-dictando__punto" />
          Escuchando… habla y revisa el texto antes de enviarlo.
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12, color: "var(--err)", marginTop: 8 }}>{error}</p>
      )}

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

// §3.2 (docs/celular-y-escritorio.md): en un teléfono el paso de la extensión
// no se salta ni se esconde -- cambia de contenido. Dice qué se puede hacer ya,
// qué se desbloquea con un computador, y no bloquea el avance.
function PasoExtensionEnMovil({ onSiguiente }: { onSiguiente: () => void }) {
  const [copiado, setCopiado] = useState(false);

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText("https://autopostula.cl");
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin portapapeles el enlace igual es corto: se muestra escrito abajo.
    }
  }

  return (
    <>
      <Header
        Icon={Puzzle}
        titulo="Para postular por ti necesitas un computador"
        sub="Las extensiones de navegador no funcionan en teléfonos. Desde el celular decides; en el computador se postula."
      />
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Mientras tanto ya puedes:</p>
      <ul style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, paddingLeft: 18, marginBottom: 16 }}>
        <li>Ver qué ofertas calzan contigo</li>
        <li>Decidir cuáles te interesan</li>
        <li>Revisar tus postulaciones</li>
      </ul>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
        Cuando tengas un computador: abre <b>autopostula.cl</b> con Chrome, entra con la misma cuenta e instala la
        extensión (te lo recordamos en el panel).
      </p>
      <button onClick={copiarEnlace} className="ap-button-ghost" style={{ width: "100%", marginBottom: 10 }}>
        {copiado ? "Enlace copiado ✓" : "Copiar autopostula.cl para abrirlo en el computador"}
      </button>
      <button onClick={onSiguiente} className="ap-button" style={{ width: "100%" }}>
        Continuar en el celular
      </button>
    </>
  );
}

function PasoExtension({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  // Se decide después de montar: el servidor no sabe qué aparato es.
  const [enMovil, setEnMovil] = useState(false);
  useEffect(() => { setEnMovil(sinSoporteExtension()); }, []);
  if (enMovil) return <PasoExtensionEnMovil onSiguiente={onSiguiente} />;
  return <PasoExtensionEscritorio onSiguiente={onSiguiente} onOmitir={onOmitir} />;
}

// Se marca al ir a la tienda de Chrome, para recargar al volver (ver abajo).
const FUE_A_INSTALAR = "ap_onboarding_fue_a_instalar";

function PasoExtensionEscritorio({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  // null = todavía detectando si la extensión está instalada.
  const [extensionDetectada, setExtensionDetectada] = useState<boolean | null>(null);
  const [conectandoExt, setConectandoExt] = useState(false);
  const [extConectada, setExtConectada] = useState(false);
  const [errorConexion, setErrorConexion] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // docs/verificacion-de-correo.md §7: si /api/account/token responde 403
  // con requiereVerificacion, no es un error cualquiera -- se explica acá
  // mismo por qué está bloqueado, con el botón de reenviar a mano.
  const [necesitaVerificacion, setNecesitaVerificacion] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

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

    // bridge.js se inyecta en document_start, o sea antes de que React hidrate:
    // su evento de presencia ya pasó cuando llegamos acá. Por eso lo primero es
    // leer la marca que deja en el DOM, y recién después pedirle que se anuncie.
    if (document.documentElement.dataset.autopostulaExtension) {
      onDetectada();
    } else {
      window.dispatchEvent(new CustomEvent("autopostula:ping"));
    }

    // Si igual no contesta, asumimos que no está instalada.
    const t = setTimeout(() => setExtensionDetectada((v) => (v === null ? false : v)), 700);

    // docs/primera-busqueda-guiada.md §10: volvió de la tienda de Chrome. Las
    // extensiones no se meten en las pestañas que ya estaban abiertas, así que
    // la página se recarga sola para encontrarla (antes había que apretar "Ya
    // la instalé, verificar"). El paso guardado hace que vuelva a este mismo.
    function alVolver() {
      if (document.visibilityState !== "visible") return;
      if (document.documentElement.dataset.autopostulaExtension) return;
      try {
        if (sessionStorage.getItem(FUE_A_INSTALAR) === null) return;
        sessionStorage.removeItem(FUE_A_INSTALAR);
      } catch {
        return;
      }
      window.location.reload();
    }
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener("autopostula:extension-presente", onDetectada);
      window.removeEventListener("autopostula:conectado", onConectado);
      window.removeEventListener("autopostula:error-conexion", onError);
      document.removeEventListener("visibilitychange", alVolver);
      clearTimeout(t);
    };
  }, []);

  async function generarToken(): Promise<string | null> {
    const res = await fetch("/api/account/token", { method: "POST" });
    const data = await parsearRespuesta(res);
    if (data.requiereVerificacion) {
      setNecesitaVerificacion(true);
      return null;
    }
    setToken(data.apiToken ?? null);
    return data.apiToken ?? null;
  }

  async function conectarExtension() {
    setConectandoExt(true);
    setErrorConexion(null);
    const t = token ?? (await generarToken());
    if (!t) {
      setConectandoExt(false);
      if (!necesitaVerificacion) setErrorConexion("No se pudo generar el token.");
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

  async function reenviarVerificacion() {
    setReenviando(true);
    setAvisoReenvio(null);
    try {
      const res = await fetch("/api/auth/reenviar-verificacion", { method: "POST" });
      const data = await parsearRespuesta(res);
      setAvisoReenvio(res.ok ? "Te enviamos un nuevo enlace — revisa tu correo." : (data.error ?? "No se pudo reenviar el correo."));
    } catch {
      setAvisoReenvio("No pudimos conectar con el servidor.");
    } finally {
      setReenviando(false);
    }
  }

  return (
    <>
      <Header
        Icon={Puzzle}
        titulo="Instala la extensión"
        sub="Es la que hace las postulaciones por ti en Computrabajo, Laborum y Trabajando.com — sin ella no hay nada que conectar."
      />

      {extConectada ? (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: "var(--status-finalizado)", fontWeight: 500 }}>
            Extensión conectada ✓
          </p>
        </div>
      ) : necesitaVerificacion ? (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p className="ap-section-title">Confirma tu correo primero</p>
          <p className="ap-section-sub">
            No dejamos que una identidad sin verificar postule a trabajos en tu nombre. Te
            mandamos un enlace al registrarte — revisa tu bandeja (y spam), o pide uno nuevo.
          </p>
          <button className="ap-button-ghost" onClick={reenviarVerificacion} disabled={reenviando}>
            {reenviando ? "Enviando..." : "Reenviar correo de verificación"}
          </button>
          {avisoReenvio && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{avisoReenvio}</p>}
        </div>
      ) : extensionDetectada ? (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p className="ap-section-title">Extensión detectada</p>
          <p className="ap-section-sub">Conéctala con un clic para continuar.</p>
          <button className="ap-button" onClick={conectarExtension} disabled={conectandoExt}>
            {conectandoExt ? "Conectando..." : "Conectar extensión"}
          </button>
          {errorConexion && <p style={{ fontSize: 12, color: "var(--err)", marginTop: 8 }}>{errorConexion}</p>}
        </div>
      ) : (
        <div className="ap-section" style={{ marginBottom: 20 }}>
          <p className="ap-section-title">Todavía no la detectamos</p>
          <p className="ap-section-sub">
            Instálala desde Chrome Web Store y vuelve a esta página. Si prefieres dejarlo
            para después, omite este paso y conéctala cuando quieras desde Portales —
            hasta entonces no podremos postular por ti.
          </p>
          <a
            href={URL_CHROME_WEB_STORE}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              try {
                sessionStorage.setItem(FUE_A_INSTALAR, "1");
              } catch {
                // Sin sessionStorage queda el botón "Ya la instalé, verificar".
              }
            }}
            className="ap-button"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              textDecoration: "none", marginBottom: 10,
            }}
          >
            <Download size={15} /> Instalar la extensión
          </a>
          <button className="ap-button-ghost" style={{ display: "block" }} onClick={() => window.location.reload()}>
            Ya la instalé, verificar
          </button>
        </div>
      )}

      {/* Antes este paso era obligatorio: sin la extensión conectada no había
          forma de avanzar. Se dejó saltable como el resto del onboarding —
          quien lo omita puede conectarla después desde Portales, pero hasta
          entonces AutoPostula no puede postular por él. */}
      <Footer
        onSiguiente={onSiguiente}
        onOmitir={onOmitir}
        siguienteTexto="Siguiente"
        deshabilitado={!extConectada}
      />
    </>
  );
}

function PasoTriaje({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [titulos, setTitulos] = useState<ItemSwipe[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/onboarding/triaje");
        const data = await parsearRespuesta(res);
        if (!res.ok) {
          setError(data.error ?? "No se pudo cargar");
          return;
        }
        setTitulos(data.titulos ?? []);
      } catch (e) {
        console.error("Error cargando triaje:", e);
        setError("No se pudo cargar — revisa la consola");
      }
    }
    cargar();
  }, []);

  async function decidir(item: ItemSwipe, veredicto: "SI" | "NO") {
    try {
      await fetch("/api/onboarding/triaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: item.titulo, veredicto }),
      });
    } catch (e) {
      console.error("Error guardando decisión de triaje:", e);
    }
  }

  return (
    <>
      <Header
        Icon={Target}
        titulo="¿Qué ofertas te interesan?"
        sub="Dinos sí o no a estos cargos — nos ayuda a entender qué buscas de verdad, no solo el nombre exacto de tu puesto."
      />
      {error && <p style={{ fontSize: 12.5, color: "var(--status-rechazado)", marginBottom: 12 }}>{error}</p>}
      {!titulos ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Cargando...</p>
      ) : titulos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 20 }}>
            No encontramos cargos parecidos al que buscas para preguntarte — no pasa nada, puedes seguir.
          </p>
          <button className="ap-button" onClick={onSiguiente}>
            Continuar
          </button>
        </div>
      ) : (
        <SwipeTriaje items={titulos} onDecidir={decidir} onTerminar={onSiguiente} />
      )}
      {titulos && titulos.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={onOmitir} className="ap-button-ghost" style={{ fontSize: 12.5 }}>
            Omitir por ahora
          </button>
        </div>
      )}
    </>
  );
}

function PasoPortal({ onSiguiente, onOmitir }: { onSiguiente: () => void; onOmitir: () => void }) {
  const [plataformas, setPlataformas] = useState<{ id: string; nombre: string }[]>([]);
  // Antes era un solo boolean compartido por las tres plataformas -- al
  // conectar una, la UI mostraba "Conectado ✓" en TODAS (la fila de la BD sí
  // quedaba bien, era puramente un bug de esta pantalla). Un Set por
  // platformId hace que cada fila refleje su propio estado.
  const [conectadas, setConectadas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // §4.2: se dice el límite del plan ANTES de que la persona choque con él.
  // null = sin límite (o todavía no se sabe).
  const [maxPortales, setMaxPortales] = useState<number | null>(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/platform-accounts");
        const data = await parsearRespuesta(res);
        setMaxPortales(data.maxPlataformasActivas ?? null);
        setPlataformas(data.plataformas ?? []);
        setConectadas(new Set((data.cuentas ?? []).filter((c: any) => c.activa).map((c: any) => c.platformId)));
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function quitar(platformId: string): Promise<boolean> {
    setError("");
    try {
      const res = await fetch("/api/platform-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Si no se pudo, sigue conectado: no se muestra como quitado.
      setError("No se pudo quitar ese portal. Revisa tu conexión e inténtalo de nuevo.");
      return false;
    }
    setConectadas((prev) => {
      const nuevo = new Set(prev);
      nuevo.delete(platformId);
      return nuevo;
    });
    return true;
  }

  async function conectar(platformId: string) {
    setError("");
    // docs/revision-2026-09-28.md: en el plan gratis (un portal a la vez), si
    // ya había uno conectado el error pedía "desconecta el que ya tienes" sin
    // ningún botón para hacerlo acá. Ahora elegir otro lo cambia.
    if (maxPortales === 1) {
      for (const id of conectadas) if (id !== platformId && !(await quitar(id))) return;
    }
    const res = await fetch("/api/platform-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId }),
    });
    const data = await parsearRespuesta(res);
    if (res.ok) {
      setConectadas((prev) => new Set(prev).add(platformId));
    } else {
      setError(data.error ?? "No se pudo conectar el portal");
    }
  }

  const unoYaConectado = maxPortales === 1 && conectadas.size > 0;

  return (
    <>
      <Header
        Icon={Globe}
        titulo="Conecta un portal"
        sub={
          maxPortales === 1
            ? "Elige dónde quieres que la extensión postule por ti. Tu plan gratuito conecta un portal a la vez; con Premium puedes tener los tres."
            : "Elige dónde quieres que la extensión postule por ti."
        }
      />
      {cargando ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Cargando...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {plataformas.map((p) => (
            <div key={p.id} className="ap-toggle-row">
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.nombre}</span>
              {conectadas.has(p.id) ? (
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--status-finalizado)" }}>Conectado ✓</span>
                  <button className="ap-button-ghost" onClick={() => quitar(p.id)} aria-label={`Quitar ${p.nombre}`}>
                    Quitar
                  </button>
                </span>
              ) : (
                <button className="ap-button-ghost" onClick={() => conectar(p.id)}>
                  {unoYaConectado ? "Cambiar a este" : "Conectar"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize: 12.5, color: "var(--status-rechazado)", marginBottom: 12 }}>{error}</p>}

      <Footer onSiguiente={onSiguiente} onOmitir={onOmitir} />
    </>
  );
}

// docs/primera-busqueda-guiada.md §10: el cierre ya no abre el portal desde acá.
// Lo abría con una búsqueda sin comuna ni jornada (todo Chile: lo primero que
// se veía eran descartes por "es en otra comuna"), solo si todo había quedado
// listo, y sin forma de saber después qué pasó. Ahora lleva a Hoy, donde la
// tarjeta "Probemos" sigue paso a paso: instalar y conectar la extensión si
// falta, abrir el portal con la búsqueda armada igual que la arma la extensión,
// ver qué haría con cada oferta y recién ahí activar.
//
// §4.2 (docs/revision-2026-09-16.md): "¡Todo listo!" sin la acción que da
// valor. Por eso el botón dice lo que la persona va a hacer, no "Ir al panel".
//
// docs/panel-de-revision-en-el-portal.md §1: si la extensión acaba de quedar
// conectada, el mejor momento para probarla es este. "Probémosla ahora" abre el
// portal que conectó con su búsqueda, en otra pestaña, y este cierre sigue a
// Hoy como siempre. Solo se ofrece si la extensión respondió en esta página y
// hay portal y búsqueda: prometer "probémosla" y caer en un portal donde no
// pasa nada es peor que no ofrecerlo. Está acá y no en el paso de la
// extensión porque el portal se conecta en el paso siguiente.
function PasoListo({ onTerminar }: { onTerminar: (destino?: string) => void }) {
  const [enMovil, setEnMovil] = useState(false);
  // docs/revision-2026-09-28.md §11: sin el correo confirmado la extensión no
  // se puede conectar; se dice antes de mandarla a probar.
  const [faltaCorreo, setFaltaCorreo] = useState(false);
  const [quierePremium, setQuierePremium] = useState(false);
  const [probarAhora, setProbarAhora] = useState<{ portal: string; url: string } | null>(null);
  useEffect(() => {
    const movil = sinSoporteExtension();
    setEnMovil(movil);
    try {
      setQuierePremium(localStorage.getItem(LLAVE_INTENCION_PREMIUM) === "1");
    } catch {
      // Sin localStorage no se ofrece el atajo al pago; Premium sigue en el panel.
    }
    const leer = (ruta: string) => fetch(ruta).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    Promise.all([leer("/api/account/extension-conectada"), leer("/api/onboarding/primera-busqueda")]).then(([extension, busqueda]) => {
      // Si no se puede saber, se muestra el cierre de siempre.
      if (extension && extension.emailVerificado === false) setFaltaCorreo(true);
      const respondio = !!document.documentElement.dataset.autopostulaExtension;
      if (!movil && respondio && extension?.extensionConectada && extension.emailVerificado !== false && busqueda?.portal && busqueda?.url) {
        setProbarAhora({ portal: busqueda.portal, url: busqueda.url });
      }
    });
  }, []);

  function probarla() {
    if (!probarAhora) return;
    window.open(probarAhora.url, "_blank", "noopener");
    onTerminar();
  }

  function irAPremium() {
    try {
      localStorage.removeItem(LLAVE_INTENCION_PREMIUM);
    } catch {
      // ver arriba
    }
    onTerminar("/dashboard/premium/pago?pase=pase_30");
  }

  return (
    <>
      <Header
        Icon={CheckCircle2}
        titulo="¡Todo listo!"
        sub={
          faltaCorreo
            ? "Tu cuenta quedó configurada. Antes de probarla, confirma tu correo con el enlace que te mandamos: sin eso la extensión no se puede conectar."
            : probarAhora
            ? `AutoPostula ya está conectada. Pruébala ahora en ${probarAhora.portal}, con tu búsqueda: marca cada oferta con lo que haría y no envía nada hasta que tú digas.`
            : enMovil
            ? "Tu cuenta quedó configurada. La prueba con ofertas reales se hace en Chrome, en un computador: en tu panel te queda el paso a paso."
            : "Ahora pruébala con ofertas reales, sin enviar nada. En tu panel te esperan los pasos: abrir tu portal con tu búsqueda y ver qué haría con cada oferta."
        }
      />
      {quierePremium && (
        <button onClick={irAPremium} className="ap-button" style={{ width: "100%", marginBottom: 10 }}>
          Activar Premium
        </button>
      )}
      {probarAhora ? (
        <>
          <button
            onClick={probarla}
            className={quierePremium ? "ap-button-ghost" : "ap-button"}
            style={{ width: "100%", marginBottom: 10 }}
          >
            Probémosla ahora
          </button>
          <button onClick={() => onTerminar()} className="ap-button-ghost" style={{ width: "100%" }}>
            Seguir y probar después
          </button>
        </>
      ) : (
        <button
          onClick={() => onTerminar()}
          className={quierePremium ? "ap-button-ghost" : "ap-button"}
          style={{ width: "100%" }}
        >
          {enMovil ? "Ir al panel" : "Probarla con ofertas reales"}
        </button>
      )}
    </>
  );
}
