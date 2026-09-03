import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { token, nuevaPassword } = await request.json();

    if (!token || !nuevaPassword) {
      return NextResponse.json({ error: "Falta el token o la nueva contraseña" }, { status: 400 });
    }

    if (typeof nuevaPassword !== "string" || nuevaPassword.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
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
      },
    });

    return NextResponse.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("Error en /api/auth/reset-password:", err);
    return NextResponse.json(
      { error: "Error interno al restablecer la contraseña" },
      { status: 500 }
    );
  }
}