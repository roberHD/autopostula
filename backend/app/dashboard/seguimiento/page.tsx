"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Mail, Handshake, ThumbsDown, Clock, ExternalLink } from "lucide-react";
import { SwipeTriaje, type ItemSwipe, type OpcionSwipe } from "@/components/SwipeTriaje";
import { useAvisos } from "@/components/Avisos";

// docs/estado-real-de-postulaciones.md §6.2. Tercer uso del mismo componente de
// swipe (triaje del onboarding, banda gris, y esto): un toque por postulación.
type Respuesta = "NADA" | "ESCRIBIERON" | "ENTREVISTA" | "RECHAZADO";

const OPCIONES: OpcionSwipe<Respuesta>[] = [
  { valor: "NADA", etiqueta: "Nada todavía", Icon: Clock, tono: "neutro" },
  { valor: "ESCRIBIERON", etiqueta: "Me escribieron", Icon: Mail, tono: "neutro" },
  { valor: "ENTREVISTA", etiqueta: "Tuve entrevista", Icon: Handshake, tono: "si" },
  { valor: "RECHAZADO", etiqueta: "Me rechazaron", Icon: ThumbsDown, tono: "no" },
];

type Pendiente = ItemSwipe & {
  empresa: string | null;
  url: string | null;
  portal: string;
  enviadaEn: string;
};

function diasDesde(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  const semanas = Math.floor(dias / 7);
  return semanas === 1 ? "hace una semana" : `hace ${semanas} semanas`;
}

export default function SeguimientoPage() {
  const { error: avisarError } = useAvisos();
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/seguimiento");
      const data = await res.json();
      if (!res.ok) {
        avisarError("No pudimos cargar tus postulaciones", data.error ?? `Error ${res.status}`);
        setPendientes([]);
        return;
      }
      setPendientes(data.pendientes ?? []);
    } catch {
      avisarError("No pudimos cargar tus postulaciones", "Revisa tu conexión.");
      setPendientes([]);
    }
  }, [avisarError]);

  useEffect(() => { cargar(); }, [cargar]);

  async function responder(item: ItemSwipe, respuesta: Respuesta) {
    const res = await fetch("/api/seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: item.id, respuesta }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      avisarError("No pudimos guardar tu respuesta", data.error ?? `Error ${res.status}`);
    }
  }

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">¿Supiste algo?</h1>
        <p className="ap-page-sub">
          Los portales solo saben que postulaste. Lo que pasa después — un correo, una llamada,
          una entrevista — solo lo sabes tú. Cuéntanoslo y el panel deja de mostrarte números que
          no son.
        </p>
      </div>

      {pendientes === null ? (
        <div className="ap-empty">Cargando…</div>
      ) : pendientes.length === 0 ? (
        <div className="ap-section">
          <div className="ap-empty-state">
            <Inbox className="ap-empty-state-icon" size={30} />
            <p className="ap-empty-state-title">Nada que revisar por ahora</p>
            <p className="ap-empty-state-sub">
              Te preguntamos recién a los 5 días de postular, y nunca dos veces seguidas por lo
              mismo. Vuelve cuando tengas postulaciones con algunos días encima.
            </p>
          </div>
        </div>
      ) : (
        <div className="ap-section">
          <SwipeTriaje<Respuesta>
            items={pendientes}
            opciones={OPCIONES}
            onDecidir={(item, respuesta) => responder(item, respuesta)}
            onTerminar={cargar}
            pregunta={(titulo) => {
              const p = pendientes.find((x) => x.titulo === titulo);
              return p?.empresa ? `¿Supiste algo de ${p.empresa}?` : "¿Supiste algo de esta postulación?";
            }}
            textoFinal="Listo. Con eso el panel ya refleja lo que de verdad pasó."
            textoBotonFinal="Ver si queda algo"
            renderDetalle={(item) => {
              const p = item as Pendiente;
              return (
                <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>
                  {p.empresa && <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.empresa}</span>}
                  {p.empresa && " · "}
                  {p.portal} · postulaste {diasDesde(p.enviadaEn)}
                  {p.url && (
                    <>
                      {" · "}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
                      >
                        ver el aviso <ExternalLink size={11} style={{ verticalAlign: "-1px" }} />
                      </a>
                    </>
                  )}
                </div>
              );
            }}
          />
        </div>
      )}

      <p className="ap-nota-pie">
        Lo que nos cuentes manda: un escaneo del portal nunca lo va a pisar. Si te equivocas,
        puedes corregirlo desde{" "}
        <Link href="/dashboard/historial" style={{ color: "var(--accent)" }}>
          Postulaciones
        </Link>
        .
      </p>
    </div>
  );
}
