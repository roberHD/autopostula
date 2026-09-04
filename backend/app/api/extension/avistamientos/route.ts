import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// Corpus de avistamientos (docs/rediseno-filtrado-ofertas.md §9.3): cada
// tarjeta que la extensión ve durante un escaneo, se postule, quede en
// banda gris o se descarte -- no solo las que terminan en Application.
// JobOffer es global (dedup por platformId+externalId): la misma oferta
// vista por distintos usuarios actualiza una sola fila, no se duplica.
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const { platformNombre, avistamientos } = await request.json().catch(() => ({}));
  if (!platformNombre || !Array.isArray(avistamientos) || !avistamientos.length) {
    return NextResponse.json({ error: "Faltan platformNombre o avistamientos" }, { status: 400 });
  }

  const platform = await prisma.jobPlatform.findUnique({ where: { nombre: platformNombre } });
  if (!platform) {
    return NextResponse.json({ error: `Portal desconocido: ${platformNombre}` }, { status: 400 });
  }

  let guardados = 0;
  for (const a of avistamientos.slice(0, 200)) {
    if (!a?.externalId || !a?.titulo) continue;
    // update: {} a propósito -- si la fila ya existe no se le toca nada, ni
    // título/empresa (pueden variar entre escaneos por A/B del portal) ni,
    // sobre todo, postulada: nunca se debe pisar un true con un false.
    await prisma.jobOffer.upsert({
      where: { platformId_externalId: { platformId: platform.id, externalId: a.externalId } },
      update: {},
      create: {
        platformId: platform.id,
        externalId: a.externalId,
        titulo: a.titulo,
        empresa: a.empresa || null,
        url: a.url || null,
        origen: "AUTOMATICO",
        postulada: false,
      },
    });
    guardados++;
  }

  return NextResponse.json({ ok: true, guardados });
}
