import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { chequearCv, type Experiencia } from "@/lib/chequeo-cv";

/**
 * El chequeo del CV que está guardado (docs/estrategia-y-rediseno.md §4.2).
 * Se calcula al pedirlo: son reglas sobre el texto, no cuesta nada rehacerlas,
 * y así siempre responde al CV y a los datos que hay ahora.
 */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const cv = await prisma.cvProfile.findUnique({
    where: { userId },
    select: {
      nombreArchivo: true,
      subidoEn: true,
      textoExtraido: true,
      email: true,
      telefono: true,
      comuna: true,
      experiencia: true,
    },
  });

  if (!cv || !cv.nombreArchivo) {
    return NextResponse.json({ tieneCv: false });
  }

  const resultado = chequearCv({
    texto: cv.textoExtraido,
    email: cv.email,
    telefono: cv.telefono,
    comuna: cv.comuna,
    experiencia: Array.isArray(cv.experiencia) ? (cv.experiencia as Experiencia[]) : null,
  });

  return NextResponse.json({
    tieneCv: true,
    nombreArchivo: cv.nombreArchivo,
    subidoEn: cv.subidoEn,
    ...resultado,
  });
}
