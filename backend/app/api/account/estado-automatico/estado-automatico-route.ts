import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const [subscripcion, cv] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id, estado: "ACTIVA" },
      include: { plan: true },
    }),
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    busquedaAutomatica: subscripcion?.plan.busquedaAutomatica ?? false,
    cargoObjetivo: cv?.cargoObjetivo ?? null,
  });
}
