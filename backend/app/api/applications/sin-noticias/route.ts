import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { limpiarTitulo } from "@/lib/text";
import { filtroSinNoticias } from "@/lib/estado-real";

/**
 * Las postulaciones por las que toca preguntar "¿Supiste algo?" hoy
 * (docs/estado-real-de-postulaciones.md §6.1): desde los 5 días de enviadas,
 * nunca dos veces en 7 días y nunca después de 3 "Nada todavía". Se muestran
 * de a pocas: más de tres seguidas ya no es una pregunta, es un formulario.
 */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const donde = filtroSinNoticias(userId);
  const [total, primeras] = await Promise.all([
    prisma.application.count({ where: donde }),
    prisma.application.findMany({
      where: donde,
      orderBy: { enviadaEn: "asc" },
      take: 3,
      select: {
        id: true,
        enviadaEn: true,
        estadoActual: true,
        jobOffer: { select: { titulo: true, empresa: true, platform: { select: { nombre: true } } } },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    postulaciones: primeras.map((a) => ({
      id: a.id,
      titulo: limpiarTitulo(a.jobOffer.titulo),
      empresa: a.jobOffer.empresa,
      portal: a.jobOffer.platform.nombre,
      estado: a.estadoActual,
      enviadaEn: a.enviadaEn,
    })),
  });
}
