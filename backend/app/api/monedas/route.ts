import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { CANJES, saldoMonedas } from "@/lib/monedas";

// El saldo y lo que se podrá canjear, para el widget de Perfil.
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  return NextResponse.json({
    saldo: await saldoMonedas(userId),
    canjes: Object.entries(CANJES).map(([id, c]) => ({ id, ...c })),
    // El canje todavía no existe: el widget lo muestra como "Próximamente".
    canjeDisponible: false,
  });
}
