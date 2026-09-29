import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/base-url";
import { enviarCorreoRecuperacion } from "@/lib/correo";
import { normalizarEmail } from "@/lib/entrada";
import { claveLimite, ipDe, LIMITES, permitirIntento } from "@/lib/limite-tasa";

// Mismo mensaje y mismo status exista o no el correo -- evita que este endpoint
// se use para enumerar qué correos están registrados en la app.
const MENSAJE_GENERICO = {
  message: "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.",
};

export async function POST(request: Request) {
  try {
    const { email: emailCrudo } = await request.json().catch(() => ({}));
    const email = normalizarEmail(emailCrudo);

    if (!email) {
      return NextResponse.json({ error: "Falta el correo" }, { status: 400 });
    }

    // docs/revision-2026-09-28.md §17: cada pedido manda un correo. Sin tope
    // servía para llenarle la bandeja de "recupera tu contraseña" a cualquiera
    // con cuenta. Pasado el límite se responde lo mismo de siempre, sin enviar:
    // así tampoco dice si la cuenta existe.
    const porCorreo = await permitirIntento(claveLimite("reset-email", email), LIMITES.resetPorEmail);
    const porIp = porCorreo && (await permitirIntento(claveLimite("reset-ip", ipDe(request)), LIMITES.resetPorIp));
    if (!porCorreo || !porIp) {
      return NextResponse.json(MENSAJE_GENERICO, { status: 200 });
    }

    // §18: cuentas viejas pueden tener el correo guardado con mayúsculas.
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { creadoEn: "asc" },
    });

    if (!user) {
      return NextResponse.json(MENSAJE_GENERICO, { status: 200 });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    try {
      // §3: enviarCorreoRecuperacion lanza si Resend rechaza el envío. Antes
      // se decía "te enviamos un enlace" aunque no hubiera salido nada.
      await enviarCorreoRecuperacion(user.email, `${getBaseUrl()}/reset-password?token=${resetToken}`);
    } catch (errEmail) {
      console.error("Error enviando correo de recuperación con Resend:", errEmail);
      return NextResponse.json(
        { error: "No se pudo enviar el correo de recuperación -- intenta de nuevo en unos minutos" },
        { status: 500 }
      );
    }

    return NextResponse.json(MENSAJE_GENERICO, { status: 200 });
  } catch (err) {
    console.error("Error en /api/auth/forgot-password:", err);
    return NextResponse.json(
      { error: "Error interno al procesar la solicitud" },
      { status: 500 }
    );
  }
}
