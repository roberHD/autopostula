import Link from "next/link";
import { Check, CircleAlert, CircleCheck, Info } from "lucide-react";
import { Marca } from "@/components/Marca";

/** El logo con el nombre, enlazado a la portada. Igual en las cuatro pantallas. */
export function MarcaAcceso() {
  return (
    <Link href="/" className="ap-acceso__marca">
      <Marca tam={34} />
      <span>
        <span style={{ display: "block", fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 15 }}>
          AutoPostula
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)" }}>
          Postula sin llenar formularios
        </span>
      </span>
    </Link>
  );
}

/**
 * Un mensaje del formulario. Dice qué pasó y, cuando corresponde, qué hacer:
 * un "error" a secas no ayuda a nadie a salir del paso.
 */
export function Mensaje({
  tipo,
  children,
}: {
  tipo: "error" | "ok" | "info";
  children: React.ReactNode;
}) {
  const Icono = tipo === "error" ? CircleAlert : tipo === "ok" ? CircleCheck : Info;
  return (
    <p className="ap-mensaje" data-tipo={tipo} role={tipo === "error" ? "alert" : "status"}>
      <Icono />
      <span>{children}</span>
    </p>
  );
}

/** El botón de Google, con el logo oficial de cuatro colores. */
export function BotonGoogle({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <button type="button" className="ap-google" onClick={onClick}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z" />
        <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.3 0-9.7-3.5-11.3-8.4l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C40.8 36 43.5 30.4 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
      </svg>
      {texto}
    </button>
  );
}

/**
 * El panel de tinta de la derecha.
 *
 * Una sola frase en display con el destacador sobre la línea que remata, y
 * debajo hechos concretos y verificables — no las tres viñetas genéricas de
 * "Listo en minutos" que trae cualquier plantilla de acceso.
 */
export function PanelTinta({
  frase,
  marcado,
  bajada,
  hechos,
  nota,
}: {
  frase: string;
  marcado: string;
  bajada: string;
  hechos: string[];
  nota: string;
}) {
  return (
    <aside className="ap-acceso__panel">
      <span />

      <div>
        <h2 className="ap-acceso__frase">
          {frase} <span className="ap-swipe ap-swipe--bloque ap-swipe--auto">{marcado}</span>
        </h2>
        <p className="ap-acceso__bajada">{bajada}</p>

        <div className="ap-acceso__hechos">
          {hechos.map((h) => (
            <p className="ap-acceso__hecho" key={h}>
              <Check strokeWidth={2.6} />
              {h}
            </p>
          ))}
        </div>
      </div>

      <p className="ap-acceso__nota">{nota}</p>
    </aside>
  );
}
