import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

// Mapeo de status de Stripe a nuestro EstadoSuscripcion -- Stripe tiene más
// estados que nosotros (trialing, incomplete, etc), pero para el MVP solo nos
// importa si está pagando (ACTIVA) o no (VENCIDA/CANCELADA).
function estadoDesde(status: Stripe.Subscription.Status): "ACTIVA" | "CANCELADA" | "VENCIDA" {
  if (status === "active" || status === "trialing") return "ACTIVA";
  if (status === "canceled" || status === "incomplete_expired") return "CANCELADA";
  return "VENCIDA"; // past_due, unpaid, incomplete
}

async function upsertSubscripcionDesdeStripe(sub: Stripe.Subscription, userIdFallback?: string) {
  const userId = (sub.metadata?.userId as string | undefined) ?? userIdFallback;
  if (!userId) {
    console.error("Webhook de Stripe sin userId en metadata ni fallback -- no se puede aplicar:", sub.id);
    return;
  }

  const plan = await prisma.plan.findFirst({ where: { tipo: "PREMIUM" } });
  if (!plan) {
    console.error("No existe el Plan PREMIUM en la base -- corre asegurarPlanesBase() antes de procesar pagos.");
    return;
  }

  const item = sub.items.data[0];
  const periodoInicio = item?.current_period_start ? new Date(item.current_period_start * 1000) : null;
  const periodoFin = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  const existente = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
  if (existente) {
    await prisma.subscription.update({
      where: { id: existente.id },
      data: { estado: estadoDesde(sub.status), periodoInicio, periodoFin },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        stripeSubscriptionId: sub.id,
        estado: estadoDesde(sub.status),
        periodoInicio,
        periodoFin,
      },
    });
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Falta STRIPE_WEBHOOK_SECRET -- no se puede verificar el webhook.");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 500 });
  }

  const firma = request.headers.get("stripe-signature");
  const cuerpoCrudo = await request.text();

  let event: Stripe.Event;
  try {
    // Se verifica la firma con el cuerpo crudo (no el JSON parseado) -- es lo
    // que prueba que el evento viene de Stripe de verdad y no de cualquiera
    // que le pegue a esta URL.
    event = getStripe().webhooks.constructEvent(cuerpoCrudo, firma ?? "", secret);
  } catch (err) {
    console.error("Firma de webhook de Stripe inválida:", err);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (userId && typeof session.customer === "string") {
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: session.customer },
          });
        }
        if (typeof session.subscription === "string") {
          const sub = await getStripe().subscriptions.retrieve(session.subscription);
          await upsertSubscripcionDesdeStripe(sub, userId ?? undefined);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscripcionDesdeStripe(sub);
        break;
      }
      default:
        // El resto de eventos (invoices, payment_intents, etc) no nos importan
        // todavía -- se ignoran en vez de tratarlos como error.
        break;
    }
  } catch (err) {
    console.error("Error procesando webhook de Stripe:", event.type, err);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
