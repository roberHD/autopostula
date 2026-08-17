"use client";

import { useEffect, useRef, useState } from "react";

type Perfil = {
  nombreArchivo?: string | null;
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  comuna?: string | null;
  cargoObjetivo?: string | null;
  expectativaRenta?: string | null;
  disponibilidad?: string | null;
  resumenProfesional?: string | null;
};

const CAMPOS: { key: keyof Perfil; label: string; placeholder: string; textarea?: boolean }[] = [
  { key: "nombre", label: "Nombre completo", placeholder: "Ej: Juan Pérez González" },
  { key: "email", label: "Email", placeholder: "tu@email.com" },
  { key: "telefono", label: "Teléfono", placeholder: "+56 9 1234 5678" },
  { key: "comuna", label: "Comuna de residencia", placeholder: "Ej: Las Condes" },
  { key: "cargoObjetivo", label: "Cargo objetivo", placeholder: "Ej: Vendedor / Retail" },
  { key: "expectativaRenta", label: "Expectativa de renta", placeholder: "Ej: $500.000 - $600.000" },
  { key: "disponibilidad", label: "Disponibilidad horaria", placeholder: "Ej: Part time, tardes y fines de semana" },
  {
    key: "resumenProfesional",
    label: "Resumen profesional",
    placeholder: "Breve descripción de tu experiencia y perfil. Si subes tu CV, esto se completa automáticamente.",
    textarea: true,
  },
];

export default function PerfilCv() {
  const [perfil, setPerfil] = useState<Perfil>({});
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/perfil")
      .then(res => res.json())
      .then(data => setPerfil(data || {}))
      .catch(() => setMensaje("No se pudo cargar tu perfil"))
      .finally(() => setCargando(false));
  }, []);

  async function subirCv(file: File) {
    if (file.type !== "application/pdf") {
      setMensaje("El archivo debe ser un PDF");
      return;
    }
    setSubiendo(true);
    setMensaje(null);
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setMensaje(data.error || "No se pudo procesar el CV"); return; }
      setPerfil(p => ({ ...p, nombreArchivo: data.nombreArchivo }));

      setAnalizando(true);
      // El endpoint real vive en /api/cv/upload/analizar (route.ts está en app/api/cv/upload/analizar/)
      const resAI = await fetch("/api/cv/upload/analizar", { method: "POST" });
      const dataAI = await resAI.json();
      if (resAI.ok && dataAI.disponible && dataAI.datos) {
        setPerfil(p => ({
          ...p,
          ...Object.fromEntries(
            Object.entries(dataAI.datos).filter(([, v]) => typeof v === "string" && (v as string).trim().length > 0)
          ),
        }));
        setMensaje("CV leído — revisa los datos que completó la IA antes de guardar");
      } else {
        setMensaje(dataAI.error || "CV subido. Completa tus datos manualmente.");
      }
    } catch {
      setMensaje("Error al subir el CV. Intenta de nuevo.");
    } finally {
      setSubiendo(false);
      setAnalizando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/perfil", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(perfil),
      });
      if (!res.ok) { setMensaje("No se pudo guardar tu perfil"); return; }
      setMensaje("Perfil guardado ✔");
    } catch {
      setMensaje("Error al guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="ap-section" style={{ maxWidth: 480 }}>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => {
          e.preventDefault();
          setArrastrando(false);
          const file = e.dataTransfer.files?.[0];
          if (file) subirCv(file);
        }}
        className={"ap-dropzone" + (arrastrando ? " ap-dropzone-active" : "")}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) subirCv(f); }}
        />
        <span style={{ fontSize: 20 }}>📄</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {subiendo ? "Subiendo y leyendo tu CV…"
            : analizando ? "🤖 La IA está leyendo tu información…"
            : perfil.nombreArchivo ? `${perfil.nombreArchivo} — toca para reemplazar`
            : "Sube tu CV en PDF — la IA leerá tu información"}
        </span>
      </div>

      {cargando ? (
        <p className="ap-section-sub">Cargando tu perfil…</p>
      ) : (
        <div>
          {CAMPOS.map(campo => (
            <div key={campo.key} className="ap-field">
              <label className="ap-label">{campo.label}</label>
              {campo.textarea ? (
                <textarea
                  value={perfil[campo.key] || ""}
                  onChange={e => setPerfil(p => ({ ...p, [campo.key]: e.target.value }))}
                  placeholder={campo.placeholder}
                  rows={3}
                  className="ap-textarea"
                />
              ) : (
                <input
                  value={perfil[campo.key] || ""}
                  onChange={e => setPerfil(p => ({ ...p, [campo.key]: e.target.value }))}
                  placeholder={campo.placeholder}
                  className="ap-input"
                />
              )}
            </div>
          ))}

          <button onClick={guardar} disabled={guardando} className="ap-button" style={{ width: "100%" }}>
            {guardando ? "Guardando…" : "Guardar perfil"}
          </button>

          {mensaje && (
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              {mensaje}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
