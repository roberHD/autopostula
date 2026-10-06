"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { Skel } from "@/components/Esqueleto";
import { EVENTO_MONEDAS } from "@/app/dashboard/LatidoUso";

type Canje = { id: string; monedas: number; postulaciones: number };

/**
 * Tus monedas (lib/monedas.ts): cuántas llevas y en qué se podrán canjear.
 * Se ganan solas, 1 por cada hora con el panel a la vista o la extensión
 * encendida. El canje todavía no existe: se muestra lo que viene, con cuánto
 * falta para cada uno, y "Próximamente".
 */
export default function MonedasPerfil() {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/monedas")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setSaldo(typeof d.saldo === "number" ? d.saldo : 0);
        setCanjes(Array.isArray(d.canjes) ? d.canjes : []);
      })
      .catch(() => setError(true));

    // LatidoUso avisa cuando una hora de uso ganó una moneda: el número sube
    // sin recargar la página.
    const alGanar = (e: Event) => {
      const nuevo = (e as CustomEvent<{ saldo?: number }>).detail?.saldo;
      if (typeof nuevo === "number") setSaldo(nuevo);
    };
    window.addEventListener(EVENTO_MONEDAS, alGanar);
    return () => window.removeEventListener(EVENTO_MONEDAS, alGanar);
  }, []);

  return (
    <section className="ap-card ap-lado ap-animate-in" aria-labelledby="monedas-t">
      <p className="ap-bloque-t" id="monedas-t">Tus monedas</p>
      <p className="ap-bloque-s" style={{ marginTop: 2, lineHeight: 1.55 }}>
        Ganas 1 moneda por cada hora que usas AutoPostula: con el panel abierto o con la extensión encendida.
      </p>

      <div className="ap-monedas__saldo">
        <span className="ap-monedas__ico" aria-hidden="true"><Coins size={20} /></span>
        {saldo === null && !error ? (
          <Skel ancho={90} alto={30} />
        ) : (
          <p>
            <span className="ap-monedas__num">{error ? "—" : saldo!.toLocaleString("es-CL")}</span>
            <span className="ap-monedas__unidad">{saldo === 1 ? "moneda" : "monedas"}</span>
          </p>
        )}
      </div>
      {error && <p className="ap-bloque-s">No pudimos cargar tus monedas. Recarga la página para intentar de nuevo.</p>}

      <div className="ap-monedas__canje">
        <div className="ap-monedas__canje-cab">
          <p className="ap-bloque-t" style={{ fontSize: 13 }}>Canjear</p>
          <span className="ap-tag ap-monedas__pronto">Próximamente</span>
        </div>
        <p className="ap-bloque-s" style={{ lineHeight: 1.55 }}>
          Muy pronto vas a poder cambiar tus monedas por postulaciones extra. Las que juntes desde ya te sirven.
        </p>

        <ul className="ap-monedas__lista">
          {canjes.map((c) => {
            const actual = saldo ?? 0;
            const pct = Math.min(100, Math.round((actual / c.monedas) * 100));
            const falta = Math.max(0, c.monedas - actual);
            return (
              <li key={c.id} className="ap-medidor">
                <div className="ap-medidor__top">
                  <span>
                    <strong>{c.postulaciones} postulaciones</strong>
                    <span style={{ color: "var(--text-muted)" }}> · {c.monedas.toLocaleString("es-CL")} monedas</span>
                  </span>
                  <span className="ap-monedas__falta">
                    {falta === 0 ? "Te alcanza" : `Te faltan ${falta.toLocaleString("es-CL")}`}
                  </span>
                </div>
                <span className="ap-medidor__barra" role="progressbar" aria-valuemin={0} aria-valuemax={c.monedas} aria-valuenow={Math.min(actual, c.monedas)} aria-label={`${c.postulaciones} postulaciones`}>
                  <span className="ap-medidor__relleno" style={{ width: `${pct}%` }} data-lleno={pct >= 100 ? "1" : undefined} />
                </span>
              </li>
            );
          })}
          {saldo === null && !error && [0, 1].map((i) => <li key={i}><Skel ancho="100%" alto={30} /></li>)}
        </ul>
      </div>
    </section>
  );
}
