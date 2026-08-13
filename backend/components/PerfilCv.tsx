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
  const [abierto, setAbierto] = useState(true);
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
      const resAI = await fetch("/api/cv/analizar", { method: "POST" });
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
        setMensaje("CV subido. Completa tus datos manualmente.");
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
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wide text-gray-900">MI CV Y PERFIL</h2>
        <button onClick={() => setAbierto(a => !a)} className="text-xs font-medium text-blue-600 hover:underline">
          {abierto ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {abierto && (
        <>
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
            className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
              arrastrando ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) subirCv(f); }}
            />
            <span className="text-sm text-gray-500">
              {subiendo ? "📄 Subiendo y leyendo tu CV…"
                : analizando ? "🤖 La IA está leyendo tu información…"
                : perfil.nombreArchivo ? `📄 ${perfil.nombreArchivo} — toca para reemplazar`
                : "📄 Sube tu CV en PDF — la IA leerá tu información"}
            </span>
          </div>

          {cargando ? (
            <p className="text-sm text-gray-400">Cargando tu perfil…</p>
          ) : (
            <div className="space-y-4">
              {CAMPOS.map(campo => (
                <div key={campo.key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {campo.label}
                  </label>
                  {campo.textarea ? (
                    <textarea
                      value={perfil[campo.key] || ""}
                      onChange={e => setPerfil(p => ({ ...p, [campo.key]: e.target.value }))}
                      placeholder={campo.placeholder}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white"
                    />
                  ) : (
                    <input
                      value={perfil[campo.key] || ""}
                      onChange={e => setPerfil(p => ({ ...p, [campo.key]: e.target.value }))}
                      placeholder={campo.placeholder}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white"
                    />
                  )}
                </div>
              ))}

              <button
                onClick={guardar}
                disabled={guardando}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar perfil"}
              </button>

              {mensaje && <p className="text-center text-xs text-gray-500">{mensaje}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}