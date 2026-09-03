import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flow } from "@/lib/flow";

// urlCallback del Plan -- Flow pega acá cada vez que cobra (o intenta cobrar)
// una renovación mensual. Solo manda un "token" de pago, no el subscriptionId
// directamente, así que se identifica al usuario por el email del pagador
// (payer) que sí viene en payment/getStatus, y desde ahí se refresca el
// estado real de SU suscripción contra Flow (no se intenta reconstruir el
// estado a mano a partir del pago suelto).
export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get("token");
  if (typeof token !== "string") {
    return NextResponse.json({ error: "Falta token" }, { status: 400 });
  }

  try {
    const pago = await flow.estadoPago(token);
    const user = await prisma.user.findUnique({ where: { email: pago.payer } });
    if (!user) {
      console.error("Webhook de cobro de Flow con un payer que no reconocemos:", pago.payer);
      return NextResponse.json({ ok: true }); // no reintentar, no es un caso recuperable
    }

    const subscripcion = await prisma.subscription.findFirst({
      where: { userId: user.id, flowSubscriptionId: { not: null } },
      orderBy: { periodoInicio: "desc" },
    });
    if (!subscripcion?.flowSubscriptionId) {
      console.error("Webhook de cobro de Flow sin Subscription local para el usuario:", user.id);
      return NextResponse.json({ ok: true });
    }

    const actual = await flow.obtenerSuscripcion(subscripcion.flowSubscriptionId);
    await prisma.subscription.update({
      where: { id: subscripcion.id },
      data: {
        estado: Number(actual.status) === 1 ? "ACTIVA" : "VENCIDA",
        periodoInicio: new Date(actual.period_start),
        periodoFin: new Date(actual.period_end),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error procesando webhook de cobro de Flow:", err);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }
}
