import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente } from "@/lib/plan-vigente";
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

  const [plataformas, cuentas, subscripcion, usuario] = await Promise.all([
    prisma.jobPlatform.findMany(),
    prisma.platformAccount.findMany({
      where: { userId },
      include: {
        _count: { select: { applications: true } },
        applications: { select: { estadoActual: true, enviadaEn: true } },
      },
    }),
    obtenerSubscripcionVigente(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { rol: true } }),
  ]);

  return NextResponse.json({
    plataformas,
    cuentas: cuentas.map((c) => ({
      id: c.id,
      platformId: c.platformId,
      activa: c.activa,
      conectadaEn: c.conectadaEn,
      postulaciones: c._count.applications,
      // Solo las que la empresa realmente vio. INCOMPLETA queda fuera: esa
      // ni siquiera se terminó de enviar.
      vistas: c.applications.filter((a) =>
        ["VISTO", "EN_PROCESO", "ENTREVISTA", "FINALISTA", "FINALIZADO", "RECHAZADO"].includes(a.estadoActual),
      ).length,
      finalistas: c.applications.filter(
        (a) => a.estadoActual === "FINALISTA" || a.estadoActual === "FINALIZADO",
      ).length,
      ultimaEn:
        c.applications.length > 0
          ? c.applications
              .reduce((max, a) => (a.enviadaEn > max ? a.enviadaEn : max), c.applications[0].enviadaEn)
              .toISOString()
          : null,
    })),
    // §3.2 (docs/revision-2026-09-16.md): la cuenta ADMIN no tiene tope (el POST
    // de abajo ya la trata así con limite=null) -- antes esto devolvía el
    // del plan igual, y la pantalla decía "Plan gratuito · 3 de 1 portales
    // activos" para una cuenta que sí puede tener los tres.
    maxPlataformasActivas: usuario?.rol === "ADMIN" ? null : (subscripcion?.plan.maxPlataformasActivas ?? 1),
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

  const subscripcion = await obtenerSubscripcionVigente(userId);

  // Sin suscripción activa, se trata como free (1 portal) — salvo cuentas ADMIN,
  // que no tienen límite (mismo criterio que checkAndLogAiUsage).
  const limite = user?.rol === "ADMIN" ? null : (subscripcion?.plan.maxPlataformasActivas ?? 1);

  const activasActuales = await prisma.platformAccount.count({
    where: { userId, activa: true },
  });

  if (limite !== null && activasActuales >= limite) {
    return NextResponse.json(
      {
        error: limite === 1
          ? "Tu plan gratuito conecta un portal a la vez. Desconecta el que ya tienes o pasa a Premium para usar los tres."
          : `Tu plan permite ${limite} portales activos a la vez. Desconecta uno o mejora tu plan.`,
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
