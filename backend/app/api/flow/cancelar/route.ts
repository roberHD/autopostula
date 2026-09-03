import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flow } from "@/lib/flow";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Flow no tiene un Billing Portal propio como Stripe -- este es nuestro
// reemplazo simple: cancela al final del período pagado (at_period_end=1),
// así la persona no pierde acceso a mitad de un mes que ya pagó.
export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const subscripcion = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA", flowSubscriptionId: { not: null } },
  });
  if (!subscripcion?.flowSubscriptionId) {
    return NextResponse.json({ error: "No tienes una suscripción activa" }, { status: 400 });
  }

  try {
    const actualizada = await flow.cancelarSuscripcion({
      subscriptionId: subscripcion.flowSubscriptionId,
      at_period_end: 1,
    });

    await prisma.subscription.update({
      where: { id: subscripcion.id },
      data: {
        periodoFin: new Date(actualizada.period_end),
        estado: Number(actualizada.status) === 1 ? "ACTIVA" : "CANCELADA",
      },
    });

    return NextResponse.json({
      ok: true,
      mensaje: `Tu premium sigue activo hasta el ${new Date(actualizada.period_end).toLocaleDateString("es-CL")}.`,
    });
  } catch (err) {
    console.error("Error cancelando suscripción de Flow:", err);
    return NextResponse.json({ error: "No se pudo cancelar — intenta de nuevo" }, { status: 500 });
  }
}
