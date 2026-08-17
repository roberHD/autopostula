import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      jobOffer: { include: { platform: true } },
      statusHistory: { orderBy: { cambiadoEn: "asc" } },
      answers: { orderBy: { respondidoEn: "asc" } },
    },
  });

  if (!application || application.userId !== userId) {
    return NextResponse.json({ error: "Postulación no encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    id: application.id,
    titulo: application.jobOffer.titulo,
    empresa: application.jobOffer.empresa,
    portal: application.jobOffer.platform.nombre,
    estadoActual: application.estadoActual,
    enviadaEn: application.enviadaEn,
    historial: application.statusHistory.map((h) => ({
      estado: h.estado,
      cambiadoEn: h.cambiadoEn,
    })),
    respuestas: application.answers.map((a) => ({
      pregunta: a.pregunta,
      respuestaIa: a.respuestaIa,
      respuestaFinal: a.respuestaFinal,
      fueEditada: a.fueEditada,
      tema: a.tema,
    })),
  });
}
