import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { extensionConectada: true },
  });

  return NextResponse.json({ extensionConectada: user?.extensionConectada ?? false });
}

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { extensionConectada: true },
  });

  return NextResponse.json({ ok: true });
}
