import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalPuedeCambiar, type Origen } from "@/lib/estado-real";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  return prisma.user.findUnique({ where: { apiToken: token } });
}

// ENVIADO solo tiene sentido como "el portal confirma que sí llegó" para una
// postulación que AutoPostula dejó INCOMPLETA (ver más abajo); para cualquier
// otra es el estado con el que ya nació y no cambia nada.
const ESTADOS_VALIDOS = ["ENVIADO", "VISTO", "EN_PROCESO", "FINALISTA", "FINALIZADO", "RECHAZADO"];

export async function PATCH(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    }

    const { platformNombre, externalId, estado } = await request.json();

    if (!platformNombre || !externalId || !estado) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    if (!ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json(
        { error: `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` },
        { status: 400 }
      );
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

    const jobOffer = await prisma.jobOffer.findUnique({
      where: { platformId_externalId: { platformId: platform.id, externalId } },
    });
    if (!jobOffer) {
      return NextResponse.json(
        { error: "No existe una oferta registrada con ese externalId" },
        { status: 404 }
      );
    }

    const application = await prisma.application.findFirst({
      where: { userId: user.id, jobOfferId: jobOffer.id },
      orderBy: { enviadaEn: "desc" },
    });
    if (!application) {
      return NextResponse.json(
        { error: "No hay una postulación registrada para esa oferta" },
        { status: 404 }
      );
    }

    // docs/estado-real-de-postulaciones.md §6.5: el portal solo sube de rango,
    // nunca baja, y nunca pisa lo que contó la persona ("tuve entrevista" no se
    // revierte porque el portal siga diciendo "postulado"). La única excepción
    // hacia abajo es INCOMPLETA → ENVIADO (§8.2/§8.3 de la revisión): "Postulado"
    // en el portal es la evidencia de que sí llegó. Todo eso vive en
    // lib/estado-real.ts, verificado por scripts/verificar-estado-real.ts.
    if (!portalPuedeCambiar(application.estadoActual, application.origenEstado as Origen, estado)) {
      return NextResponse.json({ id: application.id, sinCambios: true });
    }

    await prisma.application.update({
      where: { id: application.id },
      data: {
        estadoActual: estado as any,
        origenEstado: "PORTAL",
        ...(estado === "ENVIADO" ? { notaAtencion: null } : {}),
      },
    });

    await prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, estado: estado as any, origen: "PORTAL" },
    });

    return NextResponse.json({ id: application.id, sinCambios: false });
  } catch (err) {
    console.error("Error en /api/applications/status:", err);
    return NextResponse.json(
      { error: "Error al actualizar el estado — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
