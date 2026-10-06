import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { claveLimite, LIMITES, permitirIntento } from "@/lib/limite-tasa";
import { diaEnChile } from "@/lib/tiempo";

/**
 * "Descargar mis datos": todos los datos de la cuenta en un JSON.
 *
 * Ley 19.628 modificada por la 21.719, art. 9 (portabilidad): una copia "en un
 * formato electrónico estructurado, genérico y de uso común", y el ejercicio de
 * los derechos es gratuito, así que esto es para todos los planes (la
 * exportación de postulaciones en CSV de /api/applications/exportar sigue
 * siendo un beneficio Premium aparte). También responde al derecho de acceso
 * (art. 5) sin tener que escribirnos.
 *
 * Queda fuera solo lo que no es de la persona o serviría para entrar a su
 * cuenta: el hash de la contraseña, los tokens de acceso y de los enlaces de
 * correo, y los datos de las personas que invitó (de ellas solo va cuántas son).
 */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  if (!(await permitirIntento(claveLimite("exportar-datos", userId), LIMITES.exportarDatosPorUsuario))) {
    return NextResponse.json(
      { error: "Descargaste tus datos varias veces en la última hora. Espera un rato y vuelve a intentarlo." },
      { status: 429 }
    );
  }

  const donde = { where: { userId } };
  const [
    cuenta, consentimientos, perfilProfesional, perfilesDeEstilo, preferenciasDeBusqueda, objetivosLaborales,
    portalesConectados, postulaciones, decisionesSobreOfertas, ofertasDescartadas, ofertasObservadas,
    puestasAlDia, usoDeIA, pases, pagos, postulacionesExtra, monedas, personasInvitadas,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      omit: {
        passwordHash: true, apiToken: true, resetToken: true, resetTokenExpiry: true,
        verifyToken: true, verifyTokenExpiry: true, invitadoPorId: true,
      },
    }),
    prisma.consentimiento.findMany({ ...donde, orderBy: { aceptadoEn: "asc" } }),
    prisma.cvProfile.findUnique({ where: { userId } }),
    prisma.styleProfile.findMany({
      ...donde,
      include: { calibrationAnswers: true, refinements: true },
      orderBy: { creadoEn: "asc" },
    }),
    prisma.searchPreferences.findUnique({ where: { userId } }),
    prisma.objetivoLaboral.findMany({ ...donde, orderBy: { orden: "asc" } }),
    prisma.platformAccount.findMany({ ...donde, include: { platform: { select: { nombre: true } } } }),
    prisma.application.findMany({
      ...donde,
      include: {
        jobOffer: { select: { titulo: true, empresa: true, url: true, externalId: true, platform: { select: { nombre: true } } } },
        statusHistory: true,
        answers: true,
      },
      orderBy: { enviadaEn: "asc" },
    }),
    prisma.decisionOferta.findMany(donde),
    prisma.descarte.findMany(donde),
    prisma.ofertaObservada.findMany(donde),
    prisma.rafaga.findMany(donde),
    prisma.aiUsageLog.findMany({ ...donde, select: { tipo: true, creadoEn: true }, orderBy: { creadoEn: "asc" } }),
    prisma.subscription.findMany({ ...donde, include: { plan: { select: { nombre: true, tipo: true } } } }),
    prisma.payment.findMany(donde),
    prisma.postulacionExtra.findMany({ ...donde, orderBy: { creadoEn: "asc" } }),
    prisma.movimientoMoneda.findMany({ ...donde, orderBy: { creadoEn: "asc" } }),
    prisma.user.count({ where: { invitadoPorId: userId } }),
  ]);

  if (!cuenta) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const ahora = new Date();
  const datos = {
    acercaDe: {
      descripcion:
        "Copia de todos los datos personales que AutoPostula guarda sobre tu cuenta (Ley 19.628, modificada por la Ley 21.719: derechos de acceso y portabilidad).",
      generadoEn: ahora.toISOString(),
      excluido:
        "El hash de tu contraseña y los tokens de acceso, porque servirían para entrar a tu cuenta; y los datos de las personas que invitaste, porque son de ellas.",
      politicaDePrivacidad: "https://autopostula.cl/privacidad",
    },
    cuenta,
    consentimientos,
    perfilProfesional,
    perfilesDeEstilo,
    preferenciasDeBusqueda,
    objetivosLaborales,
    portalesConectados,
    postulaciones,
    decisionesSobreOfertas,
    ofertasDescartadas,
    ofertasObservadas,
    puestasAlDia,
    usoDeIA,
    pases,
    pagos,
    postulacionesExtra,
    monedas,
    invitaciones: { codigo: cuenta.codigoInvitacion, personasInvitadas },
  };

  return new NextResponse(JSON.stringify(datos, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="autopostula-mis-datos-${diaEnChile(ahora)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
