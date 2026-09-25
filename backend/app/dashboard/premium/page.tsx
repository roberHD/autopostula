"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, PartyPopper, TriangleAlert, Clock, ShieldCheck } from "lucide-react";
import { PASES, formatoPesos, type IdPase } from "@/lib/pases";

type Fila = { texto: string; free: string | boolean; premium: string | boolean };

const FILAS: Fila[] = [
  { texto: "Postulaciones por mes", free: "20", premium: "80" },
  { texto: "Portales conectados a la vez", free: "1", premium: "Todos" },
  { texto: "Postulaciones automáticas (sin entrar al portal)", free: "Prueba de 5", premium: true },
  { texto: "Se pone al día sola al abrir tu computador", free: false, premium: true },
  { texto: "Seguir conversando con la IA para afinar tu perfil", free: false, premium: true },
  { texto: "Calibración de estilo completa (6 preguntas)", free: false, premium: true },
  { texto: "Instrucciones personalizadas en Entrenar IA", free: false, premium: true },
  { texto: "Exportar tu historial a CSV", free: false, premium: true },
];

function Celda({ valor, destacar }: { valor: string | boolean; destacar?: boolean }) {
  if (typeof valor === "boolean") {
    return valor ? (
      <Check size={16} color="var(--chart-3)" strokeWidth={2.5} />
    ) : (
      <span style={{ color: "var(--text-muted)" }}>—</span>
    );
  }
  return <span style={{ fontWeight: 600, color: destacar ? "var(--chart-3)" : undefined }}>{valor}</span>;
}

