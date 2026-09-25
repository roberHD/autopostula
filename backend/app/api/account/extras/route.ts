import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { PAQUETES, PREMIOS, saldoExtras, obtenerCodigoInvitacion, premiarPerfilCompleto } from "@/lib/extras";
import { getBaseUrl } from "@/lib/base-url";

/**
 * Postulaciones extra y premios (docs/estrategia-y-rediseno.md §7).
 *
 * Lo que necesita la sección "Postulaciones extra" de Tu plan: cuántas te
 * quedan, de dónde salieron, los paquetes que puedes comprar y tu enlace para
 * invitar.
 */

const ETIQUETA_MOTIVO: Record<string, string> = {
  COMPRA: "Compraste",
  PREMIO_INVITACION: "Premio por invitar",
  PREMIO_PERFIL: "Premio por completar tu perfil",
  USO: "Usaste una",
  AJUSTE: "Ajuste",
};

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  // Por si el perfil quedó completo antes de que existiera el premio: se
  // revisa acá también, no solo al momento de completarlo.
  await premiarPerfilCompleto(userId).catch(() => {});

  const [saldo, movimientos, codigo, invitados] = await Promise.all([
    saldoExtras(userId),
    prisma.postulacionExtra.findMany({
      where: { userId },
      orderBy: { creadoEn: "desc" },
      take: 12,
      select: { id: true, cantidad: true, motivo: true, detalle: true, creadoEn: true },
    }),
    obtenerCodigoInvitacion(userId),
    prisma.user.count({ where: { invitadoPorId: userId, emailVerificado: { not: null } } }),
  ]);

  return NextResponse.json({
    saldo,
    movimientos: movimientos.map((m) => ({
      id: m.id,
      cantidad: m.cantidad,
      etiqueta: ETIQUETA_MOTIVO[m.motivo] ?? m.motivo,
      detalle: m.detalle,
      en: m.creadoEn.toISOString(),
    })),
    paquetes: Object.entries(PAQUETES).map(([id, p]) => ({ id, ...p })),
    premios: PREMIOS,
    invitacion: {
      codigo,
      // El enlace que se comparte. Va a la página de registro con el código:
      // quien entra ni se entera del código, solo se registra.
      url: `${getBaseUrl()}/registro?ref=${codigo}`,
      // Solo los que verificaron su correo: son los que pagaron premio.
      aceptadas: invitados,
    },
  });
}
