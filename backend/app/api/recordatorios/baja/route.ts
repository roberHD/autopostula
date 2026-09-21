import { NextResponse } from "next/server";
import { cambiarRecordatorios } from "@/lib/baja-recordatorios";

// docs/rafagas-y-ponerse-al-dia.md §3.8: "Cancelar suscripción" de Gmail y Outlook,
// con un clic (List-Unsubscribe-Post, RFC 8058): el cliente de correo hace un POST
// a la dirección que trae el encabezado, sin abrir ninguna página. Mismo enlace
// firmado que el del cuerpo del correo.
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const resultado = await cambiarRecordatorios(searchParams.get("u") ?? "", searchParams.get("t"), false);
  if (resultado !== "ok") {
    return NextResponse.json({ error: "Enlace inválido" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
