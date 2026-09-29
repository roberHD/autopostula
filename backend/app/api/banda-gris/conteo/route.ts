import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { contarPorDecidir } from "@/lib/panel/listas";

// Solo cuántas hay en "Por decidir", para el número del menú lateral. Antes el
// menú pedía /api/banda-gris entero en cada cambio de página
// (docs/optimizacion-2026-09-29.md §3).
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  return NextResponse.json({ pendientes: await contarPorDecidir(userId) });
}
