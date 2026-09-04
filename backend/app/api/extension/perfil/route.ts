import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Mismo patrón de auth por token que /api/ai/analizar-oferta y compañía —
// esta ruta la usa la extensión (Authorization: Bearer <apiToken>), nunca
// el dashboard web (que usa sesión de Auth.js vía /api/perfil).
async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// Perfil de solo lectura para la extensión: reemplaza los campos que antes
// el usuario tenía que tipear a mano en el popup. La edición real sigue
// viviendo únicamente en el dashboard (/dashboard/perfil).
export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const [perfil, filtros, aprobadas] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
    prisma.searchPreferences.findUnique({ where: { userId: user.id } }),
    // Banda gris aprobada, pendiente de que la extensión la tome (§8.6):
    // jobOfferId sigue null hasta que se postula de verdad -- ver
    // /api/applications, que lo enlaza cuando eso pasa. Tope bajo a
    // propósito: cada una abre una pestaña nueva, no tiene sentido
    // acumular decenas en un solo ciclo de la alarma.
    prisma.decisionOferta.findMany({
      where: { userId: user.id, fuente: "BANDA_GRIS", veredicto: "SI", jobOfferId: null },
      orderBy: { decididoEn: "asc" },
      take: 5,
    }),
  ]);

  const bandaGrisAprobadas = aprobadas
    .filter((d) => d.url && d.plataforma)
    .map((d) => ({ id: d.id, titulo: d.tituloCrudo, url: d.url, empresa: d.empresa, plataforma: d.plataforma }));

  const filtrosBusqueda = {
    palabrasIncluir: (filtros?.palabrasIncluir as string[] | null) ?? [],
    palabrasExcluir: (filtros?.palabrasExcluir as string[] | null) ?? [],
    modalidad: filtros?.modalidad ?? "cualquiera",
    jornada: filtros?.jornada ?? "cualquiera",
  };
  // Scorer local (docs/rediseno-filtrado-ofertas.md §6) -- detrás de un flag
  // que empieza apagado para todos (§13). Sin perfilCompilado no hay nada que
  // puntuar, así que usarScorerLocal nunca se activa solo sin uno.
  const scorer = {
    usarScorerLocal: !!(filtros?.usarScorerLocal && filtros?.perfilCompilado),
    perfilCompilado: filtros?.perfilCompilado ?? null,
    versionPerfil: filtros?.versionPerfil ?? 0,
  };

  if (!perfil) {
    return NextResponse.json({
      nombre: null, email: null, telefono: null, comuna: null,
      cargoObjetivo: null, expectativaRenta: null, disponibilidad: null,
      resumenProfesional: null, textoExtraido: null,
      filtrosBusqueda,
      scorer,
      bandaGrisAprobadas,
    });
  }

  return NextResponse.json({
    nombre: perfil.nombre,
    email: perfil.email,
    telefono: perfil.telefono,
    comuna: perfil.comuna,
    cargoObjetivo: perfil.cargoObjetivo,
    expectativaRenta: perfil.expectativaRenta,
    disponibilidad: perfil.disponibilidad,
    resumenProfesional: perfil.resumenProfesional,
    textoExtraido: perfil.textoExtraido,
    filtrosBusqueda,
    scorer,
    bandaGrisAprobadas,
  });
}
