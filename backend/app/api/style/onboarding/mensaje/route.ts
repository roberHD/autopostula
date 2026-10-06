import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { usuarioTienePerfilDinamico } from "@/lib/plan-beneficios";
import { claveLimite, LIMITES, permitirIntento } from "@/lib/limite-tasa";
import { premiarConversacion, saldoMonedas } from "@/lib/monedas";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tope duro de la fase 1 (armar el perfil por primera vez, gratis para todos)
// -- red de seguridad para que nadie se quede chateando gratis sin fin sin
// nunca finalizar. En la práctica no se nota: un perfil normal se arma en
// 4-15 mensajes del usuario, esto da margen de sobra antes de cortar.
const LIMITE_MENSAJES_FASE_1 = 30;

// docs/revision-2026-09-28.md §19: esta conversación es gratis, no exige correo
// verificado y no cuenta en el cupo de IA, y cada mensaje reenvía la
// conversación entera. Sin tope de largo, unos pocos mensajes enormes costaban
// lo mismo que cientos de postulaciones.
const LARGO_MAXIMO_MENSAJE = 2000;

const SYSTEM_PROMPT_BASE =
  "Eres un entrevistador cercano y curioso, no un formulario. Tu trabajo es conocer a esta " +
  "persona lo suficiente para poder escribir como ella en formularios de postulación laboral. " +
  "Haz UNA pregunta a la vez, corta y conversacional (nunca acartonada ni tipo encuesta). " +
  "Adapta la siguiente pregunta a lo que la persona ya respondió, no sigas un guion fijo. " +
  "Cubre a lo largo de la conversación (no todo de una vez): fortalezas reales con ejemplos " +
  "concretos, qué la motiva a trabajar, cómo prefiere que la describan, y pídele que cuente " +
  "algo con sus propias palabras para notar cómo se expresa naturalmente (frases que usa, si es " +
  "directa o da vueltas, formal o informal). Nunca preguntes por datos que ya aparecen en su CV " +
  "(en qué trabaja o trabajó, qué estudia o estudió, sus cargos, empresas, habilidades, etc.) -- " +
  "si ya tienes esa información dala por sabida y ve directo a lo que el CV no puede contarte. " +
  "Escribe en texto plano, como en un chat real: nunca uses markdown (nada de **negritas**, " +
  "#títulos, guiones de lista, etc.).\n\n" +
  // docs/revision-2026-09-28.md §14: este prompt estaba escrito con voseo
  // argentino ("sabés", "arrancá", "vos decidís"), y la IA tiende a contestar
  // como le hablan. Los usuarios son chilenos: se les habla de tú.
  "Habla en español de Chile y tutea a la persona (tú): nunca uses voseo argentino (nada de " +
  "\"vos\", \"tenés\", \"querés\", \"contame\").\n\n" +
  "TU PRIMER MENSAJE de la conversación (cuando todavía no le has preguntado nada) tiene una " +
  "estructura fija, distinta del resto: parte reconociendo en una frase natural en qué trabaja " +
  "actualmente o en qué trabajó más recientemente esta persona, usando lo que ya sabes por su CV " +
  "-- se lo dices tú, no se lo preguntas (ej. \"vi que últimamente estuviste en [cargo] en " +
  "[empresa]\"). Desde ahí pasa hacia adelante con una pregunta abierta sobre qué tiene pensado " +
  "para lo que sigue (ej. \"¿y ahora qué te gustaría que fuera distinto?\", \"¿en qué te gustaría " +
  "enfocarte de acá en adelante?\") -- esa pregunta hacia adelante reemplaza tu primera pregunta " +
  "normal, no la agregues aparte. Si el CV no trae ninguna experiencia laboral reconocible, " +
  "sáltate esta estructura y parte directo con tu primera pregunta como de costumbre.\n\n" +
  "IMPORTANTE -- tú decides cuándo ya sabes suficiente, no sigas preguntando por preguntar: una " +
  "vez que ya tengas fortalezas reales con ejemplos, qué la motiva, cómo prefiere que la " +
  "describan, y al menos un ejemplo real de cómo se expresa con sus propias palabras, da por " +
  "terminada la entrevista con un cierre breve y cálido (no otra pregunta), y marca listo=true. " +
  "No alargues la conversación de más una vez que ya tienes esto -- mientras más corta y " +
  "certera, mejor.\n\n" +
  'Responde SIEMPRE con un JSON válido, sin texto adicional ni markdown alrededor, con esta ' +
  'forma exacta: {"mensaje":"...","listo":false} -- "mensaje" es lo que le vas a decir a la ' +
  'persona (tu próxima pregunta, o el cierre si listo=true). "listo" es true solo cuando ya ' +
  "terminaste la entrevista como se explicó arriba, false mientras sigas preguntando.";

