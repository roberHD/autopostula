import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { LISTA_LIMPIEZA_CL } from "@/scripts/limpieza/cl";

// docs/revision-2026-09-16.md §2.1: la ubicación se declara con opciones
// cerradas (región + comuna), no texto libre -- este endpoint le da al
// onboarding y a Filtros la misma lista de las 346 comunas (con su región)
// que ya usa scripts/limpieza/cl.ts para el parser de títulos, en vez de
// mantener una segunda copia que se pueda desincronizar.

const NOMBRE_REGION: Record<string, string> = {
  AP: "Arica y Parinacota",
  TA: "Tarapacá",
  AN: "Antofagasta",
  AT: "Atacama",
  CO: "Coquimbo",
  VA: "Valparaíso",
  RM: "Metropolitana de Santiago",
  OH: "O'Higgins",
  ML: "Maule",
  NB: "Ñuble",
  BI: "Biobío",
  AR: "La Araucanía",
  LR: "Los Ríos",
  LL: "Los Lagos",
  AI: "Aysén",
  MA: "Magallanes y la Antártica",
};

function tituloCaso(s: string): string {
  return s.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const comunas = LISTA_LIMPIEZA_CL.filter((t) => t.tipo === "comuna").map((t: any) => ({
    nombre: tituloCaso(t.termino),
    region: t.region,
  }));

  const regiones = Object.entries(NOMBRE_REGION).map(([codigo, nombre]) => ({ codigo, nombre }));

  return NextResponse.json({ regiones, comunas });
}
