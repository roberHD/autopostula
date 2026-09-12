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
