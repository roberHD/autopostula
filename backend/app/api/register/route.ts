import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { email, password, nombre } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Falta correo o contraseña" },
      { status: 400 }
    );
  }

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    return NextResponse.json(
      { error: "Ese correo ya está registrado" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const nuevoUsuario = await prisma.user.create({
    data: { email, passwordHash, nombre },
  });

  return NextResponse.json({ id: nuevoUsuario.id, email: nuevoUsuario.email });
}
