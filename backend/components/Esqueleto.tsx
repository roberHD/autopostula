/**
 * Esqueletos de carga.
 *
 * La idea es siempre la misma: mientras llegan los datos se muestra la FORMA
 * de lo que va a aparecer, no un "Cargando..." sobre una pantalla vacía. Así
 * el layout no salta cuando llega la respuesta.
 *
 * Son componentes de presentación puros (sin hooks), así que sirven tanto en
 * el servidor como en el cliente.
 */

type Props = {
  ancho?: number | string;
  alto?: number | string;
  radio?: number | string;
  variante?: "text" | "title" | "pill" | "block";
  style?: React.CSSProperties;
};

export function Skel({ ancho = "100%", alto, radio, variante = "text", style }: Props) {
  return (
    <span
      className={`ap-skel ap-skel--${variante}`}
      style={{ width: ancho, height: alto, borderRadius: radio, ...style }}
      aria-hidden="true"
    />
  );
}

/** Varias líneas de texto, la última más corta como un párrafo real. */
export function SkelTexto({ lineas = 3, gap = 8 }: { lineas?: number; gap?: number }) {
  return (
    <span style={{ display: "grid", gap }} aria-hidden="true">
      {Array.from({ length: lineas }).map((_, i) => (
        <Skel key={i} ancho={i === lineas - 1 ? "62%" : "100%"} />
      ))}
    </span>
  );
}

/** La fila de tarjetas de métricas del inicio del dashboard. */
export function SkelStats({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="ap-card" style={{ padding: 20, borderTop: "2.5px solid var(--border)" }}>
          <Skel ancho={26} alto={26} radio={7} variante="block" />
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <Skel ancho="70%" />
            <Skel ancho={72} alto={26} variante="title" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Un bloque de gráfico: el marco se mantiene, el contenido se sombrea. */
export function SkelGrafico({ alto = 220, titulo = true }: { alto?: number; titulo?: boolean }) {
  return (
    <div className="ap-card" style={{ padding: 18 }}>
      {titulo && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <Skel ancho={160} variante="title" />
          <Skel ancho={220} />
        </div>
      )}
      <Skel ancho="100%" alto={alto} variante="block" />
    </div>
  );
}

/** Filas de una tabla o listado. */
export function SkelFilas({ n = 5, alto = 44 }: { n?: number; alto?: number }) {
  return (
    <div style={{ display: "grid", gap: 1, background: "var(--border)" }}>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "0 16px", height: alto, background: "var(--bg-elevated)",
          }}
        >
          <Skel ancho="34%" />
          <Skel ancho="18%" />
          <Skel ancho={84} variante="pill" style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}
