"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, SearchX, Download, Lock } from "lucide-react";
import { GRUPOS_ESTADO, colorEstado, fraseEstado } from "@/lib/palabras-estado";
import Cajon from "./Cajon";
import SupisteAlgo from "./SupisteAlgo";

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
  // El estado lo contó la persona ("¿Supiste algo?"), no el portal.
  contadoPorTi: boolean;
};

// §4.1: "Ver las 5" (la tarjeta del Hoy, el popup y el correo de fin de
// prueba) llega acá con ?filtro=prueba -- la prueba se demuestra con
// resultados concretos, no con un mensaje. Es un filtro aparte de los estados
// porque son las postulaciones que envió una ráfaga, en cualquier estado.
const FILTRO_PRUEBA = { valor: "PRUEBA", etiqueta: "De la prueba" };


export default function HistorialPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("TODAS");
  const [analiticaAvanzada, setAnaliticaAvanzada] = useState(false);
  // La postulación abierta en el panel lateral (?ver=<id> la abre al llegar).
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    // Sin useSearchParams: obliga a envolver la página en Suspense, y esto se lee una sola vez.
    const q = new URLSearchParams(window.location.search);
    if (q.get("filtro") === "prueba") setFiltro(FILTRO_PRUEBA.valor);
    else if (q.get("filtro") === "INCOMPLETA") setFiltro("NO_ENVIADAS");
    const ver = q.get("ver");
    if (ver) setAbierta(ver);
  }, []);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/applications");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status} al cargar tus postulaciones`);
          return;
        }
        setApplications(data.applications ?? []);
        setAnaliticaAvanzada(data.analiticaAvanzada ?? false);
      } catch (err) {
        console.error("Error cargando postulaciones:", err);
        setMensaje("No se pudieron cargar tus postulaciones. Recarga la página.");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  const abrir = useCallback((id: string) => {
    setAbierta(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("ver", id);
      window.history.replaceState(null, "", url);
    } catch {}
  }, []);

  const cerrar = useCallback(() => {
    setAbierta(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("ver");
      window.history.replaceState(null, "", url);
    } catch {}
  }, []);

  // Lo que cuenta la persona (en "¿Supiste algo?" o en el detalle) se refleja
  // de una en la lista, sin volver a pedirla entera.
  const alContar = useCallback((id: string, estado: string | null) => {
    if (!estado) return;
    setApplications((as) => as.map((a) => (a.id === id ? { ...a, estado, contadoPorTi: true } : a)));
  }, []);

  const cuenta = useCallback(
    (estados: string[] | null) => (estados ? applications.filter((a) => estados.includes(a.estado)).length : applications.length),
    [applications],
  );

  const filtradas = useMemo(() => {
    const grupo = GRUPOS_ESTADO.find((g) => g.valor === filtro);
    return applications.filter((a) => {
      if (filtro === FILTRO_PRUEBA.valor) {
        if (!a.esDePrueba) return false;
      } else if (grupo?.estados && !grupo.estados.includes(a.estado)) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        return a.titulo.toLowerCase().includes(q) || (a.empresa ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [applications, filtro, busqueda]);

  const hayDePrueba = useMemo(() => applications.some((a) => a.esDePrueba), [applications]);
  const conNovedades = cuenta(["VISTO", "EN_PROCESO", "ENTREVISTA", "FINALISTA"]);
  // "No se enviaron" solo aparece si hay alguna (o si se llegó con ese filtro
  // puesto): sin eso, quedaría un filtro activo que no se puede ver ni quitar.
  // La pestaña de la prueba, igual.
  const pestanas = [
    ...GRUPOS_ESTADO.filter((g) => g.valor !== "NO_ENVIADAS" || cuenta(g.estados) > 0 || filtro === g.valor).map((g) => ({
      valor: g.valor,
      etiqueta: `${g.etiqueta} · ${cuenta(g.estados)}`,
    })),
    ...(hayDePrueba || filtro === FILTRO_PRUEBA.valor
      ? [{ valor: FILTRO_PRUEBA.valor, etiqueta: `${FILTRO_PRUEBA.etiqueta} · ${applications.filter((a) => a.esDePrueba).length}` }]
      : []),
  ];

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="ap-page-title">Postulaciones</h1>
          <p className="ap-page-sub">
            {applications.length} en total
            {conNovedades > 0 && ` · ${conNovedades} con novedades`}
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

      <SupisteAlgo alContar={alContar} />

      <div className="ap-toolbar">
        <input
          className="ap-search"
          placeholder="Buscar por cargo o empresa..."
          aria-label="Buscar por cargo o empresa"
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

      {mensaje && <p style={{ color: "var(--status-rechazado)", fontSize: 13 }}>{mensaje}</p>}

      {cargando ? (
        <div className="ap-card"><div className="ap-empty">Cargando...</div></div>
      ) : filtradas.length === 0 ? (
        <div className="ap-card">
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
        </div>
      ) : (
        <div className="ap-log ap-log--frases">
          <div className="ap-log__cab">
            <span />
            <span>Cargo</span>
            <span>Portal</span>
            <span>Estado</span>
            <span>Fecha</span>
          </div>
          {filtradas.map((a) => {
            const color = colorEstado(a.estado);
            return (
              <button
                key={a.id}
                type="button"
                className="ap-log__fila"
                style={{ ["--c" as string]: color }}
                onClick={() => abrir(a.id)}
              >
                <span className="ap-log__filo" />
                <span className="ap-log__cargo">
                  <b>{a.titulo}</b>
                  <span>{a.empresa ?? "Empresa no especificada"}</span>
                </span>
                <span className="ap-log__meta">{a.portal}</span>
                <span className="ap-estado-f">
                  <span className="ap-badge" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
                    <span className="ap-badge-dot" />
                    {fraseEstado(a.estado)}
                  </span>
                  {a.contadoPorTi && a.estado !== "INCOMPLETA" && <small>Lo contaste tú</small>}
                  {a.estado === "INCOMPLETA" && (
                    <small>
                      {a.notaAtencion ?? "No se pudo completar sola"} · <b>hay que terminarla en el portal</b>
                    </small>
                  )}
                </span>
                <span className="ap-log__fecha">
                  {new Date(a.enviadaEn).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {abierta && <Cajon id={abierta} onCerrar={cerrar} alContar={alContar} />}
    </div>
  );
}
