"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, CheckCheck, Info, Send, Sparkles, Target, Trophy } from "lucide-react";
import { SkelStats, SkelGrafico, SkelFilas } from "@/components/Esqueleto";
import { useAvisos } from "@/components/Avisos";
import {
  RUTA_VER_LAS_DE_PRUEBA,
  TEXTO_DESPUES_DE_LA_PRUEBA,
  TEXTO_PASAR_A_PREMIUM,
  textoPruebaEnCurso,
  textoPruebaTerminada,
  textoTarjetaRafaga,
  textoVerLasDePrueba,
  type UltimaRafaga,
} from "@/lib/texto-rafaga";
import { PRUEBA_TOTAL, type ModoAutomatico } from "@/lib/estado-automatico";
import BotonPonerseAlDia from "./BotonPonerseAlDia";

type Resumen = {
  postulacionesEnviadas: number;
  cambioSemanal: number;
  tasaRespuesta: number;
  tasaSobre: number;
  conMovimiento: number;
  cobertura: {
    conSeguimiento: number;
    sinSeguimiento: number;
    portalesSinSeguimiento: string[];
    portalesConSeguimiento: readonly string[];
  };
  entrevistasEsteMes: number;
  matchPromedio: number | null;
  actividad: { etiqueta: string; enviadas: number; respuestas: number }[];
  porPortal: { nombre: string; cantidad: number }[];
  embudo: { etiqueta: string; cantidad: number }[];
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
  // Va con los tokens de advertencia, no con los de estado: es una alerta,
  // no un paso más del progreso normal de la postulación.
  INCOMPLETA: { bg: "color-mix(in srgb, var(--warn) 15%, transparent)", fg: "var(--warn)" },
};

// El embudo usa los mismos colores de estado que los badges: la misma
// cosa se ve del mismo color en toda la app.
const COLOR_EMBUDO: Record<string, string> = {
  Enviadas: "var(--status-enviado)",
  Vistas: "var(--status-visto)",
  "En proceso": "var(--status-en-proceso)",
  Finalistas: "var(--status-finalista)",
  Rechazadas: "var(--status-rechazado)",
};

const PALETA_PORTALES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Rosca de reparto por portal, dibujada a mano.
 *
 * Recharts 3 no llega a emitir el <path> del sector cuando hay un solo
 * segmento (el grupo .recharts-shape queda vacío y la rosca desaparece),
 * que es justo el caso de quien tiene un portal conectado. Son cuatro
 * líneas de SVG y no dependen de la librería.
 */
