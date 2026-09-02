import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { construirMensajesCV } from "@/lib/ai-messages";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    }

    const { contexto, perfil, info } = await request.json();
    if (!contexto) {
      return NextResponse.json({ error: "Falta contexto" }, { status: 400 });
    }

    const uso = await checkAndLogAiUsage(user.id, "analizar_oferta");
    if (!uso.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
        { status: 403 }
      );
    }

    const p = perfil || {};
    const infoTexto = (info || []).map((t: string) => "- " + t).join("\n");

    const instruccion =
      "Analiza este aviso de trabajo junto al perfil del candidato. Responde SOLO con un JSON valido, sin texto adicional, sin markdown, con exactamente esta forma:\n" +
      '{"cargo":"","empresa":"","prioridades":"","fortalezas":"","tono":"","matchScore":0}\n' +
      "- cargo: nombre exacto del puesto al que se postula, tal como aparece en el aviso\n" +
      "- empresa: nombre de la empresa que publica el aviso (si no aparece claramente, deja el string vacio)\n" +
      "- prioridades: en una frase corta, que es lo mas importante que busca esta empresa en el candidato segun el aviso (rubro, tareas clave, requisitos)\n" +
      "- fortalezas: en una frase corta, que fortalezas REALES del candidato (solo las que esten en su CV/perfil/datos adicionales) conectan mejor con este aviso especifico\n" +
      '- tono: como deberia sonar el candidato al responder preguntas de este formulario (ej: "cercano y directo", "formal y profesional", "entusiasta pero breve"), segun como este redactado el aviso -- un aviso informal pide un tono mas cercano, uno corporativo uno mas formal\n' +
      "- matchScore: numero entero de 0 a 100 que estima que tan bien calza el perfil/CV del candidato con ESTE aviso especifico (requisitos, rubro, experiencia pedida vs la real). 0 = no calza nada, 100 = calce casi perfecto. Se estricto: si falta informacion del candidato para evaluar bien, usa un puntaje moderado (40-60) en vez de uno alto\n\n" +
      "Perfil: " +
      (p.bio || "Sin informacion de perfil aun") +
      "\n" +
      "Datos adicionales del candidato:\n" +
      (infoTexto || "Ninguno") +
      "\n\n" +
      "AVISO:\n" +
      contexto.slice(0, 3000);

    const messages = await construirMensajesCV(user.id, instruccion);

    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages,
    });

    let texto = respuesta.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    texto = texto.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(texto);

    // Blindaje: si el modelo no manda matchScore, o manda algo raro, no se cae
    // el análisis completo por eso — sencillamente queda sin puntaje.
    if (typeof parsed.matchScore === "number") {
      parsed.matchScore = Math.max(0, Math.min(100, Math.round(parsed.matchScore)));
    } else {
      parsed.matchScore = null;
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Error en /api/ai/analizar-oferta:", err);
    return NextResponse.json(
      { error: "Error al analizar la oferta — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