// Arma un resumen de lo que ya se sabe por el CV para que la IA no repregunte
// datos que la persona ya entregó al subirlo.
function resumirCvParaContexto(cv: {
  nombre?: string | null;
  cargoObjetivo?: string | null;
  resumenProfesional?: string | null;
  experiencia?: unknown;
  habilidades?: unknown;
  textoExtraido?: string | null;
} | null) {
  if (!cv) return null;

  const partes: string[] = [];
  if (cv.nombre) partes.push(`Nombre: ${cv.nombre}`);
  if (cv.cargoObjetivo) partes.push(`Cargo objetivo: ${cv.cargoObjetivo}`);
  if (cv.resumenProfesional) partes.push(`Resumen profesional: ${cv.resumenProfesional}`);
  if (Array.isArray(cv.experiencia) && cv.experiencia.length) {
    const experiencia = (cv.experiencia as { cargo?: string; empresa?: string; periodo?: string }[])
      .map((e) => [e.cargo, e.empresa, e.periodo].filter(Boolean).join(" — "))
      .join("; ");
    if (experiencia) partes.push(`Experiencia laboral: ${experiencia}`);
  }
  if (Array.isArray(cv.habilidades) && cv.habilidades.length) {
    partes.push(`Habilidades: ${(cv.habilidades as string[]).join(", ")}`);
  }

  // Si la IA todavía no había estructurado el CV (recién subido), al menos se
  // le pasa el texto crudo en vez de no darle nada.
  if (!partes.length && cv.textoExtraido) {
    partes.push(cv.textoExtraido.slice(0, 2000));
  }

  return partes.length ? partes.join("\n") : null;
}

function construirSystemPrompt(contextoCv: string | null) {
  if (!contextoCv) return SYSTEM_PROMPT_BASE;
  return (
    SYSTEM_PROMPT_BASE +
    "\n\nEsto es lo que ya se sabe de esta persona por su CV — no se lo vuelvas a preguntar:\n" +
    contextoCv
  );
}

