"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAvisos } from "@/components/Avisos";

type Estado = {
  activa: boolean;
  motivo: "sin-plan" | "pausada" | "sin-cupo" | "sin-portales" | null;
  disponibleEnPlan: boolean;
  pausadaPorTi: boolean;
  portalesActivos: number;
  cupo: { usadas: number | null; limite: number | null; restantes: number | null };
  ultima: {
    titulo: string;
    empresa: string | null;
    portal: string;
    estado: string;
    enviadaEn: string;
  } | null;
};

/** "hace 2 min", "hace 3 h", "ayer" — sin librería, que es una línea de texto. */
function haceCuanto(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace un mes" : `hace ${m} meses`;
}

const EXPLICACION: Record<string, { t: string; d: string; ir?: { href: string; txt: string } }> = {
  "sin-plan": {
    t: "Postulación automática no incluida",
    d: "Con tu plan actual postulas tú desde la extensión.",
    ir: { href: "/dashboard/premium", txt: "Ver Premium" },
  },
  pausada: {
    t: "En pausa",
    d: "No va a postular hasta que la reanudes.",
  },
  "sin-cupo": {
    t: "Sin cupo este mes",
    d: "Se reinicia el día 1.",
    ir: { href: "/dashboard/premium", txt: "Ampliar cupo" },
  },
  "sin-portales": {
    t: "Sin portales conectados",
    d: "Conecta Computrabajo o Laborum para que empiece.",
    ir: { href: "/dashboard/portales", txt: "Conectar" },
  },
};

/**
 * La barra de estado que va sobre todos los módulos del dashboard.
 *
 * AutoPostula trabaja cuando nadie está mirando: sin esto, entras y no sabes
 * si la cosa está corriendo, qué hizo o cuánto cupo te queda.
 */
export default function BarraMaquina() {
  const { exito, error: avisarError } = useAvisos();
  const [e, setE] = useState<Estado | null>(null);
  const [cambiando, setCambiando] = useState(false);
  // Solo fuerza el re-render para que el "hace N min" avance; su valor no se lee.
  const [, setTic] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/estado");
      if (!res.ok) return;
      setE(await res.json());
    } catch {
      // La barra es informativa: si falla, no vale interrumpir la página.
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El "hace N min" se refresca solo, sin volver a pedir datos al servidor.
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  async function alternar() {
    if (!e) return;
    const nueva = e.pausadaPorTi; // si estaba pausada, se activa
    setCambiando(true);
    try {
      const res = await fetch("/api/account/busqueda-automatica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: nueva }),
      });
      if (!res.ok) {
        avisarError("No pudimos cambiar el estado", "Vuelve a intentar en unos segundos.");
        return;
      }
      await cargar();
      if (nueva) {
        exito("AutoPostula volvió a trabajar", "Vuelve a buscar ofertas que calcen con tus filtros.");
      } else {
        exito("AutoPostula está en pausa", "No va a postular hasta que la reanudes. Tus filtros y tu cupo quedan igual.");
      }
    } catch {
      avisarError("No se pudo cambiar el estado", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCambiando(false);
    }
  }

  if (!e) {
    return (
      <div className="ap-maquina" aria-hidden="true">
        <span className="ap-skel" style={{ width: 130, height: 12 }} />
        <span className="ap-skel" style={{ width: 220, height: 12 }} />
        <span className="ap-skel" style={{ width: 160, height: 12, marginLeft: "auto" }} />
      </div>
    );
  }

  const { usadas, limite } = e.cupo;
  const pct = limite && usadas != null ? Math.min(100, Math.round((usadas / limite) * 100)) : 0;
  const aviso = e.motivo ? EXPLICACION[e.motivo] : null;
  // El interruptor solo tiene sentido si el plan lo permite: si no, lo que
  // falta es el plan, no el botón.
  const puedeAlternar = e.disponibleEnPlan;

  return (
    <div className="ap-maquina" data-activa={e.activa ? "1" : undefined}>
      <span className="ap-maquina__estado">
        <span className="ap-pulso" />
        <span className="ap-maquina__t">{e.activa ? "Postulando" : (aviso?.t ?? "Detenida")}</span>
      </span>

      <span className="ap-maquina__ult">
        {e.activa && e.ultima ? (
          <>
            Última: <b>{e.ultima.titulo}</b> en {e.ultima.portal}, {haceCuanto(e.ultima.enviadaEn)}
          </>
        ) : e.ultima ? (
          <>
            {aviso?.d} Última: <b>{e.ultima.titulo}</b>, {haceCuanto(e.ultima.enviadaEn)}
          </>
        ) : (
          aviso?.d ?? "Todavía no hay postulaciones enviadas."
        )}
      </span>

      <span className="ap-maquina__cupo">
        {limite != null && usadas != null ? (
          <>
            <span className="ap-maquina__cifra">
              <b className="ap-tnum">{usadas}</b> de <b className="ap-tnum">{limite}</b> este mes
            </span>
            <span className="ap-maquina__barra">
              <span
                className="ap-maquina__relleno"
                style={{ width: `${pct}%` }}
                data-lleno={pct >= 100 ? "1" : undefined}
              />
            </span>
          </>
        ) : (
          <span className="ap-maquina__cifra">Sin límite de postulaciones</span>
        )}

        {puedeAlternar ? (
          <button
            type="button"
            className="ap-button-ghost ap-btn--sm"
            onClick={alternar}
            disabled={cambiando}
          >
            {cambiando ? "…" : e.pausadaPorTi ? "Reanudar" : "Pausar"}
          </button>
        ) : aviso?.ir ? (
          <Link className="ap-button-ghost ap-btn--sm" href={aviso.ir.href}>
            {aviso.ir.txt}
          </Link>
        ) : null}
      </span>
    </div>
  );
}
