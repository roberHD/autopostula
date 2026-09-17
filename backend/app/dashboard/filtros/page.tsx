"use client";

import { useEffect, useState } from "react";
import { X, FlaskConical, Target, Plus } from "lucide-react";

type PerfilCompilado = {
  version: number;
  roles: { canonico: string; sinonimos: string[]; peso: number }[];
  vetos: { patron: string; razon: string }[];
  senales: { patron: string; delta: number }[];
};

type ObjetivoItem = { ciuo: string | null; etiqueta: string; peso: number };

export default function FiltrosPage() {
  const [cargando, setCargando] = useState(true);

  const [perfilCompilado, setPerfilCompilado] = useState<PerfilCompilado | null>(null);
  const [compilando, setCompilando] = useState(false);
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
        const [resPerfil, resObjetivos] = await Promise.all([
          fetch("/api/ai/compilar-perfil"),
          fetch("/api/objetivos"),
        ]);

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
      setMensajeScorer("Perfil compilado.");
    } catch (err) {
      console.error("Error compilando perfil:", err);
      setMensajeScorer("No se pudo compilar — revisa la consola");
    } finally {
      setCompilando(false);
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
      <div className="ap-page-header">
        <h1 className="ap-page-title">Filtros de búsqueda</h1>
        <p className="ap-page-sub">
          Define qué ofertas quieres que la extensión postule por ti — se aplica tanto al escaneo manual como a la búsqueda automática.
        </p>
      </div>

      <div className="ap-hoja" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="ap-section ap-animate-in" style={{ marginBottom: 0, borderColor: "color-mix(in oklch, var(--chart-3) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Target size={15} color="var(--chart-3)" />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Objetivo laboral</p>
        </div>
        <p className="ap-section-sub">
          Tu CV describe de dónde vienes. Esto es a dónde vas — puede ser distinto, sobre todo si te
          estás cambiando de rubro. El motor de búsqueda usa esto (no tu CV) para decidir qué
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

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s", borderColor: "color-mix(in oklch, var(--chart-2) 35%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <FlaskConical size={15} color="var(--chart-2)" />
          <p className="ap-section-title" style={{ marginBottom: 0 }}>Perfil de búsqueda</p>
        </div>
        <p className="ap-section-sub">
          Compila un perfil con IA a partir de tu CV y tus decisiones, y puntúa cada oferta con más
          matices (sinónimos, vetos con razón, ubicación).
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
        </div>

        {perfilCompilado && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Roles</p>
              {perfilCompilado.roles.map((r) => (
                <p key={r.canonico} style={{ fontSize: 12.5, marginBottom: 3 }}>
                  <strong>{r.canonico}</strong> ({Math.round(r.peso * 100)}%) — {r.sinonimos.join(", ")}
                </p>
              ))}
            </div>
            {perfilCompilado.vetos.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Vetos</p>
                {perfilCompilado.vetos.map((v) => (
                  <p key={v.patron} style={{ fontSize: 12.5, marginBottom: 3 }}>
                    <strong>{v.patron}</strong> — {v.razon}
                  </p>
                ))}
              </div>
            )}
            {perfilCompilado.senales.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Señales</p>
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
    </div>
  );
}
