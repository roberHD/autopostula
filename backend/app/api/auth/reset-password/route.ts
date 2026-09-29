import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { problemaConPassword } from "@/lib/entrada";
import { premiarInvitacion } from "@/lib/extras";

export async function POST(request: Request) {
  try {
    const { token, nuevaPassword } = await request.json().catch(() => ({}));

    if (typeof token !== "string" || !token || !nuevaPassword) {
      return NextResponse.json({ error: "Falta el token o la nueva contraseña" }, { status: 400 });
    }

    const problema = problemaConPassword(nuevaPassword);
    if (problema) {
      return NextResponse.json({ error: problema }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { resetToken: token } });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return NextResponse.json(
        { error: "El enlace no es válido o ya expiró -- solicita uno nuevo" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(nuevaPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        // docs/revision-2026-09-28.md §22: cambiar la contraseña es lo que hace
        // quien sospecha que alguien más entró. Se cierran las sesiones abiertas
        // antes (en todos los navegadores) y se invalida el token de la
        // extensión, que daba acceso al CV sin vencer nunca: se vuelve a
        // conectar con un clic desde Portales.
        sesionesValidasDesde: new Date(),
        apiToken: null,
        // El enlace llegó a esta casilla: el correo queda probado.
        ...(user.emailVerificado ? {} : { emailVerificado: new Date(), verifyToken: null, verifyTokenExpiry: null }),
      },
    });

    // Si recién quedó verificado, es el mismo momento en que se paga el premio
    // de quien lo invitó (igual que en /api/auth/verificar-email).
    if (!user.emailVerificado) {
      await premiarInvitacion(user.id).catch((e) => console.error("[extras] premio de invitación (reset):", e));
    }

    return NextResponse.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("Error en /api/auth/reset-password:", err);
    return NextResponse.json(
      { error: "Error interno al restablecer la contraseña" },
      { status: 500 }
    );
  }
}
