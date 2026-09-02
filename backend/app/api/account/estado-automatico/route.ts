import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const [subscripcion, cv, cuentasActivas] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id, estado: "ACTIVA" },
      include: { plan: true },
    }),
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
    prisma.platformAccount.findMany({
      where: { userId: user.id, activa: true },
      include: { platform: true },
    }),
  ]);

  // Mismo criterio que checkAndLogAiUsage y platform-accounts: las cuentas ADMIN
  // no dependen de tener un plan con el beneficio activo (útil para probar sin
  // tener que armar un Plan+Subscription real todavía).
  const loPermiteElPlan = user.rol === "ADMIN" ? true : (subscripcion?.plan.busquedaAutomatica ?? false);
  const busquedaAutomatica = loPermiteElPlan && user.busquedaAutomaticaActiva;

  return NextResponse.json({
    busquedaAutomatica,
    cargoObjetivo: cv?.cargoObjetivo ?? null,
    // Nombres de JobPlatform (ej. "Computrabajo", "Laborum") — el automático
    // solo debe abrir pestañas de los portales que el usuario tiene conectados.
    plataformasConectadas: cuentasActivas.map((c) => c.platform.nombre),
  });
}
