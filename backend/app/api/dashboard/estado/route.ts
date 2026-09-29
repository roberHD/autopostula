import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { armarEstadoPanel } from "@/lib/panel/estado";

// Estado de la máquina, para la barra de arriba del panel. La lógica vive en
// lib/panel/estado.ts (docs/optimizacion-2026-09-29.md §1).
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  return NextResponse.json(await armarEstadoPanel(userId));
}
