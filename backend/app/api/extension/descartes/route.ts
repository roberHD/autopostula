import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

/**
 * Las ofertas que el motor dejó fuera en un escaneo, con su razón
 * (docs/estrategia-y-rediseno.md §5.2). Antes la extensión solo contaba
 * cuántas; ahora el panel puede decir cuáles y por qué, y la persona puede
 * corregir ("No era así").
 *
 * Best-effort como los avistamientos: si falla, el escaneo sigue igual. La
 * misma oferta descartada en otro escaneo no se duplica (se queda la primera
 * vez que se vio).
 */
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const { plataforma, descartes } = await request.json().catch(() => ({}));
  if (!plataforma || typeof plataforma !== "string" || !Array.isArray(descartes)) {
    return NextResponse.json({ error: "Faltan plataforma o descartes" }, { status: 400 });
  }

  const filas = descartes
    .slice(0, 200)
    .filter((d: any) => d && typeof d.externalId === "string" && d.externalId && typeof d.titulo === "string" && d.titulo)
    .map((d: any) => ({
      userId: user.id,
      plataforma,
      externalId: d.externalId.slice(0, 200),
      titulo: d.titulo.slice(0, 300),
      empresa: typeof d.empresa === "string" && d.empresa ? d.empresa.slice(0, 200) : null,
      url: typeof d.url === "string" && d.url ? d.url.slice(0, 1000) : null,
      // La razón tal como la dio el scorer: un objeto { tipo, ... } o un string.
      razon: d.razon && (typeof d.razon === "object" || typeof d.razon === "string") ? d.razon : undefined,
    }));

  if (!filas.length) return NextResponse.json({ ok: true, guardados: 0 });

  const { count } = await prisma.descarte.createMany({ data: filas, skipDuplicates: true });
  return NextResponse.json({ ok: true, guardados: count });
}
