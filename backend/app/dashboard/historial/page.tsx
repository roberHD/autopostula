"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, SearchX, Download, Lock } from "lucide-react";

type Application = {
  id: string;
  titulo: string;
  empresa: string | null;
  portal: string;
  estado: string;
  // Solo INCOMPLETA: por qué no se pudo terminar sola (§3.4).
  notaAtencion: string | null;
  enviadaEn: string;
  // Una de las 5 de la prueba automática (docs/rafagas-y-ponerse-al-dia.md §4.1).
  esDePrueba: boolean;
};

const FILTROS = [
  { valor: "TODAS", etiqueta: "Todas" },
  { valor: "ENVIADO", etiqueta: "Enviada" },
  { valor: "VISTO", etiqueta: "Vista" },
  { valor: "EN_PROCESO", etiqueta: "En proceso" },
  { valor: "FINALISTA", etiqueta: "Finalista" },
  { valor: "FINALIZADO", etiqueta: "Finalizada" },
  { valor: "RECHAZADO", etiqueta: "Rechazada" },
];

// §3.4 (docs/revision-2026-09-16.md): INCOMPLETA no es un estado más de la
// misma escala -- es una postulación que se quedó a medias y NO llegó a la
// empresa. Se muestra con su propio nombre y color (antes salía como el texto
// crudo "INCOMPLETA", gris, junto a "Enviada") y con su propio filtro, que solo
// aparece cuando hay alguna.
const FILTRO_ATENCION = { valor: "INCOMPLETA", etiqueta: "Necesitan tu atención" };

// §4.1: "Ver las 5" (la tarjeta del Inicio, el popup y el correo de fin de
// prueba) llega acá con ?filtro=prueba -- la prueba se demuestra con
// resultados concretos, no con un mensaje. Es un filtro aparte de los estados
// porque son las postulaciones que envió una ráfaga, en cualquier estado.
const FILTRO_PRUEBA = { valor: "PRUEBA", etiqueta: "De la prueba" };

const COLOR_ESTADO: Record<string, string> = {
  ENVIADO: "var(--status-enviado)",
  VISTO: "var(--status-visto)",
  EN_PROCESO: "var(--status-en-proceso)",
  FINALISTA: "var(--status-finalista)",
  FINALIZADO: "var(--status-finalizado)",
  RECHAZADO: "var(--status-rechazado)",
  INCOMPLETA: "var(--warn)",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  ENVIADO: "Enviada",
  VISTO: "Vista",
  EN_PROCESO: "En proceso",
  FINALISTA: "Finalista",
  FINALIZADO: "Finalizada",
  RECHAZADO: "Rechazada",
  INCOMPLETA: "Necesita tu atención",
};

