"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Tipo = "ok" | "err" | "info";

type Aviso = {
  id: number;
  tipo: Tipo;
  titulo: string;
  detalle?: string;
  saliendo?: boolean;
};

type Ctx = {
  avisar: (tipo: Tipo, titulo: string, detalle?: string) => void;
  exito: (titulo: string, detalle?: string) => void;
  error: (titulo: string, detalle?: string) => void;
};

const AvisosCtx = createContext<Ctx | null>(null);

/**
 * Los avisos de éxito se van solos a los 5 segundos; los de error se quedan
 * hasta que la persona los cierre. Un error que desaparece antes de que
 * alcances a leerlo es peor que no mostrarlo.
 */
const MS_AUTOCIERRE: Record<Tipo, number | null> = {
  ok: 5000,
  info: 6000,
  err: null,
};

const MAX_VISIBLES = 3;

let siguienteId = 1;

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const cerrar = useCallback((id: number) => {
    setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, saliendo: true } : a)));
    // Se espera a que termine la animación de salida antes de sacarlo del
    // árbol -- si se quita de una, el aviso desaparece de golpe.
    setTimeout(() => setAvisos((prev) => prev.filter((a) => a.id !== id)), 280);
  }, []);

  const avisar = useCallback(
    (tipo: Tipo, titulo: string, detalle?: string) => {
      const id = siguienteId++;
      setAvisos((prev) => [...prev, { id, tipo, titulo, detalle }].slice(-MAX_VISIBLES));

      const ms = MS_AUTOCIERRE[tipo];
      if (ms) setTimeout(() => cerrar(id), ms);
    },
    [cerrar],
  );

  const valor = useMemo<Ctx>(
    () => ({
      avisar,
      exito: (titulo, detalle) => avisar("ok", titulo, detalle),
      error: (titulo, detalle) => avisar("err", titulo, detalle),
    }),
    [avisar],
  );

  return (
    <AvisosCtx.Provider value={valor}>
      {children}
      <div className="ap-avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`ap-toast ap-toast--${a.tipo}${a.saliendo ? " is-out" : ""}`}
          >
            <Icono tipo={a.tipo} />
            <div style={{ minWidth: 0 }}>
              <p className="ap-toast__t">{a.titulo}</p>
              {a.detalle && <p className="ap-toast__d">{a.detalle}</p>}
            </div>
            <button
              type="button"
              className="ap-toast__x"
              onClick={() => cerrar(a.id)}
              aria-label="Cerrar aviso"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}

function Icono({ tipo }: { tipo: Tipo }) {
  const comun = {
    className: "ap-toast__ico",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (tipo === "ok") {
    return (
      <svg {...comun}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </svg>
    );
  }
  return (
    <svg {...comun}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

/**
 * Muestra avisos desde cualquier componente cliente.
 *
 *   const { exito, error } = useAvisos();
 *   error("No pudimos guardar tu perfil", "Revisa tu conexión y vuelve a intentar.");
 */
export function useAvisos(): Ctx {
  const ctx = useContext(AvisosCtx);
  if (!ctx) {
    throw new Error("useAvisos() necesita estar dentro de <ProveedorAvisos> (se monta en app/layout.tsx)");
  }
  return ctx;
}
