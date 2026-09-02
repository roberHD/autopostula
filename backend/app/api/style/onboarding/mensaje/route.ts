import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { getUsuarioSesion } from "@/lib/auth-helpers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT =
  "Eres un entrevistador cercano y curioso, no un formulario. Tu trabajo es conocer a esta " +
  "persona lo suficiente para poder escribir como ella en formularios de postulación laboral. " +
  "Haz UNA pregunta a la vez, corta y conversacional (nunca acartonada ni tipo encuesta). " +
  "Adapta la siguiente pregunta a lo que la persona ya respondió, no sigas un guion fijo. " +
  "Cubre a lo largo de la conversación (no todo de una vez): fortalezas reales con ejemplos " +
  "concretos, qué la motiva a trabajar, cómo prefiere que la describan, y pídele que cuente " +
  "algo con sus propias palabras para notar cómo se expresa naturalmente (frases que usa, si es " +
  "directa o da vueltas, formal o informal). No hagas resúmenes ni cierres tú misma la " +
  "conversación — solo sigue preguntando, una cosa a la vez.";

async function getOrCreateStyleProfile(userId: string) {
  const existente = await prisma.styleProfile.findFirst({
    where: { userId },
    orderBy: { creadoEn: "desc" },
  });
  if (existente) return existente;
  return prisma.styleProfile.create({ data: { userId } });
}

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const perfil = await getOrCreateStyleProfile(userId);
  const conversacion = (perfil.conversacion as any[]) || [];

  return NextResponse.json({ conversacion, confirmado: perfil.confirmado });
}

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { mensaje } = await request.json();

  const perfil = await getOrCreateStyleProfile(userId);
  const conversacion: { role: "user" | "assistant"; content: string }[] =
    (perfil.conversacion as any[]) || [];

  if (mensaje) {
    conversacion.push({ role: "user", content: mensaje });
  }

  const uso = await checkAndLogAiUsage(userId, "conversacion_estilo");
  if (!uso.permitido) {
    return NextResponse.json(
      { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
      { status: 403 }
    );
  }

  const respuesta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: conversacion.length
      ? conversacion
      : [{ role: "user", content: "Hola, empecemos." }],
  });

  const textoIA = respuesta.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();

  conversacion.push({ role: "assistant", content: textoIA });

  await prisma.styleProfile.update({
    where: { id: perfil.id },
    data: { conversacion },
  });

  return NextResponse.json({
    pregunta: textoIA,
    totalMensajes: conversacion.length,
  });
}
