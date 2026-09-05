import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { compilarPerfil } from "@/lib/compilar-perfil";

// docs/objetivo-laboral.md §6: endpoint propio para el objetivo laboral,
// separado de /api/perfil (que mezcla datos de contacto y no dispara nada).
// Cambiar el objetivo acá SIEMPRE dispara la cadena completa: guardar,
// marcar confirmado, recompilar el perfil, y avisar si conviene rehacer el
// triaje -- es la pieza que arregla el bug vivo de P2 (cambiar de rubro
// dejaba el scorer puntuando con el rubro viejo, sin avisar a nadie).

export async function GET() {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const [usuario, objetivos, cv] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { objetivoConfirmado: true } }),
    prisma.objetivoLaboral.findMany({ where: { userId }, orderBy: { orden: "asc" } }),
    prisma.cvProfile.findUnique({ where: { userId }, select: { cargoObjetivo: true } }),
  ]);

  return NextResponse.json({
    objetivoConfirmado: !!usuario?.objetivoConfirmado,
    objetivos: objetivos.map((o) => ({ id: o.id, ciuo: o.ciuo, etiqueta: o.etiqueta, peso: o.peso })),
    // Sugerencia sin confirmar -- lo que la IA infirió del CV (§1: "propone,
    // no decide"). Solo tiene sentido mostrarla si todavía no hay nada
    // confirmado; una vez confirmado, esto es historia.
    sugerenciaCv: usuario?.objetivoConfirmado ? null : cv?.cargoObjetivo ?? null,
  });
}

// Gran grupo = primer dígito del código CIUO (docs/rediseno-filtrado-ofertas.md
// §8.3, misma convención que lib/triaje.ts). Cambiar de gran grupo es cambiar
// de rubro (§6): "5223 (vendedor) -> 2512 (desarrollador)" pasa de "5" a "2".
function granGrupo(ciuo: string | null | undefined): string | null {
  return ciuo ? ciuo[0] : null;
}

export async function PUT(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const objetivosIn = body?.objetivos;
  if (!Array.isArray(objetivosIn) || !objetivosIn.length) {
    return NextResponse.json({ error: "Falta al menos un objetivo" }, { status: 400 });
  }
  if (objetivosIn.length > 4) {
    return NextResponse.json({ error: "Como máximo 4 objetivos a la vez" }, { status: 400 });
  }
  for (const o of objetivosIn) {
    if (!o?.etiqueta || typeof o.etiqueta !== "string") {
      return NextResponse.json({ error: "Cada objetivo necesita una etiqueta" }, { status: 400 });
    }
  }

  // El principal ANTES del cambio (mayor peso) -- se necesita para comparar
  // gran grupo contra el principal DESPUÉS, así que se lee antes de borrar.
  const anteriores = await prisma.objetivoLaboral.findMany({ where: { userId }, orderBy: { peso: "desc" } });
  const principalAnterior = anteriores[0] ?? null;

  // Se ordena por peso ANTES de asignar orden -- estado-automatico y el
  // triaje leen con orderBy: { orden: "asc" } asumiendo que objetivos[0] es
  // el principal. Sin este sort, un cliente que mandara [secundario 0.6,
  // principal 1.0] dejaría esos lectores priorizando el objetivo equivocado.
  const datos = [...objetivosIn]
    .sort((a: any, b: any) => (typeof b.peso === "number" ? b.peso : 1.0) - (typeof a.peso === "number" ? a.peso : 1.0))
    .map((o: any, i: number) => ({
      userId,
      ciuo: typeof o.ciuo === "string" && /^\d{4}$/.test(o.ciuo) ? o.ciuo : null,
      etiqueta: String(o.etiqueta).trim().slice(0, 120),
      peso: typeof o.peso === "number" ? Math.max(0, Math.min(1, o.peso)) : 1.0,
      orden: i,
    }));

  await prisma.$transaction([
    prisma.objetivoLaboral.deleteMany({ where: { userId } }),
    prisma.objetivoLaboral.createMany({ data: datos }),
    prisma.user.update({ where: { id: userId }, data: { objetivoConfirmado: true } }),
  ]);

  // datos ya viene ordenado por peso desc -- el primero es el principal.
  const principalNuevo = datos[0];

  // Si es la primera vez que esta persona confirma un objetivo, no hay nada
  // que "cambió" -- está formalizando lo que antes era solo una sugerencia
  // del CV, no cambiando de rubro. Recién a partir de la SEGUNDA vez tiene
  // sentido comparar: ahí sí, sin CIUO de un lado u otro no se puede
  // comparar con certeza, así que por las dudas se sugiere re-triaje (más
  // barato ofrecerlo de más que dejar a alguien puntuando con el rubro
  // viejo sin saberlo).
  let sugerirRetriaje = false;
  if (principalAnterior) {
    const grupoAnterior = granGrupo(principalAnterior.ciuo);
    const grupoNuevo = granGrupo(principalNuevo?.ciuo);
    sugerirRetriaje = !grupoAnterior || !grupoNuevo || grupoAnterior !== grupoNuevo;
  }

  const resultado = await compilarPerfil(userId, { forzar: true });
  if (!resultado.ok) {
    // El objetivo ya quedó guardado y confirmado aunque la IA falle acá --
    // no tiene sentido perder la declaración del usuario por un error de
    // compilación puntual. Se puede reintentar compilar después.
    return NextResponse.json(
      { ok: true, guardado: true, sugerirRetriaje, perfilCompilado: null, avisoCompilacion: resultado.error },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, guardado: true, sugerirRetriaje, perfilCompilado: resultado.perfilCompilado });
}
