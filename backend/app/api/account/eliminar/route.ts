import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flow } from "@/lib/flow";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Borrado real de la cuenta (Ley 21.719 -- derecho a la eliminación). El
// respaldo por correo con plazo de 30 días sigue existiendo para quien no
// pueda entrar a su cuenta, pero para quien sí puede, esto es inmediato.
//
// onDelete: Cascade en schema.prisma se encarga de todo lo que cuelga del
// usuario (postulaciones, perfiles, preferencias, tokens, etc.) -- acá solo
// hay que cancelar la suscripción en Flow ANTES de borrar, para no dejar un
// cobro recurrente corriendo del lado de la pasarela de pago sobre una cuenta
// que ya no existe.
export async function DELETE(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { confirmacionEmail } = await request.json().catch(() => ({}));
  if (
    typeof confirmacionEmail !== "string" ||
    confirmacionEmail.trim().toLowerCase() !== user.email.toLowerCase()
  ) {
    return NextResponse.json({ error: "El correo no coincide con el de tu cuenta" }, { status: 400 });
  }

  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA", flowSubscriptionId: { not: null } },
  });
  if (subscripcion?.flowSubscriptionId) {
    try {
      // at_period_end: 0 -- inmediato, no tiene sentido dejarla correr hasta
      // el fin del período de una cuenta que ya no va a existir.
      await flow.cancelarSuscripcion({ subscriptionId: subscripcion.flowSubscriptionId, at_period_end: 0 });
    } catch (err) {
      // No se bloquea el borrado por esto -- pero queda en el log del
      // servidor para revisarlo a mano si pasa (mejor una cuenta borrada con
      // una suscripción que revisar a mano, que un borrado que nunca ocurre).
      console.error("No se pudo cancelar la suscripción de Flow antes de borrar la cuenta:", err);
    }
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
