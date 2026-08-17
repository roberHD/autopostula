import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BANCO_CALIBRACION } from "@/lib/style-calibration-questions";

async function getOrCreateStyleProfile(userId: string) {
  const existente = await prisma.styleProfile.findFirst({
    where: { userId },
    orderBy: { creadoEn: "desc" },
  });
  if (existente) return existente;

  return prisma.styleProfile.create({ data: { userId } });
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const perfil = await getOrCreateStyleProfile(userId);

  const respondidas = await prisma.styleCalibrationAnswer.findMany({
    where: { styleProfileId: perfil.id },
  });
  const idsRespondidos = new Set(respondidas.map((r) => r.pregunta));

  const pendientes = BANCO_CALIBRACION.filter((p) => !idsRespondidos.has(p.texto));

  return NextResponse.json({
    styleProfileId: perfil.id,
    confianzaPorcentaje: perfil.confianzaPorcentaje,
    totalPreguntas: BANCO_CALIBRACION.length,
    respondidas: respondidas.length,
    pendientes,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { preguntaId, opcionElegida } = await request.json();
  if (!preguntaId || !opcionElegida) {
    return NextResponse.json({ error: "Falta preguntaId u opcionElegida" }, { status: 400 });
  }

  const pregunta = BANCO_CALIBRACION.find((p) => p.id === preguntaId);
  if (!pregunta) {
    return NextResponse.json({ error: "Pregunta desconocida" }, { status: 400 });
  }

  const perfil = await getOrCreateStyleProfile(userId);

  await prisma.styleCalibrationAnswer.create({
    data: {
      styleProfileId: perfil.id,
      tipo: pregunta.tipo.toUpperCase() as any,
      pregunta: pregunta.texto,
      opcionElegida,
    },
  });

  const totalRespondidas = await prisma.styleCalibrationAnswer.count({
    where: { styleProfileId: perfil.id },
  });

  const cv = await prisma.cvProfile.findUnique({ where: { userId } });
  const fuentes = ["calibracion"];
  if (cv) fuentes.push("cv");
  if (perfil.conversacion) fuentes.push("conversacion");

  // Ponderación simple por ahora: calibración pesa hasta 60%, CV y conversación 20% c/u.
  const pctCalibracion = Math.min(totalRespondidas / BANCO_CALIBRACION.length, 1) * 60;
  const pctCv = cv ? 20 : 0;
  const pctConversacion = perfil.conversacion ? 20 : 0;
  const confianza = Math.round(pctCalibracion + pctCv + pctConversacion);

  const actualizado = await prisma.styleProfile.update({
    where: { id: perfil.id },
    data: {
      confianzaPorcentaje: confianza,
      fuentesCompletadas: fuentes,
    },
  });

  return NextResponse.json({
    respondidas: totalRespondidas,
    totalPreguntas: BANCO_CALIBRACION.length,
    confianzaPorcentaje: actualizado.confianzaPorcentaje,
  });
}
