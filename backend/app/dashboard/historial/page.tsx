"use client";

import { useEffect, useMemo, useState } from "react";

type Application = {
  id: string;
  titulo: string;
  empresa: string | null;
  portal: string;
  estado: string;
  enviadaEn: string;
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

const COLOR_ESTADO: Record<string, string> = {
  ENVIADO: "var(--status-enviado)",
  VISTO: "var(--status-visto)",
  EN_PROCESO: "var(--status-en-proceso)",
  FINALISTA: "var(--status-finalista)",
  FINALIZADO: "var(--status-finalizado)",
  RECHAZADO: "var(--status-rechazado)",
};

const ETIQUETA_ESTADO: Record<string, string> = {
  ENVIADO: "Enviada",
  VISTO: "Vista",
  EN_PROCESO: "En proceso",
  FINALISTA: "Finalista",
  FINALIZADO: "Finalizada",
  RECHAZADO: "Rechazada",
};

export default function HistorialPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("TODAS");

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
      if (filtro !== "TODAS" && a.estado !== filtro) return false;
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

  const hoy = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Mis postulaciones</h1>
        <p className="ap-page-sub" style={{ textTransform: "capitalize" }}>
          {hoy} · {applications.length} en total
        </p>
      </div>

      <div className="ap-toolbar">
        <input
          className="ap-search"
          placeholder="Buscar por cargo o empresa..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className="ap-filter-tabs">
          {FILTROS.map((f) => (
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
          <div className="ap-empty">
            {applications.length === 0
              ? "Todavía no hay postulaciones registradas. En cuanto la extensión postule a una oferta, va a aparecer acá."
              : "Ninguna postulación calza con ese filtro o búsqueda."}
          </div>
        ) : (
          <table className="ap-table">
            <thead>
              <tr>
                <th>Cargo / Empresa</th>
                <th>Portal</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => (window.location.href = `/dashboard/historial/${a.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <div className="ap-cargo">{a.titulo}</div>
                    <div className="ap-empresa">{a.empresa ?? "Empresa no especificada"}</div>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{a.portal}</td>
                  <td>
                    <span
                      className="ap-badge"
                      style={{
                        color: COLOR_ESTADO[a.estado] ?? "var(--text-muted)",
                        background: `color-mix(in srgb, ${COLOR_ESTADO[a.estado] ?? "#8b93a7"} 15%, transparent)`,
                      }}
                    >
                      <span className="ap-badge-dot" />
                      {ETIQUETA_ESTADO[a.estado] ?? a.estado}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {new Date(a.enviadaEn).toLocaleDateString("es-CL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
