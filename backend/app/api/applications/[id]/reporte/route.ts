import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { RESPUESTAS_PERSONA } from "@/lib/estado-real";

/**
 * "¿Supiste algo?" (docs/estado-real-de-postulaciones.md §6): la persona cuenta
 * qué pasó con una postulación. Es la única forma de saber de una llamada o
 * una entrevista: ningún portal las ve.
 *
 * Lo que cuenta la persona siempre aplica, en cualquier dirección (§6.5: se
 * puede corregir), y queda marcado como suyo para que un escaneo del portal
 * no lo pise después.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { id } = await params;
  const { respuesta } = await request.json().catch(() => ({}));
  if (typeof respuesta !== "string" || !(respuesta in RESPUESTAS_PERSONA)) {
    return NextResponse.json({ error: "Respuesta desconocida" }, { status: 400 });
  }

  const application = await prisma.application.findFirst({ where: { id, userId } });
  if (!application) {
    return NextResponse.json({ error: "Postulación no encontrada" }, { status: 404 });
  }
  // Una postulación que no se envió nunca llegó a la empresa: no hay nada que contar.
  if (application.estadoActual === "INCOMPLETA") {
    return NextResponse.json({ error: "Esta postulación no llegó a la empresa" }, { status: 400 });
  }

  const ahora = new Date();
  const nuevo = RESPUESTAS_PERSONA[respuesta];

  // "Nada todavía": no cambia el estado, solo cuenta que se preguntó (§6.1:
  // a los 3 "nada" se deja de preguntar por esta postulación).
  if (!nuevo) {
    await prisma.application.update({
      where: { id },
      data: { ultimaConsulta: ahora, vecesConsultada: { increment: 1 } },
    });
    return NextResponse.json({ ok: true, estado: application.estadoActual });
  }

  const cambia = application.estadoActual !== nuevo || application.origenEstado !== "USUARIO";
  await prisma.$transaction([
    prisma.application.update({
      where: { id },
      data: { estadoActual: nuevo as any, origenEstado: "USUARIO", ultimaConsulta: ahora, notaAtencion: null },
    }),
    ...(cambia
      ? [prisma.applicationStatusHistory.create({ data: { applicationId: id, estado: nuevo as any, origen: "USUARIO" } })]
      : []),
  ]);

  return NextResponse.json({ ok: true, estado: nuevo });
}
