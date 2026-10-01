import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { LISTA_LIMPIEZA_CL } from "@/scripts/limpieza/cl";
import { nombrePropio } from "@/lib/text";
import { expandirUbicacionDeclarada } from "@/lib/compilar-perfil";
import type { UbicacionDeclarada } from "@/lib/entrada";

/**
 * "Agregar a mi perfil" desde el aviso de la extensión: el resumen del escaneo
 * dice "15 descartadas — la mayoría: santiago no está en tus comunas", y la
 * persona puede sumar esa comuna a su búsqueda sin ir al panel.
 *
 *   POST { agregarComuna: "santiago" }  (Authorization: Bearer <apiToken>)
 *
 * Toca los dos lugares donde vive la ubicación: la declarada (lo que muestra
 * Filtros) y la copia dentro de perfilCompilado (lo que lee el scorer). La
 * segunda se recalcula con la misma expansión determinista que usa
 * compilarPerfil, sin IA: así la próxima búsqueda ya la usa, sin recompilar
 * ni gastar el cupo de 24 horas de "Actualizar mi búsqueda".
 */

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// La comuna tiene que ser una de las 346 reales (opciones cerradas, igual que
// el selector del panel). Se guarda con su nombre bien escrito ("Estación
// Central"), prefiriendo la variante con tilde de la lista.
function buscarComuna(texto: string) {
  const clave = sinTildes(texto);
  let encontrada: { nombre: string; region: string } | null = null;
  for (const t of LISTA_LIMPIEZA_CL as any[]) {
    if (t.tipo !== "comuna" || sinTildes(t.termino) !== clave) continue;
    const tieneTilde = sinTildes(t.termino) !== t.termino;
    if (!encontrada || tieneTilde) encontrada = { nombre: nombrePropio(t.termino), region: t.region };
  }
  return encontrada;
}

export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const pedida = typeof body?.agregarComuna === "string" ? body.agregarComuna.slice(0, 60) : "";
  const comuna = pedida ? buscarComuna(pedida) : null;
  if (!comuna) return NextResponse.json({ error: "Comuna desconocida" }, { status: 400 });

  const prefs =
    (await prisma.searchPreferences.findUnique({ where: { userId: user.id } })) ??
    (await prisma.searchPreferences.create({ data: { userId: user.id } }));

  const compilado = (prefs.perfilCompilado as Record<string, any> | null) || null;
  const declarada = prefs.ubicacionDeclarada as UbicacionDeclarada | null;

  // Cuentas sin ubicación declarada (anteriores al onboarding nuevo): sus
  // comunas vienen del perfil compilado. Se parte de esas para no perderlas.
  const base: UbicacionDeclarada = declarada
    ? {
        regiones: declarada.regiones ?? [],
        comunas: declarada.comunas ?? [],
        todaLaRegion: !!declarada.todaLaRegion,
        aceptaRemoto: !!declarada.aceptaRemoto,
      }
    : {
        regiones: [],
        comunas: ((compilado?.ubicacion?.comunas as string[] | undefined) ?? []).map((c) => buscarComuna(c)?.nombre ?? c),
        todaLaRegion: false,
        aceptaRemoto: !!compilado?.ubicacion?.aceptaRemoto,
      };

  const yaEstaba = base.comunas.some((c) => sinTildes(c) === sinTildes(comuna.nombre));
  const nueva: UbicacionDeclarada = {
    ...base,
    comunas: yaEstaba ? base.comunas : [...base.comunas, comuna.nombre],
    // La región se suma para que el selector de Filtros la muestre. Con "toda
    // la región" no: ese interruptor vale para TODAS las regiones elegidas, y
    // sumar una abriría la región entera cuando la persona pidió una comuna.
    regiones:
      base.todaLaRegion || base.regiones.includes(comuna.region) ? base.regiones : [...base.regiones, comuna.region],
  };

  await prisma.searchPreferences.update({
    where: { userId: user.id },
    data: {
      ubicacionDeclarada: nueva as unknown as Prisma.InputJsonValue,
      ...(compilado
        ? { perfilCompilado: { ...compilado, ubicacion: expandirUbicacionDeclarada(nueva) } as Prisma.InputJsonValue }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, comuna: comuna.nombre, yaEstaba });
}
