import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletado: true },
  });

  return NextResponse.json({ ok: true });
}
