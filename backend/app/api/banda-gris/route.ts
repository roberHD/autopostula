import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { listarPorDecidir } from "@/lib/panel/listas";

// La cola de decisión de banda gris (docs/rediseno-filtrado-ofertas.md §8) --
// mismo componente de swipe que el triaje de onboarding, misma tabla
// (DecisionOferta), pero acá con ofertas reales que el scorer no pudo ubicar
// con confianza.
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  // La cola vive en lib/panel/listas.ts: la página Por decidir la arma en el
  // servidor (docs/optimizacion-2026-09-29.md §1).
  return NextResponse.json(await listarPorDecidir(userId));
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
