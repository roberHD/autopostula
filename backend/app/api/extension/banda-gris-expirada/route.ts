import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// §8.4 / §8.6: cuando la extensión va a postular sola a una oferta que el
// usuario aprobó en banda gris, y la oferta ya no existe o no tiene botón de
// postular, se marca EXPIRADA en vez de reintentar para siempre en cada
// ciclo. "Silencio ahí sería peor que el error" (§8.4).
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const { decisionId } = await request.json().catch(() => ({}));
  if (!decisionId) {
    return NextResponse.json({ error: "Falta decisionId" }, { status: 400 });
  }

  await prisma.decisionOferta.updateMany({
    where: { id: decisionId, userId: user.id, veredicto: "SI" },
    data: { veredicto: "EXPIRADA" },
  });

  return NextResponse.json({ ok: true });
}
