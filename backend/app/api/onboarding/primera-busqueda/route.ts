import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { filtrosDeLaCuenta, urlDeBusqueda } from "@/lib/busqueda-en-portal";

/**
 * "Probémosla ahora" al cerrar el onboarding (docs/panel-de-revision-en-el-portal.md
 * §1): el portal que la persona conectó, con la búsqueda armada igual que la
 * arma la extensión y la tarjeta "Probemos" de Hoy (lib/panel/hoy.ts): el
 * objetivo principal, o el cargo del CV si no declaró ninguno, y sus filtros.
 *
 * Responde { portal, url }; url es null si falta el portal o el objetivo, y
 * entonces el onboarding no ofrece el atajo.
 */
export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [objetivo, cv, preferencias, cuenta] = await Promise.all([
    prisma.objetivoLaboral.findFirst({ where: { userId }, orderBy: { orden: "asc" }, select: { etiqueta: true } }),
    prisma.cvProfile.findUnique({ where: { userId }, select: { cargoObjetivo: true } }),
    prisma.searchPreferences.findUnique({ where: { userId }, select: { jornada: true, modalidad: true, perfilCompilado: true } }),
    prisma.platformAccount.findFirst({
      where: { userId, activa: true },
      orderBy: { platform: { nombre: "asc" } },
      select: { platform: { select: { nombre: true } } },
    }),
  ]);

  const etiqueta = objetivo?.etiqueta ?? cv?.cargoObjetivo ?? null;
  const portal = cuenta?.platform.nombre ?? null;
  const url = portal && etiqueta ? urlDeBusqueda(portal, etiqueta, filtrosDeLaCuenta(preferencias)) : null;
  return NextResponse.json({ portal, url });
}
