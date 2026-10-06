import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import "./theme.css";
import Sidebar from "./Sidebar";

export const metadata: Metadata = {
  // docs/revision-2026-09-28.md (títulos de las pestañas): con un título de
  // texto plano acá, Next corta la plantilla de app/layout.tsx y las páginas
  // del panel quedaban "Postulaciones" a secas. Con la plantilla repetida
  // dicen "Postulaciones · AutoPostula", como el resto del sitio.
  title: { default: "Tu tablero", template: "%s · AutoPostula" },
  // Detrás de la sesión: no hay nada acá que Google deba indexar.
  robots: { index: false, follow: false },
};
import BarraMaquina, { type EstadoBarra } from "./BarraMaquina";
import BannerVerificacion from "./BannerVerificacion";
import BannerModoPrueba from "./BannerModoPrueba";
import BannerExtension from "./BannerExtension";
import BannerVencimiento from "./BannerVencimiento";
import LatidoUso from "./LatidoUso";
import { finDelUltimoPase } from "@/lib/plan-vigente";
import { contarPorDecidir } from "@/lib/panel/listas";
import { estadoDelPanel } from "@/lib/panel/estado";
import { comoLoDevuelveLaApi } from "@/lib/panel/sesion";
import { sinSoporteExtensionSegunCabeceras } from "@/lib/dispositivo";

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
    select: { onboardingCompletado: true, emailVerificado: true, postulacionHabilitada: true },
  });

  // Se consulta la base directo (no la sesión/JWT) para que el chequeo esté
  // siempre al día apenas termine el onboarding, sin esperar a un nuevo login.
  if (!dbUser?.onboardingCompletado) {
    redirect("/onboarding");
  }

  // Fin del último pase Premium, para el aviso de vencimiento (§6). Un admin no
  // tiene pases y no necesita el aviso. En paralelo, el número de "Por decidir"
  // del menú (docs/optimizacion-2026-09-29.md §3), que antes el menú pedía
  // después; si falla, el menú lo pide solo (null).
  const [premiumHasta, pendientesPorDecidir] = await Promise.all([
    finDelUltimoPase(userId),
    contarPorDecidir(userId).catch(() => null),
  ]);

  return (
    <div className="ap-shell">
      <LatidoUso />
      <Sidebar userName={session.user.name ?? session.user.email ?? "Usuario"} pendientesPorDecidir={pendientesPorDecidir} />
      <div className="ap-col">
        {/* docs/optimizacion-2026-09-29.md §1: la barra llega llena desde el
            servidor; mientras tanto, su mismo esqueleto de siempre. */}
        <Suspense fallback={<BarraMaquina soloEsqueleto />}>
          <BarraConDatos userId={userId} />
        </Suspense>
        <main className="ap-main">
          <BannerVerificacion verificadoAlCargar={!!dbUser.emailVerificado} />
          <BannerModoPrueba habilitadaAlCargar={!!dbUser.postulacionHabilitada} />
          <BannerExtension enMovilSegunServidor={sinSoporteExtensionSegunCabeceras(await headers())} />
          <BannerVencimiento venceEn={premiumHasta ? premiumHasta.toISOString() : null} />
          {children}
        </main>
      </div>
    </div>
  );
}

async function BarraConDatos({ userId }: { userId: string }) {
  try {
    const estado = comoLoDevuelveLaApi<EstadoBarra>(await estadoDelPanel(userId));
    return <BarraMaquina inicial={estado} ahora={new Date().toISOString()} />;
  } catch (e) {
    // Como antes: que la pida el navegador.
    console.error("[barra] no se pudo armar en el servidor; la pide el navegador:", e);
    return <BarraMaquina />;
  }
}
