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

  const [perfil, filtros] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
    prisma.searchPreferences.findUnique({ where: { userId: user.id } }),
  ]);

  const filtrosBusqueda = {
    palabrasIncluir: (filtros?.palabrasIncluir as string[] | null) ?? [],
    palabrasExcluir: (filtros?.palabrasExcluir as string[] | null) ?? [],
    modalidad: filtros?.modalidad ?? "cualquiera",
    jornada: filtros?.jornada ?? "cualquiera",
  };

  if (!perfil) {
    return NextResponse.json({
      nombre: null, email: null, telefono: null, comuna: null,
      cargoObjetivo: null, expectativaRenta: null, disponibilidad: null,
      resumenProfesional: null, textoExtraido: null,
      filtrosBusqueda,
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
  });
}
