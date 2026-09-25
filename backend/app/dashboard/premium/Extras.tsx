"use client";

import { useEffect, useState } from "react";
// lucide ya no trae los logos de marcas: para Instagram va una cámara,
// que es lo que se entiende igual sin usar una marca ajena.
import { Camera, Copy, Gift, MessageCircle, Plus } from "lucide-react";
import { useAvisos } from "@/components/Avisos";
import { formatoPesos } from "@/lib/pases";

type Paquete = { id: string; postulaciones: number; monto: number; nombre: string };
type Movimiento = { id: string; cantidad: number; etiqueta: string; detalle: string | null; en: string };
type Datos = {
  saldo: number;
  movimientos: Movimiento[];
  paquetes: Paquete[];
  premios: { invitacion: number; perfil: number };
  invitacion: { codigo: string; url: string; aceptadas: number };
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });

/**
 * Postulaciones extra y premios (docs/creditos-y-pagina-nueva.md §3).
 *
 * Se usan DESPUÉS de las del plan, no vencen y se pueden ganar invitando o
 * dejando el perfil listo. Eso último es lo que se dice arriba de todo: quien
 * llega acá porque se le acabó el mes tiene que ver que hay una salida que no
 * cuesta plata antes que el botón de pagar.
 */
export default function Extras() {
  const { exito, error: avisarError } = useAvisos();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/extras")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDatos(d))
      .catch(() => {});
  }, []);

  async function comprar(paquete: Paquete) {
    if (comprando) return;
    setComprando(paquete.id);
    try {
      const res = await fetch("/api/flow/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paquete: paquete.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        avisarError("No se pudo iniciar el pago", data.error ?? "Intenta de nuevo en un momento.");
        setComprando(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      avisarError("No se pudo iniciar el pago", "Revisa tu conexión e intenta de nuevo.");
      setComprando(null);
    }
  }

  async function copiar() {
    if (!datos) return;
    try {
      await navigator.clipboard.writeText(datos.invitacion.url);
      exito("Enlace copiado", "Mándaselo a quien quieras: ganas cuando entre y verifique su correo.");
    } catch {
      avisarError("No se pudo copiar", "Selecciona el enlace y cópialo a mano.");
    }
  }

  if (!datos) return null;

  const texto = `Estoy usando AutoPostula para postular a trabajos sin llenar formularios. Si entras con mi enlace, a los dos nos sirve: ${datos.invitacion.url}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return (
    <>
      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.05s" }}>
        <p className="ap-section-title">Postulaciones extra</p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 14 }}>
          Se usan cuando se te acaban las de tu plan en el mes. No vencen y no se renuevan solas: las compras o las
          ganas una vez y quedan ahí.
        </p>

        <div className="ap-extras__saldo">
          <b>{datos.saldo}</b>
          <span>{datos.saldo === 1 ? "postulación extra disponible" : "postulaciones extra disponibles"}</span>
        </div>

        <div className="ap-extras__paquetes">
          {datos.paquetes.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ap-extras__paquete"
              onClick={() => comprar(p)}
              disabled={!!comprando}
            >
              <b>{p.postulaciones} postulaciones</b>
              <span>${formatoPesos(p.monto)}</span>
              <em>{comprando === p.id ? "Abriendo el pago…" : `$${formatoPesos(Math.round(p.monto / p.postulaciones))} cada una`}</em>
            </button>
          ))}
        </div>

        {datos.movimientos.length > 0 && (
          <ul className="ap-extras__log">
            {datos.movimientos.map((m) => (
              <li key={m.id}>
                <span className={m.cantidad > 0 ? "ap-extras__mas" : "ap-extras__menos"}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </span>
                <span>
                  {m.etiqueta}
                  {m.detalle ? ` · ${m.detalle}` : ""}
                </span>
                <em>{fecha(m.en)}</em>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ap-section ap-animate-in" style={{ animationDelay: "0.1s" }}>
        <p className="ap-section-title">Gánalas sin pagar</p>

        <div className="ap-extras__premio">
          <Gift size={16} />
          <div>
            <p><b>+{datos.premios.invitacion} por cada persona que invites</b></p>
            <p>
              Se te acreditan cuando entra con tu enlace y verifica su correo.
              {datos.invitacion.aceptadas > 0
                ? ` Ya lo hicieron ${datos.invitacion.aceptadas}.`
                : " Todavía no las usa nadie."}
            </p>
          </div>
        </div>

        <div className="ap-copiable" style={{ marginTop: 12 }}>
          <p className="ap-copiable__l">Tu enlace</p>
          <div className="ap-copiable__caja">
            <p>{datos.invitacion.url}</p>
            <button type="button" className="ap-button-ghost ap-btn--sm" onClick={copiar} aria-label="Copiar tu enlace">
              <Copy size={14} /> Copiar
            </button>
          </div>
        </div>

        <div className="ap-extras__compartir">
          <a className="ap-button-ghost ap-btn--sm" href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle size={14} /> Mandar por WhatsApp
          </a>
          {/* Instagram no abre una app de compartir desde el navegador: lo que
              sirve de verdad es el texto listo para pegar en una historia o un
              mensaje directo. */}
          <button
            type="button"
            className="ap-button-ghost ap-btn--sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(texto);
                exito("Texto copiado", "Pégalo en tu historia o en un mensaje de Instagram.");
              } catch {
                avisarError("No se pudo copiar", "Copia el enlace de arriba a mano.");
              }
            }}
          >
            <Camera size={14} /> Copiar para Instagram
          </button>
        </div>

        <div className="ap-extras__premio" style={{ marginTop: 14 }}>
          <Plus size={16} />
          <div>
            <p><b>+{datos.premios.perfil} por dejar tu perfil listo</b></p>
            <p>CV subido, lo que buscas confirmado y al menos un portal conectado. Una sola vez.</p>
          </div>
        </div>
      </div>
    </>
  );
}
