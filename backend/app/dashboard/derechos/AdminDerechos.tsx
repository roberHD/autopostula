"use client";

import { useEffect, useState } from "react";
import {
  DERECHOS, DETALLE_MIN, ESTADOS_DERECHO, TIPOS_DERECHO, numeroSolicitud, type TipoDerecho,
} from "@/lib/textos-derechos";

type Solicitud = {
  id: string;
  email: string;
  tipo: TipoDerecho;
  detalle: string;
  origen: string;
  estado: string;
  recibidaEn: string;
  venceEn: string;
  prorrogadaEn: string | null;
  motivoProrroga: string | null;
  respondidaEn: string | null;
  respuesta: string | null;
  userId: string | null;
};

const DIA = 24 * 3_600_000;
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
const abierta = (s: Solicitud) => s.estado === "RECIBIDA" || s.estado === "PRORROGADA";

/**
 * Las solicitudes de derechos para el equipo (lib/derechos.ts). Cada acción le
 * manda el correo al titular y deja el texto guardado: es el respaldo que pide
 * el art. 11. Rechazar agrega solo el aviso de que puede reclamar ante la Agencia.
 */
export default function AdminDerechos() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState("");

  async function cargar() {
    const res = await fetch("/api/admin/derechos");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSolicitudes(data.solicitudes ?? []);
    else setError(data.error ?? "No se pudieron cargar.");
  }
  useEffect(() => { cargar(); }, []);

  const abiertas = solicitudes?.filter(abierta) ?? [];
  const cerradas = solicitudes?.filter((s) => !abierta(s)) ?? [];

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Solicitudes de datos</h1>
        <p className="ap-page-sub">
          Derechos sobre datos personales (Ley 21.719). Hay que responder por escrito dentro de 30 días corridos desde
          que llegó la solicitud; se puede extender una sola vez por 30 días más.
        </p>
      </div>
      <div className="ap-hoja" style={{ display: "grid", gap: 18 }}>
        {error && <p className="ap-derechos__error">{error}</p>}

        <section className="ap-section" style={{ marginBottom: 0 }}>
          <p className="ap-section-title">Abiertas ({abiertas.length})</p>
          {solicitudes && abiertas.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No hay solicitudes pendientes.</p>
          )}
          <div style={{ display: "grid", gap: 12 }}>
            {abiertas.map((s) => <Abierta key={s.id} s={s} alCambiar={cargar} />)}
          </div>
        </section>

        <Registrar alRegistrar={cargar} />

        {cerradas.length > 0 && (
          <section className="ap-section" style={{ marginBottom: 0 }}>
            <p className="ap-section-title">Cerradas</p>
            <div className="ap-derechos__lista">
              {cerradas.map((s) => (
                <div key={s.id} className="ap-derechos__item">
                  <div className="ap-derechos__cab">
                    <span>
                      <strong>{DERECHOS[s.tipo]?.nombre}</strong>
                      <span style={{ color: "var(--text-muted)" }}> · N° {numeroSolicitud(s.id)} · {s.email}</span>
                    </span>
                    <span className="ap-derechos__estado" data-estado={s.estado}>{ESTADOS_DERECHO[s.estado]}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    Recibida el {fecha(s.recibidaEn)} · respondida el {s.respondidaEn ? fecha(s.respondidaEn) : "—"}
                  </p>
                  <p className="ap-derechos__respuesta">{s.respuesta}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Abierta({ s, alCambiar }: { s: Solicitud; alCambiar: () => void }) {
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const dias = Math.ceil((new Date(s.venceEn).getTime() - Date.now()) / DIA);
  const plazo = dias < 0 ? `Venció hace ${-dias} día(s)` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día(s), el ${fecha(s.venceEn)}`;

  async function accion(cual: "responder" | "rechazar" | "prorrogar") {
    const confirmaciones = {
      responder: "Se le manda esta respuesta al titular por correo y la solicitud queda cerrada. ¿Seguir?",
      rechazar: "Se le manda este fundamento al titular, con el aviso de que puede reclamar ante la Agencia, y la solicitud queda cerrada. ¿Seguir?",
      prorrogar: "Se le avisa al titular que el plazo se extiende 30 días, con este motivo. Solo se puede hacer una vez. ¿Seguir?",
    };
    if (!window.confirm(confirmaciones[cual])) return;
    setTrabajando(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/derechos/${s.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: cual, texto }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo."); return; }
      setTexto("");
      alCambiar();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="ap-derechos__item" style={{ display: "grid", gap: 8 }}>
      <div className="ap-derechos__cab">
        <span>
          <strong>{DERECHOS[s.tipo]?.nombre}</strong>
          <span style={{ color: "var(--text-muted)" }}>
            {" "}· N° {numeroSolicitud(s.id)} · {s.email}
            {s.userId ? "" : " (sin cuenta)"} · {s.origen === "panel" ? "desde el panel" : "por correo"}
          </span>
        </span>
        <span className="ap-derechos__plazo" data-urgente={dias <= 5 ? "1" : undefined}>{plazo}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Recibida el {fecha(s.recibidaEn)}
        {s.prorrogadaEn ? ` · plazo extendido el ${fecha(s.prorrogadaEn)}: ${s.motivoProrroga}` : ""}
      </p>
      <p className="ap-derechos__respuesta" style={{ marginTop: 0 }}>{s.detalle}</p>
      <textarea
        className="ap-textarea"
        rows={4}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="La respuesta al titular, el fundamento del rechazo o el motivo de la extensión. Se le manda tal cual."
      />
      {error && <p className="ap-derechos__error">{error}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ap-button" disabled={trabajando || texto.trim().length < 10} onClick={() => accion("responder")}>
          Responder
        </button>
        <button type="button" className="ap-button-ghost" disabled={trabajando || texto.trim().length < 10} onClick={() => accion("rechazar")}>
          Rechazar
        </button>
        {s.estado === "RECIBIDA" && dias >= 0 && (
          <button type="button" className="ap-button-ghost" disabled={trabajando || texto.trim().length < 10} onClick={() => accion("prorrogar")}>
            Extender el plazo
          </button>
        )}
      </div>
    </div>
  );
}

function Registrar({ alRegistrar }: { alRegistrar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState<TipoDerecho | "">("");
  const [detalle, setDetalle] = useState("");
  const [recibidaEn, setRecibidaEn] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setTrabajando(true);
    setError("");
    try {
      const res = await fetch("/api/admin/derechos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Mediodía de Chile del día indicado, para que no cambie de día por la zona horaria.
        body: JSON.stringify({ email, tipo, detalle, recibidaEn: `${recibidaEn}T12:00:00-03:00` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo registrar."); return; }
      setAbierto(false);
      setEmail(""); setTipo(""); setDetalle("");
      alRegistrar();
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section className="ap-section" style={{ marginBottom: 0 }}>
      <p className="ap-section-title">Registrar una solicitud que llegó por correo</p>
      {!abierto ? (
        <button type="button" className="ap-button-ghost" onClick={() => setAbierto(true)}>Registrar</button>
      ) : (
        <form onSubmit={registrar} style={{ display: "grid", gap: 8 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            El plazo corre desde el día en que llegó el correo, no desde hoy. Al registrarla se le manda el acuse de
            recibo a la persona.
          </p>
          <input className="ap-input" type="email" placeholder="Correo de la persona" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select className="ap-input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDerecho)} required>
            <option value="" disabled>Qué derecho</option>
            {TIPOS_DERECHO.map((t) => <option key={t} value={t}>{DERECHOS[t].nombre}</option>)}
          </select>
          <label className="ap-label">Día en que llegó</label>
          <input className="ap-input" type="date" value={recibidaEn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setRecibidaEn(e.target.value)} required />
          <textarea className="ap-textarea" rows={3} placeholder="Lo que pidió (cópialo del correo)" value={detalle} onChange={(e) => setDetalle(e.target.value)} required />
          {error && <p className="ap-derechos__error">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="ap-button" disabled={trabajando || !email || !tipo || detalle.trim().length < DETALLE_MIN}>
              {trabajando ? "Registrando…" : "Registrar y mandar acuse"}
            </button>
            <button type="button" className="ap-button-ghost" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
