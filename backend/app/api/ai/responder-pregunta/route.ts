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

// Misma limpieza que tenía content.js — no se toca la lógica, solo se mueve de lugar.
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

    const { pregunta, contexto, opciones, analisis, perfil, info, estilo } = await request.json();
    if (!pregunta) {
      return NextResponse.json({ error: "Falta pregunta" }, { status: 400 });
    }

    const uso = await checkAndLogAiUsage(user.id, "responder_pregunta");
    if (!uso.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
        { status: 403 }
      );
    }

    const p = perfil || {};
    const infoTexto = (info || []).map((t: string) => "- " + t).join("\n");

    const bloqueOpciones =
      opciones && opciones.length
        ? "\nOpciones disponibles (debes responder EXACTAMENTE con el texto de una de estas, sin agregar nada mas):\n" +
          opciones.map((o: string) => '- "' + o + '"').join("\n") +
          "\n"
        : "";

    const bloqueAnalisis = analisis
      ? "Analisis previo de esta oferta (ya hecho, usalo, no lo repitas en la respuesta):\n" +
        "- Cargo: " + (analisis.cargo || "") + "\n" +
        "- Empresa: " + (analisis.empresa || "") + "\n" +
        "- Que prioriza la empresa: " + (analisis.prioridades || "") + "\n" +
        "- Tus fortalezas mas relevantes para ESTA oferta: " + (analisis.fortalezas || "") + "\n" +
        "- Tono a usar en las respuestas: " + (analisis.tono || "") + "\n\n"
      : "";

    const bloqueEstilo =
      estilo && estilo.confirmado
        ? "Perfil de estilo del candidato (de como el mismo se comunica -- esta es su voz autentica, uselo como base para TODAS las respuestas, ajustandolo levemente si el tono sugerido arriba para esta oferta lo amerita):\n" +
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

    const instruccion =
      "Eres un asistente que ayuda a " + (p.nombre || "el candidato") + " a postular empleos.\n" +
      "REGLAS:\n" +
      "1. Usa solo informacion real del CV, perfil o datos adicionales entregados abajo. Nunca inventes datos concretos (anios, empresas, certificaciones) que no esten ahi.\n" +
      "3. Para preguntas sobre experiencia, motivacion o habilidades, usa el CV y perfil para dar una respuesta real y especifica.\n" +
      "5. MUY IMPORTANTE: personaliza la respuesta segun el AVISO DE TRABAJO especifico de abajo (rubro, productos, marca, tareas mencionadas). Si el aviso es de venta de zapatillas, tu respuesta debe conectar con calzado/retail de zapatillas; si es de una cafeteria, con cafe y atencion en cafeterias; etc. No des una respuesta generica que serviria igual para cualquier aviso -- debe notarse que leiste este aviso en particular.\n" +
      "6. Responde en TEXTO PLANO, como si lo escribieras directo en un formulario web. NUNCA uses formato markdown (nada de #, ##, **, -, listas ni titulos). NUNCA repitas ni cites la pregunta antes de responder. NUNCA agregues introducciones tipo \"Respuesta:\" o comillas envolviendo el texto -- ve directo a la respuesta, en oraciones normales.\n" +
      '7. Si la pregunta pide VARIOS datos a la vez (ej: "indique su comuna y telefono", "nombre y correo"), responde TODOS los datos pedidos, no solo el primero.\n' +
      '8. SE CONCISO Y EVITA REDUNDANCIA: no digas la misma idea dos veces con distintas palabras. Si una oracion ya cubrio el punto, no agregues otra oracion que repita lo mismo de forma mas "elegante" o formal. Prefiere una respuesta corta y directa antes que una larga que da vueltas. Usa el tono indicado en el analisis previo (si lo hay) en vez de sonar siempre igual de formal o acartonado en todas las respuestas.\n' +
      (bloqueOpciones
        ? "2. Si la pregunta es sobre algo que NO esta en tu informacion y no puedes inferirlo razonablemente, responde: SINRESPUESTA\n" +
          "4. Debes elegir una de las opciones dadas textualmente, o SINRESPUESTA si ninguna aplica.\n"
        : "2. Si no tienes el dato exacto que pide la pregunta, NUNCA respondas SINRESPUESTA ni dejes el campo vacio: responde con honestidad, reconociendo que no tienes esa experiencia especifica, pero conectandolo con la experiencia real mas cercana que si tengas (ej: \"No cuento con experiencia directa en ese rubro, pero tengo experiencia en atencion al cliente y ventas retail que me permite adaptarme rapido\"). Solo usa SINRESPUESTA si la pregunta es completamente irrelevante para un postulante a empleo.\n") +
      "\n" +
      bloqueAnalisis +
      bloqueEstilo +
      "Perfil: " + (p.bio || "Sin informacion de perfil aun") + "\n" +
      "Nombre: " + (p.nombre || "") + "\n" +
      "Email: " + (p.email || "") + "\n" +
      "Telefono: " + (p.tel || "") + "\n" +
      "Comuna de residencia: " + (p.comuna || "") + "\n" +
      "Cargo buscado: " + (p.cargo || "") + "\n" +
      "Renta esperada: " + (p.renta || "") + "\n" +
      "Disponibilidad: " + (p.disp || "") + "\n" +
      "Datos adicionales del candidato:\n" + (infoTexto || "Ninguno") + "\n" +
      "AVISO DE TRABAJO (leelo completo y usa sus detalles especificos):\n" + (contexto || "").slice(0, 2500) + "\n" +
      bloqueOpciones +
      '\nPregunta del formulario: "' + pregunta + '"\n' +
      (opciones && opciones.length
        ? "Responde solo con el texto exacto de la opcion elegida, o SINRESPUESTA."
        : "Responde en primera persona, max 2 oraciones, siempre con una respuesta honesta, util, breve y personalizada al aviso de arriba (nunca la dejes en blanco ni la hagas generica ni redundante).");

    const messages = await construirMensajesCV(user.id, instruccion);

    const respuestaIA = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages,
    });

    let respuesta = respuestaIA.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    respuesta = limpiarRespuestaIA(respuesta) || "";

    if (!respuesta || respuesta.includes("SINRESPUESTA") || respuesta.toLowerCase().includes("sin respuesta")) {
      return NextResponse.json({ respuesta: null });
    }

    return NextResponse.json({ respuesta });
  } catch (err) {
    console.error("Error en /api/ai/responder-pregunta:", err);
    return NextResponse.json(
      { error: "Error al responder la pregunta — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
