"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Building2, TriangleAlert, Star } from "lucide-react";
import { SwipeTriaje, type ItemSwipe } from "@/components/SwipeTriaje";
import { formatearRazon, esRazonPositiva } from "@/lib/formatear-razon";
import type { EstadoExtension } from "@/lib/estado-extension";

// Facetas leídas en la Etapa 2 (docs/visibilidad-y-etapa2.md §B/§E) -- todos
// opcionales, una fila sin Etapa 2 (o de antes del cambio) simplemente no
// tiene ninguno y la tarjeta degrada sola (§H criterio 4).
type DetalleAviso = {
  jornada?: string;
  modalidad?: string;
  contrato?: string;
  sueldo?: string;
  publicadaHace?: string;
  ratingEmpresa?: number;
  evaluaciones?: number;
  extracto?: string;
} | null;

type DecisionGris = {
  id: string;
  tituloCrudo: string;
  url: string | null;
  empresa: string | null;
  plataforma: string | null;
  scoreLocal: number | null;
  // Json?: strings de filas viejas, u objetos estructurados nuevos (§C) --
  // formatearRazon() acepta ambas formas.
  razones: unknown[] | null;
  detalleAviso: DetalleAviso;
  venceEn: string | null;
};

// La razón de ubicación (§C) trae la comuna real de la oferta -- es la queja
// concreta del criterio de aceptación §H.2 ("la razón debe nombrar la comuna").
function comunaDeRazones(razones: unknown[] | null): string | null {
  if (!Array.isArray(razones)) return null;
  const r = razones.find(
    (x) => x && typeof x === "object" && (x as { tipo?: string }).tipo === "ubicacion"
  ) as { ofertaEn?: string | null } | undefined;
  return r?.ofertaEn || null;
}

