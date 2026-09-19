"use client";

import { useState } from "react";
import { SIN_EXTENSION_PONERSE, textoEstimadoPonerse, textoMotivoPonerse } from "@/lib/texto-rafaga";
import { extensionPresente, pedirALaExtension } from "@/lib/puente-extension";

// docs/rafagas-y-ponerse-al-dia.md §3.6: "Ponerme al día ahora", solo para
// quien su plan incluye la búsqueda automática (la tarjeta que lo monta ya lo
// exige: solo aparece con la búsqueda activa). Viaja por bridge.js igual que
// "conectar": la página dispara un evento, la extensión decide y contesta con
// otro. La extensión es la que sabe si se puede (pausa, cupo, si ya está
// corriendo, si terminó hace nada) -- acá solo se transporta y se explica.

type Fase = "listo" | "enviando" | "empezo" | "aviso";

const TEXTO_EMPEZO = "Empezó. Puedes cerrar esto: te avisamos en el ícono de la extensión.";

export default function BotonPonerseAlDia({ estimadoMs }: { estimadoMs: number | null }) {
  const [fase, setFase] = useState<Fase>("listo");
  const [aviso, setAviso] = useState<string | null>(null);

  async function ponerse() {
    setFase("enviando");
    setAviso(null);

    // Sin la extensión en ESTE navegador (el celular, sobre todo) no hay nada
    // que hacer: se explica que esto corre en el computador, y no se finge nada.
    if (!(await extensionPresente())) {
      setFase("aviso");
      setAviso(SIN_EXTENSION_PONERSE);
      return;
    }

    const resultado = await pedirALaExtension("ponerse-al-dia");
    if (resultado.ok) {
      setFase("empezo");
      setAviso(TEXTO_EMPEZO);
    } else {
      setFase("aviso");
      setAviso(textoMotivoPonerse(resultado.motivo));
    }
  }

  const ocupado = fase === "enviando" || fase === "empezo";

  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="ap-button-ghost" onClick={ponerse} disabled={ocupado}>
        {fase === "enviando" ? "Empezando…" : "Ponerme al día ahora"}
      </button>
      <p role="status" style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {aviso ?? textoEstimadoPonerse(estimadoMs)}
      </p>
    </div>
  );
}
