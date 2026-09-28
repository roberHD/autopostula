import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { estadoExtension } from "@/lib/estado-extension";
import { obtenerEstadoPostulaciones } from "@/lib/postulacion-limits";

/**
 * Lo que muestra el popup de la extensión (docs/estrategia-y-rediseno.md §6).
 *
 * El popup dejó de ser un formulario: ahora dice en qué está la máquina y qué
 * falta hacer. Todo eso vive en la cuenta, no en este navegador -- las cifras
 * del log local solo contaban lo que había pasado en ESTE computador.
 */

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const hoy = new Date();
  const inicioDia = new Date(hoy);
  inicioDia.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);
  manana.setHours(23, 59, 59, 999);

  const [enviadasHoy, descartadasHoy, porDecidir, cuentas, cupo] = await Promise.all([
    prisma.application.count({
      where: { userId: user.id, enviadaEn: { gte: inicioDia }, estadoActual: { not: "INCOMPLETA" } },
    }),
    prisma.descarte.count({ where: { userId: user.id, vistoEn: { gte: inicioDia } } }),
    prisma.decisionOferta.findMany({
      where: {
        userId: user.id,
        fuente: "BANDA_GRIS",
        veredicto: "PENDIENTE",
        OR: [{ venceEn: null }, { venceEn: { gte: hoy } }],
      },
      select: { venceEn: true },
    }),
    prisma.platformAccount.findMany({
      where: { userId: user.id },
      select: { activa: true, platform: { select: { nombre: true } } },
      orderBy: { platform: { nombre: "asc" } },
    }),
    obtenerEstadoPostulaciones(user.id),
  ]);

  return NextResponse.json({
    nombre: user.nombre?.trim().split(/\s+/)[0] ?? null,
    estado: estadoExtension(user),
    cifras: {
      enviadasHoy,
      descartadasHoy,
      // null = plan sin tope (admin): el popup dice "sin tope" en vez de un número.
      disponibles: cupo.restantes,
    },
    porDecidir: {
      total: porDecidir.length,
      vencenManana: porDecidir.filter((d) => d.venceEn && d.venceEn <= manana).length,
    },
    portales: cuentas.map((c) => ({ nombre: c.platform.nombre, conectado: c.activa })),
  });
}
