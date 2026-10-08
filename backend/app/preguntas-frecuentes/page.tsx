import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { PREGUNTAS, datosEstructuradosFaq } from "@/lib/preguntas-frecuentes";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Si pide la clave del portal, si pueden bloquearte la cuenta, cuánto cuesta, si funciona en el celular y qué pasa con tu CV. Las dudas reales de quien busca trabajo en Chile.",
  alternates: { canonical: "https://autopostula.cl/preguntas-frecuentes" },
};

// docs/pendientes-de-lanzamiento-2026-10-07.md §4.1: las preguntas ya existían
// dentro de la landing. Acá tienen URL propia para que Google las muestre y
// para poder mandarle el enlace a alguien, pero salen de la MISMA lista
// (lib/preguntas-frecuentes.ts): una sola fuente, no dos copias.
const DATOS_ESTRUCTURADOS = { "@context": "https://schema.org", ...datosEstructuradosFaq() };

export default function PreguntasFrecuentesPage() {
  return (
    <LegalPage titulo="Preguntas frecuentes" actualizado="8 de octubre de 2026">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DATOS_ESTRUCTURADOS) }}
      />

      <p>
        Lo que más nos preguntan antes de instalar la extensión. Si te queda una duda que no está
        acá, escríbenos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a>.
      </p>

      {PREGUNTAS.map(({ q, r }) => (
        <section key={q}>
          <h2>{q}</h2>
          <p>{r}</p>
        </section>
      ))}

      <h2>¿Algo más?</h2>
      <p>
        Puedes ver <Link href="/precios">los precios en detalle</Link>, o escribirnos a{" "}
        <a href="mailto:AutopostulaI@gmail.com">AutopostulaI@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
