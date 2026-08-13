import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ disponible: false });
  }

  const cv = await prisma.cvProfile.findUnique({ where: { userId } });
  if (!cv?.textoExtraido) {
    return NextResponse.json({ error: "Primero sube tu CV" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content:
            'Extrae del siguiente CV los datos pedidos. Responde SOLO con un JSON válido, sin texto extra, con exactamente estas claves (usa "" si no encuentras el dato): ' +
            '{"nombre":"","email":"","telefono":"","comuna":"","cargoObjetivo":"","expectativaRenta":"","disponibilidad":"","resumenProfesional":""}\n\n' +
            "resumenProfesional: máximo 3 líneas, en primera persona.\n\nCV:\n" + cv.textoExtraido.slice(0, 12000),
        }],
      }),
    });

    if (!res.ok) {
      console.error("Error de Anthropic API:", res.status, await res.text());
      return NextResponse.json({ error: "No se pudo analizar el CV con IA" }, { status: 502 });
    }

    const data = await res.json();
    const textoRespuesta = data?.content?.[0]?.text || "";
    const limpio = textoRespuesta.replace(/```json|```/g, "").trim();

    let extraido;
    try {
      extraido = JSON.parse(limpio);
    } catch {
      console.error("La IA no devolvió JSON válido:", textoRespuesta);
      return NextResponse.json({ error: "Respuesta de IA no interpretable" }, { status: 502 });
    }

    return NextResponse.json({ disponible: true, datos: extraido });
  } catch (err) {
    console.error("Error inesperado analizando el CV:", err);
    return NextResponse.json({ error: "Error interno al analizar el CV" }, { status: 500 });
  }
}