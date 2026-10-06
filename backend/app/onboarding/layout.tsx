import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { aceptoDocumentosVigentes } from "@/lib/consentimiento";

export const metadata: Metadata = {
  title: "Configura tu cuenta",
  description:
    "Sube tu CV, conecta un portal y define qué ofertas te sirven.",
  robots: { index: false, follow: true },
};

// Ley 21.719 (lib/consentimiento.ts): antes de subir el CV y configurar la
// cuenta, aceptar los términos y la política vigentes. Quien se registró con el
// formulario ya lo hizo ahí; esto le llega a quien entró con Google.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (userId && !(await aceptoDocumentosVigentes(userId))) {
    redirect("/aceptar?volver=/onboarding");
  }
  return children;
}
