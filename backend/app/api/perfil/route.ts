import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const perfil = await prisma.cvProfile.findUnique({ where: { userId } });
  return NextResponse.json(perfil || {});
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const {
    nombre, email, telefono, comuna,
    cargoObjetivo, expectativaRenta, disponibilidad, resumenProfesional,
  } = body || {};

  const perfil = await prisma.cvProfile.upsert({
    where: { userId },
    update: { nombre, email, telefono, comuna, cargoObjetivo, expectativaRenta, disponibilidad, resumenProfesional },
    create: { userId, nombre, email, telefono, comuna, cargoObjetivo, expectativaRenta, disponibilidad, resumenProfesional },
  });

  return NextResponse.json(perfil);
}