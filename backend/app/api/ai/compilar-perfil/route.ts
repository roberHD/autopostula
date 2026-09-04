import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { compilarPerfil } from "@/lib/compilar-perfil";

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

// Botón manual de /dashboard/filtros -- respeta el límite de 24h entre
// recompilaciones. El disparo automático al cambiar el objetivo laboral
// (docs/objetivo-laboral.md §6) vive en /api/objetivos y llama a
// compilarPerfil() con forzar:true, saltándose ese límite a propósito.
export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const resultado = await compilarPerfil(userId);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }
  return NextResponse.json({ perfilCompilado: resultado.perfilCompilado });
}
