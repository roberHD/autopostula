import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { construirMensajesCV } from "@/lib/ai-messages";
import { DESCRIPCION_TONO, DESCRIPCION_LONGITUD } from "@/lib/style-descriptions";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PREGUNTAS_EJEMPLO = [
  "¿Por qué quieres trabajar con nosotros?",
  "¿Cuál es tu pretensión de renta?",
];

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { tono, longitudRespuesta, instrucciones } = await request.json();

    const uso = await checkAndLogAiUsage(userId, "preview_entrenamiento");
    if (!uso.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
        { status: 403 }
      );
    }

    const instruccion =
      "Vas a simular respuestas de ejemplo para un formulario de postulación laboral, con esta configuración de estilo:\n" +
      "- Tono: " + (DESCRIPCION_TONO[tono] || tono) + "\n" +
      "- Extensión: " + (DESCRIPCION_LONGITUD[longitudRespuesta] || longitudRespuesta) + "\n" +
      "- Instrucciones adicionales del candidato: " + (instrucciones || "ninguna") + "\n\n" +
      "Preguntas a responder:\n" +
      PREGUNTAS_EJEMPLO.map((p, i) => i + 1 + ". " + p).join("\n") +
      "\n\n" +
      "Usa el CV del candidato para que la primera respuesta sea real y especifica, no generica. Para la pregunta de renta, si no hay dato de renta esperada, responde algo razonable tipo estar abierto a conversarlo segun la descripcion del cargo, en el tono pedido.\n\n" +
      'Responde SOLO un JSON valido, sin texto adicional, sin markdown, con esta forma exacta: {"respuestas":[{"pregunta":"...","respuesta":"..."},{"pregunta":"...","respuesta":"..."}]}';

    const messages = await construirMensajesCV(userId, instruccion);

    const respuestaIA = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages,
    });

    let texto = respuestaIA.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    texto = texto.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(texto);

    return NextResponse.json({ respuestas: parsed.respuestas || [] });
  } catch (err) {
    console.error("Error en /api/ai/preview-entrenamiento:", err);
    return NextResponse.json(
      { error: "Error al generar el preview — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
