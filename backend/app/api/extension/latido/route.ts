import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { anotarHoraDeUso } from "@/lib/monedas";

// La extensión avisa que está encendida (background.js, avisarHoraDeUso). La
// usa la extensión con su token, nunca la web. Misma moneda por hora que el
// panel: si los dos avisan en la misma hora, cuenta una sola.
async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token }, select: { id: true } });
}

export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });

  const ganada = await anotarHoraDeUso(user.id, "extension");
  return NextResponse.json({ ok: true, ganada });
}
