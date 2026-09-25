import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Lo mismo que dura una oferta en "Por decidir" antes de vencer.
const DIAS_VIGENCIA = 7;

/**
 * "No era así" (docs/estrategia-y-rediseno.md §5.2): la persona dice que una
 * oferta descartada sí le servía.
 *
 * Se guarda como una decisión SI, igual que un "sí" en Por decidir. Eso hace
 * dos cosas sin código nuevo: la extensión la toma de la cola de aprobadas y la
 * postula (/api/extension/perfil), y la próxima compilación del perfil la usa
 * para aprender (lib/compilar-perfil.ts lee todas las decisiones SI y NO).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;
  const descarte = await prisma.descarte.findFirst({ where: { id, userId } });
  if (!descarte) {
    return NextResponse.json({ error: "No encontramos esa oferta" }, { status: 404 });
  }
  if (descarte.corregidoEn) {
    return NextResponse.json({ ok: true, yaCorregido: true, seEnvia: !!descarte.url });
  }

  const ahora = new Date();
  await prisma.$transaction([
    prisma.descarte.update({ where: { id }, data: { corregidoEn: ahora } }),
    prisma.decisionOferta.create({
      data: {
        userId,
        tituloCrudo: descarte.titulo,
        url: descarte.url,
        empresa: descarte.empresa,
        plataforma: descarte.plataforma,
        razones: descarte.razon ? [descarte.razon as any] : undefined,
        fuente: "BANDA_GRIS",
        veredicto: "SI",
        decididoEn: ahora,
        venceEn: new Date(ahora.getTime() + DIAS_VIGENCIA * 86_400_000),
      },
    }),
  ]);

  // Sin URL la extensión no tiene dónde postular: igual sirve para aprender.
  return NextResponse.json({ ok: true, seEnvia: !!descarte.url });
}
