"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Ban, Check, CircleCheck, Globe, Inbox, Info, ShieldAlert, Sparkles, Target, TriangleAlert } from "lucide-react";
import { SkelStats, SkelGrafico, SkelFilas } from "@/components/Esqueleto";
import { useAvisos } from "@/components/Avisos";
import PrimeraBusqueda, { type PrimeraVez } from "./PrimeraBusqueda";
import { COOKIE_MISION_OCULTA, EVENTO_PANEL_CAMBIO } from "@/lib/primera-busqueda";
import { usarActivarPostulacion } from "@/lib/usar-activar-postulacion";
import {
  RUTA_VER_LAS_DE_PRUEBA,
  TEXTO_DESPUES_DE_LA_PRUEBA,
  TEXTO_PASAR_A_PREMIUM,
  textoPruebaEnCurso,
  textoPruebaTerminada,
  textoVerLasDePrueba,
} from "@/lib/texto-rafaga";
import { PRUEBA_TOTAL, type ModoAutomatico } from "@/lib/estado-automatico";
import { haceCuanto } from "@/lib/tiempo";

type Hecho = {
  tipo: "postulo" | "no_envio" | "por_decidir" | "descarto";
  id: string;
  titulo: string;
  detalle: string;
  en: string;
  corregido?: boolean;
};

type Resumen = {
  nombre: string | null;
  puesta?: {
    correoVerificado: boolean;
    extensionConectada: boolean;
    postulacionHabilitada: boolean;
    portalesActivos: number;
  };
  // La tarjeta "Probemos" (docs/primera-busqueda-guiada.md §10).
  primeraVez?: PrimeraVez;
  tareas: {
    porDecidir: number;
    vencenManana: number;
    noEnviadas: number;
    sinNoticias: number;
    noEnviada: { id: string; portal: string; nota: string | null } | null;
  };
  cifras: {
    enviadasMes: number;
    descartadasMes?: number | null;
    preguntasRespondidas: number;
    minutosAhorrados: number;
  };
  hechos: Hecho[];
  busqueda: {
    objetivos: string[];
    lugares: string[];
    aceptaRemoto: boolean;
    jornada: string | null;
    modalidad: string | null;
    renta: string | null;
  };
  // docs/creditos-y-pagina-nueva.md §2.3: el desglose honesto de main sobre
  // qué se sabe y qué no (docs/estado-real-de-postulaciones.md §4 y §7).
  desglose: { etiqueta: string; cantidad: number; nota: string; accionable?: boolean }[];
  cobertura: {
    conSeguimiento: number;
    sinSeguimiento: number;
    portalesSinSeguimiento: string[];
    portalesConSeguimiento: readonly string[];
  };
  perfilEntrenado: number;
  portales: { nombre: string; activa: boolean }[];
  actividad: { etiqueta: string; enviadas: number; respuestas: number }[];
  porPortal: { nombre: string; cantidad: number }[];
};

type EstadoAuto = {
  motivo: string | null;
  modo: ModoAutomatico;
  pruebaRestantes: number | null;
  pruebaTotal: number;
  limite: number | null;
  // Cuántas habría postulado la última ráfaga, en modo solo mirar.
  habriaPostulado: number | null;
};

// Lo que devuelve /api/dashboard/estado, en lo que usa esta página.
type EstadoCrudo = {
  motivo?: string | null;
  modo?: ModoAutomatico;
  pruebaRestantes?: number | null;
  pruebaTotal?: number;
  cupo?: { limite?: number | null } | null;
  ultimaRafaga?: { resumen?: { observadas?: number } | null } | null;
};

function aEstadoAuto(e: EstadoCrudo): EstadoAuto {
  return {
    motivo: e.motivo ?? null,
    modo: e.modo ?? "premium",
    pruebaRestantes: e.pruebaRestantes ?? null,
    pruebaTotal: e.pruebaTotal ?? PRUEBA_TOTAL,
    limite: e.cupo?.limite ?? null,
    habriaPostulado: e.ultimaRafaga?.resumen?.observadas ?? null,
  };
}

