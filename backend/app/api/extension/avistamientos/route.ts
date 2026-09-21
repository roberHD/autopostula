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
    // Se refresca empresa/url en cada escaneo -- un bug de extracción del
    // adaptador (ej. Laborum guardando la fecha como si fuera la empresa,
    // corregido en ef6d639) quedaba grabado para siempre porque acá no se
    // tocaba nada nunca. `|| undefined` evita que una lectura fallida (vacía)
    // borre un valor bueno ya guardado. postulada NUNCA se toca en el update:
    // nunca se debe pisar un true con un false.
    await prisma.jobOffer.upsert({
      where: { platformId_externalId: { platformId: platform.id, externalId: a.externalId } },
      update: {
        empresa: a.empresa || undefined,
        url: a.url || undefined,
      },
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
