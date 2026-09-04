"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Phone, MapPin, IdCard, Briefcase, Pencil, CheckCircle2, X, User, CalendarClock, FileText } from "lucide-react";

type Experiencia = { cargo: string; empresa: string; periodo: string };

type Perfil = {
  nombreArchivo?: string | null;
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  comuna?: string | null;
  rut?: string | null;
  cargoObjetivo?: string | null;
  expectativaRenta?: string | null;
  disponibilidad?: string | null;
  modalidad?: string | null;
  resumenProfesional?: string | null;
  experiencia?: Experiencia[] | null;
  habilidades?: string[] | null;
  completitud?: number;
};

const CAMPOS_EDITABLES: { key: keyof Perfil; label: string; placeholder: string; textarea?: boolean }[] = [
  { key: "nombre", label: "Nombre completo", placeholder: "Ej: Juan Pérez González" },
  { key: "cargoObjetivo", label: "Cargo objetivo", placeholder: "Ej: Vendedor / Retail" },
  { key: "email", label: "Email", placeholder: "tu@email.com" },
  { key: "telefono", label: "Teléfono", placeholder: "+56 9 1234 5678" },
  { key: "comuna", label: "Comuna de residencia", placeholder: "Ej: Las Condes" },
  { key: "rut", label: "RUT", placeholder: "12.345.678-9" },
  { key: "expectativaRenta", label: "Expectativa de renta", placeholder: "Ej: $500.000 - $600.000" },
  { key: "disponibilidad", label: "Disponibilidad horaria", placeholder: "Ej: Part time, tardes y fines de semana" },
  { key: "modalidad", label: "Modalidad", placeholder: "Presencial, híbrido o remoto" },
  {
    key: "resumenProfesional",
    label: "Resumen profesional",
    placeholder: "Breve descripción de tu experiencia y perfil. Si subes tu CV, esto se completa automáticamente.",
    textarea: true,
  },
];

const POR_KEY = Object.fromEntries(CAMPOS_EDITABLES.map((c) => [c.key, c]));

// Los mismos 10 campos de CAMPOS_EDITABLES, repartidos en los listones de la
// persiana. Cada grupo toma un color de la paleta de gráficos para que la fila
// se lea como un sistema y no como cinco cajas iguales.
const GRUPOS: {
  id: string;
  label: string;
  sub: string;
  icon: typeof Mail;
  color: string;
  campos: (keyof Perfil)[];
}[] = [
  {
    id: "identidad", label: "Identidad", icon: User, color: "var(--chart-1)",
    sub: "Con estos datos te identifica el reclutador",
    campos: ["nombre", "rut"],
  },
  {
    id: "contacto", label: "Contacto", icon: Mail, color: "var(--chart-3)",
    sub: "Por dónde te van a escribir",
    campos: ["email", "telefono", "comuna"],
  },
  {
    id: "objetivo", label: "Objetivo", icon: Briefcase, color: "var(--chart-2)",
    sub: "Qué buscas y por cuánto",
    campos: ["cargoObjetivo", "expectativaRenta"],
  },
  {
    id: "jornada", label: "Jornada", icon: CalendarClock, color: "var(--chart-4)",
    sub: "Cuándo y cómo puedes trabajar",
    campos: ["disponibilidad", "modalidad"],
  },
  {
    id: "resumen", label: "Resumen", icon: FileText, color: "var(--chart-5)",
    sub: "La IA lo usa como base para tus cartas",
    campos: ["resumenProfesional"],
  },
];