/**
 * docs/optimizacion-2026-09-29.md §1: la página (page.tsx) arma esto en el
 * servidor y la página llega con los datos puestos. `ahora` es la hora del
 * servidor al armarlo: con ella se calculan la fecha del saludo y los "hace N
 * min", para que el servidor y el teléfono escriban exactamente lo mismo.
 */
export type InicialHoy = { resumen: Resumen; estado: EstadoCrudo | null; ahora: string };

// docs/optimizacion-2026-09-29.md §2: recharts pesa más que todo el resto de la
// página junta. El gráfico se baja aparte, cuando lo demás ya está a la vista.
// El contenedor de abajo guarda su alto, así que nada se mueve cuando aparece.
// El ".js" y el tipo explícito son por "moduleResolution": "NodeNext" del
// tsconfig: TypeScript pide la extensión en un import() y lo tipa como si fuera
// CommonJS; para el bundler de Next es un módulo normal con su default.
const GraficoActividad = dynamic(
  () => import("./GraficoActividad.js") as unknown as Promise<{ default: ComponentType<{ datos: Resumen["actividad"] }> }>,
  { ssr: false },
);

const PALETA_PORTALES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const NUMEROS = ["", "Una cosa te espera", "Dos cosas te esperan", "Tres cosas te esperan", "Cuatro cosas te esperan", "Cinco cosas te esperan"];

// docs/revision-2026-09-28.md §11: "sigue sola" solo si de verdad puede. Si
// falta algo para que postule, se dice qué (en el mismo orden en que se resuelve).
function textoSinPendientes(puesta: Resumen["puesta"]): string {
  if (!puesta) return "Nada pendiente. AutoPostula sigue sola.";
  if (!puesta.correoVerificado) return "Falta confirmar tu correo para que AutoPostula pueda postular.";
  if (!puesta.extensionConectada) return "Falta conectar la extensión en Chrome, en tu computador.";
  if (!puesta.portalesActivos) return "Falta conectar un portal en Portales.";
  if (!puesta.postulacionHabilitada) return "Por ahora solo mira: activa la postulación cuando confíes en lo que elige.";
  return "Nada pendiente. AutoPostula sigue sola.";
}

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
      <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`${total} postulaciones repartidas en ${datos.length} portales`}>
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
        <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{total}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>en total</p>
      </div>
    </div>
  );
}

/** "45 min", "~4 h", "~12 h". Es una estimación, y el número lo dice. */
function tiempoAhorrado(min: number): string {
  if (min < 60) return `${min} min`;
  const horas = Math.round((min / 60) * 2) / 2;
  return `~${String(horas).replace(".", ",")} h`;
}

type Tarea = {
  clave: string;
  n?: number | string;
  icono?: React.ReactNode;
  color?: string;
  titulo: string;
  detalle: string;
  acciones?: React.ReactNode;
};

// "Activar postulación" como tarea de Hoy, cuando la persona ocultó la tarjeta
// "Probemos" sin activarla (el aviso del layout no aparece en Hoy).
function ActivarDesdeHoy({ alActivar, alProbar }: { alActivar: () => void; alProbar: () => void }) {
  const { activar, activando, aviso } = usarActivarPostulacion(alActivar);
  return (
    <>
      <button type="button" className="ap-button" onClick={() => void activar()} disabled={activando}>
        {activando ? "Activando…" : "Activar postulación"}
      </button>
      <button type="button" className="ap-button-ghost" onClick={alProbar}>
        Probarla primero
      </button>
      {aviso && <p style={{ flexBasis: "100%", fontSize: 12.5, color: "var(--err)", whiteSpace: "normal" }}>{aviso}</p>}
    </>
  );
}

