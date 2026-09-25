import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";
import { usuarioTieneAnaliticaAvanzada } from "@/lib/plan-beneficios";
import { limpiarTitulo } from "@/lib/text";
import { obtenerModoAutomatico, consumirPrueba } from "@/lib/prueba-automatica";
import { PRUEBA_TOTAL } from "@/lib/estado-automatico";
import { enviarCorreoPruebaTerminada } from "@/lib/correo";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [applications, analiticaAvanzada] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      include: {
        jobOffer: { include: { platform: true } },
      },
      orderBy: { enviadaEn: "desc" },
    }),
    usuarioTieneAnaliticaAvanzada(userId),
  ]);

  return NextResponse.json({
    applications: applications.map((a) => ({
      id: a.id,
      titulo: limpiarTitulo(a.jobOffer.titulo),
      empresa: a.jobOffer.empresa,
      portal: a.jobOffer.platform.nombre,
      estado: a.estadoActual,
      notaAtencion: a.notaAtencion,
      enviadaEn: a.enviadaEn,
      // Una de las 5 de la prueba automática -- lo usa "Ver las 5" (§4.1).
      esDePrueba: a.esDePrueba,
      // Si el estado lo contó la persona, la lista lo dice ("lo contaste tú").
      contadoPorTi: a.origenEstado === "USUARIO",
    })),
    analiticaAvanzada,
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
      matchScore, // 0-100 — viene de analizarOferta() en la extensión, si se llamó
      decisionOfertaId, // §8.6: viene de una aprobación de banda gris -- enlaza esa decisión con esta postulación
      // docs/rafagas-y-ponerse-al-dia.md §4.1: true cuando la postulación salió
      // de una ráfaga (la pestaña que la envió la abrió la propia extensión, no
      // la persona). Es lo que gasta la prueba de una cuenta gratis. Campo
      // aparte de `origen` a propósito: ese ya existía con otro significado
      // (OrigenOferta, del corpus de ofertas) y la extensión siempre manda MANUAL.
      desdeRafaga,
    } = body;

    if (!platformNombre || !externalId || !titulo) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    const estadoPostulaciones = await obtenerEstadoPostulaciones(user.id);
    if (!estadoPostulaciones.permitido) {
      return NextResponse.json(
        { error: `Alcanzaste el límite de postulaciones de tu plan este mes (${estadoPostulaciones.limite}).` },
        { status: 403 }
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

    const platformAccount = await prisma.platformAccount.findUnique({
      where: { userId_platformId: { userId: user.id, platformId: platform.id } },
    });
    if (!platformAccount || !platformAccount.activa) {
      return NextResponse.json(
        { error: "Ese portal no está conectado (o está desactivado) en tu cuenta" },
        { status: 400 }
      );
    }

    const relevanciaAi = typeof matchScore === "number" ? Math.max(0, Math.min(100, Math.round(matchScore))) : undefined;

    const jobOffer = await prisma.jobOffer.upsert({
      where: { platformId_externalId: { platformId: platform.id, externalId } },
      // No pisar un matchScore ya guardado con "undefined" si esta vez no vino —
      // solo se actualiza cuando realmente se calculó uno nuevo. postulada
      // siempre se fuerza a true acá: puede que la fila ya existiera como
      // avistamiento (§9.3, la vio la extensión antes sin postularse) y este
      // POST es justo el momento en que eso deja de ser cierto.
      update: { ...(url ? { url } : {}), ...(relevanciaAi !== undefined ? { relevanciaAi } : {}), postulada: true },
      create: { platformId: platform.id, externalId, titulo, empresa, url, origen, relevanciaAi, postulada: true },
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
        origenEstado: "SISTEMA",
        notaAtencion: incompleta ? (nota || "No se pudo completar automáticamente") : null,
      },
    });

    await prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, estado: estadoInicial, origen: "SISTEMA" },
    });

    // §8.6: si esta postulación viene de una aprobación de banda gris, se
    // enlaza acá -- es lo que la saca de "pendiente" en /api/extension/perfil
    // (esa query filtra por jobOfferId: null). Guardado con condiciones
    // (userId + veredicto SI) para que un id ajeno o ya resuelto no pueda
    // pisar el estado de otra decisión.
    if (decisionOfertaId) {
      await prisma.decisionOferta.updateMany({
        where: { id: decisionOfertaId, userId: user.id, veredicto: "SI" },
        data: { jobOfferId: jobOffer.id },
      });
    }

    if (Array.isArray(respuestas) && respuestas.length) {
      await prisma.applicationAnswer.createMany({
        data: respuestas
          .filter((r: any) => r?.pregunta)
          .map((r: any) => ({
            applicationId: application.id,
            pregunta: r.pregunta,
            // docs/banco-de-preguntas.md §3: la extensión ahora manda el valor
            // que generó la IA por separado del que quedó después del modo
            // revisión -- es el dataset de correcciones etiquetadas, lo más
            // caro de conseguir en un sistema así, y antes se perdía guardando
            // los dos campos iguales. Si viene de una extensión vieja sin
            // respuestaIa, cae al valor final (mismo comportamiento de antes).
            respuestaIa: r.respuestaIa ?? r.respuesta ?? "",
            respuestaFinal: r.respuesta || "",
            fueEditada: typeof r.fueEditada === "boolean" ? r.fueEditada : false,
          })),
      });
    }

    // §4.1: una postulación ENVIADA desde una ráfaga, en una cuenta gratis que
    // todavía tiene prueba, gasta una de las 5. Una INCOMPLETA no llegó a la
    // empresa (§8.3 de la revisión), así que no descuenta. Va al final, con la
    // postulación ya guardada: si esto falla, la postulación existe igual (ya
    // salió al portal, no se puede deshacer) y solo la prueba queda sin descontar.
    let prueba: { restantes: number; total: number } | undefined;
    if (desdeRafaga === true && !incompleta) {
      try {
        if ((await obtenerModoAutomatico(user)) === "prueba") {
          const restantes = await consumirPrueba(user.id, application.id);
          if (restantes !== null) {
            prueba = { restantes, total: PRUEBA_TOTAL };
            // El único correo que recibe una cuenta gratis por este tema, y solo
            // la postulación que se llevó el último cupo llega acá con 0. Con
            // await: en serverless, un envío sin esperar puede quedar congelado
            // al responder y perderse.
            if (restantes === 0 && user.emailVerificado) {
              await enviarCorreoPruebaTerminada(user.email, PRUEBA_TOTAL).catch((e) =>
                console.error("[prueba] No se pudo mandar el correo de fin de prueba:", e)
              );
            }
          }
        }
      } catch (e) {
        console.error("[prueba] No se pudo descontar la postulación de prueba:", e);
      }
    }

    return NextResponse.json({ id: application.id, ...(prueba ? { prueba } : {}) });
  } catch (err) {
    console.error("Error en /api/applications:", err);
    return NextResponse.json(
      { error: "Error al guardar la postulación — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
