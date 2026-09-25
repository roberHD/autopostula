import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { estadoExtension } from "@/lib/estado-extension";

/**
 * Cómo trabaja la extensión, desde el panel (docs/estrategia-y-rediseno.md §6).
 *
 * El mismo estado que lee y escribe la extensión en /api/extension/estado,
 * pero con sesión: lo que se toca acá se ve en el popup y al revés. Acá vive
 * también la lista de datos sueltos para la IA, que antes solo existía dentro
 * del popup de un navegador.
 */

const CAMPOS = {
  busquedaAutomaticaActiva: true,
  soloObservar: true,
  revisarAntesDeEnviar: true,
  postulacionHabilitada: true,
  infoAdicional: true,
} as const;

const MAX_INFO = 30;
const MAX_LARGO = 300;

function limpiarInfo(valor: unknown) {
  if (!Array.isArray(valor)) return null;
  return valor
    .map((it: any) => ({ id: String(it?.id ?? ""), texto: String(it?.texto ?? "").trim().slice(0, MAX_LARGO) }))
    .filter((it) => it.texto)
    .slice(0, MAX_INFO);
}

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: CAMPOS });
  if (!user) {
    return NextResponse.json({ error: "No encontramos tu cuenta" }, { status: 404 });
  }

  return NextResponse.json({
    estado: estadoExtension(user),
    infoAdicional: Array.isArray(user.infoAdicional) ? user.infoAdicional : [],
  });
}

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.soloObservar === "boolean") data.soloObservar = body.soloObservar;
  if (typeof body.revisarAntes === "boolean") data.revisarAntesDeEnviar = body.revisarAntes;
  if (body.info !== undefined) {
    const info = limpiarInfo(body.info);
    if (!info) {
      return NextResponse.json({ error: "Formato inválido en los datos para la IA" }, { status: 400 });
    }
    data.infoAdicional = info;
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
  }

  const user = await prisma.user.update({ where: { id: userId }, data, select: CAMPOS });

  return NextResponse.json({
    ok: true,
    estado: estadoExtension(user),
    infoAdicional: Array.isArray(user.infoAdicional) ? user.infoAdicional : [],
  });
}
