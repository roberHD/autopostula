import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { esAmplitud } from "@/lib/amplitud";

async function getOrCreatePreferencias(userId: string) {
  const existente = await prisma.searchPreferences.findUnique({ where: { userId } });
  if (existente) return existente;
  return prisma.searchPreferences.create({ data: { userId } });
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const preferencias = await getOrCreatePreferencias(userId);
  return NextResponse.json(preferencias);
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const { palabrasIncluir, palabrasExcluir, modalidad, jornada, usarScorerLocal, ubicacionDeclarada, amplitud } =
    body || {};

  await getOrCreatePreferencias(userId);

  const actualizado = await prisma.searchPreferences.update({
    where: { userId },
    data: {
      palabrasIncluir,
      palabrasExcluir,
      modalidad,
      jornada,
      // Solo se toca si vino explícitamente en el body -- así el PUT que ya
      // usaba la página de filtros (sin este campo) no lo pisa con undefined.
      ...(typeof usarScorerLocal === "boolean" ? { usarScorerLocal } : {}),
      // §2.1 (docs/revision-2026-09-16.md): Filtros edita la ubicación
      // declarada con el mismo selector del onboarding.
      ...(ubicacionDeclarada !== undefined ? { ubicacionDeclarada } : {}),
      // docs/amplitud-de-busqueda.md §4. Se valida contra la lista cerrada:
      // un valor cualquiera dejaría al scorer sin saber qué hacer. Cambiar la
      // amplitud NO recompila el perfil -- la expansión es determinista y se
      // resuelve al servir el perfil a la extensión, sin gastar IA.
      ...(esAmplitud(amplitud) ? { amplitud } : {}),
    },
  });

  return NextResponse.json(actualizado);
}
