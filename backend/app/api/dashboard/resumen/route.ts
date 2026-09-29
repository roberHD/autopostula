import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { armarResumenHoy } from "@/lib/panel/hoy";

// Todo lo que necesita la página Hoy. La lógica vive en lib/panel/hoy.ts: la
// página la usa directo en el servidor y esta ruta queda para cuando se vuelve
// a pedir desde el navegador (docs/optimizacion-2026-09-29.md §1).
export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  return NextResponse.json(await armarResumenHoy(userId));
}
