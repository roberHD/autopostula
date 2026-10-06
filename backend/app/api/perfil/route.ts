import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listaDeTextos, textoCorto } from "@/lib/entrada";
import { formatearRenta, formatearRut } from "@/lib/formato-perfil";
import { autorizaDatosSensibles } from "@/lib/consentimiento";

// docs/revision-2026-09-28.md §25: cada campo con su tipo y su largo. Antes
// entraba cualquier cosa (un objeto en vez de texto terminaba en error 500, y
// un texto enorme viajaba después en cada llamada de IA).
function campoTexto(valor: unknown, max: number) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  return textoCorto(valor, max);
}

// El panel ya formatea al escribir; esto cubre lo que llega por otro lado
// (lo que la IA lee del CV, el onboarding, la API).
function conFormato(valor: string | null | undefined, formato: (t: string) => string) {
  return typeof valor === "string" ? formato(valor) : valor;
}

function experienciaValida(valor: unknown) {
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((e) => e && typeof e === "object")
    .slice(0, 15)
    .map((e: any) => ({
      cargo: textoCorto(e.cargo, 150) ?? "",
      empresa: textoCorto(e.empresa, 150) ?? "",
      periodo: textoCorto(e.periodo, 60) ?? "",
    }));
}

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

  const [perfil, autoriza] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId } }),
    autorizaDatosSensibles(userId),
  ]);
  return NextResponse.json({
    ...(perfil || {}),
    completitud: calcularCompletitud(perfil),
    // Ley 21.719 (lib/consentimiento.ts): sin esto, la pantalla pide la
    // autorización antes de dejar subir el CV.
    autorizaDatosSensibles: autoriza,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) || {};

  const datos = {
    nombre: campoTexto(body.nombre, 120),
    email: campoTexto(body.email, 200),
    telefono: campoTexto(body.telefono, 40),
    comuna: campoTexto(body.comuna, 80),
    rut: conFormato(campoTexto(body.rut, 20), formatearRut),
    cargoObjetivo: campoTexto(body.cargoObjetivo, 150),
    expectativaRenta: conFormato(campoTexto(body.expectativaRenta, 80), formatearRenta),
    disponibilidad: campoTexto(body.disponibilidad, 150),
    modalidad: campoTexto(body.modalidad, 40),
    resumenProfesional: campoTexto(body.resumenProfesional, 2000),
    experiencia: experienciaValida(body.experiencia),
    habilidades: body.habilidades === undefined ? undefined : listaDeTextos(body.habilidades, 30, 80),
  };

  const perfil = await prisma.cvProfile.upsert({
    where: { userId },
    update: datos,
    create: { userId, ...datos },
  });

  return NextResponse.json({ ...perfil, completitud: calcularCompletitud(perfil) });
}