function armarTareas(d: Resumen, e: EstadoAuto | null): Tarea[] {
  const t: Tarea[] = [];

  if (e?.motivo === "sin-portales") {
    t.push({
      clave: "portales",
      icono: <Globe />,
      color: "var(--warn)",
      titulo: "Conecta un portal",
      detalle: "Sin un portal conectado, AutoPostula no puede revisar ofertas ni postular.",
      acciones: <Link className="ap-button" href="/dashboard/portales">Conectar</Link>,
    });
  }

  if (d.tareas.porDecidir > 0) {
    const n = d.tareas.porDecidir;
    const v = d.tareas.vencenManana;
    t.push({
      clave: "decidir",
      n,
      color: "var(--warn)",
      titulo: n === 1 ? "Oferta por decidir" : "Ofertas por decidir",
      detalle:
        (v > 0 ? `${v === n && n > 1 ? "Todas vencen" : v === 1 ? "1 vence" : `${v} vencen`} mañana. ` : "") +
        "Te toma unos minutos, también desde el celular.",
      acciones: <Link className="ap-button" href="/dashboard/por-decidir">Decidir ahora</Link>,
    });
  }

  if (d.tareas.noEnviadas > 0) {
    const n = d.tareas.noEnviadas;
    const ej = d.tareas.noEnviada;
    t.push({
      clave: "no-enviadas",
      n,
      color: "var(--err)",
      titulo: n === 1 ? "Postulación que no se envió" : "Postulaciones que no se enviaron",
      detalle:
        (n === 1 && ej?.nota ? `${ej.portal}: ${ej.nota}. ` : "Quedaron a medias y hay que terminarlas en el portal. ") +
        "No te descontaron del mes.",
      acciones: (
        <Link className="ap-button-ghost" href={n === 1 && ej ? `/dashboard/historial?ver=${ej.id}` : "/dashboard/historial?filtro=INCOMPLETA"}>
          {n === 1 ? "Ver qué faltó" : "Ver cuáles"}
        </Link>
      ),
    });
  }

  if (d.tareas.sinNoticias > 0) {
    const n = d.tareas.sinNoticias;
    t.push({
      clave: "sin-noticias",
      n,
      titulo: n === 1 ? "Postulación sin noticias" : "Postulaciones sin noticias",
      detalle: "Las enviaste hace más de 5 días. ¿Supiste algo? Con eso se ve qué te está funcionando.",
      acciones: <Link className="ap-button-ghost" href="/dashboard/historial">Contar</Link>,
    });
  }

  if (e?.motivo === "sin-cupo") {
    t.push({
      clave: "cupo",
      icono: <TriangleAlert />,
      color: "var(--warn)",
      titulo: "Usaste todas las postulaciones del mes",
      detalle: "Se reinicia el día 1. Mientras, puedes seguir decidiendo ofertas y afinando tu perfil.",
      acciones: <Link className="ap-button-ghost" href="/dashboard/premium">Ver tu plan</Link>,
    });
  }

  if (e?.motivo === "prueba-terminada") {
    const total = e.pruebaTotal;
    t.push({
      clave: "prueba-terminada",
      icono: <CircleCheck />,
      color: "var(--ok)",
      titulo: textoPruebaTerminada(total),
      detalle: TEXTO_DESPUES_DE_LA_PRUEBA,
      acciones: (
        <>
          <Link className="ap-button-ghost" href={RUTA_VER_LAS_DE_PRUEBA}>{textoVerLasDePrueba(total)}</Link>
          <Link className="ap-button" href="/dashboard/premium">{TEXTO_PASAR_A_PREMIUM}</Link>
        </>
      ),
    });
  }

  return t;
}

/**
 * "No era así": la persona dice que un descarte sí le servía. Queda como un
 * "sí" de Por decidir: la extensión la postula y el perfil aprende.
 */
