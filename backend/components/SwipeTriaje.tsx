"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

// Componente único de swipe (docs/rediseno-filtrado-ofertas.md §8.1): la misma
// interacción "¿postularías a esto? Sí/No" sirve tanto para el triaje de
// onboarding como, más adelante, para la banda gris del scorer (§6) -- por eso
// no sabe nada de dónde salen los items ni de qué endpoint los guarda, solo
// recibe la lista y un callback.
export type ItemSwipe = { id: string; titulo: string };

export function SwipeTriaje({
  items,
  onDecidir,
  onTerminar,
  pregunta = (titulo: string) => `¿Postularías a un trabajo de "${titulo}"?`,
}: {
  items: ItemSwipe[];
  onDecidir: (item: ItemSwipe, veredicto: "SI" | "NO") => void | Promise<void>;
  onTerminar: () => void;
  pregunta?: (titulo: string) => string;
}) {
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const actual = items[indice];
  const terminado = !items.length || indice >= items.length;

  async function decidir(veredicto: "SI" | "NO") {
    if (!actual || enviando) return;
    setEnviando(true);
    try {
      await onDecidir(actual, veredicto);
    } finally {
      setEnviando(false);
      setIndice((i) => i + 1);
    }
  }

  if (terminado) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>¡Listo! Eso nos ayuda mucho a entender qué buscas.</p>
        <button className="ap-button" onClick={onTerminar}>
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginBottom: 16 }}>
        {indice + 1} de {items.length}
      </p>
      <div
        key={actual.id}
        className="ap-animate-in"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "36px 24px",
          textAlign: "center",
          marginBottom: 20,
          minHeight: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-elevated)",
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 700, textTransform: "capitalize" }}>{actual.titulo}</p>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginBottom: 20 }}>
        {pregunta(actual.titulo)}
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          disabled={enviando}
          onClick={() => decidir("NO")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 28px",
            borderRadius: 10,
            border: "1px solid var(--status-rechazado)",
            color: "var(--status-rechazado)",
            background: "transparent",
            fontSize: 14,
            fontWeight: 600,
            cursor: enviando ? "default" : "pointer",
            opacity: enviando ? 0.6 : 1,
          }}
        >
          <X size={16} /> No
        </button>
        <button
          disabled={enviando}
          onClick={() => decidir("SI")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 28px",
            borderRadius: 10,
            border: "none",
            color: "#fff",
            background: "var(--chart-3)",
            fontSize: 14,
            fontWeight: 600,
            cursor: enviando ? "default" : "pointer",
            opacity: enviando ? 0.6 : 1,
          }}
        >
          <Check size={16} /> Sí
        </button>
      </div>
    </div>
  );
}
