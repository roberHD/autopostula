"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bug, Lightbulb, UserCog, MessageSquare, Paperclip, X, FileText, Send } from "lucide-react";
import { useAvisos } from "@/components/Avisos";

// Mismos topes que valida /api/soporte. Se repiten acá para poder avisar antes
// de subir 4 MB al pedo y que el borde de Vercel corte la petición sin
// explicación.
const MAX_ARCHIVOS = 3;
const MAX_BYTES_ARCHIVO = 3 * 1024 * 1024;
const MAX_BYTES_TOTAL = 4 * 1024 * 1024;
const MAX_MENSAJE = 4000;
const MIN_MENSAJE = 10;

const TIPOS = [
  { id: "error", label: "Algo falla", desc: "Un error o algo que no funciona", Icon: Bug },
  { id: "sugerencia", label: "Sugerencia", desc: "Una idea para mejorar", Icon: Lightbulb },
  { id: "cuenta", label: "Mi cuenta", desc: "Cobros, plan o acceso", Icon: UserCog },
  { id: "otro", label: "Otra cosa", desc: "Cualquier consulta", Icon: MessageSquare },
];

const EXTENSIONES = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf"];

function pesoLegible(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Adjunto = { archivo: File; preview: string | null };

export default function ContactoPage() {
  const router = useRouter();
  const { exito, error: avisarError } = useAvisos();

  const [tipo, setTipo] = useState("error");
  const [mensaje, setMensaje] = useState("");
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Las URL de objeto viven hasta que se las revoca a mano. Sin esto, cada
  // captura que se agrega y se quita deja un blob colgado en memoria.
  useEffect(() => {
    return () => {
      adjuntos.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
    };
  }, [adjuntos]);

  const pesoTotal = adjuntos.reduce((suma, a) => suma + a.archivo.size, 0);
  const sinEspacio = adjuntos.length >= MAX_ARCHIVOS;

  function agregar(nuevos: FileList | null) {
    if (!nuevos?.length) return;
    const aceptados: Adjunto[] = [];
    let total = pesoTotal;

    for (const archivo of Array.from(nuevos)) {
      if (adjuntos.length + aceptados.length >= MAX_ARCHIVOS) {
        avisarError(`Hasta ${MAX_ARCHIVOS} archivos`, "Quita alguno si necesitas cambiarlo.");
        break;
      }
      // Se valida por extensión y no por file.type: el MIME que reporta el
      // navegador viene vacío o distinto según el sistema operativo.
      const nombre = archivo.name.toLowerCase();
      if (!EXTENSIONES.some((ext) => nombre.endsWith(ext))) {
        avisarError(`No podemos adjuntar "${archivo.name}"`, "Solo imágenes (PNG, JPG, WEBP, GIF) o PDF.");
        continue;
      }
      if (archivo.size > MAX_BYTES_ARCHIVO) {
        avisarError(`"${archivo.name}" pesa demasiado`, "El máximo por archivo es 3 MB.");
        continue;
      }
      if (total + archivo.size > MAX_BYTES_TOTAL) {
        avisarError("Te pasaste del peso", "Los adjuntos juntos no pueden superar 4 MB.");
        break;
      }
      total += archivo.size;
      aceptados.push({
        archivo,
        preview: archivo.type.startsWith("image/") ? URL.createObjectURL(archivo) : null,
      });
    }

    if (aceptados.length) setAdjuntos((previos) => [...previos, ...aceptados]);
  }

  function quitar(indice: number) {
    setAdjuntos((previos) => {
      const fuera = previos[indice];
      if (fuera?.preview) URL.revokeObjectURL(fuera.preview);
      return previos.filter((_, i) => i !== indice);
    });
  }

  async function enviar() {
    if (mensaje.trim().length < MIN_MENSAJE) {
      avisarError("Cuéntanos un poco más", `Escribe al menos ${MIN_MENSAJE} caracteres para que podamos ayudarte.`);
      return;
    }
    setEnviando(true);
    try {
      const datos = new FormData();
      datos.append("tipo", tipo);
      datos.append("mensaje", mensaje.trim());
      datos.append("donde", window.location.origin);
      adjuntos.forEach((a) => datos.append("adjuntos", a.archivo));

      const res = await fetch("/api/soporte", { method: "POST", body: datos });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        avisarError("No pudimos enviarlo", data.error ?? `Error ${res.status}`);
        return;
      }

      exito("Mensaje enviado", "Te responderemos al correo de tu cuenta.");
      setMensaje("");
      adjuntos.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      setAdjuntos([]);
    } catch {
      avisarError("No pudimos enviarlo", "Revisa tu conexión y vuelve a intentar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <button
          className="ap-button-ghost"
          onClick={() => router.push("/dashboard/ajustes")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12 }}
        >
          <ArrowLeft size={14} /> Volver a Ajustes
        </button>
        <h1 className="ap-page-title">Contáctanos</h1>
        <p className="ap-page-sub">
          Cuéntanos qué pasó y adjunta una captura si la tienes — con eso lo encontramos mucho más rápido.
        </p>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
        <p className="ap-section-title">¿De qué se trata?</p>
        <div className="ap-option-group">
          {TIPOS.map(({ id, label, desc, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTipo(id)}
              className={"ap-option-card" + (tipo === id ? " ap-option-card-active" : "")}
              aria-pressed={tipo === id}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon size={15} />
                <span className="ap-option-title">{label}</span>
              </span>
              <span className="ap-option-desc">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
        <p className="ap-section-title">Tu mensaje</p>
        <p className="ap-section-sub">
          Si es un error, ayuda mucho saber qué estabas haciendo justo antes de que pasara.
        </p>
        <div className="ap-field" style={{ marginBottom: 0 }}>
          <textarea
            className="ap-textarea"
            rows={7}
            value={mensaje}
            maxLength={MAX_MENSAJE}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Ej: Al postular en Computrabajo se queda cargando y no pasa nada. Me pasó tres veces hoy."
          />
          <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
            {mensaje.length} / {MAX_MENSAJE}
          </p>
        </div>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s" }}>
        <p className="ap-section-title">Capturas o archivos</p>
        <p className="ap-section-sub">
          Hasta {MAX_ARCHIVOS} archivos — imágenes o PDF, 3 MB cada uno y 4 MB en total.
        </p>

        <div
          className="ap-cv"
          data-vacio={adjuntos.length === 0 ? "1" : undefined}
          data-arrastrando={arrastrando ? "1" : undefined}
          onClick={() => !sinEspacio && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!sinEspacio) setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            if (!sinEspacio) agregar(e.dataTransfer.files);
          }}
          style={sinEspacio ? { cursor: "default", opacity: 0.6 } : undefined}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={EXTENSIONES.join(",")}
            style={{ display: "none" }}
            onChange={(e) => { agregar(e.target.files); e.target.value = ""; }}
          />
          <span className="ap-cv__ico"><Paperclip size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <p className="ap-cv__nombre">
              {sinEspacio
                ? `Ya adjuntaste ${MAX_ARCHIVOS} archivos`
                : arrastrando
                ? "Suéltalos acá"
                : "Adjunta una captura o un PDF"}
            </p>
            <p className="ap-cv__sub">
              {adjuntos.length > 0
                ? `${adjuntos.length} de ${MAX_ARCHIVOS} · ${pesoLegible(pesoTotal)} de 4 MB`
                : "Arrástralos acá o haz clic para elegirlos"}
            </p>
          </div>
          {!sinEspacio && <span className="ap-cv__accion">Elegir</span>}
        </div>

        {adjuntos.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {adjuntos.map((a, i) => (
              <div
                key={`${a.archivo.name}-${i}`}
                style={{
                  position: "relative",
                  width: 108,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  background: "var(--bg-elevated-2)",
                }}
              >
                <div style={{ height: 72, display: "grid", placeItems: "center", overflow: "hidden" }}>
                  {a.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.preview}
                      alt={a.archivo.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <FileText size={22} color="var(--text-muted)" />
                  )}
                </div>
                <div style={{ padding: "6px 8px" }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.archivo.name}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text-muted)" }}>{pesoLegible(a.archivo.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  aria-label={`Quitar ${a.archivo.name}`}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    cursor: "pointer",
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button
            className="ap-button"
            onClick={enviar}
            disabled={enviando || mensaje.trim().length < MIN_MENSAJE}
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <Send size={14} />
            {enviando ? "Enviando…" : "Enviar mensaje"}
          </button>
          <button className="ap-button-ghost" onClick={() => router.push("/dashboard/ajustes")} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
