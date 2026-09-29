import { prisma } from "@/lib/prisma";

// docs/revision-2026-09-28.md §19: un CV normal son 3.000-8.000 caracteres. El
// tope evita que un PDF enorme (un libro, un portafolio escaneado a texto) se
// mande entero en cada llamada de IA de esa persona.
const MAXIMO_CV = 15_000;

// Arma el array de mensajes para la API. A diferencia de la versión que vivía en la
// extensión, ya no hace falta el respaldo en PDF/base64: el CV siempre se guarda como
// texto extraído en CvProfile al subirlo (ver /api/cv/upload).
//
// incluirCv = false cuando la persona apagó "Usar mi perfil" en Entrenar IA
// (lib/contexto-ia.ts, aplicarUsarPerfil).
export async function construirMensajesCV(userId: string, instruccion: string, incluirCv = true) {
  const cv = incluirCv ? await prisma.cvProfile.findUnique({ where: { userId }, select: { textoExtraido: true } }) : null;

  if (cv?.textoExtraido) {
    return [
      {
        role: "user" as const,
        content:
          "CV del candidato (texto extraido previamente):\n" +
          cv.textoExtraido.slice(0, MAXIMO_CV) +
          "\n\n" +
          instruccion,
      },
    ];
  }

  return [{ role: "user" as const, content: instruccion }];
}
