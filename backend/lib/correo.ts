import { Resend } from "resend";
import { getBaseUrl } from "@/lib/base-url";

// Remitente de todos los correos que manda la app.
//
// No hay valor por defecto a propósito. `onboarding@resend.dev` es el dominio
// compartido de prueba de Resend, y solo entrega a la dirección dueña de la
// cuenta: para cualquier otro destinatario acepta el envío y lo descarta. Un
// fallback ahí no degrada el servicio, lo vuelve invisible -- la app cree que
// mandó el correo, la persona nunca lo recibe, y nadie se entera hasta que
// alguien reclama que no puede recuperar su contraseña. Preferimos que reviente.
export function remitente(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "Falta RESEND_FROM_EMAIL -- sin un remitente de dominio verificado, Resend " +
        "descarta los correos en silencio."
    );
  }
  return from;
}

// Instanciado por llamada, no a nivel de módulo -- si se crea acá arriba,
// falta RESEND_API_KEY tira en cuanto Next carga el módulo para recolectar la
// config de la ruta, y se cae el build entero en vez de solo esta llamada.
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// docs/verificacion-de-correo.md §5 -- el registro y el reenvío (§6) mandan
// exactamente el mismo correo, con un token nuevo cada vez.
export async function enviarCorreoVerificacion(email: string, token: string) {
  const url = `${getBaseUrl()}/verificar?token=${token}`;
  await getResend().emails.send({
    from: remitente(),
    to: email,
    subject: "Confirma tu correo en AutoPostula",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111827;">Confirma tu correo</h2>
        <p style="color: #4B5563; line-height: 1.6;">
          Con tu correo confirmado puedes conectar la extensión y postular a trabajos. Haz clic en el siguiente enlace (válido por 24 horas):
        </p>
        <p style="margin: 24px 0;">
          <a href="${url}" style="background: #16181A; color: #F4F5F3; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Confirmar mi correo
          </a>
        </p>
        <p style="color: #9CA3AF; font-size: 12px;">
          Si no creaste una cuenta en AutoPostula, puedes ignorar este correo.
        </p>
      </div>
    `,
  });
}
