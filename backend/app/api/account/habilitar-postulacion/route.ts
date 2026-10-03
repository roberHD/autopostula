import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { evaluarRequisitos, habilitarPostulacion } from "@/lib/habilitar-postulacion";

// docs/revision-2026-09-16.md §1.2: activar la postulación desde el panel. Las
// reglas (objetivo confirmado + perfil compilado) viven en
// lib/habilitar-postulacion.ts, porque la tarjeta del portal ("Empezar a
// postular", docs/primera-busqueda-guiada.md §11) activa con las mismas.

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { puedeActivar, motivo, yaHabilitada } = await evaluarRequisitos(userId);
  return NextResponse.json({ postulacionHabilitada: yaHabilitada, puedeActivar, motivo });
}

export async function POST() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const resultado = await habilitarPostulacion(userId);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    postulacionHabilitada: true,
    recienActivada: resultado.recienActivada,
    // Solo en la llamada que de verdad la activó (como antes: si ya estaba
    // activada, no se dice el modo y el panel no arranca nada).
    ...(resultado.modo ? { modo: resultado.modo } : {}),
  });
}
