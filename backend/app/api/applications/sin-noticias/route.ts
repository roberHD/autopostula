import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { listarSinNoticias } from "@/lib/panel/listas";

/**
 * Las postulaciones por las que toca preguntar "¿Supiste algo?" hoy
 * (docs/estado-real-de-postulaciones.md §6.1): desde los 5 días de enviadas,
 * nunca dos veces en 7 días y nunca después de 3 "Nada todavía". La lógica vive
 * en lib/panel/listas.ts: la página de Postulaciones la arma en el servidor
 * (docs/optimizacion-2026-09-29.md §1).
 */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  return NextResponse.json(await listarSinNoticias(userId));
}
