import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiToken: true },
  });

  return NextResponse.json({ apiToken: user?.apiToken ?? null });
}

export async function POST() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const nuevoToken = randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { id: userId },
    data: { apiToken: nuevoToken },
  });

  return NextResponse.json({ apiToken: nuevoToken });
}
