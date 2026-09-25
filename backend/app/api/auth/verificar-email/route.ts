import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { premiarInvitacion } from "@/lib/extras";

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

  // docs/creditos-y-pagina-nueva.md §3: recién ahora la cuenta es de una persona
  // con un correo real, así que recién ahora se paga el premio a quien la
  // invitó. Best-effort: si falla, la verificación vale igual.
  try {
    await premiarInvitacion(user.id);
  } catch (err) {
    console.error("[extras] No se pudo premiar la invitación de", user.id, err);
  }

  return NextResponse.json({ ok: true, estado: "verificado" });
}
