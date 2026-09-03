import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { construirMensajesCV } from "@/lib/ai-messages";
import { DESCRIPCION_TONO, DESCRIPCION_LONGITUD } from "@/lib/style-descriptions";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// Misma limpieza que ya usaba responder-pregunta.
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

type PreguntaIn = { id: string; pregunta: string; opciones?: string[] | null };

// Fusiona lo que antes eran analizar-oferta + N llamadas a responder-pregunta
// (una por cada pregunta del formulario) en una sola llamada: el CV, el estilo,
// la calibración y el aviso se mandan una vez, no una vez por pregunta.
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    }

    const { contexto, perfil, info, preguntas } = await request.json();
    if (!contexto) {
      return NextResponse.json({ error: "Falta contexto" }, { status: 400 });
    }
    const listaPreguntas: PreguntaIn[] = Array.isArray(preguntas) ? preguntas : [];

    const uso = await checkAndLogAiUsage(user.id, "procesar_postulacion");
    if (!uso.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
        { status: 403 }
      );
    }

    const styleProfile = await prisma.styleProfile.findFirst({
      where: { userId: user.id },
      orderBy: { creadoEn: "desc" },
    });
    const estilo = styleProfile?.confirmado
      ? {
          confirmado: true,
          resumen: styleProfile.resumen,
          fortalezas: styleProfile.fortalezas as string[] | null,
          objetivos: styleProfile.objetivo,
          motivaciones: styleProfile.motivaciones,
          estilo: styleProfile.estiloDetalle as any,
          manualEscritura: styleProfile.manualEscritura as string[] | null,
        }
      : null;

    const calibracion = styleProfile
      ? await prisma.styleCalibrationAnswer.findMany({ where: { styleProfileId: styleProfile.id } })
      : [];

    const p = perfil || {};
    const infoTexto = (info || []).map((t: string) => "- " + t).join("\n");

    const bloqueEstilo =
      estilo && estilo.confirmado
        ? "Perfil de estilo del candidato (de como el mismo se comunica -- esta es su voz autentica, uselo como base para TODAS las respuestas de texto libre, ajustandolo levemente segun el tono que tu mismo determines para este aviso):\n" +
          "- Resumen: " + (estilo.resumen || "") + "\n" +
          "- Fortalezas que quiere destacar: " + (estilo.fortalezas || []).join(", ") + "\n" +
          "- Objetivo laboral: " + (estilo.objetivos || "") + "\n" +
          "- Motivaciones: " + (estilo.motivaciones || "") + "\n" +
          "- Como escribe -- formalidad: " + (estilo.estilo?.formalidad || "") + ", longitud preferida: " + (estilo.estilo?.longitud || "") + ", cercania: " + (estilo.estilo?.cercania || "") + ", nivel tecnico: " + (estilo.estilo?.nivelTecnico || "") + ", seguridad al responder: " + (estilo.estilo?.seguridad || "") + "\n" +
          ((estilo.manualEscritura && estilo.manualEscritura.length)
            ? "- Manual de escritura de este candidato (sigue esto al pie de la letra, es la guia mas importante de como debe sonar):\n" +
              estilo.manualEscritura.map((m: string) => "  * " + m).join("\n") + "\n"
            : "") +
          '- Filosofia: no intentes hacer que el candidato suene "mejor" -- intenta hacer que suene como el mismo, expresando sus ideas con claridad.\n\n'
        : "";

    const bloqueEntrenamiento = styleProfile
      ? "Configuracion de tono y extension elegida por el candidato en 'Entrenar IA' (usala como base en las respuestas de texto libre; ajustala levemente solo si el aviso lo amerita):\n" +
        "- Tono: " + (DESCRIPCION_TONO[styleProfile.tono || ""] || DESCRIPCION_TONO.profesional_cercano) + "\n" +
        "- Extension de la respuesta: " + (DESCRIPCION_LONGITUD[styleProfile.longitudRespuesta] || DESCRIPCION_LONGITUD.media) + "\n" +
        (styleProfile.instrucciones ? "- Instrucciones adicionales del candidato: " + styleProfile.instrucciones + "\n" : "") +
        "\n"
      : "";

    const bloqueCalibracion = calibracion.length
      ? "Respuestas de calibracion de estilo (el candidato eligio estas opciones entre varias -- son pistas reales de su personalidad, no las repitas literalmente, usalas para inferir como es):\n" +
        calibracion.map((c) => "- " + c.pregunta + " => Eligio: " + c.opcionElegida).join("\n") +
        "\n\n"
      : "";

    const preguntasParaPrompt = listaPreguntas.map((q) => ({
      id: q.id,
      pregunta: q.pregunta,
      opciones: q.opciones && q.opciones.length ? q.opciones : null,
    }));

    const instruccion =
      "Vas a hacer DOS cosas a la vez para " + (p.nombre || "el candidato") + ", que esta postulando a un empleo, y responder TODO en un unico JSON valido (sin markdown, sin texto fuera del JSON):\n\n" +
      "TAREA 1 -- Analizar el aviso. Completa el campo \"analisis\" con:\n" +
      '{"cargo":"","empresa":"","prioridades":"","fortalezas":"","tono":"","matchScore":0}\n' +
      "- cargo: nombre exacto del puesto, tal como aparece en el aviso\n" +
      "- empresa: nombre de la empresa (string vacio si no aparece)\n" +
      "- prioridades: en una frase corta, que es lo mas importante que busca la empresa segun el aviso\n" +
      "- fortalezas: en una frase corta, que fortalezas REALES del candidato (solo las de su CV/perfil/datos adicionales) conectan mejor con este aviso\n" +
      '- tono: como debe sonar el candidato al responder este formulario (ej: "cercano y directo", "formal y profesional"), segun el registro del aviso\n' +
      "- matchScore: entero 0-100, que tan bien calza el candidato con ESTE aviso. Se estricto: si falta informacion, usa un puntaje moderado (40-60) en vez de uno alto\n\n" +
      "TAREA 2 -- Responder cada pregunta del formulario de postulacion. Completa el campo \"respuestas\" como un array con UN objeto por cada pregunta de la lista de abajo, en el mismo orden, cada uno con exactamente esta forma: {\"id\":\"\",\"respuesta\":\"\" o null}\n" +
      "REGLAS para las respuestas:\n" +
      "1. Usa solo informacion real del CV, perfil o datos adicionales entregados abajo. Nunca inventes datos concretos (anios, empresas, certificaciones) que no esten ahi.\n" +
      "2. Si la pregunta trae \"opciones\" (no null): responde con el texto EXACTO de una de esas opciones (copiado tal cual), o null si ninguna aplica realmente.\n" +
      "3. Si la pregunta NO trae opciones (texto libre): responde en primera persona, con una extension de " + (DESCRIPCION_LONGITUD[styleProfile?.longitudRespuesta || "media"] || DESCRIPCION_LONGITUD.media) + ", honesta, util y personalizada al aviso especifico (rubro, productos, tareas mencionadas -- debe notarse que leiste este aviso en particular). Si no tienes el dato exacto, no dejes el campo en null: responde con honestidad reconociendo que no tienes esa experiencia especifica pero conectandola con la experiencia real mas cercana que si tengas. Usa null SOLO si la pregunta es completamente irrelevante para un postulante a empleo.\n" +
      "3b. Si la pregunta es una autoidentificacion voluntaria de tipo si/no (ej: discapacidad, genero, pertenencia a pueblo originario) y el candidato no menciona nada relacionado en su CV/perfil/datos adicionales, responde con el valor neutro esperado (\"No\", o el que corresponda segun la pregunta) -- NUNCA uses null en estos casos solo porque no tienes el dato explicito, esa pregunta siempre espera una respuesta.\n" +
      '4. Si la pregunta de texto libre pide VARIOS datos a la vez (ej: "indique su comuna y telefono"), responde TODOS los datos pedidos, no solo el primero.\n' +
      "5. Responde en TEXTO PLANO. NUNCA uses markdown (nada de #, ##, **, guiones ni listas). NUNCA repitas ni cites la pregunta antes de responder. NUNCA agregues introducciones tipo \"Respuesta:\" ni comillas envolviendo el texto.\n" +
      '6. SE CONCISO Y EVITA REDUNDANCIA: no repitas la misma idea con otras palabras. Usa el tono que tu mismo determinaste en el "analisis" en vez de sonar siempre igual de formal en todas las respuestas.\n\n' +
      bloqueEstilo +
      bloqueEntrenamiento +
      bloqueCalibracion +
      "Perfil: " + (p.bio || "Sin informacion de perfil aun") + "\n" +
      "Nombre: " + (p.nombre || "") + "\n" +
      "Email: " + (p.email || "") + "\n" +
      "Telefono: " + (p.tel || "") + "\n" +
      "Comuna de residencia: " + (p.comuna || "") + "\n" +
      "Cargo buscado: " + (p.cargo || "") + "\n" +
      "Renta esperada: " + (p.renta || "") + "\n" +
      "Disponibilidad: " + (p.disp || "") + "\n" +
      "Datos adicionales del candidato:\n" + (infoTexto || "Ninguno") + "\n\n" +
      "AVISO DE TRABAJO (leelo completo y usa sus detalles especificos):\n" + String(contexto).slice(0, 3000) + "\n\n" +
      "Preguntas del formulario a responder (array JSON, respeta el mismo \"id\" en tu respuesta):\n" +
      JSON.stringify(preguntasParaPrompt) + "\n\n" +
      "Responde SOLO con este JSON, sin texto adicional ni markdown:\n" +
      '{"analisis":{"cargo":"","empresa":"","prioridades":"","fortalezas":"","tono":"","matchScore":0},"respuestas":[{"id":"","respuesta":""}]}';

    const messages = await construirMensajesCV(user.id, instruccion);

    const maxTokens = Math.min(2200, 350 + listaPreguntas.length * 150);

    const respuestaIA = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages,
    });

    let texto = respuestaIA.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    texto = texto.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(texto);

    const analisis = parsed.analisis || {};
    if (typeof analisis.matchScore === "number") {
      analisis.matchScore = Math.max(0, Math.min(100, Math.round(analisis.matchScore)));
    } else {
      analisis.matchScore = null;
    }

    const respuestasCrudas = Array.isArray(parsed.respuestas) ? parsed.respuestas : [];
    const respuestas = respuestasCrudas.map((r: any) => {
      let respuesta = typeof r?.respuesta === "string" ? limpiarRespuestaIA(r.respuesta) : null;
      if (!respuesta || respuesta.includes("SINRESPUESTA") || respuesta.toLowerCase().includes("sin respuesta")) {
        respuesta = null;
      }
      return { id: r?.id, respuesta };
    });

    return NextResponse.json({ analisis, respuestas });
  } catch (err) {
    console.error("Error en /api/ai/procesar-postulacion:", err);
    return NextResponse.json(
      { error: "Error al procesar la postulación — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
