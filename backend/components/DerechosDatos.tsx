"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import {
  DERECHOS, DETALLE_MAX, DETALLE_MIN, ESTADOS_DERECHO, TIPOS_DERECHO, numeroSolicitud, type TipoDerecho,
} from "@/lib/textos-derechos";

type Solicitud = {
  id: string;
  tipo: TipoDerecho;
  detalle: string;
  estado: string;
  recibidaEn: string;
  venceEn: string;
  prorrogadaEn: string | null;
  motivoProrroga: string | null;
  respondidaEn: string | null;
  respuesta: string | null;
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });

/**
 * "Ejercer un derecho" en Ajustes → Tus datos (lib/derechos.ts; Ley 21.719,
 * art. 11): un formulario para pedir acceso, rectificación, supresión, etc., y
 * la lista de lo que ya pidió, con el plazo y la respuesta. Antes la única vía
 * era un correo a una casilla de Gmail, sin plazo a la vista ni registro.
 */
export default function DerechosDatos() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoDerecho | "">("");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  async function cargar() {
    try {
      const res = await fetch("/api/derechos");
      const data = await res.json();
      if (res.ok) setSolicitudes(data.solicitudes ?? []);
    } catch {
      setSolicitudes([]);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/derechos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, detalle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No pudimos enviarla. Intenta de nuevo en unos segundos.");
        return;
      }
      setAviso(
        `Recibimos tu solicitud. Te enviamos un correo de confirmación, y te responderemos a más tardar el ${fecha(data.venceEn)}.`
      );
      setAbierto(false);
      setTipo("");
      setDetalle("");
      cargar();
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const largoOk = detalle.trim().length >= DETALLE_MIN;

  return (
    <div className="ap-derechos">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Ejercer un derecho sobre tus datos</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
            Acceso, rectificación, supresión, oposición, portabilidad, bloqueo o revisión de una decisión automática.
            Es gratis y te respondemos por escrito dentro de 30 días.
          </p>
        </div>
        {!abierto && (
          <button
            type="button"
            className="ap-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
            onClick={() => { setAbierto(true); setAviso(""); }}
          >
            <Scale size={14} /> Ejercer un derecho
          </button>
        )}
      </div>

      {aviso && <p className="ap-derechos__ok">{aviso}</p>}

      {abierto && (
        <form onSubmit={enviar} className="ap-derechos__form">
          <label className="ap-label" htmlFor="derecho-tipo">¿Qué necesitas?</label>
          <select
            id="derecho-tipo"
            className="ap-input"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDerecho)}
            required
          >
            <option value="" disabled>Elige un derecho</option>
            {TIPOS_DERECHO.map((t) => (
              <option key={t} value={t}>{DERECHOS[t].nombre} — {DERECHOS[t].descripcion}</option>
            ))}
          </select>
          {tipo && <p className="ap-derechos__ayuda">{DERECHOS[tipo].ayuda}</p>}

          <label className="ap-label" htmlFor="derecho-detalle" style={{ marginTop: 12 }}>Cuéntanos</label>
          <textarea
            id="derecho-detalle"
            className="ap-textarea"
            rows={4}
            maxLength={DETALLE_MAX}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Qué datos, qué quieres que hagamos y por qué, si corresponde."
            required
          />
          {error && <p className="ap-derechos__error">{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button type="submit" className="ap-button" disabled={enviando || !tipo || !largoOk}>
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>
            <button type="button" className="ap-button-ghost" onClick={() => { setAbierto(false); setError(""); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {solicitudes && solicitudes.length > 0 && (
        <div className="ap-derechos__lista">
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Tus solicitudes</p>
          {solicitudes.map((s) => {
            const cerrada = s.estado === "RESPONDIDA" || s.estado === "RECHAZADA";
            return (
              <div key={s.id} className="ap-derechos__item">
                <div className="ap-derechos__cab">
                  <span>
                    <strong>{DERECHOS[s.tipo]?.nombre ?? s.tipo}</strong>
                    <span style={{ color: "var(--text-muted)" }}> · N° {numeroSolicitud(s.id)} · {fecha(s.recibidaEn)}</span>
                  </span>
                  <span className="ap-derechos__estado" data-estado={s.estado}>{ESTADOS_DERECHO[s.estado] ?? s.estado}</span>
                </div>
                {cerrada ? (
                  <p className="ap-derechos__respuesta">
                    <span style={{ color: "var(--text-muted)" }}>Respuesta del {fecha(s.respondidaEn!)}:</span>
                    <br />
                    {s.respuesta}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    Te respondemos a más tardar el {fecha(s.venceEn)}.
                    {s.prorrogadaEn && s.motivoProrroga ? ` Extendimos el plazo: ${s.motivoProrroga}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
