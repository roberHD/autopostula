import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// La cola de decisión de banda gris (docs/rediseno-filtrado-ofertas.md §8) --
// mismo componente de swipe que el triaje de onboarding, misma tabla
// (DecisionOferta), pero acá con ofertas reales que el scorer no pudo ubicar
// con confianza.
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  // Vencimiento perezoso (§8.4): antes de listar, lo que ya pasó su venceEn
  // sin decisión se marca EXPIRADA -- silencio ahí sería peor que avisar.
  await prisma.decisionOferta.updateMany({
    where: { userId, fuente: "BANDA_GRIS", veredicto: "PENDIENTE", venceEn: { lt: new Date() } },
    data: { veredicto: "EXPIRADA" },
  });

  const pendientes = await prisma.decisionOferta.findMany({
    where: { userId, fuente: "BANDA_GRIS", veredicto: "PENDIENTE" },
    orderBy: { venceEn: "asc" },
  });

  const expiradasSinRevisar = await prisma.decisionOferta.count({
    where: { userId, fuente: "BANDA_GRIS", veredicto: "EXPIRADA", decididoEn: null },
  });

  return NextResponse.json({ pendientes, expiradasSinRevisar });
}

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id, veredicto } = await request.json().catch(() => ({}));
  if (!id || (veredicto !== "SI" && veredicto !== "NO")) {
    return NextResponse.json({ error: "Faltan id o veredicto (SI|NO)" }, { status: 400 });
  }

  const decision = await prisma.decisionOferta.findFirst({ where: { id, userId } });
  if (!decision) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  await prisma.decisionOferta.update({
    where: { id },
    data: { veredicto, decididoEn: new Date() },
  });

  return NextResponse.json({ ok: true });
}
