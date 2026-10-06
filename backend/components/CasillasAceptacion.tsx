"use client";

import Link from "next/link";

/**
 * Las dos casillas que pide la Ley 21.719 para crear o usar una cuenta
 * (lib/consentimiento.ts): aceptar los términos y la política (art. 12:
 * consentimiento previo, específico e inequívoco) y declarar tener 18 años o
 * más (los términos son para mayores de edad). Las usan el registro y la página
 * /aceptar. Las dos son obligatorias: quien las pinta no deja seguir sin ellas.
 */
export default function CasillasAceptacion({
  aceptaTerminos,
  mayorDeEdad,
  onCambio,
}: {
  aceptaTerminos: boolean;
  mayorDeEdad: boolean;
  onCambio: (cambio: { aceptaTerminos?: boolean; mayorDeEdad?: boolean }) => void;
}) {
  return (
    <div className="ap-acepto">
      <label className="ap-acepto__fila">
        <input
          type="checkbox"
          checked={aceptaTerminos}
          onChange={(e) => onCambio({ aceptaTerminos: e.target.checked })}
          required
        />
        <span>
          Leí y acepto los{" "}
          <Link href="/terminos" target="_blank">términos y condiciones</Link> y la{" "}
          <Link href="/privacidad" target="_blank">política de privacidad</Link>.
        </span>
      </label>
      <label className="ap-acepto__fila">
        <input
          type="checkbox"
          checked={mayorDeEdad}
          onChange={(e) => onCambio({ mayorDeEdad: e.target.checked })}
          required
        />
        <span>Tengo 18 años o más.</span>
      </label>
    </div>
  );
}
