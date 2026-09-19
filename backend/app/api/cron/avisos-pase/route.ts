import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finDelUltimoPase } from "@/lib/plan-vigente";
import { enviarAvisoPase, type AvisoPase } from "@/lib/correo";

// docs/pase-prepagado.md §6: la corre el cron diario de Vercel (vercel.json).
// Vercel Hobby permite crons diarios con ±59 min, por eso las condiciones son
// por ventanas de días y no por una hora exacta.
//
// Sin CRON_SECRET se rechaza todo, igual que el purgado de avistamientos.

const DIA_MS = 24 * 3_600_000;
// Un pase que venció hace más que esto ya no amerita un correo de "terminó":
// evita mandar avisos de pases viejos la primera vez que corre el cron.
const VENTANA_AVISO_FINAL_DIAS = 3;
// Con menos de un día y medio por delante, el texto es el de "vence mañana".
const UMBRAL_UN_DIA_MS = 1.5 * DIA_MS;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("Falta CRON_SECRET -- los avisos de vencimiento de pase no están corriendo");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ahora = new Date();
  const enviados = { previos: 0, finales: 0 };

  // ── 1. Avisos previos (5 días antes, y 1 día antes) ─────────────────
  // Un solo campo (avisoPrevioEn) cubre los dos: el de 1 día solo sale si el de
  // 5 días salió hace ≥ 3 días, y al enviarlo se vuelve a marcar -- al día
  // siguiente ya no cumple, así que no se repite.
  const porVencer = await prisma.subscription.findMany({
    where: {
      estado: "ACTIVA",
      plan: { tipo: "PREMIUM" },
      userId: { not: null },
      periodoFin: { gt: ahora, lte: new Date(ahora.getTime() + 5 * DIA_MS) },
      OR: [{ avisoPrevioEn: null }, { avisoPrevioEn: { lte: new Date(ahora.getTime() - 3 * DIA_MS) } }],
    },
    include: { user: { select: { email: true, emailVerificado: true } } },
  });

  for (const pase of porVencer) {
    if (!pase.user?.emailVerificado || !pase.userId || !pase.periodoFin) continue;
    // Si ya compró otro pase que sigue a este, no hay nada que avisar.
    const finReal = await finDelUltimoPase(pase.userId, ahora);
    if (!finReal || finReal.getTime() !== pase.periodoFin.getTime()) continue;

    // El de 1 día solo si ya salió el de 5 (avisoPrevioEn no nulo, que la
    // consulta ya garantiza que fue hace ≥ 3 días). Sin aviso previo se manda el
    // primero, con el texto que corresponda a lo que falta.
    const faltaMs = pase.periodoFin.getTime() - ahora.getTime();
    // Con el de 5 días ya enviado, el siguiente es el de "mañana": no se repite
    // a los 2 días de haber salido el primero.
    if (pase.avisoPrevioEn && faltaMs > UMBRAL_UN_DIA_MS) continue;
    const tipo: AvisoPase = faltaMs <= UMBRAL_UN_DIA_MS ? "un_dia" : "cinco_dias";
    try {
      await enviarAvisoPase(pase.user.email, tipo, pase.periodoFin);
      await prisma.subscription.update({ where: { id: pase.id }, data: { avisoPrevioEn: ahora } });
      enviados.previos++;
    } catch (err) {
      console.error("[avisos-pase] No se pudo mandar el aviso previo:", pase.id, err);
    }
  }

  // ── 2. Aviso de que terminó ─────────────────────────────────────────
  const vencidos = await prisma.subscription.findMany({
    where: {
      estado: "ACTIVA",
      plan: { tipo: "PREMIUM" },
      userId: { not: null },
      periodoFin: { lte: ahora, gt: new Date(ahora.getTime() - VENTANA_AVISO_FINAL_DIAS * DIA_MS) },
      avisoFinalEn: null,
    },
    include: { user: { select: { email: true, emailVerificado: true } } },
  });

  for (const pase of vencidos) {
    if (!pase.user?.emailVerificado || !pase.userId || !pase.periodoFin) continue;
    // Solo si no le queda ningún otro pase (vigente o por empezar): si renovó,
    // no terminó.
    if (await finDelUltimoPase(pase.userId, ahora)) continue;
    try {
      await enviarAvisoPase(pase.user.email, "vencio", pase.periodoFin);
      await prisma.subscription.update({ where: { id: pase.id }, data: { avisoFinalEn: ahora } });
      enviados.finales++;
    } catch (err) {
      console.error("[avisos-pase] No se pudo mandar el aviso de vencimiento:", pase.id, err);
    }
  }

  // ── 3. Orden, no control de acceso ──────────────────────────────────
  // Los pases vencidos pasan a VENCIDA. El acceso NO depende de esto: se decide
  // por fecha (lib/plan-vigente.ts), así que un día de retraso del cron no deja
  // a nadie con Premium de más.
  const marcados = await prisma.subscription.updateMany({
    where: { estado: "ACTIVA", plan: { tipo: "PREMIUM" }, periodoFin: { lte: ahora } },
    data: { estado: "VENCIDA" },
  });

  console.log(`[avisos-pase] ${enviados.previos} previo(s), ${enviados.finales} de vencimiento, ${marcados.count} pase(s) marcados VENCIDA.`);
  return NextResponse.json({ ...enviados, vencidas: marcados.count });
}