async function getOrCreateStyleProfile(userId: string) {
  const existente = await prisma.styleProfile.findFirst({
    where: { userId },
    orderBy: { creadoEn: "desc" },
  });
  if (existente) return existente;
  return prisma.styleProfile.create({ data: { userId } });
}

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const perfil = await getOrCreateStyleProfile(userId);
  const conversacion = (perfil.conversacion as any[]) || [];

  // Si ya se finalizó antes, se devuelve también lo que la IA sintetizó —
  // sin esto, al volver a esta página no había forma de ver de nuevo el
  // resultado (quedaba guardado y en uso, pero invisible para la persona).
  const resultado = perfil.confirmado
    ? {
        resumen: perfil.resumen,
        fortalezas: perfil.fortalezas,
        objetivo: perfil.objetivo,
        motivaciones: perfil.motivaciones,
        estiloDetalle: perfil.estiloDetalle,
        manualEscritura: perfil.manualEscritura,
      }
    : null;

  // Fase 1 (armar el perfil por primera vez) es gratis para todos. Fase 2
  // (seguir profundizando un perfil ya armado) es premium -- se le avisa al
  // frontend de una vez para que no deje entrar al chat solo para toparse
  // con el 403 recién al mandar el primer mensaje.
  const puedeSeguirConversando = perfil.confirmado ? await usuarioTienePerfilDinamico(userId) : true;

  return NextResponse.json({ conversacion, confirmado: perfil.confirmado, resultado, puedeSeguirConversando });
}

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const cuerpo = await request.json().catch(() => null);
  const mensaje = typeof cuerpo?.mensaje === "string" ? cuerpo.mensaje.trim() : "";
  if (mensaje.length > LARGO_MAXIMO_MENSAJE) {
    return NextResponse.json(
      { error: `Tu mensaje es muy largo: como máximo ${LARGO_MAXIMO_MENSAJE} caracteres por mensaje.` },
      { status: 400 }
    );
  }
  if (!(await permitirIntento(claveLimite("estilo-usuario", userId), LIMITES.mensajesEstiloPorUsuario))) {
    return NextResponse.json(
      { error: "Llevas muchos mensajes en la última hora. Descansa un rato y sigue después: la conversación queda guardada." },
      { status: 429 }
    );
  }

  const perfil = await getOrCreateStyleProfile(userId);
  const conversacion: { role: "user" | "assistant"; content: string }[] =
    (perfil.conversacion as any[]) || [];

  if (perfil.confirmado) {
    // Fase 2: ya tiene perfil armado, seguir profundizándolo es premium.
    if (!(await usuarioTienePerfilDinamico(userId))) {
      return NextResponse.json(
        { error: "Seguir profundizando tu perfil de estilo es una función premium.", requierePremium: true },
        { status: 403 }
      );
    }
  } else if (conversacion.length >= LIMITE_MENSAJES_FASE_1) {
    // Fase 1: tope duro de mensajes, no de llamadas de IA por mes.
    return NextResponse.json(
      { error: "Llegaste al máximo de mensajes de esta conversación — finaliza tu perfil para seguir." },
      { status: 403 }
    );
  }

  if (mensaje) {
    conversacion.push({ role: "user", content: mensaje });
  }

  const cv = await prisma.cvProfile.findUnique({ where: { userId } });
  const systemPrompt = construirSystemPrompt(resumirCvParaContexto(cv));

  let respuesta: Anthropic.Message;
  try {
    respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 220,
      system: systemPrompt,
      messages: conversacion.length
        ? conversacion
        : [{ role: "user", content: "Hola, empecemos." }],
    });
  } catch (err) {
    // Antes esto reventaba sin manejo y la persona veía un 500 genérico.
    console.error("Error de IA en la conversación de estilo:", err);
    return NextResponse.json(
      { error: "La IA no respondió esta vez. Vuelve a enviar tu mensaje en un momento." },
      { status: 502 }
    );
  }

  const crudo = respuesta.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();

  let textoIA = crudo;
  let listo = false;
  try {
    const limpio = crudo.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(limpio);
    if (parsed.mensaje) {
      textoIA = parsed.mensaje;
      listo = !!parsed.listo;
    }
  } catch {
    // Si alguna vez no devuelve JSON válido, se usa el texto tal cual en vez
    // de romper la conversación -- simplemente no hay sugerencia de cierre.
  }

  conversacion.push({ role: "assistant", content: textoIA });

  await prisma.styleProfile.update({
    where: { id: perfil.id },
    data: { conversacion },
  });

  // El saludo con el que la IA abre una conversación vacía no lo escribió la
  // persona: va con otro tipo para que no cuente como un minuto de conversación
  // en las monedas (lib/monedas.ts). Igual queda fuera del cupo mensual de IA
  // (TIPOS_CONVERSACION en lib/ai-usage.ts).
  await prisma.aiUsageLog.create({
    data: { userId, tipo: mensaje ? "conversacion_estilo" : "conversacion_estilo_inicio" },
  });

  // 1 moneda al día por 10 minutos de conversación. Si falla, la respuesta de
  // la IA sale igual: la moneda no puede costarle el mensaje a la persona.
  const premio = mensaje ? await premiarConversacion(userId).catch(() => null) : null;

  return NextResponse.json({
    pregunta: textoIA,
    totalMensajes: conversacion.length,
    sugerenciaFinalizar: listo,
    monedas: premio
      ? { minutosHoy: premio.minutos, ganada: premio.ganada, saldo: premio.ganada ? await saldoMonedas(userId) : undefined }
      : undefined,
  });
}
