"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { SkelFilas } from "@/components/Esqueleto";
import { useAvisos } from "@/components/Avisos";
import { colorEstado, fraseEstado, OPCIONES_PERSONA, PASO_ESTADO, QUIEN_LO_DIJO } from "@/lib/palabras-estado";

type Detalle = {
  id: string;
  titulo: string;
  empresa: string | null;
  portal: string;
  url: string | null;
  estadoActual: string;
  contadoPorTi: boolean;
  notaAtencion: string | null;
  enviadaEn: string;
  historial: { estado: string; cambiadoEn: string; origen: string | null }[];
  respuestas: { pregunta: string; respuestaIa: string; respuestaFinal: string; fueEditada: boolean; tema: string | null }[];
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long" });

/**
 * El detalle de una postulación, abierto al lado de la lista: se revisa sin
 * perder el lugar en ella (docs/estrategia-y-rediseno.md §5.2). La página
 * /dashboard/historial/[id] sigue existiendo para los enlaces directos.
 */
export default function Cajon({
  id,
  onCerrar,
  alContar,
}: {
  id: string;
  onCerrar: () => void;
  alContar?: (id: string, estado: string | null) => void;
}) {
  const { exito, error: avisarError } = useAvisos();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [contando, setContando] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  // "¿Pasó algo?": lo mismo que "¿Supiste algo?" de la lista, desde el detalle.
  async function contar(respuesta: string) {
    setContando(true);
    try {
      const res = await fetch(`/api/applications/${id}/reporte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuesta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisarError("No pudimos guardarlo", data.error ?? "Vuelve a intentar en unos segundos.");
        return;
      }
      alContar?.(id, data.estado);
      exito("Anotado", `${fraseEstado(data.estado)}. El portal ya no lo cambia.`);
      setRecarga((n) => n + 1);
    } catch {
      avisarError("No pudimos guardarlo", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setContando(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    if (recarga === 0) setDetalle(null);
    setError("");
    fetch(`/api/applications/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!vivo) return;
        if (!r.ok) setError(data.error ?? "No pudimos cargar esta postulación.");
        else setDetalle(data);
      })
      .catch(() => vivo && setError("No pudimos cargar esta postulación. Revisa tu conexión."));
    return () => {
      vivo = false;
    };
  }, [id, recarga]);

  useEffect(() => {
    cerrarRef.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  const color = detalle ? colorEstado(detalle.estadoActual) : "var(--text-muted)";
  const incompleta = detalle?.estadoActual === "INCOMPLETA";

  return (
    <>
      <div className="ap-cajon-velo" onClick={onCerrar} />
      <aside className="ap-cajon" role="dialog" aria-modal="true" aria-label="Detalle de la postulación">
        <button ref={cerrarRef} type="button" className="ap-cajon__cerrar" onClick={onCerrar} aria-label="Cerrar">
          <X size={16} />
        </button>

        {error && <p style={{ color: "var(--err)", fontSize: 13, marginTop: 40 }}>{error}</p>}
        {!detalle && !error && <div style={{ marginTop: 44 }}><SkelFilas n={4} /></div>}

        {detalle && (
          <>
            <p className="ap-cajon__pre">
              {detalle.portal} · {incompleta ? "intentada" : "enviada"} el {fechaLarga(detalle.enviadaEn)}
            </p>
            <h2>{detalle.titulo}</h2>
            <p className="ap-cajon__emp">{detalle.empresa ?? "Empresa no especificada"}</p>

            <div className="ap-cajon__estado" style={{ "--c": color } as React.CSSProperties}>
              <b>{fraseEstado(detalle.estadoActual)}</b>
              {incompleta ? (
                <p>
                  {detalle.notaAtencion ?? "No se pudo completar sola."} Hasta que la termines a mano en {detalle.portal}, la
                  empresa no la recibe. No te descontó del mes.
                </p>
              ) : detalle.contadoPorTi ? (
                <p>Lo contaste tú. Si el portal dice otra cosa, manda lo que tú cuentas.</p>
              ) : detalle.estadoActual === "ENVIADO" ? (
                <p>El portal todavía no informa si la vieron.</p>
              ) : null}
            </div>

            {detalle.url && (
              <div className="ap-cajon__acc">
                <a className={incompleta ? "ap-button" : "ap-button-ghost"} href={detalle.url} target="_blank" rel="noreferrer">
                  {incompleta ? "Abrir la oferta y terminarla" : "Ver oferta"} <ExternalLink size={13} />
                </a>
              </div>
            )}

            {!incompleta && (
              <>
                <h3>¿Pasó algo?</h3>
                <div className="ap-opciones" role="group" aria-label="Qué pasó con esta postulación">
                  {OPCIONES_PERSONA.filter((o) => o.valor !== "nada").map((o) => (
                    <button key={o.valor} type="button" className="ap-opcion" disabled={contando} onClick={() => contar(o.valor)}>
                      {o.etiqueta}
                    </button>
                  ))}
                </div>
              </>
            )}

            {detalle.historial.length > 0 && (
              <>
                <h3>Historia</h3>
                <ul className="ap-historia">
                  {detalle.historial.map((h, i) => {
                    const primera = i === 0 && h.estado === "ENVIADO";
                    const n = detalle.respuestas.length;
                    return (
                      <li key={i} style={{ "--c": colorEstado(h.estado) } as React.CSSProperties}>
                        <i />
                        <p>
                          {primera && n ? `Enviada con ${n} ${n === 1 ? "respuesta" : "respuestas"}` : PASO_ESTADO[h.estado] ?? h.estado}{" "}
                          <em>· {h.origen ? QUIEN_LO_DIJO[h.origen] ?? "el portal" : primera ? "AutoPostula" : "el portal"}</em>
                        </p>
                        <span>{fecha(h.cambiadoEn)}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <h3>Lo que se envió</h3>
            {detalle.respuestas.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Esta postulación no tenía preguntas: se envió directo con tu CV.
              </p>
            ) : (
              detalle.respuestas.map((r, i) => (
                <div className="ap-envio" key={i}>
                  <p>{r.pregunta}</p>
                  <p>{r.respuestaFinal}</p>
                  <span className="ap-origen">{r.fueEditada ? "La editaste tú antes de enviar" : "La escribió la IA con tu perfil"}</span>
                </div>
              ))
            )}
          </>
        )}
      </aside>
    </>
  );
}