function diasRestantes(venceEn: string | null): string {
  if (!venceEn) return "";
  const dias = Math.ceil((new Date(venceEn).getTime() - Date.now()) / 86_400_000);
  if (dias <= 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

// docs/revision-2026-09-16.md §2.9: nunca mostrar "aprobada" sin decir cuándo
// se envía. La extensión responde por bridge.js con { ok, encoladas } o
// { ok: false, motivo }.
type ResultadoAprobar = { ok: boolean; encoladas?: number; motivo?: string };

function textoDeAprobacion(r: ResultadoAprobar | null): string {
  if (!r) {
    return "Aprobada. Se enviará cuando abras Chrome con la extensión de AutoPostula en tu computador.";
  }
  if (r.ok) {
    return r.encoladas
      ? "Aprobada. La extensión la está enviando ahora; en unos minutos aparece en tu historial."
      : "Aprobada. La extensión ya la tiene en cola.";
  }
  switch (r.motivo) {
    case "solo_observar":
      return "Aprobada, pero no se envía todavía: tienes \"Solo observar\" activado (o tu cuenta sigue en modo prueba). Se enviará cuando lo desactives.";
    case "sin_token":
      return "Aprobada, pero la extensión no está conectada a tu cuenta. Conéctala desde Portales para que se envíe.";
    default:
      return "Aprobada. La extensión no respondió ahora; se enviará cuando vuelva a revisar (al abrir Chrome o dentro de la hora).";
  }
}

/**
 * Las razones como el intercambio que se le pide decidir: lo que calza a un
 * lado, lo que no al otro. Las filas viejas guardaron strings sin saber si
 * eran a favor o en contra; esas van aparte, sin ubicarlas en ninguna columna.
 */
function RazonesEnDos({ razones }: { razones: unknown[] }) {
  const aFavor = razones.filter((r) => esRazonPositiva(r) === true);
  const enContra = razones.filter((r) => esRazonPositiva(r) === false);
  const sinClasificar = razones.filter((r) => esRazonPositiva(r) === null);

  return (
    <>
      {(aFavor.length > 0 || enContra.length > 0) && (
        <div className="ap-razones-dos">
          {aFavor.length > 0 && (
            <div>
              <h3>Calza contigo</h3>
              <ul className="ap-razones">
                {aFavor.map((r, i) => <li key={i} className="positiva">{formatearRazon(r)}</li>)}
              </ul>
            </div>
          )}
          {enContra.length > 0 && (
            <div>
              <h3>Pero</h3>
              <ul className="ap-razones">
                {enContra.map((r, i) => <li key={i} className="negativa">{formatearRazon(r)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      {sinClasificar.length > 0 && (
        <ul className="ap-razones">
          {sinClasificar.map((r, i) => <li key={i}>{formatearRazon(r)}</li>)}
        </ul>
      )}
    </>
  );
}

export default function PorDecidirPage() {
  const [pendientes, setPendientes] = useState<DecisionGris[] | null>(null);
  const [expiradasSinRevisar, setExpiradasSinRevisar] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [aviso, setAviso] = useState("");
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Le avisa a la extensión que hay aprobadas por enviar. Se junta el aviso de
  // varios "sí" seguidos en uno solo: la extensión pide sus aprobadas al backend,
  // no necesita un evento por cada una.
  function avisarALaExtension() {
    if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => {
      // bridge.js deja esta marca en el DOM apenas carga (ver extension/bridge.js).
      if (!document.documentElement.dataset.autopostulaExtension) {
        setAviso(textoDeAprobacion(null));
        return;
      }
      let respondio = false;
      const alResponder = (e: Event) => {
        respondio = true;
        setAviso(textoDeAprobacion((e as CustomEvent<ResultadoAprobar>).detail ?? null));
      };
      window.addEventListener("autopostula:aprobar-resultado", alResponder, { once: true });
      window.dispatchEvent(new CustomEvent("autopostula:aprobar"));
      setTimeout(() => {
        if (respondio) return;
        window.removeEventListener("autopostula:aprobar-resultado", alResponder);
        setAviso(textoDeAprobacion({ ok: false, motivo: "extension_no_responde" }));
      }, 8000);
    }, 1500);
  }

  async function cargar() {
    try {
      const res = await fetch("/api/banda-gris");
      const data = await res.json();
      if (!res.ok) {
        setMensaje(data.error ?? `Error ${res.status}`);
        return;
      }
      setPendientes(data.pendientes ?? []);
      setExpiradasSinRevisar(data.expiradasSinRevisar ?? 0);
    } catch (err) {
      console.error("Error cargando banda gris:", err);
      setMensaje("No se pudo cargar — revisa la consola");
    }
  }

  // docs/estrategia-y-rediseno.md §6: ahora el panel SÍ sabe en qué está la
  // extensión, así que el aviso deja de salir siempre "por las dudas" y sale
  // solo cuando de verdad tu "sí" va a quedar esperando.
  const [estadoExt, setEstadoExt] = useState<EstadoExtension | null>(null);

  useEffect(() => {
    cargar();
    fetch("/api/account/opciones-extension")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.estado && setEstadoExt(d.estado))
      .catch(() => {});
  }, []);

  async function decidir(item: ItemSwipe, veredicto: "SI" | "NO") {
    try {
      const res = await fetch("/api/banda-gris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, veredicto }),
      });
      if (res.ok && veredicto === "SI") avisarALaExtension();
    } catch (err) {
      console.error("Error guardando decisión:", err);
    }
  }

  const items: ItemSwipe[] =
    pendientes?.map((d) => ({
      id: d.id,
      titulo: d.tituloCrudo,
      url: d.url,
      empresa: d.empresa,
      plataforma: d.plataforma,
      razones: d.razones,
      detalleAviso: d.detalleAviso,
      venceEn: d.venceEn,
    })) ?? [];

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Por decidir</h1>
        <p className="ap-page-sub">
          Ofertas que calzan a medias. Tu sí o tu no también le enseña a tu perfil.
        </p>
        {/* docs/modo-solo-observar.md §4.3: un "sí" acá queda esperando si la
            extensión no está postulando. Antes se avisaba siempre, porque el
            panel no tenía cómo saberlo; ahora lee el estado de la cuenta y solo
            lo dice cuando es cierto (§6 del rediseño). */}
        {estadoExt && estadoExt.modo !== "postulando" && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
            {estadoExt.modo === "pausada"
              ? "La extensión está en pausa: lo que aceptes acá queda guardado y se envía cuando la reanudes."
              : "Ahora la extensión solo mira: lo que aceptes acá queda guardado y se envía cuando la dejes postular."}{" "}
            <a href="/dashboard/ajustes" style={{ color: "var(--accent)" }}>Cambiarlo en Ajustes</a>
          </p>
        )}
      </div>

      {mensaje && <p style={{ color: "var(--status-rechazado)", fontSize: 13, marginBottom: 12 }}>{mensaje}</p>}
      {aviso && (
        <p role="status" style={{ fontSize: 13, marginBottom: 12, color: "var(--text)" }}>
          {aviso}
        </p>
      )}

      {expiradasSinRevisar > 0 && (
        <div
          className="ap-section"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            borderColor: "color-mix(in oklch, var(--chart-4) 35%, transparent)",
          }}
        >
          <TriangleAlert size={16} color="var(--chart-4)" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 13 }}>
            Se te vencieron <strong>{expiradasSinRevisar}</strong> oferta{expiradasSinRevisar === 1 ? "" : "s"} sin revisar.
          </p>
        </div>
      )}

      <div className="ap-section ap-animate-in" style={{ maxWidth: 660, margin: "0 auto", padding: 26 }}>
        {pendientes === null ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Cargando...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No hay nada pendiente</p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Cuando encontremos una oferta ambigua, va a aparecer acá para que decidas.
            </p>
          </div>
        ) : (
          <SwipeTriaje
            items={items}
            onDecidir={decidir}
            onTerminar={cargar}
            pregunta={(titulo) => `¿Postularías a "${titulo}"?`}
            renderDetalle={(item) => {
              const detalle = (item.detalleAviso as DetalleAviso) || null;
              const razones = Array.isArray(item.razones) ? (item.razones as unknown[]) : [];
              const comuna = comunaDeRazones(item.razones as unknown[] | null);
              // Chips de facetas (§D): deciden solas en la mayoría de los
              // casos -- solo las que el aviso trajo (Etapa 2 no siempre corrió).
              const chips = [detalle?.jornada, detalle?.contrato, detalle?.modalidad].filter(
                (v): v is string => !!v
              );

              return (
                <div style={{ textAlign: "center" }}>
                  {!!item.empresa && (
                    <p style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                      <Building2 size={13} /> {String(item.empresa)}
                      {!!detalle?.ratingEmpresa && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <Star size={12} style={{ fill: "var(--chart-4)", color: "var(--chart-4)" }} />
                          {detalle.ratingEmpresa}
                          {!!detalle.evaluaciones && ` · ${detalle.evaluaciones} evaluaciones`}
                        </span>
                      )}
                    </p>
                  )}
                  {!!comuna && (
                    <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>{comuna}</p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                    {!!item.url && (
                      <a
                        href={String(item.url)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: "var(--accent)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                      >
                        Ver oferta <ExternalLink size={12} />
                      </a>
                    )}
                    {!!item.venceEn && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{diasRestantes(item.venceEn as string)}</span>
                    )}
                    {!!detalle?.publicadaHace && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{detalle.publicadaHace}</span>
                    )}
                  </div>

                  {(chips.length > 0 || !!detalle?.sueldo) && (
                    <div className="ap-tags" style={{ justifyContent: "center", marginTop: 10 }}>
                      {!!detalle?.sueldo && <span className="ap-tag">{detalle.sueldo}</span>}
                      {chips.map((c, i) => (
                        <span className="ap-tag" key={i}>{c}</span>
                      ))}
                    </div>
                  )}

                  {!!detalle?.extracto && <p className="ap-extracto">{detalle.extracto}</p>}

                  {razones.length > 0 && <RazonesEnDos razones={razones} />}
                </div>
              );
            }}
            pie={
              <p className="ap-decidir-cuando">
                Si dices que sí, se envía <b>en cuanto tu computador tenga Chrome abierto con la extensión</b>.
              </p>
            }
          />
        )}
      </div>
    </div>
  );
}
