import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { cerrarSolicitud, esAdmin, prorrogarSolicitud } from "@/lib/derechos";

// Para el equipo (cuentas ADMIN): responder, rechazar o prorrogar una
// solicitud (lib/derechos.ts). Cada acción le manda el correo al titular y deja
// el texto guardado como respaldo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });
  if (!(await esAdmin(userId))) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const cuerpo = await request.json().catch(() => null);
  const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";
  if (texto.length < 10) {
    return NextResponse.json({ error: "Escribe la respuesta o el motivo (al menos 10 caracteres)." }, { status: 400 });
  }

  try {
    const resultado =
      cuerpo?.accion === "responder" ? await cerrarSolicitud(id, "RESPONDIDA", texto)
      : cuerpo?.accion === "rechazar" ? await cerrarSolicitud(id, "RECHAZADA", texto)
      : cuerpo?.accion === "prorrogar" ? await prorrogarSolicitud(id, texto)
      : { ok: false as const, error: "Acción desconocida." };
    if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // El correo al titular va antes que la base: si no salió, nada cambió.
    console.error("[derechos] no se pudo completar la acción:", e);
    return NextResponse.json({ error: "No salió el correo al titular, así que no se guardó nada. Intenta de nuevo." }, { status: 502 });
  }
}
