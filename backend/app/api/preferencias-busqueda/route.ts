import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function getOrCreatePreferencias(userId: string) {
  const existente = await prisma.searchPreferences.findUnique({ where: { userId } });
  if (existente) return existente;
  return prisma.searchPreferences.create({ data: { userId } });
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const preferencias = await getOrCreatePreferencias(userId);
  return NextResponse.json(preferencias);
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const { palabrasIncluir, palabrasExcluir, modalidad, jornada } = body || {};

  await getOrCreatePreferencias(userId);

  const actualizado = await prisma.searchPreferences.update({
    where: { userId },
    data: { palabrasIncluir, palabrasExcluir, modalidad, jornada },
  });

  return NextResponse.json(actualizado);
}
