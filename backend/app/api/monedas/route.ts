import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { CANJES, MINUTOS_CONVERSACION_PARA_MONEDA, conversacionDeHoy, saldoMonedas } from "@/lib/monedas";

// El saldo, cómo va la conversación de hoy y lo que se podrá canjear, para el
// widget de Perfil.
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const [saldo, conversacion] = await Promise.all([saldoMonedas(userId), conversacionDeHoy(userId)]);
  return NextResponse.json({
    saldo,
    conversacionHoy: { ...conversacion, meta: MINUTOS_CONVERSACION_PARA_MONEDA },
    canjes: Object.entries(CANJES).map(([id, c]) => ({ id, ...c })),
    // El canje todavía no existe: el widget lo muestra como "Próximamente".
    canjeDisponible: false,
  });
}
