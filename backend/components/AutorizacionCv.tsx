"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { TEXTO_DATOS_SENSIBLES } from "@/lib/textos-consentimiento";

/**
 * La autorización expresa para tratar los datos sensibles del CV (Ley 21.719,
 * art. 16; lib/consentimiento.ts). Tres casos:
 *  - Sin autorización y sin CV: la casilla, que habilita subirlo. Quien sube
 *    manda `autorizaDatosSensibles=true` junto con el archivo.
 *  - Sin autorización y con un CV de antes: la casilla y un botón para
 *    autorizar sin volver a subirlo.
 *  - Con autorización: una línea que lo dice y deja retirarla (art. 12: tan
 *    fácil como darla). Retirarla borra el CV.
 */
export default function AutorizacionCv({
  autoriza,
  hayCv,
  marcada,
  onMarcar,
  onCambio,
}: {
  autoriza: boolean;
  hayCv: boolean;
  marcada: boolean;
  onMarcar: (v: boolean) => void;
  // Después de autorizar o retirar desde acá. `cvBorrado` cuando se retiró.
  onCambio: (autoriza: boolean, cvBorrado: boolean) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");

  async function llamar(metodo: "POST" | "DELETE") {
    setTrabajando(true);
    setError("");
    try {
      const res = await fetch("/api/consentimiento/datos-sensibles", { method: metodo });
      if (!res.ok) throw new Error();
      onCambio(metodo === "POST", metodo === "DELETE");
    } catch {
      setError("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  if (autoriza) {
    return (
      <p className="ap-autoriza-cv__ok">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>
          Autorizaste el tratamiento de los datos sensibles de tu CV.{" "}
          <button
            type="button"
            className="ap-autoriza-cv__enlace"
            disabled={trabajando}
            onClick={() => {
              if (window.confirm("Si retiras la autorización, borramos tu CV y la IA deja de usarlo. Los datos de tu perfil que escribiste tú se quedan. ¿Seguir?")) {
                llamar("DELETE");
              }
            }}
          >
            {trabajando ? "Retirando…" : "Retirar autorización"}
          </button>
        </span>
        {error && <span className="ap-autoriza-cv__error">{error}</span>}
      </p>
    );
  }

  return (
    <div className="ap-autoriza-cv" data-pendiente={hayCv ? "1" : undefined}>
      {hayCv && (
        <p className="ap-autoriza-cv__aviso">
          Tu CV ya está cargado, pero necesitamos tu autorización expresa para seguir usándolo: puede traer datos
          que la ley considera sensibles.
        </p>
      )}
      <label className="ap-autoriza-cv__fila">
        <input type="checkbox" checked={marcada} onChange={(e) => onMarcar(e.target.checked)} />
        <span>{TEXTO_DATOS_SENSIBLES}</span>
      </label>
      {hayCv && (
        <div className="ap-autoriza-cv__acciones">
          <button type="button" className="ap-button ap-btn--sm" disabled={!marcada || trabajando} onClick={() => llamar("POST")}>
            {trabajando ? "Guardando…" : "Guardar autorización"}
          </button>
          <button
            type="button"
            className="ap-autoriza-cv__enlace"
            disabled={trabajando}
            onClick={() => {
              if (window.confirm("¿Borrar tu CV? Puedes volver a subirlo cuando quieras.")) llamar("DELETE");
            }}
          >
            Prefiero borrar mi CV
          </button>
        </div>
      )}
      {error && <p className="ap-autoriza-cv__error">{error}</p>}
    </div>
  );
}
