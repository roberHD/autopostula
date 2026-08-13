import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PDFParse } from "pdf-parse";

export async function POST(request: Request) {
  let parser: any = null;

  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;

    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "El archivo debe ser un PDF" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Instancia de pdf-parse v2
    parser = new PDFParse({ data: buffer });
    const resultado = await parser.getText();
    const textoExtraido = typeof resultado === "string" ? resultado : resultado?.text || "";

    // CvProfile es 1:1 con el usuario
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
    if (parser && typeof parser.destroy === "function") {
      await parser.destroy();
    }
  }
}