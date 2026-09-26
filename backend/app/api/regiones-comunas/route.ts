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

  // LISTA_LIMPIEZA_CL trae cada comuna dos veces, con tilde y sin ella
  // ("conchalí" y "conchali"): eso es correcto para el parser de títulos, que
  // tiene que reconocer las dos formas como las escribe la gente. Pero en un
  // selector visible se ven como dos comunas distintas -- son 83 pares sobre
  // 437 entradas. Se deja una sola por comuna, prefiriendo la acentuada.
  const porComuna = new Map<string, { nombre: string; region: string }>();
  for (const t of LISTA_LIMPIEZA_CL.filter((x) => x.tipo === "comuna") as any[]) {
    const clave = `${t.region}|${t.termino.normalize("NFD").replace(/[̀-ͯ]/g, "")}`;
    const yaEsta = porComuna.get(clave);
    // La variante con tilde cambia al quitarle los diacríticos; la otra no.
    const tieneTilde = t.termino.normalize("NFD").replace(/[̀-ͯ]/g, "") !== t.termino;
    if (!yaEsta || tieneTilde) {
      porComuna.set(clave, { nombre: tituloCaso(t.termino), region: t.region });
    }
  }
  const comunas = [...porComuna.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const regiones = Object.entries(NOMBRE_REGION).map(([codigo, nombre]) => ({ codigo, nombre }));

  return NextResponse.json({ regiones, comunas });
}
