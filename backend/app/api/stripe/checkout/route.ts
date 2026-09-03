import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getUsuarioSesion } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: "Falta configurar el cobro premium — avísale al equipo." },
      { status: 500 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, stripeCustomerId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const yaEsPremium = await prisma.subscription.findFirst({
    where: { userId, estado: "ACTIVA", plan: { tipo: "PREMIUM" } },
  });
  if (yaEsPremium) {
    return NextResponse.json({ error: "Ya tienes el plan premium activo" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // client_reference_id (no metadata en la Session) es lo que el webhook usa
    // en checkout.session.completed para saber a qué usuario nuestro
    // corresponde -- subscription_data.metadata copia lo mismo al objeto
    // Subscription de Stripe, para poder identificarlo también en los eventos
    // customer.subscription.* que llegan después, sin depender de la Session.
    client_reference_id: userId,
    subscription_data: { metadata: { userId } },
    ...(user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email }),
    success_url: `${origin}/dashboard/ajustes?upgrade=exito`,
    cancel_url: `${origin}/dashboard/ajustes?upgrade=cancelado`,
  });

  return NextResponse.json({ url: session.url });
}
