import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { asegurarPlataformasBase } from "@/lib/platforms";
import { asegurarPlanesBase } from "@/lib/plans";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Se auto-repara acá en vez de depender de que alguien haya corrido
  // `npx tsx seed.ts` a mano — así los portales conocidos siempre aparecen,
  // tanto en local como recién desplegado en un ambiente nuevo.
  await Promise.all([asegurarPlataformasBase(), asegurarPlanesBase()]);

  const [plataformas, cuentas, subscripcion] = await Promise.all([
    prisma.jobPlatform.findMany(),
    prisma.platformAccount.findMany({
      where: { userId },
      include: { _count: { select: { applications: true } } },
    }),
    prisma.subscription.findFirst({
      where: { userId, estado: "ACTIVA" },
      include: { plan: true },
    }),
  ]);

  return NextResponse.json({
    plataformas,
    cuentas: cuentas.map((c) => ({
      id: c.id,
      platformId: c.platformId,
      activa: c.activa,
      conectadaEn: c.conectadaEn,
      postulaciones: c._count.applications,
    })),
    maxPlataformasActivas: subscripcion?.plan.maxPlataformasActivas ?? 1,
    planNombre: subscripcion?.plan.nombre ?? null,
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
