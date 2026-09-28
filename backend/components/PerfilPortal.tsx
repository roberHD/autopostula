"use client";

import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { useAvisos } from "@/components/Avisos";

type Perfil = {
  titulo: string;
  resumen: string;
  experiencias: { cargo: string; empresa: string; texto: string }[];
};

function Copiable({ etiqueta, texto }: { etiqueta: string; texto: string }) {
  const { exito, error } = useAvisos();
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      exito("Copiado", `Pégalo en "${etiqueta}" de tu perfil en Computrabajo.`);
    } catch {
      error("No se pudo copiar", "Selecciona el texto y cópialo a mano.");
    }
  }
  return (
    <div className="ap-copiable">
      <p className="ap-copiable__l">{etiqueta}</p>
      <div className="ap-copiable__caja">
        <p>{texto}</p>
        <button type="button" className="ap-button-ghost ap-btn--sm" onClick={copiar} aria-label={`Copiar ${etiqueta}`}>
          <Copy size={14} /> Copiar
        </button>
      </div>
    </div>
  );
}

/**
 * Tu perfil dentro de Computrabajo (docs/estrategia-y-rediseno.md §4.2):
 * Computrabajo ordena a quienes postulan comparando el CV del portal con cada
 * aviso, así que vale la pena que ese perfil diga lo mismo que tu CV, con las
 * palabras de los avisos. Se arma solo cuando la persona lo pide.
 */
export default function PerfilPortal() {
  const { error: avisarError } = useAvisos();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(false);

  async function armar() {
    setCargando(true);
    try {
      const res = await fetch("/api/cv/perfil-portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisarError("No pudimos armar el texto", data.error ?? "Vuelve a intentar en unos segundos.");
        return;
      }
      if (!data.disponible) {
        avisarError("La IA no está disponible", "Vuelve a intentar más tarde.");
        return;
      }
      setPerfil(data.perfil);
    } catch {
      avisarError("No pudimos armar el texto", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="ap-card ap-lado ap-animate-in" aria-labelledby="perfil-portal-t">
      <p className="ap-bloque-t" id="perfil-portal-t">Tu perfil dentro de Computrabajo</p>
      <p className="ap-bloque-s" style={{ marginTop: 2, lineHeight: 1.55 }}>
        Computrabajo compara tu perfil de allá con cada aviso para ordenar a quienes postulan. Te armamos el texto con
        lo que dice tu CV, para que lo pegues tal cual.
      </p>

      {!perfil ? (
        <button type="button" className="ap-button" style={{ marginTop: 14 }} onClick={armar} disabled={cargando}>
          <Sparkles size={15} /> {cargando ? "Armando el texto…" : "Armar el texto"}
        </button>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <Copiable etiqueta="Título del perfil" texto={perfil.titulo} />
          <Copiable etiqueta="Resumen" texto={perfil.resumen} />
          {perfil.experiencias.map((e, i) => (
            <Copiable key={i} etiqueta={[e.cargo, e.empresa].filter(Boolean).join(" · ")} texto={e.texto} />
          ))}
          <p className="ap-bloque-s">Revísalo antes de pegarlo: sale solo de tu CV, pero la IA puede equivocarse.</p>
        </div>
      )}
    </section>
  );
}
