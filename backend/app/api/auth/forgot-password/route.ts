import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

// Instanciado en el handler (no a nivel de módulo) -- si se crea acá arriba,
// falta RESEND_API_KEY tira en cuanto Next intenta cargar el módulo para
// recolectar la config de la ruta, y se cae el build entero, no solo esta ruta.
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Mismo mensaje y mismo status exista o no el correo -- evita que este endpoint
// se use para enumerar qué correos están registrados en la app.
const MENSAJE_GENERICO = {
  message: "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.",
};

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Falta el correo" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(MENSAJE_GENERICO, { status: 200 });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;

    try {
      await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL || "AutoPostula <onboarding@resend.dev>",
        to: user.email,
        subject: "Recupera tu contraseña de AutoPostula",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #111827;">Recupera tu contraseña</h2>
            <p style="color: #4B5563; line-height: 1.6;">
              Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, haz clic en el siguiente enlace (válido por 1 hora):
            </p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}" style="background: #7C3AED; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Restablecer contraseña
              </a>
            </p>
            <p style="color: #9CA3AF; font-size: 12px;">
              Si no solicitaste esto, puedes ignorar este correo -- tu contraseña no cambiará.
            </p>
          </div>
        `,
      });
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