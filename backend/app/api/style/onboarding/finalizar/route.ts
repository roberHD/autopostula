import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { usuarioTienePerfilDinamico } from "@/lib/plan-beneficios";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const perfil = await prisma.styleProfile.findFirst({
    where: { userId },
    orderBy: { creadoEn: "desc" },
  });

  const conversacion = (perfil?.conversacion as any[]) || [];
  if (!perfil || conversacion.length < 4) {
    return NextResponse.json(
      { error: "Conversa un poco más antes de generar el perfil" },
      { status: 400 }
    );
  }

  // Armar el perfil por primera vez (fase 1) es gratis para todos. Volver a
  // finalizar un perfil que ya estaba confirmado (fase 2, tras seguir
  // conversando) es lo mismo que seguir profundizándolo -- premium.
  if (perfil.confirmado && !(await usuarioTienePerfilDinamico(userId))) {
    return NextResponse.json(
      { error: "Volver a generar tu perfil de estilo es una función premium.", requierePremium: true },
      { status: 403 }
    );
  }

  await prisma.aiUsageLog.create({ data: { userId, tipo: "finalizar_conversacion_estilo" } });

  const transcripcion = conversacion
    .map((m) => (m.role === "user" ? "Candidato: " : "Entrevistador: ") + m.content)
    .join("\n");

  const instruccion =
    "Lee esta conversación entre un entrevistador y un candidato, y extrae su perfil de estilo. " +
    "Responde SOLO un JSON válido, sin texto adicional, sin markdown, con exactamente esta forma:\n" +
    '{"resumen":"","fortalezas":[],"objetivo":"","motivaciones":"","estiloDetalle":{"formalidad":"","longitud":"","cercania":"","nivelTecnico":"","seguridad":""},"manualEscritura":[]}\n' +
    "- resumen: 2-3 líneas describiendo a esta persona profesionalmente, en tercera persona.\n" +
    "- fortalezas: 3 a 5 strings cortos, fortalezas reales mencionadas en la conversación.\n" +
    "- objetivo: una frase de qué tipo de trabajo busca o qué la motiva laboralmente.\n" +
    "- motivaciones: 1-2 líneas de qué la mueve a trabajar, en sus propias palabras si es posible.\n" +
    "- estiloDetalle: cada campo una palabra o frase corta (ej. formalidad: \"cercana pero profesional\", longitud: \"breve\", cercania: \"directa\", nivelTecnico: \"medio\", seguridad: \"segura de si misma\").\n" +
    "- manualEscritura: 3 a 5 tips CONCRETOS y accionables sobre cómo escribe esta persona (muletillas, giros propios, cosas que evita decir) para que otra IA pueda imitar su voz al redactar respuestas por ella. Nada genérico.\n\n" +
    "Conversación:\n" + transcripcion;

  const respuesta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    messages: [{ role: "user", content: instruccion }],
  });

  let texto = respuesta.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
  texto = texto.replace(/```json|```/g, "").trim();

  let extraido;
  try {
    extraido = JSON.parse(texto);
  } catch (err) {
    console.error("La IA no devolvió JSON válido:", texto);
    return NextResponse.json({ error: "No se pudo interpretar el perfil generado" }, { status: 502 });
  }

  const cv = await prisma.cvProfile.findUnique({ where: { userId } });
  const fuentes = ["conversacion"];
  if (cv) fuentes.push("cv");

  const actualizado = await prisma.styleProfile.update({
    where: { id: perfil.id },
    data: {
      resumen: extraido.resumen,
      fortalezas: extraido.fortalezas,
      objetivo: extraido.objetivo,
      motivaciones: extraido.motivaciones,
      estiloDetalle: extraido.estiloDetalle,
      manualEscritura: extraido.manualEscritura,
      confirmado: true,
      fuentesCompletadas: fuentes,
    },
  });

  return NextResponse.json({
    resumen: actualizado.resumen,
    fortalezas: actualizado.fortalezas,
    objetivo: actualizado.objetivo,
    motivaciones: actualizado.motivaciones,
    estiloDetalle: actualizado.estiloDetalle,
    manualEscritura: actualizado.manualEscritura,
  });
}
