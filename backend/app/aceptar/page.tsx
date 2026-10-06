import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { aceptoDocumentosVigentes } from "@/lib/consentimiento";
import FormAceptar from "./FormAceptar";

export const metadata: Metadata = {
  title: "Antes de seguir",
  robots: { index: false, follow: false },
};

// Solo se vuelve al panel o al onboarding: un "volver" cualquiera haría de
// esta página un redireccionador abierto.
function destinoSeguro(volver: unknown): string {
  return typeof volver === "string" && /^\/(dashboard|onboarding)(\/|$|\?)/.test(volver) ? volver : "/dashboard";
}

/**
 * Pide aceptar los términos y la política vigentes, y declarar la mayoría de
 * edad (lib/consentimiento.ts), a quien entra al panel sin haberlo hecho: las
 * cuentas creadas con Google (no pasan por el formulario de registro), las
 * anteriores a esto, y todas cuando cambia VERSION_DOCUMENTOS.
 */
export default async function AceptarPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const { volver } = await searchParams;
  const destino = destinoSeguro(volver);

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent("/aceptar?volver=" + destino)}`);
  if (await aceptoDocumentosVigentes(userId)) redirect(destino);

  return <FormAceptar destino={destino} />;
}
