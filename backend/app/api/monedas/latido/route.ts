import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { anotarHoraDeUso, saldoMonedas } from "@/lib/monedas";

// El panel avisa que está abierto y a la vista (app/dashboard/LatidoUso.tsx).
// La primera vez en cada hora de reloj gana la moneda; las demás no suman.
export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const ganada = await anotarHoraDeUso(userId, "panel");
  return NextResponse.json({ ok: true, ganada, saldo: await saldoMonedas(userId) });
}
