import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { detectarPatrones, ajusteDeEstilo, MINIMO_CORRECCIONES } from "@/lib/detectar-patrones";

// docs/banco-de-preguntas.md §6. StyleRefinement estaba en el esquema desde
// hace tiempo sin una sola referencia en el código (§2.3): andamiaje esperando
// esta función. Acá se cablea.

/** Los refinamientos pendientes; detecta patrones nuevos si hay material. */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const styleProfile = await prisma.styleProfile.findFirst({
    where: { userId },
    orderBy: { creadoEn: "desc" },
    select: { id: true },
  });
  // Sin perfil de estilo no hay dónde colgar el refinamiento ni qué ajustar.
  if (!styleProfile) return NextResponse.json({ pendientes: [] });

  const existentes = await prisma.styleRefinement.findMany({
    where: { styleProfileId: styleProfile.id },
    orderBy: { creadoEn: "desc" },
  });

  // Un patrón ya preguntado no se vuelve a preguntar, aunque siga ocurriendo:
  // la persona ya dijo lo que quería. patronDetectado identifica al patrón.
  const yaPreguntados = new Set(existentes.map((r) => r.patronDetectado));

  const correcciones = await prisma.applicationAnswer.findMany({
    where: { fueEditada: true, application: { userId } },
    select: { respuestaIa: true, respuestaFinal: true },
    // De las más recientes: el estilo de alguien cambia, y lo que corregía
    // hace seis meses no dice tanto como lo de esta semana.
    orderBy: { respondidoEn: "desc" },
    take: 50,
  });

  const nuevos = detectarPatrones(correcciones).filter((p) => !yaPreguntados.has(p.patronDetectado));

  if (nuevos.length) {
    await prisma.styleRefinement.createMany({
      data: nuevos.map((p) => ({
        styleProfileId: styleProfile.id,
        patronDetectado: p.patronDetectado,
        preguntaGenerada: p.preguntaGenerada,
        opcionesJson: p.opciones,
      })),
    });
  }

  const pendientes = await prisma.styleRefinement.findMany({
    where: { styleProfileId: styleProfile.id, estado: "PENDIENTE" },
    orderBy: { creadoEn: "asc" },
  });

  return NextResponse.json({
    pendientes: pendientes.map((r) => ({
      id: r.id,
      patron: r.patronDetectado,
      pregunta: r.preguntaGenerada,
      opciones: r.opcionesJson,
    })),
    correccionesVistas: correcciones.length,
    minimo: MINIMO_CORRECCIONES,
  });
}

/** Guarda la respuesta y ajusta el perfil de estilo. */
export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  try {
    const { refinamientoId, valor } = await request.json();
    if (!refinamientoId || typeof valor !== "string") {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
    }

    // El where sube hasta el userId: sin eso, con el id de un refinamiento
    // ajeno se le podría tocar el perfil de estilo a otra persona.
    const refinamiento = await prisma.styleRefinement.findFirst({
      where: { id: refinamientoId, styleProfile: { userId } },
      include: { styleProfile: { select: { id: true, instrucciones: true } } },
    });
    if (!refinamiento) {
      return NextResponse.json({ error: "No encontramos esa pregunta" }, { status: 404 });
    }

    const ajuste = ajusteDeEstilo(valor);

    await prisma.styleRefinement.update({
      where: { id: refinamiento.id },
      data: { respuestaElegida: valor, estado: "RESPONDIDA" },
    });

    // "Déjalo como está" no es un no-op inútil: queda RESPONDIDA, y eso es lo
    // que evita volver a preguntar lo mismo la semana que viene.
    if (!ajuste) return NextResponse.json({ ok: true, ajustado: false });

    const instruccionesPrevias = refinamiento.styleProfile.instrucciones ?? "";
    // Se acumulan en vez de reemplazar: cada refinamiento agrega una regla, y
    // pisar las anteriores perdería lo que la persona ya pidió.
    const instrucciones = ajuste.instruccion
      ? [instruccionesPrevias, ajuste.instruccion].filter(Boolean).join("\n")
      : instruccionesPrevias;

    await prisma.styleProfile.update({
      where: { id: refinamiento.styleProfile.id },
      data: {
        ...(ajuste.longitudRespuesta ? { longitudRespuesta: ajuste.longitudRespuesta } : {}),
        ...(ajuste.instruccion ? { instrucciones } : {}),
      },
    });

    return NextResponse.json({ ok: true, ajustado: true });
  } catch (err) {
    console.error("Error en /api/style/refinamientos:", err);
    return NextResponse.json({ error: "No pudimos guardar tu respuesta" }, { status: 500 });
  }
}
