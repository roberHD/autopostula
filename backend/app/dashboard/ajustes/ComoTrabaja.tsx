"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Pause, ShieldCheck } from "lucide-react";
import { TEXTO_MODO, TEXTO_MODO_PRUEBA, type EstadoExtension } from "@/lib/estado-extension";

/**
 * Cómo trabaja la extensión (docs/estrategia-y-rediseno.md §6).
 *
 * Los mismos tres interruptores que el popup, sobre el mismo estado: lo que se
 * cambia acá se ve allá en cuanto la extensión consulta, y al revés. Antes
 * vivían en el chrome.storage de cada navegador y el panel ni los conocía.
 */

const COLOR_MODO = {
  postulando: "var(--status-entrevista)",
  observando: "var(--chart-4)",
  pausada: "var(--text-muted)",
} as const;

function Fila({
  Icon,
  titulo,
  detalle,
  activo,
  onCambiar,
  deshabilitado,
  atenuado,
  etiqueta,
}: {
  Icon: any;
  titulo: string;
  detalle: string;
  activo: boolean;
  onCambiar: () => void;
  deshabilitado?: boolean;
  atenuado?: boolean;
  etiqueta: string;
}) {
  return (
    <div className="ap-toggle-row" style={{ border: "none", padding: "10px 0", opacity: atenuado ? 0.55 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "var(--bg-elevated-2)", color: "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon size={15} />
        </div>
        <div>
          <p className="ap-toggle-label" style={{ fontWeight: 600 }}>{titulo}</p>
          <p className="ap-toggle-desc">{detalle}</p>
        </div>
      </div>
      <button
        className={"ap-switch " + (activo ? "ap-switch-on" : "ap-switch-off")}
        onClick={onCambiar}
        disabled={deshabilitado}
        aria-pressed={activo}
        aria-label={etiqueta}
      >
        <span className="ap-switch-knob" />
      </button>
    </div>
  );
}

export default function ComoTrabaja({ textoPausa }: { textoPausa: string }) {
  const [estado, setEstado] = useState<EstadoExtension | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch("/api/account/opciones-extension")
      .then((r) => r.json())
      .then((d) => (d.estado ? setEstado(d.estado) : setError(d.error ?? "No se pudo cargar")))
      .catch(() => setError("No se pudo cargar — revisa tu conexión"));
  }, []);

  // La pausa sigue viviendo en /api/account/busqueda-automatica (es el mismo
  // campo de la cuenta); los otros dos, en opciones-extension.
  async function guardar(cambio: Partial<{ pausada: boolean; soloObservar: boolean; revisarAntes: boolean }>) {
    if (!estado || guardando) return;
    const previo = estado;
    setEstado({ ...estado, ...cambio, modo: "postulando" });
    setGuardando(true);
    setError("");
    try {
      const res =
        cambio.pausada !== undefined
          ? await fetch("/api/account/busqueda-automatica", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ activa: !cambio.pausada }),
            })
          : await fetch("/api/account/opciones-extension", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cambio),
            });
      if (!res.ok) {
        setEstado(previo);
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo guardar el cambio");
        return;
      }
      // La respuesta de busqueda-automatica no trae el estado completo: se
      // vuelve a pedir para no quedar con un modo calculado a medias.
      const fresco = await fetch("/api/account/opciones-extension").then((r) => r.json());
      if (fresco.estado) setEstado(fresco.estado);
    } catch {
      setEstado(previo);
      setError("No se pudo guardar el cambio — revisa tu conexión");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
      <p className="ap-section-title">Cómo trabaja la extensión</p>

      {!estado ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{error || "Cargando..."}</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 4 }}>
            <span
              aria-hidden
              style={{
                width: 9, height: 9, borderRadius: 999, marginTop: 5, flexShrink: 0,
                background: COLOR_MODO[estado.modo],
                boxShadow: `0 0 0 3px color-mix(in oklch, ${COLOR_MODO[estado.modo]} 22%, transparent)`,
              }}
            />
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600 }}>{TEXTO_MODO[estado.modo].titulo}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                {TEXTO_MODO[estado.modo].detalle}
                {estado.porModoPrueba && (
                  <>
                    {" "}
                    {TEXTO_MODO_PRUEBA}{" "}
                    <Link href="/dashboard" style={{ color: "var(--accent)" }}>Activarla</Link>
                  </>
                )}
              </p>
            </div>
          </div>

          {error && <p style={{ color: "var(--status-rechazado)", fontSize: 12.5, margin: "6px 0" }}>{error}</p>}

          <Fila
            Icon={Pause}
            titulo="En pausa"
            detalle={estado.pausada ? "No revisa ni envía nada hasta que la reanudes." : textoPausa}
            activo={estado.pausada}
            onCambiar={() => guardar({ pausada: !estado.pausada })}
            deshabilitado={guardando}
            etiqueta="Pausar o reanudar la extensión"
          />
          <Fila
            Icon={Eye}
            titulo="Solo observar"
            detalle={
              estado.porModoPrueba
                ? "Tu cuenta está en modo prueba: por ahora solo mira, aunque apagues esto."
                : "Revisa y puntúa las ofertas, pero no envía ninguna ni gasta cupo."
            }
            activo={estado.soloObservar || estado.porModoPrueba}
            onCambiar={() => guardar({ soloObservar: !estado.soloObservar })}
            deshabilitado={guardando || estado.porModoPrueba}
            atenuado={estado.pausada}
            etiqueta="Activar o desactivar solo observar"
          />
          <Fila
            Icon={ShieldCheck}
            titulo="Revisar antes de enviar"
            detalle={
              estado.modo === "observando"
                ? "No aplica mientras solo esté mirando: no hay nada que enviar."
                : "Te muestra las respuestas en el portal y espera tu confirmación."
            }
            activo={estado.revisarAntes}
            onCambiar={() => guardar({ revisarAntes: !estado.revisarAntes })}
            deshabilitado={guardando}
            atenuado={estado.modo !== "postulando"}
            etiqueta="Activar o desactivar revisar antes de enviar"
          />
        </>
      )}
    </div>
  );
}
