import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { getUsuarioSesion } from "@/lib/auth-helpers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_BASE =
  "Eres un entrevistador cercano y curioso, no un formulario. Tu trabajo es conocer a esta " +
  "persona lo suficiente para poder escribir como ella en formularios de postulación laboral. " +
  "Haz UNA pregunta a la vez, corta y conversacional (nunca acartonada ni tipo encuesta). " +
  "Adapta la siguiente pregunta a lo que la persona ya respondió, no sigas un guion fijo. " +
  "Cubre a lo largo de la conversación (no todo de una vez): fortalezas reales con ejemplos " +
  "concretos, qué la motiva a trabajar, cómo prefiere que la describan, y pídele que cuente " +
  "algo con sus propias palabras para notar cómo se expresa naturalmente (frases que usa, si es " +
  "directa o da vueltas, formal o informal). No hagas resúmenes ni cierres tú misma la " +
  "conversación — solo sigue preguntando, una cosa a la vez. Nunca preguntes por datos que ya " +
  "aparecen en su CV (en qué trabaja o trabajó, qué estudia o estudió, sus cargos, empresas, " +
  "habilidades, etc.) — si ya tienes esa información dala por sabida y ve directo a lo que el CV " +
  "no puede contarte. Escribe en texto plano, como en un chat real: nunca uses markdown (nada de " +
  "**negritas**, #títulos, guiones de lista, etc.).";

// Arma un resumen de lo que ya se sabe por el CV para que la IA no repregunte
// datos que la persona ya entregó al subirlo.
function resumirCvParaContexto(cv: {
  nombre?: string | null;
  cargoObjetivo?: string | null;
  resumenProfesional?: string | null;
  experiencia?: unknown;
  habilidades?: unknown;
  textoExtraido?: string | null;
} | null) {
  if (!cv) return null;

  const partes: string[] = [];
  if (cv.nombre) partes.push(`Nombre: ${cv.nombre}`);
  if (cv.cargoObjetivo) partes.push(`Cargo objetivo: ${cv.cargoObjetivo}`);
  if (cv.resumenProfesional) partes.push(`Resumen profesional: ${cv.resumenProfesional}`);
  if (Array.isArray(cv.experiencia) && cv.experiencia.length) {
    const experiencia = (cv.experiencia as { cargo?: string; empresa?: string; periodo?: string }[])
      .map((e) => [e.cargo, e.empresa, e.periodo].filter(Boolean).join(" — "))
      .join("; ");
    if (experiencia) partes.push(`Experiencia laboral: ${experiencia}`);
  }
  if (Array.isArray(cv.habilidades) && cv.habilidades.length) {
    partes.push(`Habilidades: ${(cv.habilidades as string[]).join(", ")}`);
  }

  // Si la IA todavía no había estructurado el CV (recién subido), al menos se
  // le pasa el texto crudo en vez de no darle nada.
  if (!partes.length && cv.textoExtraido) {
    partes.push(cv.textoExtraido.slice(0, 2000));
  }

  return partes.length ? partes.join("\n") : null;
}

function construirSystemPrompt(contextoCv: string | null) {
  if (!contextoCv) return SYSTEM_PROMPT_BASE;
  return (
    SYSTEM_PROMPT_BASE +
    "\n\nEsto es lo que ya se sabe de esta persona por su CV — no se lo vuelvas a preguntar:\n" +
    contextoCv
  );
}

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

  // Si ya se finalizó antes, se devuelve también lo que la IA sintetizó —
  // sin esto, al volver a esta página no había forma de ver de nuevo el
  // resultado (quedaba guardado y en uso, pero invisible para la persona).
  const resultado = perfil.confirmado
    ? {
        resumen: perfil.resumen,
        fortalezas: perfil.fortalezas,
        objetivo: perfil.objetivo,
        motivaciones: perfil.motivaciones,
        estiloDetalle: perfil.estiloDetalle,
        manualEscritura: perfil.manualEscritura,
      }
    : null;

  return NextResponse.json({ conversacion, confirmado: perfil.confirmado, resultado });
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

  const cv = await prisma.cvProfile.findUnique({ where: { userId } });
  const systemPrompt = construirSystemPrompt(resumirCvParaContexto(cv));

  const respuesta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: systemPrompt,
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