function Field({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "var(--bg-elevated-2)", color: "var(--text-muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={16} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</p>
        <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export default function PerfilCv() {
  const [perfil, setPerfil] = useState<Perfil>({});
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // Listón que queda abierto aunque el cursor se vaya. El hover lo resuelve
  // el CSS; esto es solo el "clic para dejarlo fijo" y poder escribir tranquilo.
  const [fijada, setFijada] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/perfil")
      .then((res) => res.json())
      .then((data) => setPerfil(data || {}))
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
      setPerfil((p) => ({ ...p, nombreArchivo: data.nombreArchivo }));

      setAnalizando(true);
      const resAI = await fetch("/api/cv/upload/analizar", { method: "POST" });
      const dataAI = await resAI.json();
      if (resAI.ok && dataAI.disponible && dataAI.datos) {
        const nuevo = { ...perfil, ...dataAI.datos };
        setPerfil(nuevo);
        // Guardamos de una vez lo que la IA extrajo, para que la vista y la completitud queden al día
        const guardado = await fetch("/api/perfil", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nuevo),
        });
        const perfilGuardado = await guardado.json();
        setPerfil(perfilGuardado);
        setMensaje("CV leído — revisa tu perfil actualizado abajo");
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
      const data = await res.json();
      if (!res.ok) { setMensaje("No se pudo guardar tu perfil"); return; }
      setPerfil(data);
      setEditando(false);
      setMensaje("Perfil guardado ✔");
    } catch {
      setMensaje("Error al guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <div className="ap-empty">Cargando tu perfil…</div>;

  const iniciales = (perfil.nombre || "?")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const completitud = perfil.completitud ?? 0;
  const circunferencia = 97.4; // 2 * PI * r(15.5), igual que en el repomix

  return (
    <div>
      {/* Dropzone del CV — siempre visible arriba */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const file = e.dataTransfer.files?.[0];
          if (file) subirCv(file);
        }}
        className={"ap-dropzone" + (arrastrando ? " ap-dropzone-active" : "")}
        style={{ marginBottom: 20 }}
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
          {subiendo ? "Subiendo y leyendo tu CV…"
            : analizando ? "🤖 La IA está leyendo tu información…"
            : perfil.nombreArchivo ? `${perfil.nombreArchivo} — toca para reemplazar`
            : "Sube tu CV en PDF — la IA leerá tu información"}
        </span>
      </div>

      {mensaje && (
        <p style={{ fontSize: 12.5, color: mensaje.includes("✔") || mensaje.includes("leído") ? "var(--status-finalizado)" : "var(--text-muted)", marginBottom: 16 }}>
          {mensaje}
        </p>
      )}

      {editando ? (
        <>
          <div className="ap-perfil-hero">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                  background: "oklch(1 0 0 / 20%)", border: "1px solid oklch(1 0 0 / 35%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 19, fontWeight: 600,
                }}
              >
                {iniciales}
              </div>
              <div>
                <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.09em", opacity: 0.85 }}>
                  Editando tu perfil
                </p>
                <h2 style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.25 }}>{perfil.nombre || "Sin nombre"}</h2>
                <p style={{ fontSize: 13, opacity: 0.9 }}>{perfil.cargoObjetivo || "Sin cargo objetivo"}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999,
                  background: "oklch(1 0 0 / 18%)", border: "1px solid oklch(1 0 0 / 30%)",
                }}
              >
                {completitud}% completo
              </span>
              <button
                onClick={() => setEditando(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                  fontSize: 12.5, fontFamily: "inherit", padding: "8px 14px", borderRadius: 8,
                  background: "oklch(1 0 0 / 12%)", border: "1px solid oklch(1 0 0 / 30%)",
                  color: "inherit",
                }}
              >
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            Pasa el cursor por un grupo para abrirlo — haz clic en su lomo para dejarlo fijo mientras escribes.
          </p>

          <div className="ap-persiana">
            {GRUPOS.map((grupo) => {
              const Icono = grupo.icon;
              const llenos = grupo.campos.filter((k) => ((perfil[k] as string) || "").trim()).length;
              const fija = fijada === grupo.id;
              return (
                <section
                  key={grupo.id}
                  className={"ap-slat" + (fija ? " ap-slat-fija" : "")}
                  style={{ "--slat-color": grupo.color } as React.CSSProperties}
                >
                  <button
                    type="button"
                    className="ap-slat-lomo"
                    onClick={() => setFijada((f) => (f === grupo.id ? null : grupo.id))}
                    aria-expanded={fija}
                    title={fija ? "Soltar el grupo" : "Dejar el grupo fijo"}
                  >
                    <Icono size={17} />
                    <span className="ap-slat-lomo-txt">{grupo.label}</span>
                    <span className="ap-slat-conteo">{llenos}/{grupo.campos.length}</span>
                  </button>
                  <div className="ap-slat-cuerpo">
                    <div className="ap-slat-cuerpo-inner">
                      <p className="ap-slat-cuerpo-titulo">{grupo.label}</p>
                      <p className="ap-slat-cuerpo-sub">{grupo.sub}</p>
                      {grupo.campos.map((key) => {
                        const campo = POR_KEY[key];
                        return (
                          <div key={key} className="ap-field">
                            <label className="ap-label">{campo.label}</label>
                            {campo.textarea ? (
                              <textarea
                                value={(perfil[key] as string) || ""}
                                onChange={(e) => setPerfil((p) => ({ ...p, [key]: e.target.value }))}
                                placeholder={campo.placeholder}
                                rows={8}
                                className="ap-textarea"
                              />
                            ) : (
                              <input
                                value={(perfil[key] as string) || ""}
                                onChange={(e) => setPerfil((p) => ({ ...p, [key]: e.target.value }))}
                                placeholder={campo.placeholder}
                                className="ap-input"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <button onClick={guardar} disabled={guardando} className="ap-button" style={{ width: "100%" }}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </>
      ) : (
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "2fr 1fr" }} className="ap-charts-row">
          {/* Columna principal */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Identidad */}
            <div className="ap-section" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
                      background: "var(--accent)", color: "var(--accent-contrast)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, fontWeight: 600,
                    }}
                  >
                    {iniciales}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 600 }}>{perfil.nombre || "Sin nombre"}</h2>
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{perfil.cargoObjetivo || "Sin cargo objetivo"}</p>
                  </div>
                </div>
                <button onClick={() => setEditando(true)} className="ap-button-ghost" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Pencil size={14} /> Editar perfil
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                <Field icon={Mail} label="Correo" value={perfil.email || ""} />
                <Field icon={Phone} label="Teléfono" value={perfil.telefono || ""} />
                <Field icon={MapPin} label="Ubicación" value={perfil.comuna || ""} />
                <Field icon={IdCard} label="RUT" value={perfil.rut || ""} />
              </div>
            </div>

            {/* Resumen profesional */}
            <div className="ap-section" style={{ marginBottom: 0 }}>
              <p className="ap-section-title">Resumen profesional</p>
              <p className="ap-section-sub">La IA lo usa como base para presentaciones y cartas</p>
              <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                {perfil.resumenProfesional || "Todavía no hay un resumen — sube tu CV o edítalo manualmente."}
              </p>
            </div>

            {/* Experiencia */}
            <div className="ap-section" style={{ marginBottom: 0 }}>
              <p className="ap-section-title">Experiencia laboral</p>
              {(!perfil.experiencia || perfil.experiencia.length === 0) && (
                <p className="ap-section-sub" style={{ marginBottom: 0 }}>
                  Sin experiencia registrada todavía — se completa al subir tu CV.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {perfil.experiencia?.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0, marginTop: 2,
                        background: "var(--bg-elevated-2)", color: "var(--text-muted)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 500 }}>{e.cargo}</p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.empresa} · {e.periodo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Columna lateral */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Completitud */}
            <div className="ap-section" style={{ marginBottom: 0 }}>
              <p className="ap-section-title">Completitud del perfil</p>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" width={80} height={80} className="ap-donut-draw">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--bg-elevated-2)" strokeWidth="4" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={`${(completitud / 100) * circunferencia} ${circunferencia}`}
                      style={{ transition: "stroke-dasharray 0.6s ease" }}
                    />
                  </svg>
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                    {completitud}%
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Completa tu perfil para que las respuestas automáticas suenen aún más como tú.
                </p>
              </div>
            </div>

            {/* Preferencias */}
            <div className="ap-section" style={{ marginBottom: 0 }}>
              <p className="ap-section-title">Preferencias laborales</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>Disponibilidad</span>
                  <span style={{ fontWeight: 500, textAlign: "right" }}>{perfil.disponibilidad || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>Modalidad</span>
                  <span style={{ fontWeight: 500, textAlign: "right" }}>{perfil.modalidad || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>Pretensión</span>
                  <span style={{ fontWeight: 500, textAlign: "right" }}>{perfil.expectativaRenta || "—"}</span>
                </div>
              </div>
            </div>

            {/* Habilidades */}
            <div className="ap-section" style={{ marginBottom: 0 }}>
              <p className="ap-section-title">Habilidades</p>
              {(!perfil.habilidades || perfil.habilidades.length === 0) && (
                <p className="ap-section-sub" style={{ marginBottom: 0 }}>Sin habilidades registradas todavía.</p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {perfil.habilidades?.map((h) => (
                  <span
                    key={h}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 500,
                      background: "var(--bg-elevated-2)", color: "var(--text)",
                    }}
                  >
                    <CheckCircle2 size={12} color="var(--accent)" />
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
