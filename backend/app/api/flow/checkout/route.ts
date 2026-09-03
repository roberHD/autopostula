import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flow } from "@/lib/flow";
import { getUsuarioSesion } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, nombre: true, flowCustomerId: true },
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

  try {
    let flowCustomerId = user.flowCustomerId;
    if (!flowCustomerId) {
      const cliente = await flow.crearCliente({
        name: user.nombre || user.email,
        email: user.email,
        externalId: userId,
      });
      flowCustomerId = cliente.customerId;
      await prisma.user.update({ where: { id: userId }, data: { flowCustomerId } });
    }

    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const registro = await flow.registrarTarjeta({
      customerId: flowCustomerId,
      url_return: `${origin}/api/flow/registro-callback`,
    });

    return NextResponse.json({ url: `${registro.url}?token=${registro.token}` });
  } catch (err) {
    console.error("Error iniciando checkout de Flow:", err);
    return NextResponse.json(
      { error: "No se pudo iniciar el pago — intenta de nuevo en un momento" },
      { status: 500 }
    );
  }
}