function Rosca({ datos, colores }: { datos: { nombre: string; cantidad: number }[]; colores: string[] }) {
  const total = datos.reduce((a, b) => a + b.cantidad, 0);
  if (!total) return null;

  const r = 52;
  const circunferencia = 2 * Math.PI * r;
  // Separación entre arcos, solo si hay más de uno que separar.
  const hueco = datos.length > 1 ? 3 : 0;
  let acumulado = 0;

  return (
    <div style={{ display: "grid", placeItems: "center", position: "relative", height: 160 }}>
      <svg
        width={140}
        height={140}
        viewBox="0 0 140 140"
        role="img"
        aria-label={`${total} postulaciones repartidas en ${datos.length} portales`}
      >
        {datos.map((d, i) => {
          const largo = (d.cantidad / total) * circunferencia - hueco;
          const desfase = -acumulado;
          acumulado += (d.cantidad / total) * circunferencia;
          return (
            <circle
              key={d.nombre}
              cx={70}
              cy={70}
              r={r}
              fill="none"
              stroke={colores[i % colores.length]}
              strokeWidth={17}
              strokeDasharray={`${Math.max(0, largo)} ${circunferencia - Math.max(0, largo)}`}
              strokeDashoffset={desfase}
              style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
            />
          );
        })}
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          {total}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>en total</p>
      </div>
    </div>
  );
}

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
  // §3.2 (docs/revision-2026-09-16.md): la tarjeta "Tu asistente está activo"
  // decidía solo por "hay un portal conectado", mientras la barra de arriba
  // (BarraMaquina) decía "En pausa" -- dos veredictos distintos en la misma
  // pantalla. Ahora lee del mismo /api/dashboard/estado que la barra.
  const [estadoAuto, setEstadoAuto] = useState<{
    activa: boolean;
    motivo: string | null;
    ultimaRafaga: UltimaRafaga | null;
    estimadoRafagaMs: number | null;
    // docs/rafagas-y-ponerse-al-dia.md §4.1: premium | prueba | manual, y cuántas
    // postulaciones de prueba le quedan de las `pruebaTotal` (solo con "prueba").
    modo: ModoAutomatico;
    pruebaRestantes: number | null;
    pruebaTotal: number;
  } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const { error: avisarError } = useAvisos();

  useEffect(() => {
    fetch("/api/dashboard/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((e) => {
        if (e) {
          setEstadoAuto({
            activa: !!e.activa,
            motivo: e.motivo ?? null,
            ultimaRafaga: e.ultimaRafaga ?? null,
            estimadoRafagaMs: e.estimadoRafagaMs ?? null,
            modo: e.modo ?? "premium",
            pruebaRestantes: e.pruebaRestantes ?? null,
            pruebaTotal: e.pruebaTotal ?? PRUEBA_TOTAL,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/dashboard/resumen");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          avisarError("No pudimos cargar tu resumen", data.error ?? "Recarga la página en unos segundos.");
          return;
        }
        setDatos(data);
      } catch (err) {
        console.error("Error cargando resumen:", err);
        setMensaje("No se pudo cargar tu resumen.");
        avisarError("No pudimos cargar tu resumen", "Revisa tu conexión y recarga la página.");
      } finally {
        setCargando(false);
      }
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="ap-page-header" style={{ marginBottom: 0 }}>
          <h1 className="ap-page-title">Inicio</h1>
          <p className="ap-page-sub">Cargando tu actividad...</p>
        </div>
        <SkelStats />
        <div className="ap-charts-row">
          <SkelGrafico alto={220} />
          <SkelGrafico alto={220} />
        </div>
        <div className="ap-card">
          <SkelFilas n={5} />
        </div>
      </div>
    );
  }

  if (mensaje) {
    return (
      <div className="ap-empty-state">
        <div className="ap-empty-state-icon" style={{ color: "var(--err)", background: "var(--err-soft)" }}>
          <Target size={20} />
        </div>
        <p className="ap-empty-state-title">No pudimos cargar tu resumen</p>
        <p className="ap-empty-state-sub">{mensaje}</p>
        <button
          type="button"
          className="ap-button"
          style={{ marginTop: 16 }}
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </div>
    );
  }

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
      Icon: Send,
      color: "var(--chart-1)",
    },
    // docs/estado-real-de-postulaciones.md §4: acá estaba "Tasa de respuesta",
    // un porcentaje calculado sobre postulaciones que dos de los tres portales
    // no pueden mover de ENVIADO. Además de estar mal, no le sirve de nada a
    // alguien que está buscando trabajo: no puede hacer nada con un 16%.
    // Se reemplaza por lo que sí puede accionar — cuáles se movieron.
    {
      label: "Con movimiento",
      value: String(datos.conMovimiento),
      delta: null,
      up: true,
      hint: datos.conMovimiento ? "revísalas en Postulaciones" : "sin novedades todavía",
      Icon: CheckCheck,
      color: "var(--chart-2)",
    },
    {
      label: "Finalistas",
      value: String(datos.entrevistasEsteMes),
      delta: null,
      up: true,
      hint: "este mes",
      Icon: Trophy,
      color: "var(--chart-4)",
    },
    // §3.2 (docs/revision-2026-09-16.md): la tarjeta "Match promedio IA" se
    // sacó -- el número salía de JobOffer.relevanciaAi, que solo llenaba el
    // filtro de IA viejo (ya fuera de la decisión desde §1.1/§1.4), así que
    // mostraba un 69% de una fuente que el motor actual no alimenta, con la
    // palabra "IA" en una app cuya política dice que decidir a qué postular
    // no usa IA oferta por oferta.
  ];

  const totalPortal = datos.porPortal.reduce((a, b) => a + b.cantidad, 0);

  // "De cada 10 que envías, N ..." — se saca del mismo embudo que se dibuja,
  // para que el texto y las barras nunca digan cosas distintas.
  const deEmbudo = (etiqueta: string) => {
    const fila = datos.embudo.find((e) => e.etiqueta === etiqueta);
    if (!fila || !datos.postulacionesEnviadas) return "0";
    const porDiez = (fila.cantidad / datos.postulacionesEnviadas) * 10;
    return porDiez >= 1 ? String(Math.round(porDiez)) : porDiez.toFixed(1).replace(".0", "");
  };
  // Decir "activo" sin un portal conectado es mentira: no puede postular. Y
  // tampoco si está en pausa, sin cupo, o el plan no incluye la búsqueda
  // automática (§3.2): manda el mismo estado que la barra de arriba, y solo si
  // todavía no cargó se cae al criterio viejo (portal conectado).
  const asistenteActivo = estadoAuto ? estadoAuto.activa : datos.portalesActivos > 0;
  const totalPrueba = estadoAuto?.pruebaTotal ?? PRUEBA_TOTAL;
  const textoInactivo: Record<string, { t: string; d: string; href?: string; cta?: string; extra?: { href: string; cta: string } }> = {
    pausada: { t: "Tu búsqueda automática está en pausa", d: "Reanúdala desde la barra de arriba y vuelve a ponerse al día sola." },
    // §4.1: la prueba se demuestra con resultados concretos -- "Ver las 5" lleva
    // al historial filtrado, y las dos salidas (Premium, o entrar a mano a un
    // portal) se dicen sin rodeos.
    "prueba-terminada": {
      t: textoPruebaTerminada(totalPrueba),
      d: TEXTO_DESPUES_DE_LA_PRUEBA,
      href: "/dashboard/premium",
      cta: TEXTO_PASAR_A_PREMIUM,
      extra: { href: RUTA_VER_LAS_DE_PRUEBA, cta: textoVerLasDePrueba(totalPrueba) },
    },
    "sin-cupo": { t: "Sin cupo este mes", d: "Se reinicia el día 1. Entretanto puedes ir completando tu perfil.", href: "/dashboard/premium", cta: "Ampliar cupo" },
  };
  const inactivoInfo = estadoAuto?.motivo ? textoInactivo[estadoAuto.motivo] : undefined;
  // docs/rafagas-y-ponerse-al-dia.md §3.5: cuando la búsqueda automática SÍ
  // está activa, la tarjeta ya no dice "Tu asistente está activo" (eso no dice
  // nada que la persona pueda comprobar) sino cuándo se puso al día por última
  // vez y qué encontró -- o, si hace más de 48 h, qué hacer. Sin el estado
  // cargado todavía no se sabe nada de eso: no se inventa un "todavía no se
  // puso al día" que parpadee y se corrija.
  const tarjetaRafaga = estadoAuto && asistenteActivo ? textoTarjetaRafaga(estadoAuto.ultimaRafaga, new Date()) : null;

  return (
    <div className="ap-glow-bg" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ap-page-header" style={{ marginBottom: 0 }}>
        <h1 className="ap-page-title">Inicio</h1>
        <p className="ap-page-sub">
          Tu actividad de postulación de un vistazo · {hoy}
        </p>
      </div>

      {/* Stats */}
      <div className="ap-metricas">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="ap-card ap-animate-in"
            style={{ padding: 20, animationDelay: `${i * 0.05}s`, borderTop: `2.5px solid ${s.color}` }}
          >
            <div
              style={{
                width: 26, height: 26, borderRadius: 7, marginBottom: 10,
                background: `color-mix(in oklch, ${s.color} 16%, transparent)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <s.Icon size={14} color={s.color} strokeWidth={2.2} />
            </div>
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

      {/* Embudo + reparto por portal: las dos terminan parejas de alto */}
      <div className="ap-fila-2 ap-split--parejo">
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.15s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>De enviada a finalista</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            Dónde se te quedan las postulaciones
          </p>

          {/* docs/estado-real-de-postulaciones.md §4: el embudo se arma con lo
              que reportan los portales, y dos de los tres no reportan nada. Sin
              decirlo, estos números se leen como la realidad completa -- y la
              entrevista que se coordinó por correo no aparece en ninguno. */}
          {datos.cobertura.sinSeguimiento > 0 && (
            <p className="ap-cobertura">
              <Info size={13} />
              <span>
                Esto sale de lo que reportan los portales.{" "}
                <b>{datos.cobertura.portalesSinSeguimiento.join(" y ")}</b>{" "}
                {datos.cobertura.portalesSinSeguimiento.length > 1 ? "no avisan" : "no avisa"} cuando algo
                cambia, así que {datos.cobertura.sinSeguimiento} de tus {datos.cobertura.sinSeguimiento + datos.cobertura.conSeguimiento}{" "}
                postulaciones se quedan en «Enviada» aunque hayan avanzado. Lo que te escriban por
                correo o teléfono tampoco se ve acá.
              </span>
            </p>
          )}

          <div className="ap-embudo">
            {datos.embudo.map(({ etiqueta, cantidad }) => (
              <div
                key={etiqueta}
                className="ap-embudo__fila"
                style={{ color: COLOR_EMBUDO[etiqueta] ?? "var(--text-muted)" }}
              >
                <span className="ap-embudo__lab"><i />{etiqueta}</span>
                <span className="ap-embudo__pista">
                  <span
                    className="ap-embudo__relleno"
                    style={{
                      width: datos.postulacionesEnviadas
                        ? `${(cantidad / datos.postulacionesEnviadas) * 100}%`
                        : "0%",
                    }}
                  />
                </span>
                <span className="ap-embudo__n">{cantidad}</span>
              </div>
            ))}
          </div>

          {datos.postulacionesEnviadas > 0 && (
            <p
              style={{
                marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)",
                fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6,
              }}
            >
              De cada 10 que envías,{" "}
              <b style={{ color: "var(--text)" }}>{deEmbudo("Vistas")} las abre la empresa</b> y{" "}
              <b style={{ color: "var(--text)" }}>{deEmbudo("Finalistas")} llega a finalista</b>.
            </p>
          )}
        </div>

        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.25s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Por portal</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Distribución de postulaciones</p>
          <Rosca datos={datos.porPortal} colores={PALETA_PORTALES} />
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

      {/* Actividad de la semana, a lo ancho */}
      <div style={{ marginBottom: 16 }}>
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.2s" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Actividad de la semana</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Postulaciones enviadas y respuestas recibidas
              </p>
            </div>
            {/* Sin esto las dos áreas de color no decían cuál era cuál. */}
            <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                {[
                  { t: "Enviadas", c: "var(--chart-1)" },
                  { t: "Respuestas", c: "var(--chart-2)" },
              ].map(({ t, c }) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

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

      </div>

      {/* Recientes + asistente */}
      <div className="ap-fila-2">
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.3s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Postulaciones recientes</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Las últimas gestionadas por tu asistente
          </p>
          {datos.recientes.length === 0 && (
            <div className="ap-empty-state" style={{ padding: "36px 20px" }}>
              <div className="ap-empty-state-icon">
                <CheckCheck size={20} />
              </div>
              <p className="ap-empty-state-title">Acá va a aparecer cada postulación</p>
              <p className="ap-empty-state-sub">
                Con su portal y su fecha, y con su estado cuando el portal lo informa: enviada,
                vista, en proceso o finalista.
              </p>
            </div>
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
            <h2 style={{ marginTop: 12, fontSize: 13.5, fontWeight: 600 }}>
              {asistenteActivo ? tarjetaRafaga?.t ?? "Revisando el estado…" : inactivoInfo?.t ?? "Tu asistente todavía no postula"}
            </h2>
            <p style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {asistenteActivo
                ? tarjetaRafaga?.d ?? ""
                : inactivoInfo?.d ??
                  "Le falta un portal conectado para empezar a trabajar. Entretanto puedes ir completando tu perfil: mientras más entrenado, más tuyas suenan las respuestas."}
            </p>
            {/* §4.1: mientras dura la prueba, cuántas lleva -- visible aunque hoy esté
                en pausa, para que se entienda qué es lo que se pausó. */}
            {estadoAuto?.modo === "prueba" && estadoAuto.pruebaRestantes !== null && (
              <p style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>
                {textoPruebaEnCurso(estadoAuto.pruebaRestantes, totalPrueba)}
              </p>
            )}
            {!asistenteActivo && (!inactivoInfo || inactivoInfo.href) && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {inactivoInfo?.extra && (
                  <Link className="ap-button-ghost" href={inactivoInfo.extra.href}>
                    {inactivoInfo.extra.cta}
                  </Link>
                )}
                <Link className="ap-button-ghost" href={inactivoInfo?.href ?? "/dashboard/portales"}>
                  {inactivoInfo?.cta ?? "Conectar un portal"}
                </Link>
              </div>
            )}
            {/* docs/rafagas-y-ponerse-al-dia.md §3.6: solo Premium. `activa` exige que
                se pueda buscar solo (plan, o la prueba de una cuenta gratis), no esté
                en pausa, quede cupo y haya un portal conectado; el botón además pide
                `modo === "premium"`: en el plan gratis no existe, ni durante la prueba. */}
            {estadoAuto?.activa && estadoAuto.modo === "premium" && (
              <BotonPonerseAlDia estimadoMs={estadoAuto.estimadoRafagaMs} />
            )}
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
              {/* "Monitoreando" prometía una vigilancia continua que las ráfagas
                  no son: se pone al día al abrir el computador, no mira todo el día. */}
              {datos.portalesActivos === 0
                ? "Sin portales conectados"
                : datos.portalesActivos === 1
                  ? "1 portal conectado"
                  : `${datos.portalesActivos} portales conectados`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
