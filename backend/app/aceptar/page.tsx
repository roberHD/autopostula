import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUsuarioSesion } from "@/lib/auth-helpers";
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

  // getUsuarioSesion y no auth(): una sesión de una cuenta que ya no existe
  // (borrada, o la base cambió) también va al login, en vez de mostrar un
  // formulario que no se puede guardar.
  const { userId } = await getUsuarioSesion();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent("/aceptar?volver=" + destino)}`);
  if (await aceptoDocumentosVigentes(userId)) redirect(destino);

  return <FormAceptar destino={destino} />;
}
