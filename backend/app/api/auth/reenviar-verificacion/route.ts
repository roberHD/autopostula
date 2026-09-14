import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { enviarCorreoVerificacion } from "@/lib/correo";

// docs/verificacion-de-correo.md §6: límite de frecuencia, si no cualquiera
// con una cuenta puede usar este endpoint para bombardear de correos la
// dirección que puso -- y de paso quemar la reputación de envío del dominio.
// El esquema solo guarda el ÚLTIMO envío (verifyUltimoEnvio), no un contador
// por hora, así que el límite real es un solo intervalo mínimo entre envíos.
// 12 minutos entre reenvíos ya implica como máximo 5 por hora (3600s / 5 =
// 720s) y de paso cumple sobrado el mínimo de 1 por minuto -- un solo campo
// alcanza para las dos reglas del documento.
const INTERVALO_MINIMO_MS = 12 * 60 * 1000;

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerificado: true, verifyUltimoEnvio: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (user.emailVerificado) {
    return NextResponse.json({ ok: true, yaVerificado: true });
  }

  if (user.verifyUltimoEnvio) {
    const faltanMs = INTERVALO_MINIMO_MS - (Date.now() - user.verifyUltimoEnvio.getTime());
    if (faltanMs > 0) {
      return NextResponse.json(
        {
          error: `Espera ${Math.ceil(faltanMs / 60000)} minuto(s) antes de pedir otro reenvío.`,
        },
        { status: 429 }
      );
    }
  }

  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  // Se manda ANTES de tocar la base: si Resend falla, no queremos haber
  // quemado el límite de frecuencia (§6, arriba) por un correo que nadie
  // recibió, ni haber invalidado un token anterior que todavía servía.
  try {
    await enviarCorreoVerificacion(user.email, verifyToken);
  } catch (errEmail) {
    console.error("Error reenviando correo de verificación:", errEmail);
    return NextResponse.json(
      { error: "No se pudo enviar el correo -- intenta de nuevo en unos minutos" },
      { status: 500 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { verifyToken, verifyTokenExpiry, verifyUltimoEnvio: new Date() },
  });

  return NextResponse.json({ ok: true });
}
