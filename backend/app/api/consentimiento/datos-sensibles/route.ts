import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { registrarDatosSensibles, revocarDatosSensibles } from "@/lib/consentimiento";

// La autorización para tratar los datos sensibles del CV (Ley 21.719, art. 16;
// lib/consentimiento.ts), aparte de la subida del CV:
//   POST   autorizar sin volver a subirlo (quien ya tenía un CV de antes).
//   DELETE retirarla: se borra el CV. El art. 12 pide que retirar el
//          consentimiento sea tan fácil como darlo y esté siempre disponible.

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });
  await registrarDatosSensibles(userId);
  return NextResponse.json({ ok: true, autorizaDatosSensibles: true });
}

export async function DELETE() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });
  await revocarDatosSensibles(userId);
  return NextResponse.json({ ok: true, autorizaDatosSensibles: false });
}
