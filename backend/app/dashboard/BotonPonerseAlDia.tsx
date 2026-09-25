"use client";

import { useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { SIN_EXTENSION_PONERSE, textoEstimadoPonerse, textoMotivoPonerse } from "@/lib/texto-rafaga";
import { extensionPresente, pedirALaExtension } from "@/lib/puente-extension";

// docs/rafagas-y-ponerse-al-dia.md §3.6: "Ponerme al día ahora", solo para
// quien su plan incluye la búsqueda automática (la barra que lo monta ya lo
// exige). Viaja por bridge.js igual que "conectar": la página dispara un
// evento, la extensión decide y contesta con otro. La extensión es la que sabe
// si se puede (pausa, cupo, si ya está corriendo, si terminó hace nada) --
// acá solo se transporta y se explica.
//
// Vive en la barra de arriba, así que no tiene espacio para una línea de
// estado debajo: lo que pasó se cuenta en un aviso, y cuánto suele tardar va
// en el título del botón. TEXTO_EMPEZO es el mismo del popup
// (TEXTO_EMPEZO_PONERSE): lo verifica extension/verificar-rafagas.js.

const TEXTO_EMPEZO = "Empezó. Puedes cerrar esto: te avisamos en el ícono de la extensión.";

export default function BotonPonerseAlDia({ estimadoMs }: { estimadoMs: number | null }) {
  const { exito, avisar } = useAvisos();
  const [enviando, setEnviando] = useState(false);

  async function ponerse() {
    setEnviando(true);
    try {
      // Sin la extensión en ESTE navegador (el celular, sobre todo) no hay nada
      // que hacer: se explica que esto corre en el computador, y no se finge nada.
      if (!(await extensionPresente())) {
        avisar("info", "Esto corre en tu computador", SIN_EXTENSION_PONERSE);
        return;
      }
      const resultado = await pedirALaExtension("ponerse-al-dia");
      if (resultado.ok) {
        exito("Poniéndose al día", `${TEXTO_EMPEZO} ${textoEstimadoPonerse(estimadoMs)}`);
      } else {
        avisar("info", "No empezó", textoMotivoPonerse(resultado.motivo));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button
      type="button"
      className="ap-button-ghost ap-btn--sm"
      onClick={ponerse}
      disabled={enviando}
      title={textoEstimadoPonerse(estimadoMs)}
    >
      {enviando ? "Empezando…" : "Ponerme al día"}
    </button>
  );
}
