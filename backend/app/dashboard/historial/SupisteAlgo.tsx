"use client";

import { useEffect, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { OPCIONES_PERSONA, fraseEstado } from "@/lib/palabras-estado";

type Pendiente = { id: string; titulo: string; empresa: string | null; portal: string; enviadaEn: string };

const dias = (iso: string) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * "¿Supiste algo de estas?" (docs/estado-real-de-postulaciones.md §6): la
 * persona es la única que sabe si la llamaron o si tuvo entrevista. Un toque
 * por postulación; al contestar, la fila se va y la lista se actualiza.
 */
export default function SupisteAlgo({ alContar }: { alContar: (id: string, estado: string | null) => void }) {
  const { exito, error: avisarError } = useAvisos();
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [total, setTotal] = useState(0);
  const [enviando, setEnviando] = useState<string | null>(null);

  function cargar() {
    fetch("/api/applications/sin-noticias")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setPendientes(d.postulaciones ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {});
  }

  useEffect(cargar, []);

  async function contar(p: Pendiente, respuesta: string) {
    setEnviando(p.id);
    try {
      const res = await fetch(`/api/applications/${p.id}/reporte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuesta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisarError("No pudimos guardarlo", data.error ?? "Vuelve a intentar en unos segundos.");
        return;
      }
      alContar(p.id, respuesta === "nada" ? null : data.estado);
      exito(
        "Anotado",
        respuesta === "nada"
          ? "Te volvemos a preguntar en una semana."
          : `${p.titulo}: ${fraseEstado(data.estado).toLowerCase()}. El portal ya no lo cambia.`,
      );
      setPendientes((ps) => ps.filter((x) => x.id !== p.id));
      setTotal((t) => Math.max(0, t - 1));
      // Si quedan más de las que se muestran, se trae la siguiente.
      if (pendientes.length === 1 && total > 1) cargar();
    } catch {
      avisarError("No pudimos guardarlo", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(null);
    }
  }

  if (!pendientes.length) return null;

  return (
    <section className="ap-card ap-supiste ap-animate-in" aria-labelledby="supiste-t">
      <div className="ap-bloque-cab">
        <div>
          <p className="ap-bloque-t" id="supiste-t">¿Supiste algo de estas?</p>
          <p className="ap-bloque-s">
            Las enviaste hace más de 5 días y el portal no dice nada.
            {total > pendientes.length && ` Quedan ${total - pendientes.length} más.`}
          </p>
        </div>
      </div>
      {pendientes.map((p) => (
        <div className="ap-supiste__fila" key={p.id}>
          <div style={{ minWidth: 0 }}>
            <p className="ap-supiste__cargo">
              {p.titulo}
              {p.empresa ? ` · ${p.empresa}` : ""}
            </p>
            <p className="ap-supiste__meta">
              {p.portal} · enviada hace {dias(p.enviadaEn)} días
            </p>
          </div>
          <div className="ap-opciones" role="group" aria-label={`Qué pasó con ${p.titulo}`}>
            {OPCIONES_PERSONA.map((o) => (
              <button
                key={o.valor}
                type="button"
                className="ap-opcion"
                disabled={enviando === p.id}
                onClick={() => contar(p, o.valor)}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
