import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Entra a tu cuenta",
  description:
    "Entra a AutoPostula y revisa en qué quedó cada postulación: enviada, vista, en proceso o finalista.",
  robots: { index: false, follow: true },
};

// §5 (docs/revision-2026-09-16.md): /login se mostraba con la sesión ya
// iniciada. El panel decide si falta el onboarding, así que se manda ahí.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  // Se confirma que la cuenta existe: un JWT que sobrevive a una cuenta
  // eliminada no debe rebotar entre /login y el panel.
  if (userId && (await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
    redirect("/dashboard");
  }
  return children;
}
