import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // Si el estado no cambió, no duplicamos el historial
    if (application.estadoActual === estado) {
      return NextResponse.json({ id: application.id, sinCambios: true });
    }

    // docs/revision-2026-09-16.md §8.2/§8.3: "Postulado" en "Mis postulaciones"
    // del portal es la evidencia que faltaba -- si AutoPostula la había dejado
    // INCOMPLETA (no vio la confirmación) pero el portal la muestra, sí llegó.
    // Solo INCOMPLETA puede pasar a ENVIADO: nunca se retrocede una postulación
    // que ya avanzó (VISTO, EN_PROCESO...) porque el portal diga "Postulado".
    if (estado === "ENVIADO" && application.estadoActual !== "INCOMPLETA") {
      return NextResponse.json({ id: application.id, sinCambios: true });
    }

    await prisma.application.update({
      where: { id: application.id },
      data: { estadoActual: estado as any, ...(estado === "ENVIADO" ? { notaAtencion: null } : {}) },
    });

    await prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, estado: estado as any },
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
