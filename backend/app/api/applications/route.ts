import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const applications = await prisma.application.findMany({
    where: { userId },
    include: {
      jobOffer: { include: { platform: true } },
    },
    orderBy: { enviadaEn: "desc" },
  });

  return NextResponse.json({
    applications: applications.map((a) => ({
      id: a.id,
      titulo: a.jobOffer.titulo,
      empresa: a.jobOffer.empresa,
      portal: a.jobOffer.platform.nombre,
      estado: a.estadoActual,
      notaAtencion: a.notaAtencion,
      enviadaEn: a.enviadaEn,
    })),
  });
}

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    }

    const body = await request.json();
    const {
      platformNombre, // ej. "Computrabajo"
      externalId, // id de la oferta en el portal
      titulo,
      empresa,
      url, // link a la oferta original — útil sobre todo cuando queda incompleta
      origen = "MANUAL", // MANUAL | AUTOMATICO
      styleProfileId,
      respuestas, // [{ pregunta, respuesta, vacia, fueIA }] — opcional
      incompleta = false, // true: la extensión no pudo terminar la postulación sola
      nota, // por qué quedó incompleta (solo aplica si incompleta = true)
    } = body;

    if (!platformNombre || !externalId || !titulo) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    const platform = await prisma.jobPlatform.findUnique({
      where: { nombre: platformNombre },
    });
    if (!platform) {
      return NextResponse.json(
        { error: `Portal desconocido: ${platformNombre}` },
        { status: 400 }
      );
    }

    const platformAccount = await prisma.platformAccount.findUnique({
      where: { userId_platformId: { userId: user.id, platformId: platform.id } },
    });
    if (!platformAccount || !platformAccount.activa) {
      return NextResponse.json(
        { error: "Ese portal no está conectado (o está desactivado) en tu cuenta" },
        { status: 400 }
      );
    }

    const jobOffer = await prisma.jobOffer.upsert({
      where: { platformId_externalId: { platformId: platform.id, externalId } },
      update: url ? { url } : {},
      create: { platformId: platform.id, externalId, titulo, empresa, url, origen },
    });

    const cv = await prisma.cvProfile.findUnique({ where: { userId: user.id } });
    if (!cv) {
      return NextResponse.json(
        { error: "El usuario no tiene un CV cargado todavía" },
        { status: 400 }
      );
    }

    const estadoInicial = incompleta ? "INCOMPLETA" : "ENVIADO";

    const application = await prisma.application.create({
      data: {
        userId: user.id,
        jobOfferId: jobOffer.id,
        platformAccountId: platformAccount.id,
        cvProfileId: cv.id,
        styleProfileId: styleProfileId ?? null,
        estadoActual: estadoInicial,
        notaAtencion: incompleta ? (nota || "No se pudo completar automáticamente") : null,
      },
    });

    await prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, estado: estadoInicial },
    });

    if (Array.isArray(respuestas) && respuestas.length) {
      await prisma.applicationAnswer.createMany({
        data: respuestas
          .filter((r: any) => r?.pregunta)
          .map((r: any) => ({
            applicationId: application.id,
            pregunta: r.pregunta,
            // Por ahora respuestaIa y respuestaFinal son iguales — todavía no
            // capturamos el valor antes/después de la edición en el panel de revisión.
            respuestaIa: r.respuesta || "",
            respuestaFinal: r.respuesta || "",
            fueEditada: false,
          })),
      });
    }

    return NextResponse.json({ id: application.id });
  } catch (err) {
    console.error("Error en /api/applications:", err);
    return NextResponse.json(
      { error: "Error al guardar la postulación — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
