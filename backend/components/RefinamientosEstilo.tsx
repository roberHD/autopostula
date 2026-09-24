"use client";

import { useCallback, useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { useAvisos } from "@/components/Avisos";

// docs/banco-de-preguntas.md §6. Aparece solo cuando hay un patrón detectado:
// si no hay nada que preguntar, no ocupa espacio. Lo que la persona responde
// acá ajusta el StyleProfile, así que el ajuste fino deja de depender solo de
// lo que dijo en la conversación inicial.

type Refinamiento = {
  id: string;
  patron: string;
  pregunta: string;
  opciones: { valor: string; etiqueta: string }[];
};

export default function RefinamientosEstilo({ onAjustado }: { onAjustado?: () => void }) {
  const { exito, error: avisarError } = useAvisos();
  const [pendientes, setPendientes] = useState<Refinamiento[]>([]);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/style/refinamientos");
      if (!res.ok) return;
      const data = await res.json();
      setPendientes(data.pendientes ?? []);
    } catch {
      // Silencio a propósito: es una sugerencia, no una función principal.
      // Si falla, la pantalla de ajuste fino sigue sirviendo igual.
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function responder(refinamientoId: string, valor: string) {
    setRespondiendo(refinamientoId);
    try {
      const res = await fetch("/api/style/refinamientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refinamientoId, valor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisarError("No pudimos guardar tu respuesta", data.error ?? `Error ${res.status}`);
        return;
      }
      setPendientes((p) => p.filter((r) => r.id !== refinamientoId));
      if (data.ajustado) {
        exito("Listo", "Lo vamos a tener en cuenta de aquí en adelante.");
        onAjustado?.();
      }
    } catch {
      avisarError("No pudimos guardar tu respuesta", "Revisa tu conexión.");
    } finally {
      setRespondiendo(null);
    }
  }

  if (!pendientes.length) return null;

  return (
    <>
      {pendientes.map((r) => (
        <div key={r.id} className="ap-refinamiento ap-animate-in">
          <span className="ap-refinamiento__ico"><Lightbulb size={16} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="ap-refinamiento__txt">{r.pregunta}</p>
            <p className="ap-refinamiento__fuente">Lo notamos en las respuestas que corregiste antes de enviarlas.</p>
            <div className="ap-refinamiento__ops">
              {r.opciones.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  className="ap-button-ghost"
                  disabled={respondiendo === r.id}
                  onClick={() => responder(r.id, o.valor)}
                >
                  {o.etiqueta}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
