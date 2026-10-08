import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { PASES, formatoPesos } from "@/lib/pases";
import { PAQUETES } from "@/lib/extras";
import { PLANES_BASE } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Precios",
  description:
    "20 postulaciones gratis al mes. Pases de 30 o 90 días de pago único, sin cobro automático, y paquetes de postulaciones que no vencen.",
  alternates: { canonical: "https://autopostula.cl/precios" },
};

// docs/pendientes-de-lanzamiento-2026-10-07.md §4.2: hasta ahora los precios
// vivían dentro de la landing y del panel, y no había una URL que mandarle a
// alguien que pregunta cuánto vale. Los montos salen del MISMO catálogo que
// cobra el servidor (lib/pases.ts, lib/extras.ts, lib/plans.ts): un precio no
// puede quedar distinto entre lo que dice la página y lo que cobra Flow.
const GRATIS = PLANES_BASE.find((p) => p.tipo === "FREE")!;
const PREMIUM = PLANES_BASE.find((p) => p.tipo === "PREMIUM")!;

const FILAS = [
  {
    nombre: "Gratis",
    incluye: `${GRATIS.limitePostulacionesMes} postulaciones al mes. Entras tú a los portales y la extensión postula mientras navegas.`,
    precio: "$0",
  },
  {
    nombre: "Pase de 30 días",
    incluye: `${PREMIUM.limitePostulacionesMes} postulaciones al mes y búsqueda automática: se pone al día sola cada vez que abres tu computador.`,
    precio: `$${formatoPesos(PASES.pase_30.monto)}`,
  },
  {
    nombre: "Pase de 90 días",
    incluye: "Lo mismo, por tres meses.",
    precio: `$${formatoPesos(PASES.pase_90.monto)}`,
  },
  {
    nombre: `${PAQUETES.extra_20.postulaciones} postulaciones extra`,
    incluye: "Se usan cuando se acaban las de tu mes. No vencen.",
    precio: `$${formatoPesos(PAQUETES.extra_20.monto)}`,
  },
  {
    nombre: `${PAQUETES.extra_50.postulaciones} postulaciones extra`,
    incluye: "Igual que el anterior, con más postulaciones.",
    precio: `$${formatoPesos(PAQUETES.extra_50.monto)}`,
  },
];

export default function PreciosPage() {
  return (
    <LegalPage titulo="Precios" actualizado="8 de octubre de 2026">
      <p>
        Todos los precios están en pesos chilenos, con impuestos incluidos. No se pide tarjeta para
        crear la cuenta ni para usar el plan gratis.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", margin: "22px 0" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 10px 8px 0" }}>Plan</th>
            <th style={{ textAlign: "left", padding: "8px 10px" }}>Qué incluye</th>
            <th style={{ textAlign: "right", padding: "8px 0 8px 10px", whiteSpace: "nowrap" }}>
              Precio
            </th>
          </tr>
        </thead>
        <tbody>
          {FILAS.map((fila) => (
            <tr key={fila.nombre} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 10px 10px 0", fontWeight: 600, verticalAlign: "top" }}>
                {fila.nombre}
              </td>
              <td style={{ padding: "10px", verticalAlign: "top" }}>{fila.incluye}</td>
              <td
                style={{
                  padding: "10px 0 10px 10px",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  verticalAlign: "top",
                  fontWeight: 600,
                }}
              >
                {fila.precio}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Tres cosas que conviene saber</h2>
      <ul>
        <li>
          <strong>Primero se gastan las postulaciones de tu mes</strong>, y recién cuando se acaban
          se tocan las que compraste aparte. Al revés sería cobrarte algo que ya tenías pagado.
        </li>
        <li>
          <strong>Una postulación que no llegó a la empresa no se cobra.</strong> Si el formulario
          se queda a medias o el portal no confirma el envío, no se descuenta de tu cupo.
        </li>
        <li>
          <strong>No hay cobro automático.</strong> Los pases son de pago único: cuando se cumple el
          plazo, tu cuenta vuelve al plan gratis sola y no se te cobra de nuevo.
        </li>
      </ul>

      <h2>¿Y si no me sirve?</h2>
      <p>
        Puedes borrar tu cuenta cuando quieras desde Ajustes, y con eso se borran tu CV y tus datos.
        Si compraste un pase y tienes un problema, escríbenos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a> y lo vemos.
      </p>

      <p style={{ marginTop: 28 }}>
        ¿Te queda una duda? Mira las{" "}
        <Link href="/preguntas-frecuentes">preguntas frecuentes</Link>.
      </p>
    </LegalPage>
  );
}
