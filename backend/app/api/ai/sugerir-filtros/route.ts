import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { construirMensajesCV } from "@/lib/ai-messages";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [cv, styleProfile] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId } }),
    prisma.styleProfile.findFirst({ where: { userId }, orderBy: { creadoEn: "desc" } }),
  ]);

  if (!cv?.textoExtraido) {
    return NextResponse.json({ error: "Primero sube tu CV para poder sugerir filtros" }, { status: 400 });
  }

  const uso = await checkAndLogAiUsage(userId, "sugerir_filtros");
  if (!uso.permitido) {
    return NextResponse.json(
      { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
      { status: 403 }
    );
  }

  const contextoConversacion = styleProfile?.confirmado
    ? "Objetivo laboral (de la conversación): " + (styleProfile.objetivo || "") + "\n" +
      "Motivaciones: " + (styleProfile.motivaciones || "") + "\n"
    : "";

  const instruccion =
    "Basándote en el CV y la información del candidato, sugiere criterios para filtrar ofertas de " +
    "empleo automáticamente. Responde SOLO con un JSON válido, sin texto adicional, sin markdown, " +
    "con exactamente esta forma:\n" +
    '{"modalidad":"","jornada":"","palabrasIncluir":[],"palabrasExcluir":[]}\n' +
    '- modalidad: una de "cualquiera", "remoto", "hibrido", "presencial" — según lo que indique su perfil (si no hay indicio claro, usa "cualquiera").\n' +
    '- jornada: una de "cualquiera", "full_time", "part_time" — infiere de su disponibilidad indicada.\n' +
    "- palabrasIncluir: 3 a 6 palabras o frases cortas (cargos o rubros) que calcen con su experiencia real, para buscar ofertas relevantes.\n" +
    "- palabrasExcluir: 0 a 4 palabras cortas de cargos o rubros que claramente NO calzan con su perfil (deja el array vacío si no hay nada obvio que excluir — no inventes).\n\n" +
    "Cargo objetivo: " + (cv.cargoObjetivo || "") + "\n" +
    "Disponibilidad indicada: " + (cv.disponibilidad || "") + "\n" +
    "Modalidad indicada en su perfil: " + (cv.modalidad || "") + "\n" +
    contextoConversacion;

  const messages = await construirMensajesCV(userId, instruccion);

  try {
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
    const sugerido = JSON.parse(texto);

    return NextResponse.json({ sugerido });
  } catch (err) {
    console.error("Error en /api/ai/sugerir-filtros:", err);
    return NextResponse.json({ error: "No se pudo generar la sugerencia" }, { status: 500 });
  }
}
