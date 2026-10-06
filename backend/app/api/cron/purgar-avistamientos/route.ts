import { NextResponse } from "next/server";
import { purgarAvistamientos, purgarDescartes, purgarObservadas, purgarRafagas } from "@/lib/purgar-avistamientos";
import { purgarLimites } from "@/lib/limite-tasa";

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
  const rafagasBorradas = await purgarRafagas();
  const descartesBorrados = await purgarDescartes();
  const observadasBorradas = await purgarObservadas();
  // docs/revision-2026-09-28.md §17: los intentos de login, registro, etc. solo
  // sirven mientras dura su ventana (a lo más un día).
  const intentosBorrados = await purgarLimites();
  console.log(
    `Purgados ${borrados} avistamiento(s), ${rafagasBorradas} ráfaga(s), ${descartesBorrados} descarte(s), ${observadasBorradas} oferta(s) observada(s) vencidos y ${intentosBorrados} intento(s) viejos.`,
  );
  return NextResponse.json({ borrados, rafagasBorradas, descartesBorrados, observadasBorradas, intentosBorrados });
}
