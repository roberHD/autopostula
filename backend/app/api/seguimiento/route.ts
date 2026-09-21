import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { decidirCambioEstado } from "@/lib/estado-postulacion";
import { limpiarTitulo } from "@/lib/text";

// docs/estado-real-de-postulaciones.md §6. La persona es la fuente de verdad:
// esto es lo único que captura lo que ningún portal ve — la entrevista que se
// coordinó por correo, la llamada del reclutador, el WhatsApp.

// §6.1 — cuándo se puede preguntar.
const DIAS_MINIMOS = 5;          // nada antes de los 5 días de enviada
const DIAS_ENTRE_CONSULTAS = 7;  // nunca dos veces por lo mismo en menos de 7
const MAX_CONSULTAS = 3;         // se deja de insistir tras 3 intentos

// Estados en los que ya no tiene sentido preguntar: la postulación terminó.
const TERMINALES = ["FINALIZADO", "RECHAZADO"] as const;

// Lo que la persona puede responder (§6.2) y a qué estado corresponde.
// "NADA" no es un estado: es "todavía no pasó nada", y solo cuenta el intento
// para no volver a preguntar mañana.
const RESPUESTAS = {
  NADA: null,
  ESCRIBIERON: "EN_PROCESO",
  ENTREVISTA: "ENTREVISTA",
  RECHAZADO: "RECHAZADO",
} as const;

export type Respuesta = keyof typeof RESPUESTAS;

function haceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}

/** Las postulaciones sobre las que toca preguntar ahora. */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const pendientes = await prisma.application.findMany({
    where: {
      userId,
      estadoActual: { notIn: [...TERMINALES, "INCOMPLETA"] },
      enviadaEn: { lte: haceDias(DIAS_MINIMOS) },
      vecesConsultada: { lt: MAX_CONSULTAS },
      OR: [
        { ultimaConsulta: null },
        { ultimaConsulta: { lte: haceDias(DIAS_ENTRE_CONSULTAS) } },
      ],
    },
    orderBy: { enviadaEn: "asc" },
    select: {
      id: true,
      estadoActual: true,
      enviadaEn: true,
      jobOffer: { select: { titulo: true, empresa: true, url: true } },
      platformAccount: { select: { platform: { select: { nombre: true } } } },
    },
  });

  return NextResponse.json({
    pendientes: pendientes.map((a) => ({
      id: a.id,
      titulo: limpiarTitulo(a.jobOffer.titulo),
      empresa: a.jobOffer.empresa,
      url: a.jobOffer.url,
      portal: a.platformAccount.platform.nombre,
      estado: a.estadoActual,
      enviadaEn: a.enviadaEn,
    })),
  });
}

/** Guarda lo que respondió la persona. */
export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  try {
    const { applicationId, respuesta } = await request.json();

    if (!applicationId || !(respuesta in RESPUESTAS)) {
      return NextResponse.json(
        { error: `Respuesta inválida. Debe ser una de: ${Object.keys(RESPUESTAS).join(", ")}` },
        { status: 400 }
      );
    }

    // El where lleva el userId: sin eso, cualquiera con el id de una
    // postulación ajena podría cambiarle el estado.
    const application = await prisma.application.findFirst({
      where: { id: applicationId, userId },
    });
    if (!application) {
      return NextResponse.json({ error: "No encontramos esa postulación" }, { status: 404 });
    }

    const nuevoEstado = RESPUESTAS[respuesta as Respuesta];

    // El intento se registra siempre, incluso con "nada todavía": es lo que
    // evita volver a preguntar mañana por lo mismo (§6.1).
    const consulta = {
      ultimaConsulta: new Date(),
      vecesConsultada: { increment: 1 },
    };

    if (!nuevoEstado) {
      await prisma.application.update({ where: { id: application.id }, data: consulta });
      return NextResponse.json({ ok: true, cambioEstado: false });
    }

    const decision = decidirCambioEstado({
      actual: application.estadoActual,
      origenActual: application.origenEstado,
      nuevo: nuevoEstado,
      origen: "USUARIO",
    });

    if (!decision.aplica) {
      // Pasa cuando responde lo mismo que ya estaba. Igual cuenta el intento.
      await prisma.application.update({ where: { id: application.id }, data: consulta });
      return NextResponse.json({ ok: true, cambioEstado: false, motivo: decision.motivo });
    }

    await prisma.application.update({
      where: { id: application.id },
      data: { ...consulta, estadoActual: nuevoEstado, origenEstado: "USUARIO" },
    });

    await prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, estado: nuevoEstado },
    });

    return NextResponse.json({ ok: true, cambioEstado: true, estado: nuevoEstado });
  } catch (err) {
    console.error("Error en /api/seguimiento:", err);
    return NextResponse.json({ error: "No pudimos guardar tu respuesta" }, { status: 500 });
  }
}