export default function HistorialPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("TODAS");
  const [analiticaAvanzada, setAnaliticaAvanzada] = useState(false);

  useEffect(() => {
    // Sin useSearchParams: obliga a envolver la página en Suspense, y esto se lee una sola vez.
    if (new URLSearchParams(window.location.search).get("filtro") === "prueba") setFiltro(FILTRO_PRUEBA.valor);
  }, []);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/applications");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status} al cargar el historial`);
          return;
        }
        setApplications(data.applications ?? []);
        setAnaliticaAvanzada(data.analiticaAvanzada ?? false);
      } catch (err) {
        console.error("Error cargando historial:", err);
        setMensaje("No se pudo cargar el historial — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  const filtradas = useMemo(() => {
    return applications.filter((a) => {
      if (filtro === FILTRO_PRUEBA.valor) {
        if (!a.esDePrueba) return false;
      } else if (filtro !== "TODAS" && a.estado !== filtro) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        return (
          a.titulo.toLowerCase().includes(q) ||
          (a.empresa ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [applications, filtro, busqueda]);

  const hayIncompletas = useMemo(() => applications.some((a) => a.estado === "INCOMPLETA"), [applications]);
  const hayDePrueba = useMemo(() => applications.some((a) => a.esDePrueba), [applications]);
  // La pestaña de la prueba aparece si hubo alguna -- o si se llegó con el filtro
  // ya puesto: sin ella, quedaría un filtro activo que no se puede ver ni quitar.
  const pestanas = [
    ...FILTROS,
    ...(hayIncompletas ? [FILTRO_ATENCION] : []),
    ...(hayDePrueba || filtro === FILTRO_PRUEBA.valor ? [FILTRO_PRUEBA] : []),
  ];

  const hoy = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="ap-page-title">Mis postulaciones</h1>
          <p className="ap-page-sub">
            {hoy} · {applications.length} en total
          </p>
        </div>
        {analiticaAvanzada ? (
          <a
            className="ap-button-ghost"
            href="/api/applications/exportar"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
          >
            <Download size={14} /> Exportar CSV
          </a>
        ) : (
          <span
            title="Exportar tu historial es una función premium"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
              fontSize: 12.5, color: "var(--text-muted)", padding: "8px 14px",
              borderRadius: "var(--radius)", background: "var(--bg-elevated-2)",
            }}
          >
            <Lock size={13} /> Exportar CSV
          </span>
        )}
      </div>

      <div className="ap-toolbar">
        <input
          className="ap-search"
          placeholder="Buscar por cargo o empresa..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className="ap-filter-tabs">
          {pestanas.map((f) => (
            <button
              key={f.valor}
              className={"ap-filter-tab" + (filtro === f.valor ? " ap-filter-tab-active" : "")}
              onClick={() => setFiltro(f.valor)}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {mensaje && (
        <p style={{ color: "var(--status-rechazado)", fontSize: 13 }}>{mensaje}</p>
      )}

      <div className="ap-card">
        {cargando ? (
          <div className="ap-empty">Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div className="ap-empty-state ap-animate-in">
            <div className="ap-empty-state-icon">
              {applications.length === 0 ? <Inbox size={20} /> : <SearchX size={20} />}
            </div>
            <p className="ap-empty-state-title">
              {applications.length === 0 ? "Todavía no hay postulaciones" : "Sin resultados"}
            </p>
            <p className="ap-empty-state-sub">
              {applications.length === 0
                ? "En cuanto conectes un portal y la extensión postule a una oferta, va a aparecer acá."
                : "Ninguna postulación calza con ese filtro o búsqueda — prueba con otro término."}
            </p>
          </div>
        ) : (
          <div className="ap-log">
            <div className="ap-log__cab">
              <span />
              <span>Cargo</span>
              <span>Portal</span>
              <span>Estado</span>
              <span>Fecha</span>
            </div>
            {filtradas.map((a) => {
              const color = COLOR_ESTADO[a.estado] ?? "var(--text-muted)";
              return (
                <button
                  key={a.id}
                  type="button"
                  className="ap-log__fila"
                  style={{ ["--c" as string]: color }}
                  onClick={() => (window.location.href = `/dashboard/historial/${a.id}`)}
                >
                  <span className="ap-log__filo" />
                  <span className="ap-log__cargo">
                    <b>{a.titulo}</b>
                    <span>{a.empresa ?? "Empresa no especificada"}</span>
                    {a.estado === "INCOMPLETA" && (
                      <span style={{ display: "block", color: "var(--warn)" }}>
                        {a.notaAtencion ?? "No se pudo completar automáticamente"} — ábrela y termínala a mano
                      </span>
                    )}
                  </span>
                  <span className="ap-log__meta">{a.portal}</span>
                  <span>
                    <span
                      className="ap-badge"
                      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
                    >
                      <span className="ap-badge-dot" />
                      {ETIQUETA_ESTADO[a.estado] ?? a.estado}
                    </span>
                  </span>
                  <span className="ap-log__fecha">
                    {new Date(a.enviadaEn).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
