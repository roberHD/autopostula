"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  Cell,
  Pie,
  PieChart,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";

type Resumen = {
  postulacionesEnviadas: number;
  cambioSemanal: number;
  tasaRespuesta: number;
  entrevistasEsteMes: number;
  matchPromedio: number | null;
  actividad: { etiqueta: string; enviadas: number; respuestas: number }[];
  porPortal: { nombre: string; cantidad: number }[];
  perfilEntrenado: number;
  portalesActivos: number;
  recientes: {
    id: string;
    titulo: string;
    empresa: string | null;
    portal: string;
    estado: string;
    match: number | null;
  }[];
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

// Mismo criterio que StatusBadge del repomix: fondo suave + texto del color del estado.
const ESTILO_BADGE: Record<string, { bg: string; fg: string }> = {
  ENVIADO: { bg: "var(--bg-elevated-2)", fg: "var(--status-enviado)" },
  VISTO: { bg: "color-mix(in oklch, var(--status-visto) 15%, transparent)", fg: "var(--status-visto)" },
  EN_PROCESO: { bg: "color-mix(in oklch, var(--status-en-proceso) 18%, transparent)", fg: "var(--status-en-proceso)" },
  FINALISTA: { bg: "color-mix(in oklch, var(--status-finalista) 18%, transparent)", fg: "var(--status-finalista)" },
  FINALIZADO: { bg: "color-mix(in oklch, var(--status-finalizado) 18%, transparent)", fg: "var(--status-finalizado)" },
  RECHAZADO: { bg: "color-mix(in oklch, var(--status-rechazado) 15%, transparent)", fg: "var(--status-rechazado)" },
  // Ámbar fijo (no una variable del theme) porque es un estado de advertencia,
  // no un paso más del progreso normal de la postulación.
  INCOMPLETA: { bg: "rgba(217,119,6,0.12)", fg: "#D97706" },
};

const PALETA_PORTALES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Badge({ estado }: { estado: string }) {
  const s = ESTILO_BADGE[estado] ?? ESTILO_BADGE.ENVIADO;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.8 }} />
      {ETIQUETA_ESTADO[estado] ?? estado}
    </span>
  );
}

export default function InicioPage() {
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/dashboard/resumen");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          return;
        }
        setDatos(data);
      } catch (err) {
        console.error("Error cargando resumen:", err);
        setMensaje("No se pudo cargar — revisa la consola");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  if (cargando) return <div className="ap-empty">Cargando...</div>;
  if (mensaje) return <p style={{ color: "var(--status-rechazado)", fontSize: 13 }}>{mensaje}</p>;
  if (!datos) return null;

  const hoy = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stats = [
    {
      label: "Postulaciones enviadas",
      value: String(datos.postulacionesEnviadas),
      delta: `${Math.abs(datos.cambioSemanal)}%`,
      up: datos.cambioSemanal >= 0,
      hint: "vs. semana anterior",
    },
    {
      label: "Tasa de respuesta",
      value: `${datos.tasaRespuesta}%`,
      delta: null,
      up: true,
      hint: "empresas que respondieron",
    },
    {
      label: "Finalistas",
      value: String(datos.entrevistasEsteMes),
      delta: null,
      up: true,
      hint: "este mes",
    },
    {
      label: "Match promedio IA",
      value: datos.matchPromedio != null ? `${datos.matchPromedio}%` : "—",
      delta: null,
      up: true,
      hint: "afinidad con ofertas",
    },
  ];

  const totalPortal = datos.porPortal.reduce((a, b) => a + b.cantidad, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ap-page-header" style={{ marginBottom: 0 }}>
        <h1 className="ap-page-title">Inicio</h1>
        <p className="ap-page-sub" style={{ textTransform: "capitalize" }}>
          Tu actividad de postulación de un vistazo · {hoy}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="ap-card ap-animate-in"
            style={{ padding: 20, animationDelay: `${i * 0.05}s` }}
          >
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>{s.label}</p>
            <div style={{ marginTop: 8, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{s.value}</span>
              {s.delta && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: 12,
                    fontWeight: 500,
                    color: s.up ? "var(--status-finalizado)" : "var(--status-rechazado)",
                  }}
                >
                  {s.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {s.delta}
                </span>
              )}
            </div>
            <p style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Actividad + Por portal */}
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "2fr 1fr" }} className="ap-charts-row">
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.2s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Actividad de la semana</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Postulaciones enviadas y respuestas recibidas
          </p>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={datos.actividad} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gEnviadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRespuestas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="etiqueta"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text)", fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="enviadas"
                  name="Enviadas"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#gEnviadas)"
                  animationDuration={900}
                />
                <Area
                  type="monotone"
                  dataKey="respuestas"
                  name="Respuestas"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fill="url(#gRespuestas)"
                  animationDuration={900}
                  animationBegin={150}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.25s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Por portal</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Distribución de postulaciones</p>
          <div style={{ display: "flex", justifyContent: "center", position: "relative", height: 160 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={datos.porPortal}
                  dataKey="cantidad"
                  nameKey="nombre"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={3}
                  stroke="none"
                  animationDuration={600}
                >
                  {datos.porPortal.map((p, i) => (
                    <Cell key={p.nombre} fill={PALETA_PORTALES[i % PALETA_PORTALES.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 600 }}>{totalPortal}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>total</span>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {datos.porPortal.map((p, i) => (
              <div key={p.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: PALETA_PORTALES[i % PALETA_PORTALES.length],
                    }}
                  />
                  <span style={{ color: "var(--text-muted)" }}>{p.nombre}</span>
                </span>
                <span style={{ fontWeight: 500 }}>{p.cantidad}</span>
              </div>
            ))}
            {datos.porPortal.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sin postulaciones todavía</p>
            )}
          </div>
        </div>
      </div>

      {/* Recientes + asistente */}
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "2fr 1fr" }} className="ap-charts-row">
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.3s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Postulaciones recientes</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Las últimas gestionadas por tu asistente
          </p>
          {datos.recientes.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Todavía no hay postulaciones.</p>
          )}
          <div>
            {datos.recientes.map((r, i) => (
              <div
                key={r.id}
                onClick={() => (window.location.href = `/dashboard/historial/${r.id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: i < datos.recientes.length - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.titulo}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.empresa ?? "—"} · {r.portal}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  {r.match != null && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Match {Math.round(r.match)}%</span>
                  )}
                  <Badge estado={r.estado} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="ap-animate-in"
          style={{
            animationDelay: "0.35s",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "color-mix(in oklch, var(--accent) 8%, var(--bg-elevated))",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--accent-contrast)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={18} />
            </div>
            <h2 style={{ marginTop: 12, fontSize: 13.5, fontWeight: 600 }}>Tu asistente está activo</h2>
            <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Perfil entrenado al {datos.perfilEntrenado}%. Mientras más completo, más precisas y
              personales serán las respuestas en los formularios.
            </p>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-muted)" }}>Nivel de personalización</span>
              <span style={{ fontWeight: 500 }}>{datos.perfilEntrenado}%</span>
            </div>
            <div
              style={{
                marginTop: 6,
                height: 8,
                width: "100%",
                overflow: "hidden",
                borderRadius: 999,
                background: "var(--bg-elevated-2)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--accent)",
                  width: `${datos.perfilEntrenado}%`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-muted)" }}>
              Monitoreando {datos.portalesActivos} portal(es) conectado(s)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
