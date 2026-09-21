import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decidirCambioEstado } from "@/lib/estado-postulacion";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  return prisma.user.findUnique({ where: { apiToken: token } });
}

// ENVIADO solo tiene sentido como "el portal confirma que sí llegó" para una
// postulación que AutoPostula dejó INCOMPLETA (ver más abajo); para cualquier
// otra es el estado con el que ya nació y no cambia nada.
const ESTADOS_VALIDOS = ["ENVIADO", "VISTO", "EN_PROCESO", "ENTREVISTA", "FINALISTA", "FINALIZADO", "RECHAZADO"];

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

    // Este endpoint es SIEMPRE el camino del portal: lo llama la extensión con
    // el token de la cuenta, desde escanearMisPostulaciones(). Lo que reporte
    // la persona va a entrar por otra ruta con origen USUARIO.
    //
    // La decisión vive en lib/estado-postulacion.ts para que las dos rutas no
    // puedan divergir (docs/estado-real-de-postulaciones.md §6.5). Cubre lo que
    // antes estaba suelto acá: que solo INCOMPLETA pueda pasar a ENVIADO, y
    // ahora además que el portal nunca pise lo que reportó la persona ni haga
    // retroceder una postulación que ya avanzó.
    const decision = decidirCambioEstado({
      actual: application.estadoActual,
      origenActual: application.origenEstado,
      nuevo: estado,
      origen: "PORTAL",
    });

    if (!decision.aplica) {
      return NextResponse.json({ id: application.id, sinCambios: true, motivo: decision.motivo });
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
      data: { applicationId: application.id, estado: estado as any },
    });

    return NextResponse.json({ id: application.id, sinCambios: false, motivo: decision.motivo });
  } catch (err) {
    console.error("Error en /api/applications/status:", err);
    return NextResponse.json(
      { error: "Error al actualizar el estado — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
