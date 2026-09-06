"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mail, Phone, MapPin, IdCard, Briefcase, Pencil, X,
  FileText, Loader2, Sparkles, Plus, User, CalendarClock,
} from "lucide-react";
import { useAvisos } from "@/components/Avisos";
import { Skel } from "@/components/Esqueleto";

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

function Dato({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value?: string | null }) {
  return (
    <div className="ap-dato">
      <span className="ap-dato__ico"><Icon size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <p className="ap-dato__lab">{label}</p>
        <p className="ap-dato__val" data-vacio={value ? undefined : "1"}>
          {value || "Sin completar"}
        </p>
      </div>
    </div>
  );
}

function Par({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="ap-par">
      <span>{label}</span>
      <span data-vacio={value ? undefined : "1"}>{value || "Sin completar"}</span>
    </div>
  );
}

export default function PerfilCv() {
  const { exito, error: avisarError } = useAvisos();
  const [perfil, setPerfil] = useState<Perfil>({});
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  // Listón que queda abierto aunque el cursor se vaya. El hover lo resuelve
  // el CSS; esto es solo el "clic para dejarlo fijo" y poder escribir tranquilo.
  const [fijada, setFijada] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/perfil")
      .then((res) => res.json())
      .then((data) => setPerfil(data || {}))
      .catch(() => avisarError("No pudimos cargar tu perfil", "Revisa tu conexión y recarga la página."))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subirCv(file: File) {
    if (file.type !== "application/pdf") {
      avisarError("Ese archivo no es un PDF", "Exporta tu CV como PDF y vuelve a subirlo.");
      return;
    }
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        avisarError("No pudimos procesar tu CV", data.error || "Intenta con otro archivo PDF.");
        return;
      }
      setPerfil((p) => ({ ...p, nombreArchivo: data.nombreArchivo }));

      setAnalizando(true);
      const resAI = await fetch("/api/cv/upload/analizar", { method: "POST" });
      const dataAI = await resAI.json();
      if (resAI.ok && dataAI.disponible && dataAI.datos) {
        const nuevo = { ...perfil, ...dataAI.datos };
        // Se guarda de una vez lo que la IA extrajo, para que la vista y la
        // completitud queden al día sin un paso manual.
        const guardado = await fetch("/api/perfil", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nuevo),
        });
        setPerfil(await guardado.json());
        exito("CV leído", "Completamos tu perfil con lo que encontramos. Revísalo abajo.");
      } else {
        exito("CV guardado", dataAI.error || "No pudimos leerlo automáticamente: completa tus datos a mano.");
      }
    } catch {
      avisarError("No se pudo subir el CV", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSubiendo(false);
      setAnalizando(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/perfil", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(perfil),
      });
      const data = await res.json();
      if (!res.ok) {
        avisarError("No pudimos guardar tu perfil", "Vuelve a intentar en unos segundos.");
        return;
      }
      setPerfil(data);
      setEditando(false);
      exito("Perfil guardado", "La IA ya usa estos datos para responder por ti.");
    } catch {
      avisarError("No se pudo guardar", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando />;

  const iniciales =
    (perfil.nombre || "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  const completitud = perfil.completitud ?? 0;

  // Decir "62%" sin decir qué falta no ayuda a nadie. Se nombran los campos
  // vacíos para que completarlo sea una acción concreta.
  const faltantes = CAMPOS_EDITABLES.filter((c) => !perfil[c.key]).map((c) => c.label.toLowerCase());

  return (
    <div className="ap-hoja" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Cabecera: identidad + cuánto falta ── */}
      <div className="ap-ficha-cab ap-animate-in">
        <div className="ap-ficha-cab__id">
          <span className="ap-ficha-avatar">{iniciales}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className="ap-ficha-nombre">{perfil.nombre || "Sin nombre todavía"}</h2>
            <p className="ap-ficha-cargo">{perfil.cargoObjetivo || "Sin cargo objetivo"}</p>
          </div>
          <button onClick={() => setEditando((v) => !v)} className="ap-button-ghost">
            {editando ? <><X size={14} /> Cancelar</> : <><Pencil size={14} /> Editar perfil</>}
          </button>
        </div>

        <div className="ap-medidor">
          <div className="ap-medidor__top">
            <span style={{ color: "var(--text-muted)" }}>Perfil completo</span>
            <span className="ap-medidor__pct">{completitud}%</span>
          </div>
          <span className="ap-medidor__barra">
            <span
              className="ap-medidor__relleno"
              style={{ width: `${completitud}%` }}
              data-lleno={completitud >= 100 ? "1" : undefined}
            />
          </span>
          <p className="ap-medidor__falta">
            {faltantes.length === 0
              ? "Está todo listo: la IA tiene con qué responder por ti."
              : `Falta ${faltantes.slice(0, 3).join(", ")}${faltantes.length > 3 ? ` y ${faltantes.length - 3} más` : ""}.`}
          </p>
        </div>
      </div>

      {/* ── El CV: una fila, no un cajón ── */}
      <div
        className="ap-cv ap-animate-in"
        style={{ animationDelay: "0.04s" }}
        data-vacio={perfil.nombreArchivo ? undefined : "1"}
        data-arrastrando={arrastrando ? "1" : undefined}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const file = e.dataTransfer.files?.[0];
          if (file) subirCv(file);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subirCv(f); }}
        />

        <span className="ap-cv__ico">
          {subiendo || analizando ? (
            <Loader2 size={16} style={{ animation: "ap-girar 0.8s linear infinite" }} />
          ) : perfil.nombreArchivo ? (
            <FileText size={16} />
          ) : (
            <Plus size={16} />
          )}
        </span>

        <div style={{ minWidth: 0 }}>
          <p className="ap-cv__nombre">
            {subiendo ? "Subiendo tu CV…"
              : analizando ? "La IA está leyendo tu CV…"
              : perfil.nombreArchivo || "Sube tu CV en PDF"}
          </p>
          <p className="ap-cv__sub">
            {perfil.nombreArchivo && !subiendo && !analizando
              ? "De acá salen tus datos y tu forma de escribir"
              : "Arrástralo acá o haz clic para elegirlo"}
          </p>
        </div>

        {!subiendo && !analizando && (
          <span className="ap-cv__accion">{perfil.nombreArchivo ? "Reemplazar" : "Elegir archivo"}</span>
        )}
      </div>

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
        <>
          {/* ── Contacto: una fila que ocupa el ancho ── */}
          <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.08s" }}>
            <div className="ap-datos">
              <Dato icon={Mail} label="Correo" value={perfil.email} />
              <Dato icon={Phone} label="Teléfono" value={perfil.telefono} />
              <Dato icon={MapPin} label="Comuna" value={perfil.comuna} />
              <Dato icon={IdCard} label="RUT" value={perfil.rut} />
            </div>
          </div>

          <div className="ap-split ap-animate-in" style={{ animationDelay: "0.12s" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <section className="ap-section" style={{ marginBottom: 0 }}>
                <p className="ap-section-title">Resumen profesional</p>
                <p className="ap-section-sub">La IA lo usa como base para presentaciones y cartas</p>
                {perfil.resumenProfesional ? (
                  <p style={{ fontSize: 13.5, lineHeight: 1.7, maxWidth: "68ch" }}>
                    {perfil.resumenProfesional}
                  </p>
                ) : (
                  <VacioSuave
                    texto="Todavía no hay resumen. Sube tu CV y lo escribimos por ti, o edítalo a mano."
                    onEditar={() => setEditando(true)}
                  />
                )}
              </section>

              <section className="ap-section" style={{ marginBottom: 0 }}>
                <p className="ap-section-title">Experiencia laboral</p>
                <p className="ap-section-sub">Lo que citamos cuando una oferta pide experiencia</p>
                {perfil.experiencia && perfil.experiencia.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {perfil.experiencia.map((e, i) => (
                      <div
                        key={`${e.cargo}-${i}`}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 12,
                          padding: "12px 0",
                          borderBottom: i < (perfil.experiencia?.length ?? 0) - 1 ? "1px solid var(--border)" : "none",
                        }}
                      >
                        <span className="ap-dato__ico" style={{ marginTop: 1 }}><Briefcase size={15} /></span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600 }}>{e.cargo}</p>
                          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                            {e.empresa} · {e.periodo}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <VacioSuave texto="Sin experiencia registrada. Se completa sola al subir tu CV." />
                )}
              </section>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <section className="ap-section" style={{ marginBottom: 0 }}>
                <p className="ap-section-title">Preferencias laborales</p>
                <p className="ap-section-sub">Lo que respondemos cuando el formulario pregunta</p>
                <div className="ap-pares">
                  <Par label="Disponibilidad" value={perfil.disponibilidad} />
                  <Par label="Modalidad" value={perfil.modalidad} />
                  <Par label="Pretensión de renta" value={perfil.expectativaRenta} />
                </div>
              </section>

              <section className="ap-section" style={{ marginBottom: 0 }}>
                <p className="ap-section-title">Habilidades</p>
                <p className="ap-section-sub">Se mencionan cuando la oferta las pide</p>
                {perfil.habilidades && perfil.habilidades.length > 0 ? (
                  <div className="ap-tags">
                    {perfil.habilidades.map((h) => (
                      <span key={h} className="ap-tag">{h}</span>
                    ))}
                  </div>
                ) : (
                  <VacioSuave texto="Sin habilidades registradas todavía." />
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Vacío discreto: dice qué falta y, si aplica, cómo llenarlo. */
function VacioSuave({ texto, onEditar }: { texto: string; onEditar?: () => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 16px", borderRadius: 10,
        background: "var(--bg-elevated-2)", border: "1px dashed var(--border-strong)",
      }}
    >
      <Sparkles size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>{texto}</p>
      {onEditar && (
        <button className="ap-button-ghost ap-btn--sm" style={{ marginLeft: "auto", flexShrink: 0 }} onClick={onEditar}>
          Escribirlo
        </button>
      )}
    </div>
  );
}

function Cargando() {
  return (
    <div className="ap-hoja" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ap-ficha-cab">
        <div className="ap-ficha-cab__id">
          <Skel ancho={56} alto={56} radio={14} variante="block" />
          <div style={{ display: "grid", gap: 8, flex: 1 }}>
            <Skel ancho={180} variante="title" />
            <Skel ancho={120} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <Skel ancho="100%" alto={7} />
          <Skel ancho="70%" />
        </div>
      </div>
      <Skel ancho="100%" alto={62} variante="block" />
      <div className="ap-split">
        <div style={{ display: "grid", gap: 20 }}>
          <div className="ap-section" style={{ marginBottom: 0 }}><Skel ancho="100%" alto={96} variante="block" /></div>
          <div className="ap-section" style={{ marginBottom: 0 }}><Skel ancho="100%" alto={120} variante="block" /></div>
        </div>
        <div className="ap-section" style={{ marginBottom: 0 }}><Skel ancho="100%" alto={140} variante="block" /></div>
      </div>
    </div>
  );
}
