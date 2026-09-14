import { NextResponse } from "next/server";
import { purgarAvistamientos } from "@/lib/purgar-avistamientos";

// La corre el cron de Vercel una vez al día (vercel.json). Vercel manda el
// header `Authorization: Bearer <CRON_SECRET>` solo si esa variable existe en
// el proyecto.
//
// Sin CRON_SECRET se rechaza todo, en vez de dejar la ruta abierta: el purgado
// es inofensivo de disparar, pero una ruta pública que borra filas no debería
// depender de que lo sea.
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("Falta CRON_SECRET -- el purgado de avistamientos no está corriendo");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const borrados = await purgarAvistamientos();
  console.log(`Purgados ${borrados} avistamiento(s) vencidos.`);
  return NextResponse.json({ borrados });
}
