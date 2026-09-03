"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, Filter, FlaskConical } from "lucide-react";

type Preferencias = {
  palabrasIncluir: string[];
  palabrasExcluir: string[];
  modalidad: string;
  jornada: string;
};

type PerfilCompilado = {
  version: number;
  roles: { canonico: string; sinonimos: string[]; peso: number }[];
  vetos: { patron: string; razon: string }[];
  senales: { patron: string; delta: number }[];
};

const OPCIONES_MODALIDAD = [
  { valor: "cualquiera", titulo: "Cualquiera", desc: "No filtrar por modalidad" },
  { valor: "remoto", titulo: "Remoto", desc: "Solo trabajo a distancia" },
  { valor: "hibrido", titulo: "Híbrido", desc: "Combinación presencial/remoto" },
  { valor: "presencial", titulo: "Presencial", desc: "Solo en el lugar de trabajo" },
];

const OPCIONES_JORNADA = [
  { valor: "cualquiera", titulo: "Cualquiera" },
  { valor: "full_time", titulo: "Full time" },
  { valor: "part_time", titulo: "Part time" },
];

function TagInput({
  etiqueta, descripcion, valores, onChange, placeholder,
}: {
  etiqueta: string; descripcion: string; valores: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [input, setInput] = useState("");

  function agregar() {
    const v = input.trim();
    if (v && !valores.includes(v)) onChange([...valores, v]);
    setInput("");
  }

  return (
    <div className="ap-field">
      <label className="ap-label">{etiqueta}</label>
      <p className="ap-section-sub" style={{ marginBottom: 8 }}>{descripcion}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: valores.length ? 8 : 0 }}>
        {valores.map((v) => (
          <span
            key={v}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              borderRadius: 999, padding: "5px 10px 5px 12px", fontSize: 12, fontWeight: 500,
              background: "var(--bg-elevated-2)", color: "var(--text)",
            }}
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(valores.filter((x) => x !== v))}
              style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
              aria-label={`Quitar ${v}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <input
        className="ap-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            agregar();
          }
        }}
        onBlur={agregar}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function FiltrosPage() {
  const [prefs, setPrefs] = useState<Preferencias>({
    palabrasIncluir: [], palabrasExcluir: [], modalidad: "cualquiera", jornada: "cualquiera",
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [guardado, setGuardado] = useState(false);

  const [usarScorerLocal, setUsarScorerLocal] = useState(false);
  const [perfilCompilado, setPerfilCompilado] = useState<PerfilCompilado | null>(null);
  const [compilando, setCompilando] = useState(false);
  const [guardandoScorer, setGuardandoScorer] = useState(false);
  const [mensajeScorer, setMensajeScorer] = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        const [resPrefs, resPerfil] = await Promise.all([
          fetch("/api/preferencias-busqueda"),
          fetch("/api/ai/compilar-perfil"),
        ]);
        const data = await resPrefs.json();
        if (!resPrefs.ok) { setMensaje(data.error ?? `Error ${resPrefs.status}`); return; }
        setPrefs({
          palabrasIncluir: data.palabrasIncluir ?? [],
          palabrasExcluir: data.palabrasExcluir ?? [],
          modalidad: data.modalidad ?? "cualquiera",
          jornada: data.jornada ?? "cualquiera",
        });
        setUsarScorerLocal(!!data.usarScorerLocal);

        if (resPerfil.ok) {
          const perfilData = await resPerfil.json();
          setPerfilCompilado(perfilData.perfilCompilado ?? null);
        }
      } catch (err) {
        console.error("Error cargando filtros:", err);
        setMensaje("No se pudo cargar — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function compilarPerfil() {
    setCompilando(true);
    setMensajeScorer("");
    try {
      const res = await fetch("/api/ai/compilar-perfil", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setMensajeScorer(data.error ?? "No se pudo compilar"); return; }
      setPerfilCompilado(data.perfilCompilado);
      setMensajeScorer("Perfil compilado — ya lo puede usar el motor nuevo.");
    } catch (err) {
      console.error("Error compilando perfil:", err);
      setMensajeScorer("No se pudo compilar — revisa la consola");
    } finally {
      setCompilando(false);
    }
  }

  async function alternarScorerLocal() {
    if (!perfilCompilado) return;
    const nuevoValor = !usarScorerLocal;
    setGuardandoScorer(true);
    setUsarScorerLocal(nuevoValor); // optimista
    try {
      const res = await fetch("/api/preferencias-busqueda", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prefs, usarScorerLocal: nuevoValor }),
      });
      if (!res.ok) {
        setUsarScorerLocal(!nuevoValor);
        const data = await res.json().catch(() => ({}));
        setMensajeScorer(data.error ?? "No se pudo guardar el cambio");
      }
    } catch (err) {
      setUsarScorerLocal(!nuevoValor);
      console.error("Error guardando el flag del scorer:", err);
    } finally {
      setGuardandoScorer(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    setGuardado(false);
    try {
      const res = await fetch("/api/preferencias-busqueda", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) { setMensaje(data.error ?? "No se pudo guardar"); return; }
      setGuardado(true);
    } catch (err) {
      console.error("Error guardando filtros:", err);
      setMensaje("No se pudo guardar — revisa la consola");
    } finally {
      setGuardando(false);
    }
  }

  async function sugerirConIA() {
    setSugiriendo(true);
    setMensaje("");
    setGuardado(false);
    try {
      const res = await fetch("/api/ai/sugerir-filtros", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setMensaje(data.error ?? "No se pudo generar la sugerencia"); return; }
      setPrefs({
        palabrasIncluir: data.sugerido.palabrasIncluir ?? [],
        palabrasExcluir: data.sugerido.palabrasExcluir ?? [],
        modalidad: data.sugerido.modalidad ?? "cualquiera",
        jornada: data.sugerido.jornada ?? "cualquiera",
      });
      setMensaje("Sugerencia generada — revísala y guarda si te sirve.");
    } catch (err) {
      console.error("Error sugiriendo filtros:", err);
      setMensaje("No se pudo generar la sugerencia — revisa la consola");
    } finally {
      setSugiriendo(false);
    }
  }

  if (cargando) return <div className="ap-empty">Cargando...</div>;

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="ap-page-title">Filtros de búsqueda</h1>
          <p className="ap-page-sub">
            Define qué ofertas quieres que la extensión postule por ti — se aplica tanto al escaneo manual como a la búsqueda automática.
          </p>
        </div>
        <button className="ap-button-ghost" onClick={sugerirConIA} disabled={sugiriendo} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <Sparkles size={14} />
          {sugiriendo ? "Pensando..." : "Sugerir con IA"}
        </button>
      </div>

      {mensaje && (
        <p style={{ color: mensaje.includes("Sugerencia") ? "var(--status-finalizado)" : "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>
          {mensaje}
        </p>
      )}

      <div className="ap-two-col">
        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0s" }}>
            <TagInput
              etiqueta="Palabras clave a incluir"
              descripcion="Solo se consideran ofertas que mencionen al menos una de estas (cargo, rubro, herramienta)"
              valores={prefs.palabrasIncluir}
              onChange={(v) => setPrefs((p) => ({ ...p, palabrasIncluir: v }))}
              placeholder="Ej: vendedor, retail — Enter para agregar"
            />
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
            <TagInput
              etiqueta="Palabras a excluir"
              descripcion="Se descartan las ofertas que mencionen cualquiera de estas"
              valores={prefs.palabrasExcluir}
              onChange={(v) => setPrefs((p) => ({ ...p, palabrasExcluir: v }))}
              placeholder="Ej: comisión pura — Enter para agregar"
            />
          </div>

          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s" }}>
            <p className="ap-section-title">Modalidad</p>
            <div className="ap-option-group">
              {OPCIONES_MODALIDAD.map((o) => (
                <button
                  key={o.valor}
                  className={"ap-option-card" + (prefs.modalidad === o.valor ? " ap-option-card-active" : "")}
                  onClick={() => setPrefs((p) => ({ ...p, modalidad: o.valor }))}
                >
                  <div className="ap-option-title">{o.titulo}</div>
                  <div className="ap-option-desc">{o.desc}</div>
                </button>
              ))}
            </div>

            <p className="ap-section-title" style={{ marginTop: 4 }}>Jornada</p>
            <div className="ap-option-group" style={{ marginBottom: 0 }}>
              {OPCIONES_JORNADA.map((o) => (
                <button
                  key={o.valor}
                  className={"ap-option-card" + (prefs.jornada === o.valor ? " ap-option-card-active" : "")}
                  onClick={() => setPrefs((p) => ({ ...p, jornada: o.valor }))}
                  style={{ flex: "0 0 auto", minWidth: 100, textAlign: "center" }}
                >
                  <div className="ap-option-title">{o.titulo}</div>
                </button>
              ))}
            </div>
          </div>

          <button className="ap-button" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando..." : "Guardar filtros"}
          </button>
          {guardado && (
            <span style={{ fontSize: 12, color: "var(--status-finalizado)", marginLeft: 12 }}>
              Guardado — la extensión ya usa estos filtros.
            </span>
          )}
        </div>

        <div>
          <div className="ap-section ap-animate-in" style={{ animationDelay: "0.15s" }}>
            <div
              style={{
                width: 34, height: 34, borderRadius: 8, marginBottom: 10,
                background: "var(--accent)", color: "var(--accent-contrast)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Filter size={16} />
            </div>
            <p className="ap-section-title">Cómo funciona</p>
            <p className="ap-section-sub" style={{ marginBottom: 0 }}>
              Antes de postular a una oferta, la extensión revisa estos filtros. Si no calza, la salta
              sin gastar tiempo ni cupo de IA en ella. "Sugerir con IA" los arma a partir de tu CV y de
              lo que conversaste en "Conversación IA".
            </p>
          </div>
        </div>
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.2s", borderColor: "color-mix(in oklch, var(--chart-2) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <FlaskConical size={15} color="var(--chart-2)" />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Motor de filtrado nuevo (beta)</p>
        </div>
        <p className="ap-section-sub">
          En vez de palabras sueltas, compila un perfil con IA a partir de tu CV y tus decisiones, y puntúa
          cada oferta con más matices (sinónimos, vetos con razón, ubicación). Reemplaza a los filtros de
          arriba cuando lo actives.
        </p>

        {mensajeScorer && (
          <p style={{ fontSize: 12.5, color: mensajeScorer.includes("compilado") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeScorer}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: perfilCompilado ? 16 : 0, flexWrap: "wrap" }}>
          <button className="ap-button-ghost" onClick={compilarPerfil} disabled={compilando}>
            {compilando ? "Compilando..." : perfilCompilado ? "Recompilar perfil" : "Compilar mi perfil"}
          </button>

          {perfilCompilado && (
            <div className="ap-toggle-row" style={{ border: "none", padding: 0, flex: 1, minWidth: 220 }}>
              <div>
                <div className="ap-toggle-label">Usar el motor nuevo</div>
                <div className="ap-toggle-desc">{usarScorerLocal ? "Activo" : "Apagado — se sigue usando el filtro de arriba"}</div>
              </div>
              <button
                className={"ap-switch " + (usarScorerLocal ? "ap-switch-on" : "ap-switch-off")}
                onClick={alternarScorerLocal}
                disabled={guardandoScorer}
                aria-pressed={usarScorerLocal}
              >
                <span className="ap-switch-knob" />
              </button>
            </div>
          )}
        </div>

        {perfilCompilado && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>ROLES</p>
              {perfilCompilado.roles.map((r) => (
                <p key={r.canonico} style={{ fontSize: 12.5, marginBottom: 3 }}>
                  <strong>{r.canonico}</strong> ({Math.round(r.peso * 100)}%) — {r.sinonimos.join(", ")}
                </p>
              ))}
            </div>
            {perfilCompilado.vetos.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>VETOS</p>
                {perfilCompilado.vetos.map((v) => (
                  <p key={v.patron} style={{ fontSize: 12.5, marginBottom: 3 }}>
                    <strong>{v.patron}</strong> — {v.razon}
                  </p>
                ))}
              </div>
            )}
            {perfilCompilado.senales.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>SEÑALES</p>
                {perfilCompilado.senales.map((s) => (
                  <p key={s.patron} style={{ fontSize: 12.5, marginBottom: 3 }}>
                    {s.delta >= 0 ? "+" : ""}{s.delta} por <strong>{s.patron}</strong>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
