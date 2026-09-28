"use client";

import { useEffect, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { SkelFilas } from "@/components/Esqueleto";
import type { Revision } from "@/lib/chequeo-cv";

type Resultado =
  | { tieneCv: false }
  | { tieneCv: true; legible: boolean; revisiones: Revision[]; porArreglar: number };

const ICONO = { ok: <Check />, aviso: <TriangleAlert />, mal: <X /> };
const COLOR = { ok: "var(--ok)", aviso: "var(--warn)", mal: "var(--err)" };

/**
 * Qué tan bien van a leer tu CV los portales, con arreglos concretos
 * (docs/estrategia-y-rediseno.md §4.2). Se vuelve a pedir cuando cambia
 * `version` (al subir otro CV o guardar los datos).
 */
export default function ChequeoCv({ version = 0 }: { version?: number }) {
  const [res, setRes] = useState<Resultado | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/cv/chequeo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && d && setRes(d))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [version]);

  if (!res) return <div className="ap-card"><SkelFilas n={3} /></div>;
  if (!res.tieneCv) return null;

  const n = res.porArreglar;

  return (
    <section className="ap-card ap-animate-in" aria-labelledby="chequeo-cv-t">
      <div className="ap-chequeo__res">
        <span className="ap-chequeo__n ap-tnum" style={{ color: n === 0 ? "var(--ok)" : undefined }}>
          {n === 0 ? <Check /> : n}
        </span>
        <div>
          <p className="ap-chequeo__t" id="chequeo-cv-t">
            {n === 0 ? "Tu CV está en orden" : n === 1 ? "cosa por arreglar" : "cosas por arreglar"}
          </p>
          <p className="ap-chequeo__d">
            {!res.legible
              ? "Antes que nada, los portales tienen que poder leerlo."
              : n === 0
                ? "Los portales lo van a leer bien."
                : "Tu CV se puede leer. Con estos arreglos, los portales lo van a entender mejor."}
          </p>
        </div>
      </div>
      {res.revisiones.map((r) => (
        <div className="ap-revision" key={r.clave} style={{ "--c": COLOR[r.estado] } as React.CSSProperties}>
          <span className="ap-revision__i">{ICONO[r.estado]}</span>
          <div>
            <p className="ap-revision__t">{r.titulo}</p>
            <p className="ap-revision__d">{r.detalle}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
