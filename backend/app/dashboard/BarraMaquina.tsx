"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAvisos } from "@/components/Avisos";
import type { ModoAutomatico, MotivoInactivo } from "@/lib/estado-automatico";
import { textoTarjetaRafaga, type UltimaRafaga } from "@/lib/texto-rafaga";
import { haceCuanto } from "@/lib/tiempo";
import BotonPonerseAlDia from "./BotonPonerseAlDia";

type Estado = {
  activa: boolean;
  motivo: MotivoInactivo | null;
  disponibleEnPlan: boolean;
  // premium | prueba | manual (docs/rafagas-y-ponerse-al-dia.md §4.1).
  modo: ModoAutomatico;
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
  // Cuándo se puso al día por última vez y qué encontró (docs/rafagas-y-ponerse-al-dia.md §3.5).
  ultimaRafaga: UltimaRafaga | null;
  estimadoRafagaMs: number | null;
};

// Pasado esto sin ponerse al día, la barra deja de decir "Al día".
const HORAS_AL_DIA = 48;

const EXPLICACION: Record<string, { t: string; d: string; ir?: { href: string; txt: string } }> = {
  // Reemplaza al antiguo "sin-plan": una cuenta gratis ya no está "sin"
  // postulación automática desde el principio, la tiene y se le acaba (§4.1).
  "prueba-terminada": {
    t: "Prueba automática terminada",
    d: "Ahora postulas tú, entrando a Computrabajo, Laborum o Trabajando.",
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
    d: "Conecta Computrabajo, Laborum o Trabajando.com para que empiece.",
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
  // El interruptor solo tiene sentido si hay algo automático que pausar: el plan
  // Premium, o la prueba de una cuenta gratis mientras dura (una acción que corre
  // sola tiene que poder pararse, aunque no sea del plan). Con la prueba gastada,
  // lo que falta es el plan, no el botón.
  const puedeAlternar = e.modo !== "manual";

  // Con la búsqueda andando, lo que importa es cuándo se puso al día y qué
  // encontró -- lo mismo que decía la tarjeta del Inicio, que ahora vive acá.
  const rafaga = e.activa ? textoTarjetaRafaga(e.ultimaRafaga, new Date()) : null;
  const horasDesde = e.ultimaRafaga ? (Date.now() - new Date(e.ultimaRafaga.en).getTime()) / 3_600_000 : null;
  const alDia = horasDesde !== null && horasDesde < HORAS_AL_DIA;
  const titulo = e.activa ? (alDia ? "Al día" : "Sin ponerse al día") : (aviso?.t ?? "Detenida");

  return (
    <div className="ap-maquina" data-activa={e.activa && alDia ? "1" : undefined}>
      <span className="ap-maquina__estado">
        <span className="ap-pulso" />
        <span className="ap-maquina__t">{titulo}</span>
      </span>

      <span className="ap-maquina__ult">
        {rafaga ? (
          <>
            {rafaga.t}
            {rafaga.d ? <> · <b>{rafaga.d}</b></> : null}
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

        {e.activa && e.modo === "premium" && <BotonPonerseAlDia estimadoMs={e.estimadoRafagaMs} />}
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
