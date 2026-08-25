import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import "./theme.css";
import Sidebar from "./Sidebar";

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
    select: { onboardingCompletado: true },
  });

  // Se consulta la base directo (no la sesión/JWT) para que el chequeo esté
  // siempre al día apenas termine el onboarding, sin esperar a un nuevo login.
  if (!dbUser?.onboardingCompletado) {
    redirect("/onboarding");
  }

  return (
    <div className="ap-shell">
      <Sidebar userName={session.user.name ?? session.user.email ?? "Usuario"} />
      <main className="ap-main">{children}</main>
    </div>
  );
}
