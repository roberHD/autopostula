"use client";

import { useState } from "react";
import PerfilCv from "@/components/PerfilCv";
import ChequeoCv from "@/components/ChequeoCv";
import PerfilPortal from "@/components/PerfilPortal";
import DatosParaLaIa from "@/components/DatosParaLaIa";

/**
 * Perfil: tu CV y tus datos, lo que la IA usa para responder por ti. Entrenar
 * la IA (conversación, calibración, ajuste fino) es otra cosa y vive aparte.
 */
export default function PerfilPage() {
  // Sube cada vez que cambia el CV o los datos, para que el chequeo se rehaga.
  const [version, setVersion] = useState(0);

  return (
    <div className="ap-glow-bg">
      <div className="ap-page-header">
        <h1 className="ap-page-title">Perfil</h1>
        <p className="ap-page-sub">Tu CV y tus datos: lo que la IA usa para responder por ti.</p>
      </div>

      <PerfilCv alCambiar={() => setVersion((v) => v + 1)} trasCv={
          <div className="ap-split" style={{ alignItems: "start" }}>
            <ChequeoCv version={version} />
            <PerfilPortal />
            <DatosParaLaIa />
          </div>
        } />
    </div>
  );
}
