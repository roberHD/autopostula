import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [plataformas, cuentas, subscripcion] = await Promise.all([
    prisma.jobPlatform.findMany(),
    prisma.platformAccount.findMany({ where: { userId } }),
    prisma.subscription.findFirst({
      where: { userId, estado: "ACTIVA" },
      include: { plan: true },
    }),
  ]);

  return NextResponse.json({
    plataformas,
    cuentas,
    maxPlataformasActivas: subscripcion?.plan.maxPlataformasActivas ?? 1,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { platformId } = await request.json();
  if (!platformId) {
    return NextResponse.json({ error: "Falta platformId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { rol: true } });

  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA" },
    include: { plan: true },
  });

  // Sin suscripción activa, se trata como free (1 portal) — salvo cuentas ADMIN,
  // que no tienen límite (mismo criterio que checkAndLogAiUsage).
  const limite = user?.rol === "ADMIN" ? null : (subscripcion?.plan.maxPlataformasActivas ?? 1);

  const activasActuales = await prisma.platformAccount.count({
    where: { userId, activa: true },
  });

  if (limite !== null && activasActuales >= limite) {
    return NextResponse.json(
      {
        error: `Tu plan permite ${limite} portal(es) activo(s) a la vez. Desconecta uno o mejora tu plan.`,
      },
      { status: 403 }
    );
  }

  const cuenta = await prisma.platformAccount.upsert({
    where: { userId_platformId: { userId, platformId } },
    update: { activa: true },
    create: { userId, platformId, activa: true },
  });

  return NextResponse.json(cuenta);
}

export async function DELETE(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { platformId } = await request.json();
  if (!platformId) {
    return NextResponse.json({ error: "Falta platformId" }, { status: 400 });
  }

  await prisma.platformAccount.update({
    where: { userId_platformId: { userId, platformId } },
    data: { activa: false },
  });

  return NextResponse.json({ ok: true });
}
