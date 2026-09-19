import { NextResponse } from "next/server";
import { ejecutarRecordatorios } from "@/lib/recordatorio-rafaga";

// docs/rafagas-y-ponerse-al-dia.md §3.8: la corre el cron diario de Vercel (vercel.json).
// Vercel Hobby permite crons diarios con ±59 min, por eso las reglas son por
// ventanas de horas y no por una hora exacta.
//
// Sin CRON_SECRET se rechaza todo, igual que el purgado de avistamientos: esta ruta
// manda correos, y una ruta pública que manda correos no debe quedar abierta.
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error("Falta CRON_SECRET -- el recordatorio de ráfagas no está corriendo");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await ejecutarRecordatorios();
  console.log(
    `[recordatorio-rafaga] ${resultado.enviados} enviado(s), ${resultado.fallidos} fallido(s), ${resultado.diferidos} diferido(s), de ${resultado.candidatos} candidato(s).`,
  );
  return NextResponse.json(resultado);
}
