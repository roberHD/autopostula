import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { enviarCorreoVerificacion } from "@/lib/correo";
import { normalizarEmail, problemaConPassword, textoCorto } from "@/lib/entrada";
import { claveLimite, ipDe, LIMITES, permitirIntento } from "@/lib/limite-tasa";

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);

  // docs/revision-2026-09-28.md §18: antes el mínimo de 8 caracteres solo se
  // revisaba en el navegador (la API aceptó una contraseña de 1), y el correo
  // se guardaba tal cual: "Juan@Gmail.com" y "juan@gmail.com" eran dos cuentas.
  const email = normalizarEmail(cuerpo?.email);
  if (!email || typeof cuerpo?.password !== "string") {
    return NextResponse.json({ error: "Falta un correo válido o la contraseña" }, { status: 400 });
  }
  const problema = problemaConPassword(cuerpo.password);
  if (problema) {
    return NextResponse.json({ error: problema }, { status: 400 });
  }
  const nombre = textoCorto(cuerpo?.nombre, 100);
  const ref = textoCorto(cuerpo?.ref, 20);

  const existente = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) {
    return NextResponse.json(
      { error: "Ese correo ya está registrado" },
      { status: 409 }
    );
  }

  // §17: cada cuenta nueva manda un correo de verificación. Sin tope, desde una
  // misma IP se podían crear cuentas (y mandar correos) sin límite.
  if (!(await permitirIntento(claveLimite("registro-ip", ipDe(request)), LIMITES.registroPorIp))) {
    return NextResponse.json(
      { error: "Se crearon demasiadas cuentas desde esta conexión. Intenta de nuevo en una hora." },
      { status: 429 }
    );
  }

  // docs/creditos-y-pagina-nueva.md §3: quién te invitó. El premio no se paga
  // acá -- se paga cuando esta cuenta verifica su correo, para que nadie se
  // regale postulaciones creando cuentas con direcciones inventadas.
  const invitadoPor = ref
    ? await prisma.user.findUnique({
        where: { codigoInvitacion: ref.toUpperCase() },
        select: { id: true },
      })
    : null;

  const passwordHash = await bcrypt.hash(cuerpo.password, 10);
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  const nuevoUsuario = await prisma.user.create({
    data: { email, passwordHash, nombre, verifyToken, verifyTokenExpiry, invitadoPorId: invitadoPor?.id ?? null },
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
