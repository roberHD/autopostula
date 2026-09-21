import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { remitente } from "@/lib/correo";

// Igual que en forgot-password: se instancia adentro del handler. Si se crea a
// nivel de módulo y falta RESEND_API_KEY, revienta apenas Next carga el módulo
// para juntar la config de la ruta y se cae el build entero.
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// El cuerpo de una función serverless en Vercel no puede pasar de 4.5 MB, y
// eso incluye el multipart completo (archivos + campos + separadores). Los
// topes de acá quedan debajo a propósito: si se suben, el request muere en el
// borde con un 413 que este código nunca llega a ver y la persona se queda
// sin saber qué pasó.
export const LIMITES = {
  archivos: 3,
  bytesPorArchivo: 3 * 1024 * 1024,
  bytesTotal: 4 * 1024 * 1024,
  mensajeMax: 4000,
  mensajeMin: 10,
};

const TIPOS_OK: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
};

const EXTENSIONES_OK = Object.values(TIPOS_OK).flat();

const ASUNTOS: Record<string, string> = {
  error: "Reporte de error",
  sugerencia: "Sugerencia",
  cuenta: "Problema con la cuenta",
  otro: "Consulta",
};

function escapar(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  try {
    const { userId, error } = await getUsuarioSesion();
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const formData = await request.formData();
    const tipo = String(formData.get("tipo") || "otro");
    const mensaje = String(formData.get("mensaje") || "").trim();
    const donde = String(formData.get("donde") || "").trim();

    if (mensaje.length < LIMITES.mensajeMin) {
      return NextResponse.json(
        { error: `Cuéntanos un poco más — al menos ${LIMITES.mensajeMin} caracteres.` },
        { status: 400 }
      );
    }
    if (mensaje.length > LIMITES.mensajeMax) {
      return NextResponse.json(
        { error: `El mensaje no puede pasar de ${LIMITES.mensajeMax} caracteres.` },
        { status: 400 }
      );
    }

    const archivos = formData.getAll("adjuntos").filter((a): a is File => a instanceof File && a.size > 0);

    if (archivos.length > LIMITES.archivos) {
      return NextResponse.json(
        { error: `Puedes adjuntar hasta ${LIMITES.archivos} archivos.` },
        { status: 400 }
      );
    }

    let total = 0;
    const adjuntos: { filename: string; content: Buffer }[] = [];

    for (const archivo of archivos) {
      // No se confía solo en file.type: el MIME que reporta el navegador viene
      // vacío o raro según el sistema operativo. Se acepta si el MIME o la
      // extensión calzan.
      const nombre = archivo.name.toLowerCase();
      const extensionOk = EXTENSIONES_OK.some((ext) => nombre.endsWith(ext));
      if (!TIPOS_OK[archivo.type] && !extensionOk) {
        return NextResponse.json(
          { error: `"${archivo.name}" no es una imagen ni un PDF.` },
          { status: 400 }
        );
      }
      if (archivo.size > LIMITES.bytesPorArchivo) {
        return NextResponse.json(
          { error: `"${archivo.name}" pesa más de 3 MB.` },
          { status: 400 }
        );
      }
      total += archivo.size;
      if (total > LIMITES.bytesTotal) {
        return NextResponse.json(
          { error: "Los adjuntos juntos no pueden pasar de 4 MB." },
          { status: 400 }
        );
      }
      adjuntos.push({
        filename: archivo.name,
        content: Buffer.from(await archivo.arrayBuffer()),
      });
    }

    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, nombre: true },
    });

    // Sin fallback a RESEND_FROM_EMAIL: ese remitente no tiene buzón (no hay MX
    // en el dominio raíz), así que caer ahí sería perder los reportes en silencio.
    const destino = process.env.SOPORTE_EMAIL;
    if (!destino) {
      console.error("Falta SOPORTE_EMAIL — no hay a dónde mandar el reporte");
      return NextResponse.json(
        { error: "El canal de soporte no está configurado. Escríbenos por correo mientras lo arreglamos." },
        { status: 500 }
      );
    }

    const asunto = ASUNTOS[tipo] || ASUNTOS.otro;

    try {
      await getResend().emails.send({
        from: remitente(),
        to: destino,
        // Contestar el correo le responde directo a la persona, sin tener que
        // copiar la dirección a mano.
        replyTo: usuario?.email ? [usuario.email] : undefined,
        subject: `[Soporte] ${asunto} — ${usuario?.email ?? userId}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px;">
            <h2 style="color: #111827; margin-bottom: 4px;">${escapar(asunto)}</h2>
            <p style="color: #6B7280; font-size: 13px; margin-top: 0;">
              ${escapar(usuario?.nombre || "Sin nombre")} &middot; ${escapar(usuario?.email || "sin correo")}<br>
              <span style="color:#9CA3AF;">id ${escapar(userId)}</span>
              ${donde ? `<br><span style="color:#9CA3AF;">Desde: ${escapar(donde)}</span>` : ""}
            </p>
            <div style="background:#F9FAFB; border-left:3px solid #16181A; padding:12px 16px; margin:16px 0; white-space:pre-wrap; color:#111827; line-height:1.6; font-size:14px;">${escapar(mensaje)}</div>
            <p style="color:#9CA3AF; font-size:12px;">
              ${adjuntos.length ? `${adjuntos.length} archivo(s) adjunto(s).` : "Sin adjuntos."}
            </p>
          </div>
        `,
        attachments: adjuntos.length ? adjuntos : undefined,
      });
    } catch (errEmail) {
      console.error("Error enviando reporte de soporte con Resend:", errEmail);
      return NextResponse.json(
        { error: "No pudimos enviar tu mensaje — inténtalo de nuevo en unos minutos." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Error en /api/soporte:", err);
    return NextResponse.json({ error: "Error interno al enviar tu mensaje" }, { status: 500 });
  }
}
