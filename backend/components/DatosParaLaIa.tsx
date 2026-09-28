"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useAvisos } from "@/components/Avisos";

type Dato = { id: string; texto: string };

/**
 * Datos sueltos para responder formularios (docs/estrategia-y-rediseno.md §6).
 *
 * Hechos cortos que no están en el CV y que los portales preguntan igual:
 * licencia de conducir, disponibilidad para viajar, desde cuándo puede
 * empezar. Vivían dentro del popup de la extensión, donde se perdían al
 * cambiar de computador y no había cómo verlos desde el panel.
 */
export default function DatosParaLaIa() {
  const { exito, error: avisarError } = useAvisos();
  const [datos, setDatos] = useState<Dato[] | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch("/api/account/opciones-extension")
      .then((r) => r.json())
      .then((d) => setDatos(Array.isArray(d.infoAdicional) ? d.infoAdicional : []))
      .catch(() => setDatos([]));
  }, []);

  async function guardar(nuevos: Dato[], mensaje: string) {
    const previos = datos ?? [];
    setDatos(nuevos);
    setGuardando(true);
    try {
      const res = await fetch("/api/account/opciones-extension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ info: nuevos }),
      });
      if (!res.ok) {
        setDatos(previos);
        const data = await res.json().catch(() => ({}));
        avisarError("No pudimos guardarlo", data.error ?? "Vuelve a intentar en unos segundos.");
        return;
      }
      exito(mensaje, "La extensión lo usa en la próxima postulación.");
    } catch {
      setDatos(previos);
      avisarError("No pudimos guardarlo", "Revisa tu conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  function agregar() {
    const limpio = texto.trim();
    if (!limpio || guardando) return;
    setTexto("");
    guardar([...(datos ?? []), { id: String(Date.now()), texto: limpio }], "Dato agregado");
  }

  return (
    <section className="ap-card ap-lado ap-animate-in" aria-labelledby="datos-ia-t">
      <p className="ap-bloque-t" id="datos-ia-t">Tus datos para los formularios</p>
      <p className="ap-bloque-s" style={{ marginTop: 2, lineHeight: 1.55 }}>
        Lo que los portales preguntan y no está en tu CV: licencia de conducir, desde cuándo puedes empezar, si
        puedes viajar. La IA responde con esto, en vez de inventar.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input
          className="ap-input"
          style={{ flex: 1 }}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
          placeholder="Tengo licencia clase B y auto propio"
          aria-label="Agregar un dato para la IA"
          maxLength={300}
        />
        <button type="button" className="ap-button" onClick={agregar} disabled={guardando || !texto.trim()}>
          <Plus size={15} /> Agregar
        </button>
      </div>

      {datos === null ? (
        <p className="ap-bloque-s" style={{ marginTop: 12 }}>Cargando…</p>
      ) : datos.length === 0 ? (
        <p className="ap-bloque-s" style={{ marginTop: 12 }}>
          Todavía no agregas ninguno. Sin esto, cuando un formulario pregunte algo que tu CV no dice, la postulación
          queda a medias esperándote.
        </p>
      ) : (
        <ul className="ap-datos-ia">
          {datos.map((d) => (
            <li key={d.id}>
              <span>{d.texto}</span>
              <button
                type="button"
                onClick={() => guardar(datos.filter((x) => x.id !== d.id), "Dato eliminado")}
                disabled={guardando}
                aria-label={`Eliminar "${d.texto}"`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
