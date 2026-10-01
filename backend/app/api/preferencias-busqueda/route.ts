import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { esAmplitud } from "@/lib/amplitud";
import { Prisma } from "@/lib/generated/prisma/client";
import { limpiarUbicacion, listaDeTextos } from "@/lib/entrada";
import { expandirUbicacionDeclarada } from "@/lib/compilar-perfil";

// docs/revision-2026-09-28.md §25: solo valores conocidos. Antes se guardaba lo
// que llegara (un objeto en vez de lista, una modalidad inventada).
const MODALIDADES = new Set(["cualquiera", "remoto", "hibrido", "presencial"]);
const JORNADAS = new Set(["cualquiera", "full_time", "part_time"]);

async function getOrCreatePreferencias(userId: string) {
  const existente = await prisma.searchPreferences.findUnique({ where: { userId } });
  if (existente) return existente;
  return prisma.searchPreferences.create({ data: { userId } });
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const preferencias = await getOrCreatePreferencias(userId);
  return NextResponse.json(preferencias);
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { usarScorerLocal, amplitud, calibrarUmbral } = body || {};
  const palabrasIncluir = body?.palabrasIncluir !== undefined ? listaDeTextos(body.palabrasIncluir, 50, 80) : undefined;
  const palabrasExcluir = body?.palabrasExcluir !== undefined ? listaDeTextos(body.palabrasExcluir, 50, 80) : undefined;
  const modalidad = MODALIDADES.has(body?.modalidad) ? body.modalidad : undefined;
  const jornada = JORNADAS.has(body?.jornada) ? body.jornada : undefined;
  const ubicacionDeclarada = limpiarUbicacion(body?.ubicacionDeclarada);

  const actuales = await getOrCreatePreferencias(userId);

  // La ubicación vive dos veces: la declarada (lo que muestra esta página) y la
  // copia dentro de perfilCompilado (lo que lee el scorer). Antes guardar aquí
  // solo tocaba la primera y pedía "Actualizar mi búsqueda", que recompila con
  // IA, gasta cupo y está bloqueada 24 h desde la última compilación: recién
  // salido del onboarding, corregir las comunas no llegaba a la extensión hasta
  // el día siguiente. La copia es una expansión determinista (la misma de
  // compilarPerfil), así que se recalcula acá, sin IA.
  const compilado = (actuales.perfilCompilado as Record<string, unknown> | null) || null;
  const perfilConUbicacion =
    ubicacionDeclarada && compilado
      ? ({ ...compilado, ubicacion: expandirUbicacionDeclarada(ubicacionDeclarada) } as Prisma.InputJsonValue)
      : undefined;

  const actualizado = await prisma.searchPreferences.update({
    where: { userId },
    data: {
      palabrasIncluir,
      palabrasExcluir,
      modalidad,
      jornada,
      // Solo se toca si vino explícitamente en el body -- así el PUT que ya
      // usaba la página de filtros (sin este campo) no lo pisa con undefined.
      ...(typeof usarScorerLocal === "boolean" ? { usarScorerLocal } : {}),
      // §2.1 (docs/revision-2026-09-16.md): Filtros edita la ubicación
      // declarada con el mismo selector del onboarding.
      ...(ubicacionDeclarada !== undefined ? { ubicacionDeclarada: ubicacionDeclarada ?? Prisma.DbNull } : {}),
      ...(perfilConUbicacion ? { perfilCompilado: perfilConUbicacion } : {}),
      // docs/amplitud-de-busqueda.md §4. Se valida contra la lista cerrada:
      // un valor cualquiera dejaría al scorer sin saber qué hacer. Cambiar la
      // amplitud NO recompila el perfil -- la expansión es determinista y se
      // resuelve al servir el perfil a la extensión, sin gastar IA.
      ...(esAmplitud(amplitud) ? { amplitud } : {}),
      // docs/revision-scorer-2026-09-30.md §7: apagar el ajuste vuelve al
      // umbral normal en la próxima revisión de la extensión. Prenderlo borra
      // la fecha del último cálculo, para que /api/extension/perfil lo haga de
      // inmediato en vez de esperar la semana.
      ...(typeof calibrarUmbral === "boolean"
        ? calibrarUmbral
          ? { calibrarUmbral: true, umbralCalibradoEn: null }
          : { calibrarUmbral: false, umbralPostularCalibrado: null, umbralCalibradoCon: null, umbralCalibradoEn: null }
        : {}),
    },
  });

  return NextResponse.json(actualizado);
}
