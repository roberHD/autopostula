import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  let parser: PDFParse | null = null;

  try {
    const { userId, error } = await getUsuarioSesion();
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    // No confiar solo en file.type -- el MIME que reporta el navegador para un
    // PDF real puede venir vacío o distinto según el sistema operativo/cómo se
    // generó el archivo. Si el nombre termina en .pdf, se acepta igual.
    const pareceUnPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!pareceUnPdf) {
      return NextResponse.json({ error: "El archivo debe ser un PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({ data: buffer });
    const resultado = await parser.getText();
    const textoExtraido = resultado.text;

    // CvProfile es 1:1 con el usuario — upsert reemplaza el CV anterior si ya existía
    const cvProfile = await prisma.cvProfile.upsert({
      where: { userId },
      update: {
        nombreArchivo: file.name,
        textoExtraido,
      },
      create: {
        userId,
        nombreArchivo: file.name,
        textoExtraido,
      },
    });

    return NextResponse.json({
      id: cvProfile.id,
      nombreArchivo: cvProfile.nombreArchivo,
      largoTexto: textoExtraido.length,
    });
  } catch (err) {
    console.error("Error en /api/cv/upload:", err);
    return NextResponse.json(
      { error: "Error al procesar el CV — revisa la terminal del servidor" },
      { status: 500 }
    );
  } finally {
    if (parser) await parser.destroy();
  }
}
