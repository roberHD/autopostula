import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// docs/revision-2026-09-16.md §1.3: el tope mensual y el de portal conectado
// se validaban solo en POST /api/applications, AL QUE LA EXTENSIÓN LLAMA
// DESPUÉS DE POSTULAR de verdad en el portal externo. El rechazo del backend
// no deshacía la postulación ya enviada -- solo la dejaba invisible en el
// historial. La extensión consulta esto ANTES de cada "Postulando:" para
// cortar el escaneo sin haber hecho clic en nada; /api/applications sigue
// validando lo mismo como defensa en profundidad.
export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const plataforma = searchParams.get("plataforma");
  if (!plataforma) {
    return NextResponse.json({ error: "Falta el parámetro 'plataforma'" }, { status: 400 });
  }

  const estado = await obtenerEstadoPostulaciones(user.id);
  if (!estado.permitido) {
    return NextResponse.json({ permitido: false, motivo: "limite", restantes: estado.restantes });
  }

  const platform = await prisma.jobPlatform.findUnique({ where: { nombre: plataforma } });
  const platformAccount = platform
    ? await prisma.platformAccount.findUnique({
        where: { userId_platformId: { userId: user.id, platformId: platform.id } },
      })
    : null;

  if (!platform || !platformAccount || !platformAccount.activa) {
    return NextResponse.json({ permitido: false, motivo: "portal", restantes: estado.restantes });
  }

  return NextResponse.json({ permitido: true, motivo: null, restantes: estado.restantes });
}
