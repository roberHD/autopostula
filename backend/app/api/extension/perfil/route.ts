import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { objetivosPermitenDirectivo } from "@/lib/nivel-cargo";
import { estadoExtension } from "@/lib/estado-extension";
import { AMPLITUD_POR_DEFECTO, esAmplitud, rolesPorAmplitud } from "@/lib/amplitud";
import { requisitosDelCandidato } from "@/lib/requisitos-cv";
import { urlDePortal } from "@/lib/entrada";

// Mismo patrón de auth por token que /api/ai/analizar-oferta y compañía —
// esta ruta la usa la extensión (Authorization: Bearer <apiToken>), nunca
// el dashboard web (que usa sesión de Auth.js vía /api/perfil).
async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// Cuánto se sigue intentando enviar una oferta aprobada en "Por decidir".
const DIAS_PARA_ENVIAR_APROBADA = 14;

// Perfil de solo lectura para la extensión: reemplaza los campos que antes
// el usuario tenía que tipear a mano en el popup. La edición real sigue
// viviendo únicamente en el dashboard (/dashboard/perfil).
export async function GET(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const [perfil, filtros, aprobadas, objetivos] = await Promise.all([
    prisma.cvProfile.findUnique({ where: { userId: user.id } }),
    prisma.searchPreferences.findUnique({ where: { userId: user.id } }),
    // Banda gris aprobada, pendiente de que la extensión la tome (§8.6):
    // jobOfferId sigue null hasta que se postula de verdad -- ver
    // /api/applications, que lo enlaza cuando eso pasa. Tope bajo a
    // propósito: cada una abre una pestaña nueva, no tiene sentido
    // acumular decenas en un solo ciclo de la alarma.
    // docs/revision-2026-09-28.md §6: antes salían siempre las 5 MÁS ANTIGUAS.
    // Una aprobada que no se puede enviar nunca (ya estaba postulada, se saltó
    // en la revisión...) quedaba ahí para siempre, y con 5 así ninguna
    // aprobación nueva se enviaba más. Ahora primero las recientes, y pasados
    // 14 días se dejan de intentar (siguen siendo un "sí" para el perfil).
    prisma.decisionOferta.findMany({
      where: {
        userId: user.id,
        fuente: "BANDA_GRIS",
        veredicto: "SI",
        jobOfferId: null,
        // Sin enlace o sin portal no hay cómo enviarla: que no ocupe uno de
        // los 5 cupos (igual que el conteo de lib/recordatorio-rafaga.ts).
        url: { not: null },
        plataforma: { not: null },
        // Una fila sin fecha (no debería haber) no se deja afuera: la extensión
        // igual la cierra a los 3 intentos fallidos.
        OR: [{ decididoEn: null }, { decididoEn: { gte: new Date(Date.now() - DIAS_PARA_ENVIAR_APROBADA * 24 * 3_600_000) } }],
      },
      orderBy: { decididoEn: "desc" },
      take: 5,
    }),
    // §2.7: el nivel del cargo se calcula acá, en cada consulta, y no dentro de
    // perfilCompilado -- así también rige para perfiles compilados antes de
    // que existiera, sin obligar a recompilarlos.
    user.objetivoConfirmado
      ? prisma.objetivoLaboral.findMany({ where: { userId: user.id }, select: { ciuo: true, etiqueta: true } })
      : Promise.resolve([]),
  ]);

  // docs/revision-2026-09-28.md §1: la extensión abre estas direcciones en una
  // pestaña para postular, así que solo salen las https:// del portal.
  const bandaGrisAprobadas = aprobadas
    .map((d) => ({ id: d.id, titulo: d.tituloCrudo, url: urlDePortal(d.url, d.plataforma), empresa: d.empresa, plataforma: d.plataforma }))
    .filter((d) => d.url && d.plataforma);

  const filtrosBusqueda = {
    palabrasIncluir: (filtros?.palabrasIncluir as string[] | null) ?? [],
    palabrasExcluir: (filtros?.palabrasExcluir as string[] | null) ?? [],
    modalidad: filtros?.modalidad ?? "cualquiera",
    jornada: filtros?.jornada ?? "cualquiera",
  };
  // Scorer local (docs/rediseno-filtrado-ofertas.md §6) -- detrás de un flag
  // que empieza apagado para todos (§13). Sin perfilCompilado no hay nada que
  // puntuar, así que usarScorerLocal nunca se activa solo sin uno.
  // docs/amplitud-de-busqueda.md §4 y §5: la amplitud se resuelve acá, en cada
  // consulta, por la misma razón que nivelDirectivo (§2.7) -- es una consulta
  // determinista al catálogo CIUO, no una llamada de IA. Así cambiar el
  // selector en el panel se refleja de inmediato, sin recompilar el perfil y
  // sin gastarle a la persona una llamada de su cupo mensual.
  const amplitud = esAmplitud(filtros?.amplitud) ? filtros.amplitud : AMPLITUD_POR_DEFECTO;
  const compilado = (filtros?.perfilCompilado as Record<string, unknown> | null) || null;
  const rolesDeclarados: { canonico?: string; sinonimos?: string[] }[] = Array.isArray(compilado?.roles)
    ? (compilado!.roles as { canonico?: string; sinonimos?: string[] }[])
    : [];
  const rolesExtra = compilado
    ? await rolesPorAmplitud(
        objetivos,
        amplitud,
        rolesDeclarados
          .flatMap((r) => [r?.canonico, ...(Array.isArray(r?.sinonimos) ? r.sinonimos : [])])
          .filter((t): t is string => !!t)
      )
    : [];

  const scorer = {
    usarScorerLocal: !!(filtros?.usarScorerLocal && compilado),
    perfilCompilado: compilado
      ? {
          ...compilado,
          nivelDirectivo: objetivosPermitenDirectivo(objetivos),
          amplitud,
          modo: amplitud === "abierto" ? "abierto" : "objetivo",
          roles: [...rolesDeclarados, ...rolesExtra],
          // §5: lo que el CV acredita. Solo lo usa el modo abierto, pero viaja
          // siempre: es barato y evita una consulta aparte del scorer.
          tiene: requisitosDelCandidato(perfil || {}),
        }
      : null,
    versionPerfil: filtros?.versionPerfil ?? 0,
    // Revisión externa 2026-09-05: si una recompilación forzada por cambio
    // de objetivo falló, perfilCompilado sigue con el objetivo viejo -- el
    // scorer usa esto para mandar todo a banda gris en vez de confiar en un
    // puntaje que puede estar mirando el rubro equivocado (ver
    // lib/compilar-perfil.ts, marcarDesactualizadoSiForzado).
    perfilDesactualizado: !!filtros?.perfilDesactualizado,
  };

  // Un solo estado para la extensión (docs/estrategia-y-rediseno.md §6): el
  // popup ya no decide nada por su cuenta, dibuja esto. `postulacionHabilitada`
  // se deja arriba, suelto, porque las extensiones instaladas hoy lo leen así.
  const estado = estadoExtension(user);
  const infoAdicional = Array.isArray(user.infoAdicional) ? user.infoAdicional : [];

  if (!perfil) {
    return NextResponse.json({
      nombre: null, email: null, telefono: null, comuna: null,
      cargoObjetivo: null, expectativaRenta: null, disponibilidad: null,
      resumenProfesional: null, textoExtraido: null,
      filtrosBusqueda,
      scorer,
      bandaGrisAprobadas,
      estado,
      infoAdicional,
      postulacionHabilitada: user.postulacionHabilitada,
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
    estado,
    infoAdicional,
    postulacionHabilitada: user.postulacionHabilitada,
  });
}
