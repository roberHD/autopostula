import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { FuenteDecision } from "@/lib/generated/prisma/client";
import { accionDe, limpiarTanda, tandaConPesoReducido, type OfertaRevisada } from "@/lib/panel-revision";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// Lo mismo que /api/extension/perfil sigue intentando enviar una aprobada.
const DIAS_PARA_ENVIAR_APROBADA = 14;

/**
 * El panel de revisión del portal (docs/panel-de-revision-en-el-portal.md §2.2
 * y §3): la persona apretó "Postular a las N". Cada casilla queda como una
 * decisión, con el puntaje y las razones que tenía en ese momento, y lo
 * marcado vuelve a la extensión para que lo postule por la cola de aprobadas
 * (la misma de "Por decidir": revisa el cupo antes de cada una y enlaza la
 * postulación con su decisión).
 *
 * Responde { aEnviar: [{ externalId, decisionId, url, titulo, plataforma }] },
 * en el orden del panel. Activar la postulación (si la cuenta solo miraba) lo
 * hace la extensión antes de llamar acá, con las reglas de siempre.
 */
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const cuerpo = await request.json().catch(() => ({}));
  const tanda = limpiarTanda(cuerpo?.plataforma, cuerpo?.ofertas);
  if (!tanda) {
    return NextResponse.json({ error: "Faltan las ofertas o el portal" }, { status: 400 });
  }

  const pesoReducido = tandaConPesoReducido(tanda.ofertas);
  const ahora = new Date();
  const desdeAprobadas = new Date(ahora.getTime() - DIAS_PARA_ENVIAR_APROBADA * 86_400_000);
  const aEnviar: { externalId: string; decisionId: string; url: string; titulo: string; plataforma: string }[] = [];

  // La misma oferta, decidida hace poco por esta cuenta: por su enlace o, si no
  // tiene, por su título en ese portal. Así un reintento de la extensión (o
  // apretar dos veces) no duplica decisiones ni postula dos veces. Un "sí" ya
  // enviado (con postulación) no cuenta.
  const decidida = (o: OfertaRevisada, veredicto: "SI" | "NO") =>
    prisma.decisionOferta.findFirst({
      where: {
        userId: user.id,
        veredicto,
        decididoEn: { gte: desdeAprobadas },
        ...(o.url ? { url: o.url } : { url: null, tituloCrudo: o.titulo, plataforma: tanda.plataforma }),
        ...(veredicto === "SI"
          ? { jobOfferId: null, fuente: { in: ["BANDA_GRIS", "PANEL_REVISION"] as FuenteDecision[] } }
          : { fuente: "PANEL_REVISION" as FuenteDecision }),
      },
      select: { id: true },
    });

  for (const o of tanda.ofertas) {
    const accion = accionDe(o);
    if (!accion) continue;
    const base = {
      userId: user.id,
      tituloCrudo: o.titulo,
      url: o.url,
      empresa: o.empresa,
      plataforma: tanda.plataforma,
      scoreLocal: o.scoreLocal,
      razones: (o.razones ?? undefined) as any,
      entradaScorer: o.entrada,
      bandaMotor: o.banda,
      pesoReducido,
      decididoEn: ahora,
    };

    if (accion === "quitar") {
      if (!(await decidida(o, "NO"))) await prisma.decisionOferta.create({ data: { ...base, fuente: "PANEL_REVISION", veredicto: "NO" } });
      continue;
    }

    let decisionId: string | null = null;
    if (accion === "aprobar" && o.url) {
      // El mismo escaneo la dejó en "Por decidir" (AP.reportarBandaGris): se
      // decide esa fila, para que no quede también esperando ahí.
      const fila = await prisma.decisionOferta.findFirst({
        where: { userId: user.id, url: o.url, fuente: "BANDA_GRIS", veredicto: { in: ["PENDIENTE", "SI"] }, jobOfferId: null },
        orderBy: { creadoEn: "desc" },
      });
      if (fila) {
        await prisma.decisionOferta.update({
          where: { id: fila.id },
          data: {
            veredicto: "SI",
            decididoEn: ahora,
            bandaMotor: "gris",
            pesoReducido,
            scoreLocal: fila.scoreLocal ?? o.scoreLocal,
            ...(fila.entradaScorer === null && o.entrada ? { entradaScorer: o.entrada } : {}),
          },
        });
        decisionId = fila.id;
      }
    }

    if (accion === "rescatar") {
      // "No era así" (/api/descartes/[id]/corregir): el banco de casos ya
      // cuenta los descartes corregidos como falsos negativos.
      await prisma.descarte.updateMany({
        where: { userId: user.id, plataforma: tanda.plataforma, externalId: o.externalId, corregidoEn: null },
        data: { corregidoEn: ahora },
      });
    }

    if (!decisionId) {
      decisionId =
        (await decidida(o, "SI"))?.id ??
        (await prisma.decisionOferta.create({ data: { ...base, fuente: "PANEL_REVISION", veredicto: "SI" } })).id;
    }
    // Sin enlace no hay cómo postularla: el "sí" queda igual, para aprender.
    if (o.url) aEnviar.push({ externalId: o.externalId, decisionId, url: o.url, titulo: o.titulo, plataforma: tanda.plataforma });
  }

  return NextResponse.json({ ok: true, pesoReducido, aEnviar });
}