function NoEraAsi({ id, corregido }: { id: string; corregido?: boolean }) {
  const { exito, error: avisarError } = useAvisos();
  const [estado, setEstado] = useState<"listo" | "enviando" | "hecho">(corregido ? "hecho" : "listo");

  async function corregir() {
    setEstado("enviando");
    try {
      const res = await fetch(`/api/descartes/${id}/corregir`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado("listo");
        avisarError("No pudimos corregirlo", data.error ?? "Vuelve a intentar en unos segundos.");
        return;
      }
      setEstado("hecho");
      exito(
        "Anotado: sí te servía",
        data.seEnvia
          ? "Se envía en cuanto tu computador tenga Chrome abierto con la extensión, y tu perfil lo tiene en cuenta desde ahora."
          : "Tu perfil lo tiene en cuenta desde ahora.",
      );
    } catch {
      setEstado("listo");
      avisarError("No pudimos corregirlo", "Revisa tu conexión e intenta de nuevo.");
    }
  }

  if (estado === "hecho") return <span className="ap-hecho__a" style={{ cursor: "default", color: "var(--ok)" }}>Corregido</span>;
  return (
    <button type="button" className="ap-hecho__a" onClick={corregir} disabled={estado === "enviando"}>
      {estado === "enviando" ? "…" : "No era así"}
    </button>
  );
}

// Lo que se ve mientras llegan los datos. Lo usa también page.tsx mientras el
// servidor los arma: es exactamente la misma pantalla de carga de siempre.
export function HoyCargando() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ap-page-header" style={{ marginBottom: 0 }}>
        <h1 className="ap-page-title">Hoy</h1>
        <p className="ap-page-sub">Cargando lo que te espera...</p>
      </div>
      <div className="ap-card"><SkelFilas n={3} /></div>
      <SkelStats />
      <div className="ap-charts-row">
        <SkelGrafico alto={220} />
        <SkelGrafico alto={220} />
      </div>
    </div>
  );
}

