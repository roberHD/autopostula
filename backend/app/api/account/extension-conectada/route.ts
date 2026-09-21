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

  // Solo la primera vez: el recordatorio de ráfagas (docs/rafagas-y-ponerse-al-dia.md
  // §3.8) necesita saber desde cuándo está conectada. Reconectar no la cambia, ni se
  // inventa una fecha para las cuentas que ya estaban conectadas antes de que existiera.
  await prisma.user.updateMany({
    where: { id: userId, extensionConectada: false },
    data: { extensionConectada: true, extensionConectadaEn: new Date() },
  });

  return NextResponse.json({ ok: true });
}