function TablaPlanes({ esPremium }: { esPremium: boolean }) {
  const tuya = { background: "color-mix(in srgb, var(--accent) 5%, transparent)" };
  return (
    <div className="ap-card ap-table-scroll" style={{ maxWidth: 760, margin: "0 auto" }}>
      <table className="ap-table" style={{ minWidth: 460 }}>
        <thead>
          <tr>
            <th>Función</th>
            <th style={{ textAlign: "center", width: 120, ...(esPremium ? {} : tuya) }}>{esPremium ? "Free" : "Free (tu plan)"}</th>
            <th style={{ textAlign: "center", width: 150, whiteSpace: "nowrap", ...(esPremium ? tuya : {}) }}>
              {esPremium ? "Premium (tu plan)" : "Premium"}
            </th>
          </tr>
        </thead>
        <tbody>
          {FILAS.map((fila) => (
            <tr key={fila.texto}>
              <td>{fila.texto}</td>
              <td style={{ textAlign: "center", ...(esPremium ? {} : tuya) }}>
                <Celda valor={fila.free} />
              </td>
              <td style={{ textAlign: "center", ...(esPremium ? tuya : {}) }}>
                <Celda valor={fila.premium} destacar />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Cupo = { usadas: number | null; limite: number | null; restantes: number | null };

/**
 * Cuánto te queda este mes y hasta cuándo dura tu Premium, juntos arriba
 * (docs/estrategia-y-rediseno.md §5.2). Los dos datos ya existían, pero uno
 * vivía en la barra de arriba y el otro en el aviso de vencimiento.
 */
function TuMes({ cupo, premiumHasta, acciones }: { cupo: Cupo | null; premiumHasta: string | null; acciones?: React.ReactNode }) {
  if (!cupo || cupo.limite === null || cupo.restantes === null) return null;
  const usadas = cupo.usadas ?? cupo.limite - cupo.restantes;
  const pct = Math.min(100, Math.round((usadas / cupo.limite) * 100));
  const hoy = new Date();
  const renueva = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toLocaleDateString("es-CL", { day: "numeric", month: "long" });

  return (
    <div className="ap-card ap-mes ap-animate-in">
      <div>
        <p className="ap-mes__n">{cupo.restantes}</p>
        <p className="ap-mes__l">{cupo.restantes === 1 ? "postulación te queda" : "postulaciones te quedan"}</p>
      </div>
      <div>
        <div className="ap-mes__barra" role="img" aria-label={`${usadas} de ${cupo.limite} usadas`}>
          <i style={{ width: `${pct}%` }} data-lleno={pct >= 100 ? "1" : undefined} />
        </div>
        <div className="ap-mes__filas">
          <div>
            <b>{usadas} de {cupo.limite} usadas</b>
            <span>Se renuevan el {renueva}</span>
          </div>
          <div>
            {premiumHasta ? (
              <>
                <b>Premium hasta el {fechaLarga(premiumHasta)}</b>
                <span>No se renueva solo: pagas cuando lo necesitas</span>
              </>
            ) : (
              <>
                <b>Plan gratis</b>
                <span>Con Premium son 80 al mes y se pone al día sola</span>
              </>
            )}
          </div>
        </div>
        {acciones}
      </div>
    </div>
  );
}

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

// docs/pase-prepagado.md §5.3: a lo que se vuelve de Flow (?pago=…) se le
// contesta con lo que pasó de verdad, sin prometer más.
function AvisoDePago({ resultado, hasta }: { resultado: string | null; hasta: string | null }) {
  if (resultado === "exito") {
    return (
      <div className="ap-cartel-maqueta" role="status">
        <PartyPopper size={17} />
        <div>
          <p className="ap-cartel-maqueta__t">{hasta ? `Premium activo hasta el ${fechaLarga(hasta)}` : "Recibimos tu pago"}</p>
          <p className="ap-cartel-maqueta__d">Te mandamos el comprobante por correo.</p>
        </div>
      </div>
    );
  }
  if (resultado === "pendiente") {
    return (
      <div className="ap-cartel-maqueta" role="status">
        <Clock size={17} />
        <div>
          <p className="ap-cartel-maqueta__t">Tu pago se está procesando</p>
          <p className="ap-cartel-maqueta__d">Te avisamos por correo apenas se confirme.</p>
        </div>
      </div>
    );
  }
  if (resultado === "rechazado") {
    return (
      <div className="ap-cartel-maqueta" role="alert">
        <TriangleAlert size={17} />
        <div>
          <p className="ap-cartel-maqueta__t">El pago no se completó</p>
          <p className="ap-cartel-maqueta__d">No se hizo ningún cobro. Puedes intentarlo de nuevo cuando quieras.</p>
        </div>
      </div>
    );
  }
  return null;
}

export default function PremiumPage() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [esPremium, setEsPremium] = useState(false);
  const [planNombre, setPlanNombre] = useState<string | null>(null);
  const [premiumHasta, setPremiumHasta] = useState<string | null>(null);
  const [resultadoPago, setResultadoPago] = useState<string | null>(null);
  const [cupo, setCupo] = useState<Cupo | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((e) => e?.cupo && setCupo(e.cupo))
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch("/api/account/busqueda-automatica");
        const data = await res.json();
        setEsPremium(data.esPremium ?? false);
        setPlanNombre(data.planNombre);
        setPremiumHasta(data.premiumHasta ?? null);
      } catch (err) {
        console.error("Error cargando estado del plan:", err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
    // Se lee de la URL en el navegador (no con useSearchParams) para no obligar
    // a envolver la página en Suspense.
    setResultadoPago(new URLSearchParams(window.location.search).get("pago"));
  }, []);

  function elegirPase(pase: IdPase) {
    router.push(`/dashboard/premium/pago?pase=${pase}`);
  }

  if (cargando) {
    return <div className="ap-empty">Cargando...</div>;
  }

  if (esPremium) {
    // Los días se suman a los que quedan: con 30 más, el Premium dura hasta acá.
    const con30 = premiumHasta ? new Date(new Date(premiumHasta).getTime() + 30 * 86_400_000).toISOString() : null;
    return (
      <div className="ap-glow-bg">
        <div className="ap-page-header">
          <h1 className="ap-page-title">Tu plan</h1>
          <p className="ap-page-sub">Cuánto te queda este mes y cómo seguir.</p>
        </div>
        <AvisoDePago resultado={resultadoPago} hasta={premiumHasta} />
        <TuMes
          cupo={cupo}
          premiumHasta={premiumHasta}
          acciones={
            <>
              <div className="ap-mes__acc">
                <button className="ap-button" onClick={() => elegirPase("pase_30")}>
                  Extender Premium 30 días · ${formatoPesos(PASES.pase_30.monto)}
                </button>
                <button className="ap-button-ghost" onClick={() => elegirPase("pase_90")}>
                  Extender 90 días · ${formatoPesos(PASES.pase_90.monto)}
                </button>
              </div>
              {con30 && (
                <p className="ap-mes__nota">
                  Los días se suman a los que te quedan: con 30 más, tu Premium dura hasta el {fechaLarga(con30)}.
                </p>
              )}
            </>
          }
        />
        {!cupo && (
          <div className="ap-section ap-animate-in" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <PartyPopper size={20} />
            <p style={{ fontSize: 13.5 }}>
              Ya eres {planNombre ?? "Premium"}
              {premiumHasta ? `, hasta el ${fechaLarga(premiumHasta)}` : ""}.
            </p>
          </div>
        )}
        <p className="ap-regla-linea">
          <ShieldCheck />
          Una postulación que no llegó al portal no te descuenta. Revisar ofertas, descartar y Por decidir no gastan nada.
        </p>
        <TablaPlanes esPremium />
      </div>
    );
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Tu plan</h1>
        <p className="ap-page-sub">Cuánto te queda este mes y cómo seguir.</p>
      </div>
      <AvisoDePago resultado={resultadoPago} hasta={premiumHasta} />
      <TuMes cupo={cupo} premiumHasta={null} />
      <div className="ap-page-header" style={{ textAlign: "center", marginTop: 28 }}>
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12,
            padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: "linear-gradient(90deg, color-mix(in oklch, var(--chart-1) 18%, transparent), color-mix(in oklch, var(--chart-3) 18%, transparent))",
            color: "var(--accent)",
          }}
        >
          <Sparkles size={13} /> AutoPostula Premium
        </div>
        <h2 className="ap-page-title" style={{ fontSize: 26 }}>Postula más rápido, sin límites de siempre</h2>
        <p className="ap-page-sub" style={{ maxWidth: 480, margin: "0 auto" }}>
          Deja que AutoPostula se ponga al día sola cada vez que abres tu computador, mientras tú te enfocas en las entrevistas.
        </p>
      </div>

      <div className="ap-pricing-grid" style={{ maxWidth: 980, margin: "0 auto 28px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {/* Free */}
        <div className="ap-section ap-animate-in" style={{ marginBottom: 0 }}>
          <p className="ap-section-title">Free</p>
          <p style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>$0</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>Para empezar a postular</p>
        </div>

        {/* Premium -- borde degradado: div exterior con el gradiente de fondo
            + div interior sólido, para simular un borde de varios colores
            (un border-image con gradiente no deja redondear bien las esquinas). */}
        <div
          className="ap-gradient-border ap-animate-in"
          style={{ borderRadius: "var(--radius)", padding: "1.5px", animationDelay: "0.05s" }}
        >
          <div
            className="ap-section"
            style={{ marginBottom: 0, position: "relative", height: "100%", boxSizing: "border-box" }}
          >
            <span
              className="ap-gradient-accent"
              style={{
                position: "absolute", top: -11, right: 16,
                fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}
            >
              Recomendado
            </span>
            <p className="ap-section-title">Premium · 30 días</p>
            <p style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
              ${formatoPesos(PASES.pase_30.monto)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>por 30 días</span>
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
              Sin renovación automática: pagas solo cuando lo necesitas
            </p>
            <button
              className="ap-gradient-accent"
              style={{
                width: "100%", border: "none", borderRadius: 8, padding: "9px 16px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
              onClick={() => elegirPase("pase_30")}
            >
              ✨ Pasar a Premium
            </button>
          </div>
        </div>

        <div className="ap-section ap-animate-in" style={{ marginBottom: 0, animationDelay: "0.1s" }}>
          <p className="ap-section-title">Premium · 90 días</p>
          <p style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
            ${formatoPesos(PASES.pase_90.monto)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>por 90 días</span>
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
            Para buscar con calma: sale más barato por día
          </p>
          <button
            className="ap-button-ghost"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => elegirPase("pase_90")}
          >
            Elegir 90 días
          </button>
        </div>
      </div>

      <TablaPlanes esPremium={false} />
    </div>
  );
}
