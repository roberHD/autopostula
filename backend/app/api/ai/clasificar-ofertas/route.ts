import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";

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

    const { titulos, objetivo } = await request.json();
    if (!titulos || !titulos.length || !objetivo) {
      return NextResponse.json({ error: "Faltan titulos u objetivo" }, { status: 400 });
    }

    const uso = await checkAndLogAiUsage(user.id, "clasificar_ofertas");
    if (!uso.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
        { status: 403 }
      );
    }

    const lista = titulos.map((t: string, i: number) => i + 1 + ". " + t).join("\n");
    const instruccion =
      'El candidato busca trabajo relacionado con: "' +
      objetivo +
      '"\n\n' +
      "Aqui hay una lista numerada de titulos de ofertas de trabajo reales. Para cada una, decide si es razonablemente relevante para lo que el candidato busca -- entiende sinonimos y categorias relacionadas (ej: si busca \"vendedor\", \"asesor comercial\" o \"ejecutivo de ventas\" SI son relevantes; \"auxiliar de aseo\" o \"conductor\" normalmente NO lo son, salvo que el objetivo lo mencione explicitamente).\n\n" +
      "Lista:\n" +
      lista +
      "\n\n" +
      'Responde SOLO un JSON valido, sin texto adicional, sin markdown: {"relevantes":[1,3,5]} -- solo los numeros (segun la lista) de las ofertas relevantes.';

    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: instruccion }],
    });

    let texto = respuesta.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    texto = texto.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(texto);

    return NextResponse.json({ relevantes: parsed.relevantes || [] });
  } catch (err) {
    console.error("Error en /api/ai/clasificar-ofertas:", err);
    return NextResponse.json(
      { error: "Error al clasificar ofertas — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
