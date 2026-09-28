import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";

/**
 * Arreglar una respuesta sin volver a escribirla entera
 * (docs/estrategia-y-rediseno.md §6, panel de revisión).
 *
 * En el panel que aparece antes de enviar, cada respuesta tiene tres botones:
 * "Más corta", "Más formal", "Más cercana". Antes la única salida era borrar y
 * escribir de nuevo a mano, en un textarea, dentro de un portal —- que es
 * exactamente lo que la persona esperaba no tener que hacer.
 *
 * Mismo modelo que /api/ai/responder-pregunta a propósito: si el ajuste lo
 * escribiera otro modelo, la respuesta corregida sonaría distinta a las demás
 * del mismo formulario.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

const AJUSTES: Record<string, string> = {
  corta: "Dejala mas corta: una o dos frases, sin perder lo concreto. Saca el relleno, no los hechos.",
  formal: "Subile el registro: trato de usted, sin modismos ni abreviaciones, pero sin sonar acartonada.",
  cercana: "Bajale el almidon: mas directa y natural, como habla una persona en Chile, sin caer en informal ni en chiste.",
};

// Misma limpieza que /api/ai/responder-pregunta: el texto va derecho a un
// campo de un portal, no puede llegar con markdown ni con comillas de sobra.
function limpiarRespuestaIA(txt: string) {
  if (!txt) return txt;
  let t = txt;
  t = t.replace(/^\s*#+\s*/gm, "");
  t = t.replace(/^\s*[-*•]\s+/gm, "");
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/(^|\n)\s*(Respuesta|Pregunta)\s*:\s*/gi, "$1");
  t = t.trim();
  t = t.replace(/^["“'](.+)["”']$/s, "$1");
  return t.trim();
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    }

    const { pregunta, respuesta, ajuste, maxLargo } = await request.json();
    if (!respuesta || !AJUSTES[ajuste]) {
      return NextResponse.json({ error: "Falta la respuesta o el ajuste pedido" }, { status: 400 });
    }

    const uso = await checkAndLogAiUsage(user.id, "reescribir_respuesta");
    if (!uso.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
        { status: 403 },
      );
    }

    const tope = typeof maxLargo === "number" && maxLargo > 40 && maxLargo < 5000 ? maxLargo : 500;

    const salida = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system:
        "Reescribes una respuesta que una persona va a mandar en un formulario de postulacion en Chile.\n" +
        "Reglas duras:\n" +
        "- No agregues ningun hecho nuevo: ni anios de experiencia, ni cifras, ni herramientas, ni certificaciones. " +
        "Solo puedes reordenar, acortar o cambiar el tono de lo que ya dice.\n" +
        "- Primera persona, espanol de Chile.\n" +
        "- Maximo " + tope + " caracteres.\n" +
        "- Devuelve SOLO el texto final, sin comillas ni explicaciones.",
      messages: [
        {
          role: "user",
          content:
            (pregunta ? 'Pregunta del formulario: "' + String(pregunta).slice(0, 300) + '"\n\n' : "") +
            "Respuesta actual:\n" + String(respuesta).slice(0, 2000) + "\n\n" +
            AJUSTES[ajuste],
        },
      ],
    });

    const texto = limpiarRespuestaIA(
      salida.content.filter((b) => b.type === "text").map((b: any) => b.text).join("").trim(),
    );
    if (!texto) {
      return NextResponse.json({ error: "La IA no devolvió texto" }, { status: 502 });
    }

    return NextResponse.json({ texto: texto.slice(0, tope) });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Hay mucha demanda ahora. Intenta en un minuto." }, { status: 503 });
    }
    console.error("Error en /api/ai/reescribir-respuesta:", err);
    return NextResponse.json({ error: "No se pudo reescribir la respuesta" }, { status: 500 });
  }
}
