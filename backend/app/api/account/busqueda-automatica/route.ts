import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [user, subscripcion] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { rol: true, email: true, busquedaAutomaticaActiva: true } }),
    prisma.subscription.findFirst({
      where: { userId, estado: "ACTIVA" },
      include: { plan: true },
    }),
  ]);

  const disponibleEnPlan = user?.rol === "ADMIN" ? true : (subscripcion?.plan.busquedaAutomatica ?? false);

  return NextResponse.json({
    activa: user?.busquedaAutomaticaActiva ?? true,
    disponibleEnPlan,
    planNombre: subscripcion?.plan.nombre ?? null,
    esPremium: subscripcion?.plan.tipo === "PREMIUM",
    email: user?.email ?? null,
  });
}

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { activa } = await request.json();
  if (typeof activa !== "boolean") {
    return NextResponse.json({ error: "Falta el campo 'activa' (boolean)" }, { status: 400 });
  }

  // No valida acá si el plan lo permite -- estado-automatico ya exige las dos
  // cosas (plan Y este toggle) antes de escanear. Guardar la preferencia igual
  // aunque el plan actual no la use evita perderla si el usuario sube de plan.
  await prisma.user.update({
    where: { id: userId },
    data: { busquedaAutomaticaActiva: activa },
  });

  return NextResponse.json({ ok: true, activa });
}
