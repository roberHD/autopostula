import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { portalSigueEstado, PORTALES_CON_SEGUIMIENTO } from "@/lib/platforms";
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
        origenEstado: true,
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
  // §3.1 (docs/revision-2026-09-16.md): INCOMPLETA no es "una empresa
  // respondió" -- es una postulación que se quedó a medias y nunca llegó.
  // Antes el filtro era "distinto de ENVIADO", que las contaba: 7 INCOMPLETA
  // de 46 daban un "15% de respuesta" que en realidad eran cero respuestas
  // (0 vistas, 0 en proceso, 0 finalistas en el mismo panel). Tampoco cuentan
  // en el denominador: no son postulaciones que una empresa haya podido
  // responder.
  const enviadasDeVerdad = todas.filter((a) => a.estadoActual !== "INCOMPLETA");
  const conRespuesta = enviadasDeVerdad.filter((a) => a.estadoActual !== "ENVIADO").length;

  // docs/estado-real-de-postulaciones.md §4. La tasa de respuesta se calculaba
  // sobre TODAS las postulaciones, pero solo Computrabajo sincroniza estado:
  // lo de Laborum y Trabajando queda en ENVIADO para siempre. Meterlas en el
  // denominador garantiza un porcentaje bajo aunque a la persona le esté yendo
  // bien -- el caso que origino esto fue "16% y 0 finalistas" con cuatro
  // entrevistas coordinadas por correo.
  //
  // Un numero equivocado es peor que ninguno, asi que el porcentaje deja de
  // ser la metrica destacada. En su lugar va algo accionable (cuantas se
  // movieron) y la cobertura, para que se vea sobre que se sabe y sobre que no.
  const conSeguimiento = enviadasDeVerdad.filter((a) => portalSigueEstado(a.platformAccount.platform.nombre));
  const sinSeguimiento = enviadasDeVerdad.length - conSeguimiento.length;

  const portalesSinSeguimiento = [
    ...new Set(
      enviadasDeVerdad
        .map((a) => a.platformAccount.platform.nombre)
        .filter((n) => !portalSigueEstado(n))
    ),
  ];

  // §7: la tasa se calcula solo sobre las postulaciones de las que se sabe
  // algo de verdad -- un portal que reporta, o la persona que ya respondio.
  // Nunca sobre el total, que incluye las que nadie miro nunca. Viaja junto a
  // su denominador: quien la muestre tiene que decir sobre cuantas la calculo
  // (criterio de aceptacion 7).
  const conInfoReal = enviadasDeVerdad.filter(
    (a) => portalSigueEstado(a.platformAccount.platform.nombre) || a.origenEstado === "USUARIO"
  );
  const tasaRespuesta = conInfoReal.length
    ? Math.round((conInfoReal.filter((a) => a.estadoActual !== "ENVIADO").length / conInfoReal.length) * 100)
    : 0;

  // §7 -- el desglose honesto. Es una particion: cada postulacion cae en
  // exactamente un grupo y la suma da el total, para que nadie tenga que
  // adivinar que pasa con las que faltan.
  const entrevistas = enviadasDeVerdad.filter((a) => a.estadoActual === "ENTREVISTA").length;
  const conMovimientoSinEntrevistas = enviadasDeVerdad.filter(
    (a) => a.estadoActual !== "ENVIADO" && a.estadoActual !== "ENTREVISTA"
  ).length;
  // Quietas en ENVIADO. La diferencia entre las dos filas siguientes es si se
  // sabe que no paso nada, o si simplemente no hay forma de saberlo:
  const quietas = enviadasDeVerdad.filter((a) => a.estadoActual === "ENVIADO");
  //   - el portal las sigue y dice que no hubo novedad
  const sinNovedad = quietas.filter((a) => portalSigueEstado(a.platformAccount.platform.nombre)).length;
  //   - nadie las puede mirar: solo la persona puede contar que paso (§6)
  const esperandoQueCuentes = quietas.length - sinNovedad;
  const incompletas = total - enviadasDeVerdad.length;

  const desglose = [
    { etiqueta: "Sin novedad", cantidad: sinNovedad, nota: "el portal dice que no ha pasado nada" },
    { etiqueta: "Esperando que nos cuentes", cantidad: esperandoQueCuentes, nota: "nadie nos avisa: solo tú puedes saberlo", accionable: true },
    { etiqueta: "Con movimiento", cantidad: conMovimientoSinEntrevistas, nota: "alguien las miró o avanzaron" },
    { etiqueta: "Entrevistas", cantidad: entrevistas, nota: "lo que de verdad importa" },
    { etiqueta: "Quedaron a medias", cantidad: incompletas, nota: "no llegaron a la empresa" },
  ].filter((f) => f.cantidad > 0);

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
    conMovimiento: conRespuesta,
    cobertura: {
      conSeguimiento: conSeguimiento.length,
      sinSeguimiento,
      portalesSinSeguimiento,
      portalesConSeguimiento: PORTALES_CON_SEGUIMIENTO,
    },
    tasaRespuesta,
    tasaSobre: conInfoReal.length,
    desglose,
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
