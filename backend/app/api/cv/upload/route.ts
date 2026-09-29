import { NextResponse } from "next/server";
import "@/lib/pdf-polyfills";
import { PDFParse } from "pdf-parse";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { premiarPerfilCompleto } from "@/lib/extras";
import { claveLimite, LIMITES, permitirIntento } from "@/lib/limite-tasa";

// docs/revision-2026-09-28.md §19: un CV es un PDF de unas pocas páginas. En
// Vercel el cuerpo ya no puede pasar de 4,5 MB; el tope hace que el mensaje
// sea claro en vez de un error genérico, y protege también fuera de Vercel.
const TAMANO_MAXIMO_CV = 4 * 1024 * 1024;

export async function POST(request: Request) {
  let parser: PDFParse | null = null;

  try {
    const { userId, error } = await getUsuarioSesion();
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 });
    }

    if (!(await permitirIntento(claveLimite("cv-usuario", userId), LIMITES.subidaCvPorUsuario))) {
      return NextResponse.json(
        { error: "Subiste muchos CV en la última hora. Espera un rato y vuelve a intentarlo." },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("cv");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (file.size > TAMANO_MAXIMO_CV) {
      return NextResponse.json({ error: "El PDF pesa más de 4 MB. Exporta una versión más liviana (sin fotos pesadas)." }, { status: 400 });
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

    // docs/creditos-y-pagina-nueva.md §3: el premio por dejar el perfil listo se
    // revisa en los tres puntos donde puede quedar completo (CV, objetivo,
    // portal). Es idempotente: se paga una sola vez, sin importar cuál fue el
    // último paso. Best-effort -- si falla, no arruina la acción principal.
    await premiarPerfilCompleto(userId).catch((err) => console.error("[extras] premio de perfil:", err));

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
