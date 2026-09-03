import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flow } from "@/lib/flow";
import { FLOW_PLAN_ID } from "@/lib/flow-plan";
import { asegurarPlanesBase } from "@/lib/plans";

// Flow redirige el browser del cliente de vuelta acá con un POST
// x-www-form-urlencoded que trae solo un "token" -- no identifica al usuario
// directamente, así que se lo busca por el customerId que devuelve
// getRegisterStatus (que sí guardamos nosotros al crear el cliente).
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const form = await request.formData();
  const token = form.get("token");

  if (typeof token !== "string") {
    return NextResponse.redirect(`${origin}/dashboard/ajustes?upgrade=error`, 303);
  }

  try {
    const registro = await flow.estadoRegistroTarjeta(token);
    if (String(registro.status) !== "1") {
      return NextResponse.redirect(`${origin}/dashboard/ajustes?upgrade=rechazado`, 303);
    }

    const user = await prisma.user.findFirst({ where: { flowCustomerId: registro.customerId } });
    if (!user) {
      console.error("Callback de Flow con un customerId que no reconocemos:", registro.customerId);
      return NextResponse.redirect(`${origin}/dashboard/ajustes?upgrade=error`, 303);
    }

    await asegurarPlanesBase();
    const plan = await prisma.plan.findFirst({ where: { tipo: "PREMIUM" } });
    if (!plan) {
      console.error("No se pudo asegurar el Plan PREMIUM en la base.");
      return NextResponse.redirect(`${origin}/dashboard/ajustes?upgrade=error`, 303);
    }

    const suscripcion = await flow.crearSuscripcion({
      planId: FLOW_PLAN_ID,
      customerId: registro.customerId,
    });

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        flowSubscriptionId: suscripcion.subscriptionId,
        estado: Number(suscripcion.status) === 1 ? "ACTIVA" : "VENCIDA",
        periodoInicio: new Date(suscripcion.period_start),
        periodoFin: new Date(suscripcion.period_end),
      },
    });

    return NextResponse.redirect(`${origin}/dashboard/ajustes?upgrade=exito`, 303);
  } catch (err) {
    console.error("Error en callback de registro de Flow:", err);
    return NextResponse.redirect(`${origin}/dashboard/ajustes?upgrade=error`, 303);
  }
}
