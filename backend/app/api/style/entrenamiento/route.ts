import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { usuarioTienePerfilDinamico } from "@/lib/plan-beneficios";

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

  const { tono, longitudRespuesta, instrucciones, usarPerfil, evitarRepetidas } =
    await request.json();

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
