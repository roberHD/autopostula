import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claveDuplicado, DIAS_VENTANA_DUPLICADOS } from "@/lib/duplicados";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

const MAX_OFERTAS = 100;

// docs/revision-2026-09-16.md §2.8: la extensión pregunta acá, antes de abrir
// nada, cuáles de las ofertas que se dispone a postular ya se postularon en
// los últimos 30 días con otro id (misma plataforma, mismo título, misma
// empresa). Devuelve solo los duplicados, con la fecha de la postulación
// anterior, para poder decirlo en el log.
//
// Las INCOMPLETA no cuentan: esa postulación nunca llegó a la empresa, así que
// reintentarla no duplica nada.
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const plataforma = typeof body?.plataforma === "string" ? body.plataforma : null;
  const ofertas: { titulo?: unknown; empresa?: unknown }[] = Array.isArray(body?.ofertas) ? body.ofertas : [];
  if (!plataforma || !ofertas.length) {
    return NextResponse.json({ error: "Faltan 'plataforma' u 'ofertas'" }, { status: 400 });
  }
  if (ofertas.length > MAX_OFERTAS) {
    return NextResponse.json({ error: `Máximo ${MAX_OFERTAS} ofertas por consulta` }, { status: 400 });
  }

  const desde = new Date(Date.now() - DIAS_VENTANA_DUPLICADOS * 24 * 3_600_000);
  const previas = await prisma.application.findMany({
    where: {
      userId: user.id,
      enviadaEn: { gte: desde },
      estadoActual: { not: "INCOMPLETA" },
      platformAccount: { platform: { nombre: plataforma } },
    },
    select: { enviadaEn: true, jobOffer: { select: { titulo: true, empresa: true } } },
    orderBy: { enviadaEn: "desc" },
  });

  // La más reciente por clave (orderBy desc: la primera que entra gana).
  const porClave = new Map<string, Date>();
  for (const p of previas) {
    const clave = claveDuplicado(p.jobOffer.titulo, p.jobOffer.empresa, p.enviadaEn);
    if (!porClave.has(clave)) porClave.set(clave, p.enviadaEn);
  }

  const ahora = new Date();
  const duplicados: { indice: number; fecha: string }[] = [];
  ofertas.forEach((o, indice) => {
    if (typeof o?.titulo !== "string" || !o.titulo.trim()) return;
    const empresa = typeof o.empresa === "string" ? o.empresa : null;
    const fecha = porClave.get(claveDuplicado(o.titulo, empresa, ahora));
    if (fecha) duplicados.push({ indice, fecha: fecha.toISOString() });
  });

  return NextResponse.json({ duplicados });
}
