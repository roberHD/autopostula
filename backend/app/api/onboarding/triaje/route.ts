import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { seleccionarTitulosTriaje, type ObjetivoTriaje } from "@/lib/triaje";

// Triaje de onboarding (docs/rediseno-filtrado-ofertas.md §8.1/§8.3): la misma
// interacción "¿postularías a esto? Sí/No" que después reaparece como banda
// gris (§6), pero acá corre una vez con nombres del catálogo oficial (§7.1),
// no con ofertas reales -- el triaje elicita preferencias, no necesita títulos
// auténticos de un portal.
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [usuario, objetivos, cv] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { objetivoConfirmado: true } }),
    prisma.objetivoLaboral.findMany({ where: { userId }, orderBy: { orden: "asc" } }),
    prisma.cvProfile.findUnique({ where: { userId }, select: { cargoObjetivo: true } }),
  ]);

  // docs/objetivo-laboral.md §7.4: el triaje se ancla en lo que la persona
  // declaró, no en lo que la IA infirió del CV. Sin nada confirmado todavía
  // (usuario nuevo a medio onboarding, o cuenta antigua de antes de que
  // existiera esto), cae al cargoObjetivo del CV como objetivo único --
  // mismo comportamiento de siempre, nada se rompe (§11, criterio 6).
  const objetivosTriaje: ObjetivoTriaje[] =
    usuario?.objetivoConfirmado && objetivos.length
      ? objetivos.map((o) => ({ etiqueta: o.etiqueta, ciuo: o.ciuo, peso: o.peso }))
      : cv?.cargoObjetivo
      ? [{ etiqueta: cv.cargoObjetivo, ciuo: null, peso: 1 }]
      : [];

  const [titulos, totalDecisiones] = await Promise.all([
    seleccionarTitulosTriaje(userId, objetivosTriaje),
    prisma.decisionOferta.count({ where: { userId, fuente: "TRIAJE_ONBOARDING" } }),
  ]);

  return NextResponse.json({ titulos, totalDecisiones });
}

// Registra una decisión del triaje. Se guarda en DecisionOferta con
// fuente=TRIAJE_ONBOARDING -- la misma tabla que va a alimentar la
// recompilación del Perfil de Búsqueda (§5) más adelante.
export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { titulo, veredicto } = await request.json().catch(() => ({}));
  if (!titulo || (veredicto !== "SI" && veredicto !== "NO")) {
    return NextResponse.json({ error: "Faltan titulo o veredicto (SI|NO)" }, { status: 400 });
  }

  // No hay índice único compuesto sobre (userId, tituloCrudo, fuente) a
  // propósito -- una misma persona podría recalificar el mismo título más
  // adelante desde la banda gris, y eso debe poder convivir. Para el triaje de
  // onboarding alcanza con no duplicar dentro de la misma sesión.
  const existente = await prisma.decisionOferta.findFirst({
    where: { userId, tituloCrudo: titulo, fuente: "TRIAJE_ONBOARDING" },
  });

  if (existente) {
    await prisma.decisionOferta.update({
      where: { id: existente.id },
      data: { veredicto, decididoEn: new Date() },
    });
  } else {
    await prisma.decisionOferta.create({
      data: { userId, tituloCrudo: titulo, fuente: "TRIAJE_ONBOARDING", veredicto, decididoEn: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
