import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// docs/verificacion-de-correo.md §5 -- valida y consume el token del enlace
// que llegó por correo. Mismo esqueleto que /api/auth/reset-password.
export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({}));

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Falta el token", estado: "invalido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { verifyToken: token } });

  if (!user) {
    return NextResponse.json(
      { error: "Este enlace de verificación no es válido.", estado: "invalido" },
      { status: 400 }
    );
  }

  if (!user.verifyTokenExpiry || user.verifyTokenExpiry < new Date()) {
    return NextResponse.json(
      { error: "Este enlace ya venció. Pide uno nuevo.", estado: "vencido" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificado: new Date(), verifyToken: null, verifyTokenExpiry: null },
  });

  return NextResponse.json({ ok: true, estado: "verificado" });
}
