"use client";

import { useState } from "react";
import { Check, X, type LucideIcon } from "lucide-react";

// Componente único de swipe (docs/rediseno-filtrado-ofertas.md §8.1): la misma
// interacción "¿postularías a esto? Sí/No" sirve tanto para el triaje de
// onboarding como, más adelante, para la banda gris del scorer (§6) -- por eso
// no sabe nada de dónde salen los items ni de qué endpoint los guarda, solo
// recibe la lista y un callback.
export type ItemSwipe = { id: string; titulo: string; [extra: string]: unknown };

// Una respuesta posible. El triaje y la banda gris usan dos (Sí/No); el
// seguimiento de postulaciones usa cuatro ("nada todavía / me escribieron /
// tuve entrevista / me rechazaron", docs/estado-real-de-postulaciones.md §6.2).
// El componente no sabe qué significan: solo las dibuja y devuelve el valor.
export type OpcionSwipe<V extends string = string> = {
  valor: V;
  etiqueta: string;
  Icon?: LucideIcon;
  // "si" pinta el botón relleno, "no" el borde rojo, "neutro" el borde gris.
  tono?: "si" | "no" | "neutro";
};

const OPCIONES_SI_NO: OpcionSwipe<"SI" | "NO">[] = [
  { valor: "NO", etiqueta: "No", Icon: X, tono: "no" },
  { valor: "SI", etiqueta: "Sí", Icon: Check, tono: "si" },
];

function estiloBoton(tono: OpcionSwipe["tono"], enviando: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 22px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: enviando ? "default" : "pointer",
    opacity: enviando ? 0.6 : 1,
  };
  if (tono === "si") {
    return { ...base, border: "none", color: "var(--ok-soft)", background: "var(--ok)" };
  }
  if (tono === "no") {
    return { ...base, border: "1px solid var(--status-rechazado)", color: "var(--status-rechazado)", background: "transparent" };
  }
  return { ...base, border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-elevated-2)" };
}

export function SwipeTriaje<V extends string = "SI" | "NO">({
  items,
  onDecidir,
  onTerminar,
  pregunta = (titulo: string) => `¿Postularías a un trabajo de "${titulo}"?`,
  renderDetalle,
  pie,
  opciones = OPCIONES_SI_NO as unknown as OpcionSwipe<V>[],
  textoFinal = "¡Listo! Eso nos ayuda mucho a entender qué buscas.",
  textoBotonFinal = "Continuar",
}: {
  items: ItemSwipe[];
  onDecidir: (item: ItemSwipe, veredicto: V) => void | Promise<void>;
  onTerminar: () => void;
  pregunta?: (titulo: string) => string;
  // Las respuestas posibles. Por omisión, el Sí/No de siempre.
  opciones?: OpcionSwipe<V>[];
  textoFinal?: string;
  textoBotonFinal?: string;
  // Contenido extra por debajo del título -- la banda gris lo usa para
  // mostrar empresa, por qué cayó ahí, y un link a la oferta real; el triaje
  // de onboarding no lo necesita y lo deja sin usar.
  renderDetalle?: (item: ItemSwipe) => React.ReactNode;
  // Una línea bajo los botones mientras quedan ofertas (en "Por decidir":
  // cuándo se envía si dices que sí). Al terminar no se muestra.
  pie?: React.ReactNode;
}) {
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const actual = items[indice];
  const terminado = !items.length || indice >= items.length;

  async function decidir(veredicto: V) {
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
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{textoFinal}</p>
        <button className="ap-button" onClick={onTerminar}>
          {textoBotonFinal}
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
      {renderDetalle && <div style={{ marginBottom: 16 }}>{renderDetalle(actual)}</div>}
      <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginBottom: 20 }}>
        {pregunta(actual.titulo)}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            disabled={enviando}
            onClick={() => decidir(o.valor)}
            style={estiloBoton(o.tono, enviando)}
          >
            {o.Icon && <o.Icon size={16} />} {o.etiqueta}
          </button>
        ))}
      </div>
      {pie}
    </div>
  );
}
