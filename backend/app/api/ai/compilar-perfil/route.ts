import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { checkAndLogAiUsage } from "@/lib/ai-usage";
import { construirMensajesCV } from "@/lib/ai-messages";
import { getUsuarioSesion } from "@/lib/auth-helpers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// El Perfil de Búsqueda compilado (docs/rediseno-filtrado-ofertas.md §5) --
// reemplaza a /api/ai/sugerir-filtros y a las columnas planas de
// SearchPreferences (palabrasIncluir/excluir). Es la entrada del scorer local
// (§6): compila una vez (cara, con IA) y el scorer lo ejecuta miles de veces
// gratis en la extensión.
//
// Corre "como máximo una vez al día" según el documento -- no porque cueste
// mucho una sola vez, sino porque nada relevante del candidato cambia tan
// rápido como para justificar recompilar más seguido.
const HORAS_MIN_ENTRE_RECOMPILACIONES = 24;

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }
  const prefs = await prisma.searchPreferences.findUnique({ where: { userId } });
  return NextResponse.json({
    perfilCompilado: prefs?.perfilCompilado ?? null,
    versionPerfil: prefs?.versionPerfil ?? 0,
    actualizadoEn: prefs?.actualizadoEn ?? null,
  });
}

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [cv, styleProfile, prefsActuales, decisiones] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId } }),
    prisma.styleProfile.findFirst({ where: { userId }, orderBy: { creadoEn: "desc" } }),
    prisma.searchPreferences.findUnique({ where: { userId } }),
    prisma.decisionOferta.findMany({ where: { userId, veredicto: { in: ["SI", "NO"] } } }),
  ]);

  if (!cv?.textoExtraido) {
    return NextResponse.json({ error: "Primero sube tu CV para poder compilar tu perfil de búsqueda" }, { status: 400 });
  }

  if (prefsActuales?.perfilCompilado && prefsActuales.actualizadoEn) {
    const horasDesdeUltima = (Date.now() - prefsActuales.actualizadoEn.getTime()) / 3_600_000;
    if (horasDesdeUltima < HORAS_MIN_ENTRE_RECOMPILACIONES) {
      return NextResponse.json(
        {
          error: `Tu perfil de búsqueda ya se actualizó hace poco -- se puede volver a compilar en ${Math.ceil(
            HORAS_MIN_ENTRE_RECOMPILACIONES - horasDesdeUltima
          )}h.`,
        },
        { status: 429 }
      );
    }
  }

  const uso = await checkAndLogAiUsage(userId, "compilar_perfil");
  if (!uso.permitido) {
    return NextResponse.json(
      { error: `Alcanzaste el límite de llamadas de IA de tu plan este mes (${uso.limite}).` },
      { status: 403 }
    );
  }

  const contextoEstilo = styleProfile?.confirmado
    ? "Objetivo laboral (de la conversación): " +
      (styleProfile.objetivo || "") +
      "\n" +
      "Motivaciones: " +
      (styleProfile.motivaciones || "") +
      "\n" +
      "Fortalezas: " +
      ((styleProfile.fortalezas as string[] | null) || []).join(", ") +
      "\n"
    : "";

  const decisionesSi = decisiones.filter((d) => d.veredicto === "SI").map((d) => d.tituloCrudo);
  const decisionesNo = decisiones.filter((d) => d.veredicto === "NO").map((d) => d.tituloCrudo);

  const contextoDecisiones =
    (decisionesSi.length
      ? "Cargos a los que el candidato dijo que SÍ postularía:\n" + decisionesSi.map((t) => "- " + t).join("\n") + "\n\n"
      : "") +
    (decisionesNo.length
      ? "Cargos a los que el candidato dijo que NO postularía:\n" + decisionesNo.map((t) => "- " + t).join("\n") + "\n\n"
      : "");

  const instruccion =
    "Vas a compilar el Perfil de Búsqueda de este candidato a partir de su CV, su estilo y las decisiones " +
    "que ya tomó sobre distintos cargos. Este perfil es lo que va a decidir, de ahora en adelante y sin " +
    "volver a llamarte, si cada oferta de trabajo que vea el candidato en Computrabajo o Laborum es " +
    "relevante para él o no -- tiene que ser preciso y realista, no optimista.\n\n" +
    "Responde SOLO con un JSON válido, sin texto adicional, sin markdown, con exactamente esta forma:\n" +
    '{"roles":[{"canonico":"","sinonimos":[],"peso":1.0}],"vetos":[{"patron":"","razon":""}],"senales":[{"patron":"","delta":0}],"ubicacion":{"comunas":[],"aceptaRemoto":false},"jornada":"cualquiera","modalidad":"cualquiera"}\n\n' +
    '- roles: 1 a 4 roles que el candidato busca de verdad, cada uno con su nombre canónico simple (ej. "vendedor", no "Vendedor de tiendas y almacenes"), sinónimos reales que usan los avisos chilenos para el mismo rol (ej. para vendedor: asesor comercial, ejecutivo de ventas, promotor), y un peso de 0 a 1 según qué tan central es ese rol (1.0 = objetivo principal, 0.3-0.6 = lo aceptaría pero no lo busca activamente). Básate en su cargoObjetivo, su CV, y sobre todo en los cargos a los que dijo que SÍ.\n' +
    "- vetos: cargos o características que el candidato claramente NO acepta -- solo si hay evidencia real (un patrón sistemático en los cargos a los que dijo que NO, no un caso aislado). razon en una frase corta y mostrable (\"no es el rubro que busca\", \"nivel de seniority distinto\"). Deja el array vacío si no hay un patrón claro -- no inventes vetos.\n" +
    '- senales: ajustes graduales al puntaje (no descartan, solo suman o restan), patron en texto libre y delta entre -40 y 40. Ej: si busca part time, {"patron":"part time","delta":15}. Como mucho 3-4 señales, solo con respaldo real en sus datos.\n' +
    "- ubicacion.comunas: comunas donde el candidato quiere trabajar, en minúsculas y sin tildes (vacío si no hay preferencia clara). aceptaRemoto: true si su perfil sugiere que aceptaría trabajo remoto.\n" +
    '- jornada: "cualquiera", "full_time" o "part_time" según su disponibilidad indicada.\n' +
    '- modalidad: "cualquiera", "remoto", "hibrido" o "presencial" según su perfil.\n\n' +
    "Cargo objetivo indicado: " +
    (cv.cargoObjetivo || "Sin indicar") +
    "\n" +
    "Comuna de residencia: " +
    (cv.comuna || "Sin indicar") +
    "\n" +
    "Disponibilidad indicada: " +
    (cv.disponibilidad || "Sin indicar") +
    "\n" +
    "Modalidad indicada en su perfil: " +
    (cv.modalidad || "Sin indicar") +
    "\n" +
    contextoEstilo +
    "\n" +
    contextoDecisiones;

  const messages = await construirMensajesCV(userId, instruccion);

  try {
    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages,
    });

    let texto = respuesta.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    texto = texto.replace(/```json|```/g, "").trim();
    const compilado = JSON.parse(texto);

    const nuevaVersion = (prefsActuales?.versionPerfil ?? 0) + 1;
    const perfilCompilado = {
      version: nuevaVersion,
      roles: Array.isArray(compilado.roles) ? compilado.roles : [],
      vetos: Array.isArray(compilado.vetos) ? compilado.vetos : [],
      senales: Array.isArray(compilado.senales) ? compilado.senales : [],
      ubicacion: {
        comunas: Array.isArray(compilado.ubicacion?.comunas) ? compilado.ubicacion.comunas : [],
        aceptaRemoto: !!compilado.ubicacion?.aceptaRemoto,
      },
      jornada: compilado.jornada || "cualquiera",
      modalidad: compilado.modalidad || "cualquiera",
      // No son decisión de la IA -- son parámetros de sistema, ver §6.
      umbralPostular: 65,
      umbralGris: 45,
    };

    await prisma.searchPreferences.upsert({
      where: { userId },
      create: { userId, perfilCompilado, versionPerfil: nuevaVersion },
      update: { perfilCompilado, versionPerfil: nuevaVersion },
    });

    return NextResponse.json({ perfilCompilado });
  } catch (err) {
    console.error("Error en /api/ai/compilar-perfil:", err);
    return NextResponse.json({ error: "No se pudo compilar el perfil — revisa la terminal del servidor" }, { status: 500 });
  }
}
