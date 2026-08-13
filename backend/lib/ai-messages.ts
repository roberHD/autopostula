import { prisma } from "@/lib/prisma";

// Arma el array de mensajes para la API. A diferencia de la versión que vivía en la
// extensión, ya no hace falta el respaldo en PDF/base64: el CV siempre se guarda como
// texto extraído en CvProfile al subirlo (ver /api/cv/upload).
export async function construirMensajesCV(userId: string, instruccion: string) {
  const cv = await prisma.cvProfile.findUnique({ where: { userId } });

  if (cv?.textoExtraido) {
    return [
      {
        role: "user" as const,
        content:
          "CV del candidato (texto extraido previamente):\n" +
          cv.textoExtraido +
          "\n\n" +
          instruccion,
      },
    ];
  }

  return [{ role: "user" as const, content: instruccion }];
}
