import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const CAMPOS_PARA_COMPLETITUD = [
  "nombre", "email", "telefono", "comuna", "rut", "cargoObjetivo",
  "expectativaRenta", "disponibilidad", "modalidad", "resumenProfesional",
] as const;

function calcularCompletitud(perfil: any) {
  if (!perfil) return 0;
  let llenos = 0;
  for (const campo of CAMPOS_PARA_COMPLETITUD) {
    if (perfil[campo] && String(perfil[campo]).trim()) llenos++;
  }
  const totalCampos = CAMPOS_PARA_COMPLETITUD.length + 2; // + experiencia + habilidades
  if (Array.isArray(perfil.experiencia) && perfil.experiencia.length) llenos++;
  if (Array.isArray(perfil.habilidades) && perfil.habilidades.length) llenos++;
  return Math.round((llenos / totalCampos) * 100);
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const perfil = await prisma.cvProfile.findUnique({ where: { userId } });
  return NextResponse.json({ ...(perfil || {}), completitud: calcularCompletitud(perfil) });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const {
    nombre, email, telefono, comuna, rut,
    cargoObjetivo, expectativaRenta, disponibilidad, modalidad,
    resumenProfesional, experiencia, habilidades,
  } = body || {};

  const datos = {
    nombre, email, telefono, comuna, rut,
    cargoObjetivo, expectativaRenta, disponibilidad, modalidad,
    resumenProfesional, experiencia, habilidades,
  };

  const perfil = await prisma.cvProfile.upsert({
    where: { userId },
    update: datos,
    create: { userId, ...datos },
  });

  return NextResponse.json({ ...perfil, completitud: calcularCompletitud(perfil) });
}
