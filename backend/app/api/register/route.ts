import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { enviarCorreoVerificacion } from "@/lib/correo";

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
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  const nuevoUsuario = await prisma.user.create({
    data: { email, passwordHash, nombre, verifyToken, verifyTokenExpiry },
  });

  // docs/verificacion-de-correo.md §5: el registro NO falla si el correo no
  // sale -- la cuenta se crea igual y la persona puede pedir el reenvío
  // desde el dashboard. Un problema puntual de Resend no debe impedir
  // registrarse.
  try {
    await enviarCorreoVerificacion(nuevoUsuario.email, verifyToken);
  } catch (errEmail) {
    console.error("Error enviando correo de verificación:", errEmail);
  }

  return NextResponse.json({ id: nuevoUsuario.id, email: nuevoUsuario.email });
}
