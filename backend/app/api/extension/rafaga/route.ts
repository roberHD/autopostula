import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// "activacion": la persona acaba de activar la postulación desde el panel y se corre
// una ráfaga de inmediato (docs/rafagas-y-ponerse-al-dia.md §4.1).
const DISPARADORES = ["inicio_chrome", "despertar", "chequeo", "manual", "activacion"];
const ESTADOS = ["en_curso", "terminada", "interrumpida"];

// Las fechas vienen del reloj de la persona (Date.now() de la extensión). Se
// acepta una ventana razonable en vez de cualquier número: un reporte con la
// hora corrida por días no debe ensuciar el orden del historial de esa
// persona con una ráfaga "del futuro" que siempre queda de última.
const VENTANA_PASADO_MS = 30 * 24 * 3600e3;
const VENTANA_FUTURO_MS = 24 * 3600e3;

function fechaPlausible(valor: unknown): Date | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  const ahora = Date.now();
  if (valor < ahora - VENTANA_PASADO_MS || valor > ahora + VENTANA_FUTURO_MS) return null;
  return new Date(valor);
}

// Un contador roto (negativo, NaN, gigante) se toma como 0 o se topa, en vez
// de rechazar el reporte entero: perder el aviso de que la ráfaga terminó es
// peor que anotar un número dudoso.
function contar(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return 0;
  return Math.min(Math.trunc(valor), 10_000);
}

function duracion(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  return Math.min(Math.trunc(valor), 24 * 3600e3);
}

// docs/rafagas-y-ponerse-al-dia.md §3.4: la extensión reporta cada ráfaga dos
// veces -- al empezar (estado "en_curso") y al terminar ("terminada" o
// "interrumpida", con los conteos) -- y ambas caen en la misma fila: el id que
// manda es el suyo (extensionId), no el nuestro. Las dos llamadas son
// idempotentes: un reintento de red no duplica ni retrocede nada.
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const extensionId = typeof body.id === "string" ? body.id.trim() : "";
  if (!extensionId || extensionId.length > 64) {
    return NextResponse.json({ error: "Falta el id de la ráfaga (máximo 64 caracteres)" }, { status: 400 });
  }
  if (!DISPARADORES.includes(body.disparador)) {
    return NextResponse.json({ error: "disparador inválido" }, { status: 400 });
  }
  const inicio = fechaPlausible(body.inicio);
  if (!inicio) {
    return NextResponse.json({ error: "inicio inválido" }, { status: 400 });
  }
  const estado = body.estado ?? "en_curso";
  if (!ESTADOS.includes(estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 });
  }

  const where = { userId_extensionId: { userId: user.id, extensionId } };

  if (estado === "en_curso") {
    // Reporte de inicio. Si la fila ya existe no se toca: puede ser un
    // reintento, o este reporte llegó DESPUÉS del de fin (la red no garantiza
    // el orden) y no debe devolver una ráfaga terminada a "en_curso".
    await prisma.rafaga.upsert({
      where,
      create: { userId: user.id, extensionId, disparador: body.disparador, inicio, estado: "en_curso" },
      update: {},
    });
    return NextResponse.json({ ok: true });
  }

  const fin = fechaPlausible(body.fin);
  if (!fin) {
    return NextResponse.json({ error: "fin inválido" }, { status: 400 });
  }
  const conteos = body.conteos ?? {};
  const datosFin = {
    estado,
    fin,
    postuladas: contar(conteos.postuladas),
    observadas: contar(conteos.observadas),
    descartadas: contar(conteos.descartadas),
    gris: contar(conteos.gris),
    errores: contar(conteos.errores),
    duracionMs: duracion(body.duracionMs),
  };

  // create con los mismos datos de inicio: si el reporte de inicio se perdió
  // en la red, el de fin alcanza para que la ráfaga igual quede registrada.
  await prisma.rafaga.upsert({
    where,
    create: { userId: user.id, extensionId, disparador: body.disparador, inicio, ...datosFin },
    update: datosFin,
  });

  if (estado === "terminada") {
    // Hora del servidor, no la del reloj de la persona: un reloj corrido
    // hacia adelante dejaría a ultimaRafagaEn en el futuro y, con eso, el
    // panel y el recordatorio pensando que se puso al día hace nada.
    await prisma.user.update({ where: { id: user.id }, data: { ultimaRafagaEn: new Date() } });
  }

  return NextResponse.json({ ok: true });
}
