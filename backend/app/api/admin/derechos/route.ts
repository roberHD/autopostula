import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { crearSolicitud, esAdmin } from "@/lib/derechos";
import { DETALLE_MAX, DETALLE_MIN, TIPOS_DERECHO, type TipoDerecho } from "@/lib/textos-derechos";
import { normalizarEmail } from "@/lib/entrada";

// Para el equipo (cuentas ADMIN), /dashboard/derechos:
//   GET  todas las solicitudes, las abiertas primero.
//   POST registrar una que llegó por correo, con la fecha en que llegó: el plazo
//        legal corre desde ahí, no desde que se registra.

async function soloAdmin() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return { error: NextResponse.json({ error }, { status: 401 }) };
  if (!(await esAdmin(userId))) return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  return { userId };
}

export async function GET() {
  const acceso = await soloAdmin();
  if (acceso.error) return acceso.error;

  const solicitudes = await prisma.solicitudDerecho.findMany({ orderBy: { recibidaEn: "desc" }, take: 300 });
  const abierta = (e: string) => e === "RECIBIDA" || e === "PRORROGADA";
  solicitudes.sort((a, b) =>
    abierta(a.estado) === abierta(b.estado)
      ? abierta(a.estado) ? a.venceEn.getTime() - b.venceEn.getTime() : 0
      : abierta(a.estado) ? -1 : 1
  );
  return NextResponse.json({ solicitudes });
}

export async function POST(request: Request) {
  const acceso = await soloAdmin();
  if (acceso.error) return acceso.error;

  const cuerpo = await request.json().catch(() => null);
  const email = normalizarEmail(cuerpo?.email);
  const tipo = cuerpo?.tipo as TipoDerecho;
  const detalle = typeof cuerpo?.detalle === "string" ? cuerpo.detalle.trim() : "";
  const recibidaEn = cuerpo?.recibidaEn ? new Date(cuerpo.recibidaEn) : new Date();

  if (!email) return NextResponse.json({ error: "Falta un correo válido." }, { status: 400 });
  if (!TIPOS_DERECHO.includes(tipo)) return NextResponse.json({ error: "Falta el tipo de derecho." }, { status: 400 });
  if (detalle.length < DETALLE_MIN || detalle.length > DETALLE_MAX) {
    return NextResponse.json({ error: "Copia lo que pidió la persona (al menos 10 caracteres)." }, { status: 400 });
  }
  if (Number.isNaN(recibidaEn.getTime()) || recibidaEn.getTime() > Date.now()) {
    return NextResponse.json({ error: "La fecha en que llegó no es válida." }, { status: 400 });
  }

  const cuenta = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  const solicitud = await crearSolicitud({ userId: cuenta?.id ?? null, email, tipo, detalle, origen: "correo", recibidaEn });
  return NextResponse.json({ ok: true, id: solicitud.id });
}