export default function Hoy({
  inicial,
  misionOcultaInicial = false,
  enMovilSegunServidor = null,
}: {
  inicial?: InicialHoy | null;
  // La persona ocultó la tarjeta "Probemos" (cookie, la lee el servidor).
  misionOcultaInicial?: boolean;
  enMovilSegunServidor?: boolean | null;
}) {
  const [datos, setDatos] = useState<Resumen | null>(inicial?.resumen ?? null);
  const [misionOculta, setMisionOculta] = useState(misionOcultaInicial);
  // La misma fuente que la barra de arriba (/api/dashboard/estado): las
  // tareas y la barra no pueden contar dos historias distintas.
  const [estado, setEstado] = useState<EstadoAuto | null>(inicial?.estado ? aEstadoAuto(inicial.estado) : null);
  const [cargando, setCargando] = useState(!inicial);
  const [mensaje, setMensaje] = useState("");
  const { error: avisarError } = useAvisos();

  // La tarjeta "Probemos" vuelve a pedir el día al volver del portal, para ver
  // si la extensión ya miró (docs/primera-busqueda-guiada.md §10).
  const refrescar = useCallback(async () => {
    try {
      const [resumen, estadoNuevo] = await Promise.all([fetch("/api/dashboard/resumen"), fetch("/api/dashboard/estado")]);
      if (resumen.ok) setDatos(await resumen.json());
      if (estadoNuevo.ok) setEstado(aEstadoAuto(await estadoNuevo.json()));
      window.dispatchEvent(new CustomEvent(EVENTO_PANEL_CAMBIO));
    } catch {
      // Se reintenta la próxima vez que vuelva a la pestaña.
    }
  }, []);

  const cambiarPuesta = useCallback((cambio: Partial<NonNullable<Resumen["puesta"]>>) => {
    setDatos((d) => (d && d.puesta ? { ...d, puesta: { ...d.puesta, ...cambio } } : d));
    window.dispatchEvent(new CustomEvent(EVENTO_PANEL_CAMBIO));
  }, []);

  // Con los datos del servidor no se vuelven a pedir. Sin ellos (si el
  // servidor no pudo armarlos), se piden desde acá como antes.
  useEffect(() => {
    if (inicial) return;
    fetch("/api/dashboard/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((e) => {
        if (!e) return;
        setEstado(aEstadoAuto(e));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inicial) return;
    async function cargar() {
      try {
        const res = await fetch("/api/dashboard/resumen");
        const data = await res.json();
        if (!res.ok) {
          setMensaje(data.error ?? `Error ${res.status}`);
          avisarError("No pudimos cargar tu día", data.error ?? "Recarga la página en unos segundos.");
          return;
        }
        setDatos(data);
      } catch (err) {
        console.error("Error cargando Hoy:", err);
        setMensaje("No se pudo cargar tu día.");
        avisarError("No pudimos cargar tu día", "Revisa tu conexión y recarga la página.");
      } finally {
        setCargando(false);
      }
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) {
    return <HoyCargando />;
  }

  if (mensaje || !datos) {
    return (
      <div className="ap-empty-state">
        <div className="ap-empty-state-icon" style={{ color: "var(--err)", background: "var(--err-soft)" }}>
          <Target size={20} />
        </div>
        <p className="ap-empty-state-title">No pudimos cargar tu día</p>
        <p className="ap-empty-state-sub">{mensaje || "Recarga la página en unos segundos."}</p>
        <button type="button" className="ap-button" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  // En hora de Chile: el servidor corre en UTC y de noche daría otro día.
  const ahora = inicial ? new Date(inicial.ahora) : new Date();
  const hoy = ahora.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" });
  const hoyTitulo = hoy.charAt(0).toUpperCase() + hoy.slice(1);
  // docs/primera-busqueda-guiada.md §10: una cuenta que todavía no activa la
  // postulación no ve un tablero en cero, ve la tarjeta "Probemos". Mientras
  // está, no hay tareas ni cifras: todo lo que hay que hacer está en sus pasos.
  const mision = !!datos.primeraVez && !!datos.puesta && !datos.puesta.postulacionHabilitada && !misionOculta;
  const tareas = mision ? [] : armarTareas(datos, estado);
  if (!mision && datos.puesta && !datos.puesta.postulacionHabilitada) {
    tareas.unshift({
      clave: "activar",
      icono: <ShieldAlert />,
      color: "var(--accent)",
      titulo: "Todavía no activas la postulación",
      detalle: "La extensión mira tus ofertas y te dice qué haría con cada una, pero no envía ninguna hasta que la actives.",
      acciones: (
        <ActivarDesdeHoy
          alActivar={() => cambiarPuesta({ postulacionHabilitada: true })}
          alProbar={() => {
            document.cookie = `${COOKIE_MISION_OCULTA}=; path=/; max-age=0; samesite=lax`;
            setMisionOculta(false);
          }}
        />
      ),
    });
  }
  const pendientes = tareas.length;
  // "Postula sola hasta completar las 5" no es cierto mientras no se active.
  const pruebaEnCurso =
    !mision && datos.puesta?.postulacionHabilitada !== false && estado?.modo === "prueba" && estado.pruebaRestantes !== null;
  const b = datos.busqueda;
  const chips = [
    ...b.lugares,
    ...(b.aceptaRemoto ? ["Acepta remoto"] : []),
    ...(b.jornada ? [b.jornada] : []),
    ...(b.modalidad ? [b.modalidad] : []),
    ...(b.renta ? [`Renta: ${b.renta}`] : []),
  ];

  return (
    <div className="ap-glow-bg" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="ap-page-header" style={{ marginBottom: 0 }}>
        <h1 className="ap-page-title">{datos.nombre ? `Hola, ${datos.nombre}` : "Hola"}</h1>
        <p className="ap-page-sub ap-hoy-sub">
          {hoyTitulo} ·{" "}
          {mision ? (
            <>Antes de que postule por ti, mira qué haría con ofertas reales.</>
          ) : pendientes > 0 ? (
            <>
              <b>{NUMEROS[pendientes] ?? `${pendientes} cosas te esperan`}.</b> Del resto se encarga AutoPostula.
            </>
          ) : (
            <>{textoSinPendientes(datos.puesta)}</>
          )}
        </p>
      </div>

      {mision && datos.primeraVez && datos.puesta && (
        <PrimeraBusqueda
          correoVerificado={datos.puesta.correoVerificado}
          extensionConectada={datos.puesta.extensionConectada}
          primeraVez={datos.primeraVez}
          porDecidir={datos.tareas.porDecidir}
          habriaPostulado={estado?.habriaPostulado ?? null}
          modo={estado?.modo ?? null}
          pruebaTotal={estado?.pruebaTotal ?? PRUEBA_TOTAL}
          lugares={datos.busqueda.lugares}
          jornada={datos.busqueda.jornada}
          enMovilSegunServidor={enMovilSegunServidor}
          refrescar={refrescar}
          alConectar={() => cambiarPuesta({ extensionConectada: true })}
          alActivar={() => cambiarPuesta({ postulacionHabilitada: true })}
          alOcultar={() => setMisionOculta(true)}
        />
      )}

      {/* Lo que te necesita: lo primero que se lee es qué hacer hoy. */}
      {(pendientes > 0 || pruebaEnCurso) && (
        <div className="ap-card ap-tareas ap-animate-in">
          {tareas.map((t) => (
            <div className="ap-tarea" key={t.clave} style={t.color ? ({ "--c": t.color } as React.CSSProperties) : undefined}>
              <span className="ap-tarea__n ap-tnum">
                {t.n !== undefined ? (
                  <>
                    {t.n}
                    <i />
                  </>
                ) : (
                  t.icono
                )}
              </span>
              <div>
                <p className="ap-tarea__t">{t.titulo}</p>
                <p className="ap-tarea__d">{t.detalle}</p>
              </div>
              {t.acciones && <div className="ap-tarea__acc">{t.acciones}</div>}
            </div>
          ))}
          {pruebaEnCurso && estado && (
            <div className="ap-tarea" style={{ "--c": "var(--ok)" } as React.CSSProperties}>
              <span className="ap-tarea__n"><Sparkles /></span>
              <div>
                <p className="ap-tarea__t">{textoPruebaEnCurso(estado.pruebaRestantes ?? 0, estado.pruebaTotal)}</p>
                <p className="ap-tarea__d">Postula sola hasta completar las {estado.pruebaTotal}, sin que entres a ningún portal.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tres cifras del mes (con la tarjeta "Probemos" serían tres ceros) */}
      {!mision && (
      <div className="ap-metricas ap-metricas--3">
        <div className="ap-card ap-metrica ap-animate-in" style={{ borderTop: "2.5px solid var(--chart-1)" }}>
          <p className="ap-metrica__l">Enviadas</p>
          <p className="ap-metrica__v">{datos.cifras.enviadasMes}</p>
          <p className="ap-metrica__h">{estado?.limite ? `de ${estado.limite} este mes` : "este mes"}</p>
        </div>
        <div className="ap-card ap-metrica ap-animate-in" style={{ borderTop: "2.5px solid var(--chart-2)", animationDelay: "0.05s" }}>
          <p className="ap-metrica__l">Descartadas con razón</p>
          <p className="ap-metrica__v">{datos.cifras.descartadasMes ?? "—"}</p>
          <p className="ap-metrica__h">
            {datos.cifras.descartadasMes != null ? "no calzaban contigo, este mes" : "se cuentan desde que actualices la extensión"}
          </p>
        </div>
        <div className="ap-card ap-metrica ap-animate-in" style={{ borderTop: "2.5px solid var(--chart-3)", animationDelay: "0.1s" }}>
          <p className="ap-metrica__l">Formularios ahorrados</p>
          <p className="ap-metrica__v">{tiempoAhorrado(datos.cifras.minutosAhorrados)}</p>
          <p className="ap-metrica__h">
            {datos.cifras.preguntasRespondidas} {datos.cifras.preguntasRespondidas === 1 ? "pregunta" : "preguntas"} este mes · estimado: 3 min cada una
          </p>
        </div>
      </div>
      )}

      {/* Sobre qué se sabe y sobre qué no (docs/estado-real-de-postulaciones.md
          §4 y §7): reemplaza al porcentaje de respuesta, que mezclaba postulaciones
          reales con las que ningún portal reporta. Solo se muestra si hay algo que decir. */}
      {!mision && (datos.desglose.length > 0 || datos.cobertura.sinSeguimiento > 0) && (
        <div className="ap-card ap-animate-in" style={{ padding: 20 }}>
          <p className="ap-bloque-t">Sobre qué se sabe</p>
          {datos.desglose.length > 0 && (
            <ul className="ap-desglose">
              {datos.desglose.map((f) => (
                <li key={f.etiqueta} className={"ap-desglose__fila" + (f.accionable ? " ap-desglose__fila--accion" : "")}>
                  <span className="ap-desglose__n ap-tnum">{f.cantidad}</span>
                  <span className="ap-desglose__txt">
                    <b>{f.etiqueta}</b>
                    <i>{f.nota}</i>
                  </span>
                  {f.accionable && (
                    <Link href="/dashboard/historial" className="ap-desglose__cta">
                      Contarles
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
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
        </div>
      )}

      {/* Lo último que hizo · lo que buscas · tus portales */}
      <div className="ap-fila-2 ap-split--parejo" style={{ marginBottom: 0 }}>
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.12s" }}>
          <div className="ap-bloque-cab">
            <div>
              <p className="ap-bloque-t">Lo último que hizo</p>
              <p className="ap-bloque-s">Cada cosa con su razón</p>
            </div>
            <Link href="/dashboard/historial">Ver todo</Link>
          </div>
          {datos.hechos.length === 0 ? (
            <div className="ap-empty-state" style={{ padding: "32px 20px" }}>
              <div className="ap-empty-state-icon"><Check size={20} /></div>
              <p className="ap-empty-state-title">Todavía no hay actividad</p>
              <p className="ap-empty-state-sub">Apenas AutoPostula revise ofertas, acá aparece qué hizo con cada una.</p>
            </div>
          ) : (
            <div>
              {datos.hechos.map((h) => {
                const conf =
                  h.tipo === "postulo"
                    ? { c: "var(--ok)", icono: <Check />, verbo: "Postuló a", accion: "Ver respuestas", href: `/dashboard/historial?ver=${h.id}`, aviso: false }
                    : h.tipo === "no_envio"
                      ? { c: "var(--err)", icono: <TriangleAlert />, verbo: "No pudo enviar", accion: "Ver qué faltó", href: `/dashboard/historial?ver=${h.id}`, aviso: true }
                      : h.tipo === "descarto"
                        ? { c: "var(--text-muted)", icono: <Ban />, verbo: "Descartó", accion: "", href: "", aviso: false }
                        : { c: "var(--warn)", icono: <Inbox />, verbo: "Te dejó para decidir", accion: "Decidir", href: "/dashboard/por-decidir", aviso: false };
                return (
                  <div className="ap-hecho" key={`${h.tipo}-${h.id}`} style={{ "--c": conf.c } as React.CSSProperties}>
                    <span className="ap-hecho__ico">{conf.icono}</span>
                    <div style={{ minWidth: 0 }}>
                      <p className="ap-hecho__t">
                        {conf.verbo} <b>{h.titulo}</b>
                      </p>
                      {h.detalle && <p className="ap-hecho__m">{h.detalle}</p>}
                    </div>
                    {h.tipo === "descarto" ? (
                      <NoEraAsi id={h.id} corregido={h.corregido} />
                    ) : (
                      <Link className={`ap-hecho__a${conf.aviso ? " ap-hecho__a--aviso" : ""}`} href={conf.href}>
                        {conf.accion}
                      </Link>
                    )}
                    <span className="ap-hecho__h">{haceCuanto(h.en, ahora)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="ap-columna">
          <div className="ap-card ap-lado ap-animate-in" style={{ animationDelay: "0.16s" }}>
            <div className="ap-bloque-cab">
              <p className="ap-bloque-t">Lo que buscas</p>
              <Link href="/dashboard/filtros">Editar</Link>
            </div>
            {b.objetivos.length > 0 ? (
              <>
                <p className="ap-lado__obj">{b.objetivos[0]}</p>
                {b.objetivos.length > 1 && (
                  <p className="ap-bloque-s" style={{ marginTop: -6, marginBottom: 10 }}>También: {b.objetivos.slice(1).join(", ")}</p>
                )}
              </>
            ) : (
              <p className="ap-bloque-s" style={{ margin: "10px 0" }}>
                Todavía no nos dices qué buscas. <Link className="ap-enlace" href="/dashboard/filtros">Cuéntanos</Link>
              </p>
            )}
            {chips.length > 0 && (
              <div className="ap-tags">
                {chips.map((c) => <span className="ap-tag" key={c}>{c}</span>)}
              </div>
            )}
            <div className="ap-afinado">
              <div className="ap-afinado__fila">
                <span>Qué tan tuyas suenan las respuestas</span>
                <span className="ap-tnum">{datos.perfilEntrenado}%</span>
              </div>
              <div className="ap-afinado__barra"><i style={{ width: `${datos.perfilEntrenado}%` }} /></div>
              <p className="ap-afinado__nota">
                Sube conversando con la IA en <Link className="ap-enlace" href="/dashboard/perfil/conversacion">Entrenar IA</Link>.
              </p>
            </div>
          </div>

          <div className="ap-card ap-lado ap-animate-in" style={{ animationDelay: "0.2s" }}>
            <div className="ap-bloque-cab">
              <p className="ap-bloque-t">Tus portales</p>
              <Link href="/dashboard/portales">Ver</Link>
            </div>
            {datos.portales.length === 0 ? (
              <p className="ap-bloque-s" style={{ marginTop: 8 }}>
                Ninguno conectado. <Link className="ap-enlace" href="/dashboard/portales">Conectar un portal</Link>
              </p>
            ) : (
              datos.portales.map((p) => (
                <div className="ap-portal-fila" key={p.nombre} style={{ "--c": p.activa ? "var(--ok)" : "var(--text-muted)" } as React.CSSProperties}>
                  <i />
                  <span>{p.nombre}</span>
                  <span>{p.activa ? "Conectado" : "Desactivado"}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Actividad de la semana y reparto por portal: se quedan como estaban
          (salvo con la tarjeta "Probemos": serían dos gráficos vacíos) */}
      {!mision && (
      <div className="ap-fila-2 ap-split--parejo">
        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.24s" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Actividad de la semana</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Postulaciones enviadas y respuestas recibidas</p>
            </div>
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
          <div style={{ height: 240 }}>
            <GraficoActividad datos={datos.actividad} />
          </div>
        </div>

        <div className="ap-card ap-animate-in" style={{ padding: 20, animationDelay: "0.28s" }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Por portal</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Distribución de postulaciones</p>
          <Rosca datos={datos.porPortal} colores={PALETA_PORTALES} />
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {datos.porPortal.map((p, i) => (
              <div key={p.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: PALETA_PORTALES[i % PALETA_PORTALES.length] }} />
                  <span style={{ color: "var(--text-muted)" }}>{p.nombre}</span>
                </span>
                <span style={{ fontWeight: 500 }}>{p.cantidad}</span>
              </div>
            ))}
            {datos.porPortal.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sin postulaciones todavía</p>}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
