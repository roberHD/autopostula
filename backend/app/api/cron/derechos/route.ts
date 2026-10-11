import { NextResponse } from "next/server";
import { avisarSolicitudesPorVencer } from "@/lib/derechos";

// Una vez al día (vercel.json): avisa a la casilla de soporte de las solicitudes
// de derechos que vencen en 5 días o menos, o que ya vencieron (lib/derechos.ts).
// Sin CRON_SECRET se rechaza todo, igual que los otros cron.
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("Falta CRON_SECRET -- los avisos de solicitudes de derechos no están corriendo");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const avisadas = await avisarSolicitudesPorVencer();
  return NextResponse.json({ ok: true, avisadas });
}
