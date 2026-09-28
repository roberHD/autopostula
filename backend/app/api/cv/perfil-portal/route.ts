import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { checkAndLogAiUsage } from "@/lib/ai-usage";

/**
 * El texto para el perfil de Computrabajo (docs/estrategia-y-rediseno.md
 * §4.2, punto 3). Computrabajo ordena a quienes postulan comparando el CV que
 * tienen EN el portal con cada aviso; este endpoint arma, con el CV guardado,
 * el título y el resumen para copiar allá. Se pide a mano (un botón), nunca al
 * cargar la página: cada llamada gasta del cupo de IA del plan.
 *
 * Misma regla que el resto de la IA del producto: solo hechos que están en el
 * CV. Nada de experiencia, cifras ni certificaciones inventadas.
 */

// El formato de la respuesta, validado por la API (structured outputs): el
// modelo no puede devolver texto suelto ni claves de más.
const FORMATO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      titulo: { type: "string" },
      resumen: { type: "string" },
      experiencias: {
        type: "array",
        items: {
          type: "object",
          properties: {
            cargo: { type: "string" },
            empresa: { type: "string" },
            texto: { type: "string" },
          },
          required: ["cargo", "empresa", "texto"],
          additionalProperties: false,
        },
      },
    },
    required: ["titulo", "resumen", "experiencias"],
    additionalProperties: false,
  },
};

type PerfilPortal = {
  titulo: string;
  resumen: string;
  experiencias: { cargo: string; empresa: string; texto: string }[];
};

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ disponible: false });
  }

  const [cv, objetivos] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId }, select: { textoExtraido: true } }),
    prisma.objetivoLaboral.findMany({ where: { userId }, orderBy: { orden: "asc" }, select: { etiqueta: true } }),
  ]);
  if (!cv?.textoExtraido?.trim()) {
    return NextResponse.json({ error: "Primero sube tu CV" }, { status: 400 });
  }

  const uso = await checkAndLogAiUsage(userId, "perfil_portal");
  if (!uso.permitido) {
    return NextResponse.json(
      { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
      { status: 403 },
    );
  }

  const client = new Anthropic();

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      // Si la IA declina la solicitud, la API la reintenta sola con el modelo
      // de respaldo que recomienda Anthropic, en la misma llamada.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: FORMATO },
      system:
        "Escribes el perfil de una persona que busca trabajo en Chile, para pegarlo en su cuenta de Computrabajo. " +
        "Computrabajo compara ese perfil con cada aviso para ordenar a quienes postulan, así que conviene usar las " +
        "palabras con que se nombran los cargos y las tareas en los avisos chilenos.\n\n" +
        "Reglas:\n" +
        "- Usa solo hechos que estén en el CV. Si algo no aparece (años de experiencia, cifras, licencias, " +
        "certificaciones, herramientas), no lo agregues ni lo supongas.\n" +
        "- Español de Chile, claro y sin adornos: nada de 'proactivo', 'apasionado' ni frases que podría decir cualquiera.\n" +
        "- titulo: una línea de máximo 90 caracteres, con el cargo que busca y 2 o 3 cosas concretas que sabe hacer, " +
        "separadas por ' · '.\n" +
        "- resumen: 2 a 4 oraciones en primera persona, con lo más fuerte primero.\n" +
        "- experiencias: una por cada cargo del CV (máximo 4, los más recientes), con 1 o 2 oraciones en primera " +
        "persona sobre lo que hacía. Si el CV no describe las tareas de un cargo, di solo el cargo y la empresa, sin inventar tareas.",
      messages: [
        {
          role: "user",
          content:
            (objetivos.length ? `Lo que busca: ${objetivos.map((o) => o.etiqueta).join(", ")}.\n\n` : "") +
            "CV:\n" +
            cv.textoExtraido.slice(0, 12000),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "No pudimos armar el texto esta vez. Intenta de nuevo más tarde." }, { status: 502 });
    }

    const bloque = response.content.find((b) => b.type === "text");
    if (!bloque || bloque.type !== "text") {
      return NextResponse.json({ error: "La IA no devolvió el texto" }, { status: 502 });
    }

    const perfil = JSON.parse(bloque.text) as PerfilPortal;
    return NextResponse.json({ disponible: true, perfil });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Hay mucha demanda en este momento. Intenta en un minuto." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Error de Anthropic API armando el perfil del portal (${err.status}):`, err.message);
      return NextResponse.json({ error: "No se pudo armar el texto con IA" }, { status: 502 });
    }
    console.error("Error inesperado armando el perfil del portal:", err);
    return NextResponse.json({ error: "Error interno al armar el texto" }, { status: 500 });
  }
}
