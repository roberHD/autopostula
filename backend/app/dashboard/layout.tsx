import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import "./theme.css";
import Sidebar from "./Sidebar";

export const metadata: Metadata = {
  title: "Tu tablero",
  // Detrás de la sesión: no hay nada acá que Google deba indexar.
  robots: { index: false, follow: false },
};
import BarraMaquina from "./BarraMaquina";
import BannerVerificacion from "./BannerVerificacion";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as any).id;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletado: true, emailVerificado: true },
  });

  // Se consulta la base directo (no la sesión/JWT) para que el chequeo esté
  // siempre al día apenas termine el onboarding, sin esperar a un nuevo login.
  if (!dbUser?.onboardingCompletado) {
    redirect("/onboarding");
  }

  return (
    <div className="ap-shell">
      <Sidebar userName={session.user.name ?? session.user.email ?? "Usuario"} />
      <div className="ap-col">
        <BarraMaquina />
        <main className="ap-main">
          <BannerVerificacion verificadoAlCargar={!!dbUser.emailVerificado} />
          {children}
        </main>
      </div>
    </div>
  );
}
