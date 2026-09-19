import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerSubscripcionVigente, finDelUltimoPase } from "@/lib/plan-vigente";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { modoAutomatico, PRUEBA_TOTAL } from "@/lib/estado-automatico";

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [user, subscripcion] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { rol: true, email: true, busquedaAutomaticaActiva: true, pruebaAutomaticaRestantes: true } }),
    obtenerSubscripcionVigente(userId),
  ]);

  const modo = modoAutomatico({
    esAdmin: user?.rol === "ADMIN",
    planIncluyeBusquedaAutomatica: subscripcion?.plan.busquedaAutomatica ?? false,
    pruebaRestantes: user?.pruebaAutomaticaRestantes ?? 0,
  });
  const disponibleEnPlan = modo === "premium";
  // docs/pase-prepagado.md §6: hasta cuándo llega el Premium (con pases
  // apilados, el que termina último). null si no hay un pase vigente -- un
  // admin es Premium sin pase.
  const premiumHasta = subscripcion ? await finDelUltimoPase(userId) : null;

  return NextResponse.json({
    activa: user?.busquedaAutomaticaActiva ?? true,
    disponibleEnPlan,
    // docs/rafagas-y-ponerse-al-dia.md §4.1: una cuenta gratis con la prueba
    // corriendo también puede pausarla desde acá -- es una acción automática de
    // la que la persona tiene que poder salir, aunque no sea del plan.
    modo,
    pruebaRestantes: modo === "prueba" ? (user?.pruebaAutomaticaRestantes ?? 0) : null,
    pruebaTotal: PRUEBA_TOTAL,
    planNombre: subscripcion?.plan.nombre ?? null,
    esPremium: subscripcion?.plan.tipo === "PREMIUM",
    premiumHasta: premiumHasta ? premiumHasta.toISOString() : null,
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
