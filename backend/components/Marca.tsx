/**
 * El logotipo: una casilla que se marca sola. Es literalmente lo que hace el
 * producto, y a 16px (favicon) sigue leyéndose. El trazo se dibuja al montar.
 */
export function Marca({ tam = 30, className = "" }: { tam?: number; className?: string }) {
  return (
    <span
      className={`ap-mark${className ? ` ${className}` : ""}`}
      style={{ width: tam, height: tam, borderRadius: Math.round(tam * 0.27) }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" style={{ width: tam * 0.57, height: tam * 0.57 }}>
        <path d="M4 12.5l5.2 5.2L20 6.8" />
      </svg>
    </span>
  );
}

export function MarcaConNombre({ tam = 30 }: { tam?: number }) {
  return (
    <>
      <Marca tam={tam} />
      <b>AutoPostula</b>
    </>
  );
}
