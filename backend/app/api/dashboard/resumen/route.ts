import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { limpiarTitulo } from "@/lib/text";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const hoy = new Date();
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - 6);
  inicioSemana.setHours(0, 0, 0, 0);

  const inicioSemanaAnterior = new Date(inicioSemana);
  inicioSemanaAnterior.setDate(inicioSemana.getDate() - 7);

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const [
    todas,
    estaSemana,
    semanaAnterior,
    entrevistasEsteMes,
    styleProfile,
    portalesActivos,
    recientes,
    cambiosDeEstado,
  ] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      select: {
        id: true,
        estadoActual: true,
        enviadaEn: true,
        jobOffer: { select: { relevanciaAi: true, titulo: true, empresa: true } },
        platformAccount: { select: { platform: { select: { nombre: true } } } },
      },
    }),
    prisma.application.count({ where: { userId, enviadaEn: { gte: inicioSemana } } }),
    prisma.application.count({
      where: { userId, enviadaEn: { gte: inicioSemanaAnterior, lt: inicioSemana } },
    }),
    prisma.application.count({
      where: { userId, estadoActual: "FINALISTA", enviadaEn: { gte: inicioMes } },
    }),
    prisma.styleProfile.findFirst({ where: { userId }, orderBy: { creadoEn: "desc" } }),
    prisma.platformAccount.count({ where: { userId, activa: true } }),
    prisma.application.findMany({
      where: { userId },
      orderBy: { enviadaEn: "desc" },
      take: 5,
      include: {
        jobOffer: { select: { titulo: true, empresa: true, relevanciaAi: true } },
        platformAccount: { select: { platform: { select: { nombre: true } } } },
      },
    }),
    prisma.applicationStatusHistory.findMany({
      where: {
        estado: { not: "ENVIADO" },
        cambiadoEn: { gte: inicioSemana },
        application: { userId },
      },
      select: { cambiadoEn: true },
    }),
  ]);

  const total = todas.length;
  const conRespuesta = todas.filter((a) => a.estadoActual !== "ENVIADO").length;
  const tasaRespuesta = total ? Math.round((conRespuesta / total) * 100) : 0;

  const matches = todas.map((a) => a.jobOffer.relevanciaAi).filter((v): v is number => v != null);
  const matchPromedio = matches.length
    ? Math.round(matches.reduce((s, v) => s + v, 0) / matches.length)
    : null;

  const cambioSemanal = semanaAnterior
    ? Math.round(((estaSemana - semanaAnterior) / semanaAnterior) * 100)
    : estaSemana
    ? 100
    : 0;

  // Actividad por día, últimos 7 días — enviadas y respuestas (cambios de estado)
  const actividad: { etiqueta: string; enviadas: number; respuestas: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    const clave = d.toDateString();
    const etiqueta = d.toLocaleDateString("es-CL", { weekday: "short" });
    const enviadas = todas.filter((a) => a.enviadaEn.toDateString() === clave).length;
    const respuestas = cambiosDeEstado.filter((c) => c.cambiadoEn.toDateString() === clave).length;
    actividad.push({ etiqueta, enviadas, respuestas });
  }

  // Embudo: cada escalón contiene al siguiente. "Vista" es toda la que
  // avanzó de ENVIADO, "en proceso" la que pasó de vista, y así. RECHAZADO
  // no es un escalón del avance sino una salida, por eso va aparte.
  const enEstado = (...estados: string[]) =>
    todas.filter((a) => estados.includes(a.estadoActual)).length;

  // INCOMPLETA no es "vista": significa que la postulación quedó a medias y
  // nunca llegó a la empresa. Se nombran los estados uno por uno en vez de
  // usar "distinto de ENVIADO", que es lo que la metía por error.
  const vistas = enEstado("VISTO", "EN_PROCESO", "FINALISTA", "FINALIZADO", "RECHAZADO");
  const enProceso = enEstado("EN_PROCESO", "FINALISTA", "FINALIZADO");
  const finalistas = enEstado("FINALISTA", "FINALIZADO");
  const rechazadas = enEstado("RECHAZADO");

  const embudo = [
    { etiqueta: "Enviadas", cantidad: total },
    { etiqueta: "Vistas", cantidad: vistas },
    { etiqueta: "En proceso", cantidad: enProceso },
    { etiqueta: "Finalistas", cantidad: finalistas },
    { etiqueta: "Rechazadas", cantidad: rechazadas },
  ];

  // Distribución por portal
  const porPortalMap = new Map<string, number>();
  todas.forEach((a) => {
    const nombre = a.platformAccount.platform.nombre;
    porPortalMap.set(nombre, (porPortalMap.get(nombre) ?? 0) + 1);
  });
  const porPortal = Array.from(porPortalMap.entries()).map(([nombre, cantidad]) => ({
    nombre,
    cantidad,
  }));

  return NextResponse.json({
    postulacionesEnviadas: total,
    cambioSemanal,
    tasaRespuesta,
    entrevistasEsteMes,
    matchPromedio,
    actividad,
    embudo,
    porPortal,
    perfilEntrenado: styleProfile?.confianzaPorcentaje ?? 0,
    portalesActivos,
    recientes: recientes.map((a) => ({
      id: a.id,
      titulo: limpiarTitulo(a.jobOffer.titulo),
      empresa: a.jobOffer.empresa,
      portal: a.platformAccount.platform.nombre,
      estado: a.estadoActual,
      match: a.jobOffer.relevanciaAi,
    })),
  });
}
