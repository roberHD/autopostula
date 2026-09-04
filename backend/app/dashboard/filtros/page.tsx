"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, Filter, FlaskConical, Target, Plus } from "lucide-react";

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

type ObjetivoItem = { ciuo: string | null; etiqueta: string; peso: number };

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

  // Objetivo laboral (docs/objetivo-laboral.md) -- distinto de cargoObjetivo
  // del CV: esto es lo que la persona declara que busca, no lo que la IA
  // infirió de su historial. Guardarlo dispara la recompilación del perfil.
  const [objetivos, setObjetivos] = useState<ObjetivoItem[]>([]);
  const [sugerenciaCv, setSugerenciaCv] = useState<string | null>(null);
  const [objetivoConfirmado, setObjetivoConfirmado] = useState(false);
  const [guardandoObjetivo, setGuardandoObjetivo] = useState(false);
  const [mensajeObjetivo, setMensajeObjetivo] = useState("");
  const [sugerirRetriaje, setSugerirRetriaje] = useState(false);

  useEffect(() => {
    async function cargar() {
      try {
        const [resPrefs, resPerfil, resObjetivos] = await Promise.all([
          fetch("/api/preferencias-busqueda"),
          fetch("/api/ai/compilar-perfil"),
          fetch("/api/objetivos"),
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

        if (resObjetivos.ok) {
          const objData = await resObjetivos.json();
          setObjetivoConfirmado(!!objData.objetivoConfirmado);
          setSugerenciaCv(objData.sugerenciaCv ?? null);
          if (Array.isArray(objData.objetivos) && objData.objetivos.length) {
            setObjetivos(objData.objetivos.map((o: any) => ({ ciuo: o.ciuo ?? null, etiqueta: o.etiqueta, peso: o.peso })));
          } else if (objData.sugerenciaCv) {
            // Precarga la sugerencia del CV como punto de partida editable --
            // todavía no está confirmada hasta que se guarde.
            setObjetivos([{ ciuo: null, etiqueta: objData.sugerenciaCv, peso: 1.0 }]);
          } else {
            setObjetivos([{ ciuo: null, etiqueta: "", peso: 1.0 }]);
          }
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

  async function guardarObjetivos() {
    const limpios = objetivos.map((o) => ({ ...o, etiqueta: o.etiqueta.trim() })).filter((o) => o.etiqueta);
    if (!limpios.length) { setMensajeObjetivo("Escribe al menos un objetivo."); return; }

    setGuardandoObjetivo(true);
    setMensajeObjetivo("");
    setSugerirRetriaje(false);
    try {
      const res = await fetch("/api/objetivos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivos: limpios }),
      });
      const data = await res.json();
      if (!res.ok) { setMensajeObjetivo(data.error ?? "No se pudo guardar"); return; }

      setObjetivoConfirmado(true);
      setObjetivos(limpios);
      if (data.perfilCompilado) setPerfilCompilado(data.perfilCompilado);
      setSugerirRetriaje(!!data.sugerirRetriaje);
      setMensajeObjetivo(
        data.avisoCompilacion
          ? "Objetivo guardado. " + data.avisoCompilacion
          : "Objetivo guardado y perfil recompilado."
      );
    } catch (err) {
      console.error("Error guardando objetivo:", err);
      setMensajeObjetivo("No se pudo guardar — revisa la consola");
    } finally {
      setGuardandoObjetivo(false);
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

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.18s", borderColor: "color-mix(in oklch, var(--chart-3) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Target size={15} color="var(--chart-3)" />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Objetivo laboral</p>
        </div>
        <p className="ap-section-sub">
          Tu CV describe de dónde vienes. Esto es a dónde vas — puede ser distinto, sobre todo si te
          estás cambiando de rubro. El motor nuevo de abajo usa esto (no tu CV) para decidir qué
          ofertas te calzan.
        </p>

        {!objetivoConfirmado && sugerenciaCv && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
            Por tu CV, parece que buscas <strong>{sugerenciaCv}</strong> — puedes dejarlo así o cambiarlo abajo.
          </p>
        )}

        {mensajeObjetivo && (
          <p style={{ fontSize: 12.5, color: mensajeObjetivo.startsWith("Objetivo guardado") ? "var(--status-finalizado)" : "var(--status-rechazado)", marginBottom: 10 }}>
            {mensajeObjetivo}
          </p>
        )}

        {sugerirRetriaje && (
          <div className="nota" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0 }}>
              Cambiaste de rubro. Vale la pena rehacer el triaje de onboarding para recalibrar qué
              ofertas te mostramos — desde tu perfil puedes volver a hacerlo cuando quieras.
            </p>
          </div>
        )}

        {objetivos.map((o, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              className="ap-input"
              style={{ flex: 1 }}
              value={o.etiqueta}
              placeholder={i === 0 ? "Ej: vendedor" : "Ej: desarrollador de software (segundo objetivo)"}
              onChange={(e) => {
                const copia = [...objetivos];
                copia[i] = { ...copia[i], etiqueta: e.target.value };
                setObjetivos(copia);
              }}
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              className="ap-input"
              style={{ width: 72 }}
              title="Peso: 1.0 = objetivo principal, menos si lo aceptarías pero no lo buscas activamente"
              value={o.peso}
              onChange={(e) => {
                const copia = [...objetivos];
                copia[i] = { ...copia[i], peso: Math.max(0, Math.min(1, Number(e.target.value))) };
                setObjetivos(copia);
              }}
            />
            {objetivos.length > 1 && (
              <button
                type="button"
                onClick={() => setObjetivos(objetivos.filter((_, j) => j !== i))}
                style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
                aria-label="Quitar objetivo"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {objetivos.length < 4 && (
            <button
              type="button"
              className="ap-button-ghost"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => setObjetivos([...objetivos, { ciuo: null, etiqueta: "", peso: 0.5 }])}
            >
              <Plus size={14} /> Agregar otro objetivo
            </button>
          )}
          <button className="ap-button" disabled={guardandoObjetivo} onClick={guardarObjetivos}>
            {guardandoObjetivo ? "Guardando..." : "Guardar objetivo"}
          </button>
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
