import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { usuarioTienePerfilDinamico } from "@/lib/plan-beneficios";
import { DESCRIPCION_LONGITUD, DESCRIPCION_TONO } from "@/lib/style-descriptions";

// docs/revision-2026-09-28.md §25: solo valores conocidos, y las instrucciones
// libres con tope (van dentro de cada llamada de IA de esta persona).
const LARGO_MAXIMO_INSTRUCCIONES = 1500;

async function getOrCreateStyleProfile(userId: string) {
  const existente = await prisma.styleProfile.findFirst({
    where: { userId },
    orderBy: { creadoEn: "desc" },
  });
  if (existente) return existente;
  return prisma.styleProfile.create({ data: { userId } });
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const perfil = await getOrCreateStyleProfile(userId);
  const instruccionesBloqueadas = !(await usuarioTienePerfilDinamico(userId));

  return NextResponse.json({
    tono: perfil.tono ?? "profesional_cercano",
    longitudRespuesta: perfil.longitudRespuesta,
    instrucciones: perfil.instrucciones ?? "",
    usarPerfil: perfil.usarPerfil,
    evitarRepetidas: perfil.evitarRepetidas,
    instruccionesBloqueadas,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const cuerpo = await request.json().catch(() => ({}));
  const tono = typeof cuerpo?.tono === "string" && cuerpo.tono in DESCRIPCION_TONO ? cuerpo.tono : undefined;
  const longitudRespuesta =
    typeof cuerpo?.longitudRespuesta === "string" && cuerpo.longitudRespuesta in DESCRIPCION_LONGITUD
      ? cuerpo.longitudRespuesta
      : undefined;
  const instrucciones =
    typeof cuerpo?.instrucciones === "string" ? cuerpo.instrucciones.slice(0, LARGO_MAXIMO_INSTRUCCIONES) : undefined;
  const usarPerfil = typeof cuerpo?.usarPerfil === "boolean" ? cuerpo.usarPerfil : undefined;
  const evitarRepetidas = typeof cuerpo?.evitarRepetidas === "boolean" ? cuerpo.evitarRepetidas : undefined;

  const perfil = await getOrCreateStyleProfile(userId);

  // Instrucciones libres son premium (perfilDinamico) -- tono, longitud y los
  // demás toggles se guardan igual, solo se ignora el texto de instrucciones
  // si no tiene el beneficio (no se rechaza el guardado completo por eso).
  const puedeEscribirInstrucciones = await usuarioTienePerfilDinamico(userId);

  const actualizado = await prisma.styleProfile.update({
    where: { id: perfil.id },
    data: {
      tono,
      longitudRespuesta,
      usarPerfil,
      evitarRepetidas,
      ...(puedeEscribirInstrucciones ? { instrucciones } : {}),
    },
  });

  return NextResponse.json({
    tono: actualizado.tono,
    longitudRespuesta: actualizado.longitudRespuesta,
    instrucciones: actualizado.instrucciones ?? "",
    usarPerfil: actualizado.usarPerfil,
    evitarRepetidas: actualizado.evitarRepetidas,
    instruccionesBloqueadas: !puedeEscribirInstrucciones,
  });
}
