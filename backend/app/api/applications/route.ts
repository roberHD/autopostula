import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";
import { gastarExtra } from "@/lib/extras";
import { obtenerModoAutomatico, consumirPrueba } from "@/lib/prueba-automatica";
import { PRUEBA_TOTAL } from "@/lib/estado-automatico";
import { enviarCorreoPruebaTerminada } from "@/lib/correo";
import { textoCorto, urlDePortal } from "@/lib/entrada";
import { listarPostulaciones } from "@/lib/panel/listas";

// docs/revision-2026-09-28.md §25: topes para lo que llega de la extensión. Un
// formulario real tiene unas pocas preguntas; esto solo corta lo absurdo.
const MAX_RESPUESTAS = 60;
const MAX_PREGUNTA = 1000;
const MAX_RESPUESTA = 5000;

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // La lista vive en lib/panel/listas.ts: la página de Postulaciones la arma
  // en el servidor (docs/optimizacion-2026-09-29.md §1).
  return NextResponse.json(await listarPostulaciones(userId));
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }
    const {
      styleProfileId,
      respuestas, // [{ pregunta, respuesta, vacia, fueIA }] — opcional
      matchScore, // 0-100 — viene de analizarOferta() en la extensión, si se llamó
      decisionOfertaId, // §8.6: viene de una aprobación de banda gris -- enlaza esa decisión con esta postulación
      // docs/rafagas-y-ponerse-al-dia.md §4.1: true cuando la postulación salió
      // de una ráfaga (la pestaña que la envió la abrió la propia extensión, no
      // la persona). Es lo que gasta la prueba de una cuenta gratis. Campo
      // aparte de `origen` a propósito: ese ya existía con otro significado
      // (OrigenOferta, del corpus de ofertas) y la extensión siempre manda MANUAL.
      desdeRafaga,
    } = body;
    const platformNombre = textoCorto(body.platformNombre, 50); // ej. "Computrabajo"
    const externalId = textoCorto(body.externalId, 200); // id de la oferta en el portal
    const titulo = textoCorto(body.titulo, 300);
    const empresa = textoCorto(body.empresa, 200);
    // El link a la oferta original -- útil sobre todo cuando queda incompleta.
    // docs/revision-2026-09-28.md §1: solo https:// del portal; si no, null.
    const url = urlDePortal(body.url, platformNombre);
    const origen = body.origen === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL";
    const incompleta = body.incompleta === true; // la extensión no pudo terminar la postulación sola
    const nota = textoCorto(body.nota, 500); // por qué quedó incompleta (solo aplica si incompleta = true)

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

    // docs/revision-2026-09-28.md §25: el perfil de estilo tiene que ser de esta
    // misma cuenta. Uno ajeno se ignora en vez de quedar enlazado.
    const styleProfileValido =
      typeof styleProfileId === "string" && styleProfileId
        ? await prisma.styleProfile.findFirst({ where: { id: styleProfileId, userId: user.id }, select: { id: true } })
        : null;

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
        styleProfileId: styleProfileValido?.id ?? null,
        estadoActual: estadoInicial,
        origenEstado: "SISTEMA",
        notaAtencion: incompleta ? (nota || "No se pudo completar automáticamente") : null,
        // docs/revision-2026-09-28.md §1: la copia propia de lo que se muestra.
        // Lo que no mandó la extensión se toma de la oferta tal como está AHORA
        // (el escaneo de esta misma persona la acaba de refrescar); lo que otra
        // cuenta le cambie a la oferta después ya no aparece acá.
        titulo,
        empresa: empresa ?? jobOffer.empresa,
        url: url ?? urlDePortal(jobOffer.url, platformNombre),
        relevanciaAi: relevanciaAi ?? null,
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
    if (typeof decisionOfertaId === "string" && decisionOfertaId) {
      await prisma.decisionOferta.updateMany({
        where: { id: decisionOfertaId, userId: user.id, veredicto: "SI" },
        data: { jobOfferId: jobOffer.id },
      });
    }

    if (Array.isArray(respuestas) && respuestas.length) {
      await prisma.applicationAnswer.createMany({
        data: respuestas
          .filter((r: any) => r && typeof r.pregunta === "string" && r.pregunta.trim())
          .slice(0, MAX_RESPUESTAS)
          .map((r: any) => {
            const respuestaFinal = typeof r.respuesta === "string" ? r.respuesta.slice(0, MAX_RESPUESTA) : "";
            return {
              applicationId: application.id,
              pregunta: r.pregunta.slice(0, MAX_PREGUNTA),
              // docs/banco-de-preguntas.md §3: la extensión ahora manda el valor
              // que generó la IA por separado del que quedó después del modo
              // revisión -- es el dataset de correcciones etiquetadas, lo más
              // caro de conseguir en un sistema así, y antes se perdía guardando
              // los dos campos iguales. Si viene de una extensión vieja sin
              // respuestaIa, cae al valor final (mismo comportamiento de antes).
              respuestaIa: typeof r.respuestaIa === "string" ? r.respuestaIa.slice(0, MAX_RESPUESTA) : respuestaFinal,
              respuestaFinal,
              fueEditada: typeof r.fueEditada === "boolean" ? r.fueEditada : false,
            };
          }),
      });
    }

    // docs/creditos-y-pagina-nueva.md §3: si el cupo del mes ya estaba en cero,
    // esta postulación salió de las extra (compradas o ganadas) y se descuenta
    // una. Va después de crear la postulación, con su id: la clave del
    // movimiento es esa, así que reintentar el mismo POST no cobra dos veces.
    // Una INCOMPLETA no llegó a la empresa (§8.3), así que no gasta nada.
    if (!incompleta && estadoPostulaciones.delMes === 0) {
      try {
        await gastarExtra(user.id, application.id);
      } catch (err) {
        // La postulación ya salió al portal: no se deshace porque el descuento
        // falle. Queda en el log para revisarlo.
        console.error("[extras] No se pudo descontar la postulación extra:", application.id, err);
      }
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
