import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { claveLimite, LIMITES, permitirIntento } from "@/lib/limite-tasa";
import { crearSolicitud } from "@/lib/derechos";
import { DETALLE_MAX, DETALLE_MIN, TIPOS_DERECHO, type TipoDerecho } from "@/lib/textos-derechos";

// Ajustes → "Ejercer un derecho" (lib/derechos.ts; Ley 21.719, art. 11).
//   GET  las solicitudes de la cuenta, con su estado, plazo y respuesta.
//   POST una nueva: acuse de recibo al titular y aviso al equipo.

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const solicitudes = await prisma.solicitudDerecho.findMany({
    where: { userId },
    orderBy: { recibidaEn: "desc" },
    select: {
      id: true, tipo: true, detalle: true, estado: true, recibidaEn: true, venceEn: true,
      prorrogadaEn: true, motivoProrroga: true, respondidaEn: true, respuesta: true,
    },
  });
  return NextResponse.json({ solicitudes });
}

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const cuerpo = await request.json().catch(() => null);
  const tipo = cuerpo?.tipo as TipoDerecho;
  const detalle = typeof cuerpo?.detalle === "string" ? cuerpo.detalle.trim() : "";
  if (!TIPOS_DERECHO.includes(tipo)) {
    return NextResponse.json({ error: "Elige qué derecho quieres ejercer." }, { status: 400 });
  }
  if (detalle.length < DETALLE_MIN || detalle.length > DETALLE_MAX) {
    return NextResponse.json(
      { error: `Cuéntanos qué necesitas en al menos ${DETALLE_MIN} caracteres (y como máximo ${DETALLE_MAX}).` },
      { status: 400 }
    );
  }
  if (!(await permitirIntento(claveLimite("derechos-usuario", userId), LIMITES.solicitudesDerechoPorUsuario))) {
    return NextResponse.json(
      { error: "Ya enviaste varias solicitudes hoy. Si necesitas algo más, escríbenos al correo de contacto." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const solicitud = await crearSolicitud({ userId, email: user.email, tipo, detalle, origen: "panel" });
  return NextResponse.json({ ok: true, id: solicitud.id, venceEn: solicitud.venceEn });
}
