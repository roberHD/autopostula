import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { limpiarTitulo } from "@/lib/text";
import { formatearRazon, esRazonPositiva } from "@/lib/formatear-razon";
import { filtroSinNoticias } from "@/lib/estado-real";

/**
 * Todo lo que necesita la página Hoy (docs/estrategia-y-rediseno.md §5.2).
 *
 * La página parte por lo que hay que hacer (las tareas), sigue con tres cifras
 * del mes y "Lo último que hizo", y termina con lo que buscas, los portales,
 * la rosca por portal y la actividad de la semana.
 */

// Una pregunta respondida a mano en un formulario de portal toma unos 3
// minutos (leerla, pensar, escribir). Es una estimación y se dice como tal.
const MINUTOS_POR_PREGUNTA = 3;

const JORNADA: Record<string, string> = { full_time: "Jornada completa", part_time: "Part time" };
const MODALIDAD: Record<string, string> = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

type UbicacionDeclarada = { regiones?: string[]; comunas?: string[]; todaLaRegion?: boolean; aceptaRemoto?: boolean };

const NOMBRE_REGION: Record<string, string> = {
  AP: "Arica y Parinacota", TA: "Tarapacá", AN: "Antofagasta", AT: "Atacama", CO: "Coquimbo",
  VA: "Valparaíso", RM: "Región Metropolitana", OH: "O'Higgins", ML: "Maule", NB: "Ñuble",
  BI: "Biobío", AR: "La Araucanía", LR: "Los Ríos", LL: "Los Lagos", AI: "Aysén", MA: "Magallanes",
};

export type HechoReciente = {
  tipo: "postulo" | "no_envio" | "por_decidir" | "descarto";
  id: string;
  titulo: string;
  detalle: string;
  en: string;
  // Solo descartes: si la persona ya dijo "No era así".
  corregido?: boolean;
};

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const hoy = new Date();
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - 6);
  inicioSemana.setHours(0, 0, 0, 0);
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);
  manana.setHours(23, 59, 59, 999);

  const [
    user,
    todas,
    respuestasDelMes,
    styleProfile,
    cuentas,
    recientes,
    cambiosDeEstado,
    porDecidir,
    objetivos,
    preferencias,
    cvProfile,
    descartadasMes,
    hayDescartes,
    descartesRecientes,
    sinNoticias,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { nombre: true } }),
    prisma.application.findMany({
      where: { userId },
      select: {
        estadoActual: true,
        enviadaEn: true,
        platformAccount: { select: { platform: { select: { nombre: true } } } },
      },
    }),
    // Preguntas respondidas este mes en postulaciones que llegaron: las que
    // quedaron a medias (INCOMPLETA) no ahorraron nada, hubo que terminarlas.
    prisma.applicationAnswer.count({
      where: { application: { userId, enviadaEn: { gte: inicioMes }, estadoActual: { not: "INCOMPLETA" } } },
    }),
    prisma.styleProfile.findFirst({ where: { userId }, orderBy: { creadoEn: "desc" } }),
    prisma.platformAccount.findMany({
      where: { userId },
      select: { activa: true, platform: { select: { nombre: true } } },
      orderBy: { platform: { nombre: "asc" } },
    }),
    prisma.application.findMany({
      where: { userId },
      orderBy: { enviadaEn: "desc" },
      take: 8,
      select: {
        id: true,
        estadoActual: true,
        notaAtencion: true,
        enviadaEn: true,
        jobOffer: { select: { titulo: true, empresa: true } },
        platformAccount: { select: { platform: { select: { nombre: true } } } },
        _count: { select: { answers: true } },
      },
    }),
    prisma.applicationStatusHistory.findMany({
      where: { estado: { not: "ENVIADO" }, cambiadoEn: { gte: inicioSemana }, application: { userId } },
      select: { cambiadoEn: true },
    }),
    prisma.decisionOferta.findMany({
      where: { userId, fuente: "BANDA_GRIS", veredicto: "PENDIENTE", OR: [{ venceEn: null }, { venceEn: { gte: hoy } }] },
      orderBy: { creadoEn: "desc" },
      select: { id: true, tituloCrudo: true, empresa: true, razones: true, venceEn: true, creadoEn: true },
    }),
    prisma.objetivoLaboral.findMany({ where: { userId }, orderBy: { orden: "asc" }, select: { etiqueta: true } }),
    prisma.searchPreferences.findUnique({
      where: { userId },
      select: { jornada: true, modalidad: true, ubicacionDeclarada: true },
    }),
    prisma.cvProfile.findUnique({ where: { userId }, select: { nombre: true, expectativaRenta: true } }),
    prisma.descarte.count({ where: { userId, vistoEn: { gte: inicioMes } } }),
    // Sin ningún descarte guardado, la extensión todavía no los manda (versión
    // vieja): la cifra se muestra como "—", no como un 0 que no es cierto.
    prisma.descarte.findFirst({ where: { userId }, select: { id: true } }),
    prisma.descarte.findMany({
      where: { userId },
      orderBy: { vistoEn: "desc" },
      take: 4,
      select: { id: true, titulo: true, empresa: true, plataforma: true, razon: true, vistoEn: true, corregidoEn: true },
    }),
    prisma.application.count({ where: filtroSinNoticias(userId, hoy) }),
  ]);

  // ── Tareas ────────────────────────────────────────────────────────
  const noEnviadas = todas.filter((a) => a.estadoActual === "INCOMPLETA").length;
  const ultimaNoEnviada = recientes.find((a) => a.estadoActual === "INCOMPLETA") ?? null;
  const vencenManana = porDecidir.filter((d) => d.venceEn && d.venceEn <= manana).length;

  // ── Cifras del mes ────────────────────────────────────────────────
  const enviadasMes = todas.filter((a) => a.enviadaEn >= inicioMes && a.estadoActual !== "INCOMPLETA").length;

  // ── Lo último que hizo ────────────────────────────────────────────
  const hechos: HechoReciente[] = [];
  for (const a of recientes) {
    const portal = a.platformAccount.platform.nombre;
    const titulo = limpiarTitulo(a.jobOffer.titulo);
    if (a.estadoActual === "INCOMPLETA") {
      hechos.push({
        tipo: "no_envio",
        id: a.id,
        titulo,
        detalle: [a.jobOffer.empresa, portal, a.notaAtencion ?? "no se pudo completar sola"].filter(Boolean).join(" · "),
        en: a.enviadaEn.toISOString(),
      });
    } else {
      const n = a._count.answers;
      hechos.push({
        tipo: "postulo",
        id: a.id,
        titulo,
        detalle: [a.jobOffer.empresa, portal, n ? `${n} ${n === 1 ? "respuesta" : "respuestas"}` : null].filter(Boolean).join(" · "),
        en: a.enviadaEn.toISOString(),
      });
    }
  }
  for (const d of porDecidir.slice(0, 4)) {
    const razones = Array.isArray(d.razones) ? (d.razones as unknown[]) : [];
    // Lo que la dejó en duda es lo que no calza: eso es lo que se cuenta.
    const enContra = razones.find((r) => esRazonPositiva(r) === false);
    // Minúscula solo la primera letra: el resto puede traer una comuna.
    const motivo = enContra ? formatearRazon(enContra) : null;
    hechos.push({
      tipo: "por_decidir",
      id: d.id,
      titulo: limpiarTitulo(d.tituloCrudo),
      detalle: [d.empresa, motivo ? motivo.charAt(0).toLowerCase() + motivo.slice(1) : null].filter(Boolean).join(" · "),
      en: d.creadoEn.toISOString(),
    });
  }
  for (const d of descartesRecientes) {
    const motivo = d.razon ? formatearRazon(d.razon) : null;
    hechos.push({
      tipo: "descarto",
      id: d.id,
      titulo: limpiarTitulo(d.titulo),
      detalle: [d.empresa, motivo ? motivo.charAt(0).toLowerCase() + motivo.slice(1) : null].filter(Boolean).join(" · "),
      en: d.vistoEn.toISOString(),
      corregido: !!d.corregidoEn,
    });
  }
  hechos.sort((x, y) => y.en.localeCompare(x.en));

  // ── Lo que buscas ─────────────────────────────────────────────────
  const ubicacion = (preferencias?.ubicacionDeclarada ?? null) as UbicacionDeclarada | null;
  const lugares = ubicacion?.todaLaRegion
    ? (ubicacion.regiones ?? []).map((r) => NOMBRE_REGION[r] ?? r)
    : ubicacion?.comunas ?? [];
  const busqueda = {
    objetivos: objetivos.map((o) => o.etiqueta),
    lugares,
    aceptaRemoto: !!ubicacion?.aceptaRemoto,
    jornada: preferencias ? JORNADA[preferencias.jornada] ?? null : null,
    modalidad: preferencias ? MODALIDAD[preferencias.modalidad] ?? null : null,
    renta: cvProfile?.expectativaRenta?.trim() || null,
  };

  // ── Actividad de la semana y reparto por portal (se quedan como estaban) ──
  const actividad: { etiqueta: string; enviadas: number; respuestas: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    const clave = d.toDateString();
    actividad.push({
      etiqueta: d.toLocaleDateString("es-CL", { weekday: "short" }),
      enviadas: todas.filter((a) => a.enviadaEn.toDateString() === clave).length,
      respuestas: cambiosDeEstado.filter((c) => c.cambiadoEn.toDateString() === clave).length,
    });
  }

  const porPortalMap = new Map<string, number>();
  todas.forEach((a) => {
    const nombre = a.platformAccount.platform.nombre;
    porPortalMap.set(nombre, (porPortalMap.get(nombre) ?? 0) + 1);
  });

  const nombreCompleto = user?.nombre || cvProfile?.nombre || "";

  return NextResponse.json({
    nombre: nombreCompleto.trim().split(/\s+/)[0] || null,
    tareas: {
      porDecidir: porDecidir.length,
      vencenManana,
      noEnviadas,
      sinNoticias,
      noEnviada: ultimaNoEnviada
        ? {
            id: ultimaNoEnviada.id,
            portal: ultimaNoEnviada.platformAccount.platform.nombre,
            nota: ultimaNoEnviada.notaAtencion,
          }
        : null,
    },
    cifras: {
      enviadasMes,
      descartadasMes: hayDescartes ? descartadasMes : null,
      preguntasRespondidas: respuestasDelMes,
      minutosAhorrados: respuestasDelMes * MINUTOS_POR_PREGUNTA,
    },
    hechos: hechos.slice(0, 6),
    busqueda,
    perfilEntrenado: styleProfile?.confianzaPorcentaje ?? 0,
    portales: cuentas.map((c) => ({ nombre: c.platform.nombre, activa: c.activa })),
    actividad,
    porPortal: Array.from(porPortalMap.entries()).map(([nombre, cantidad]) => ({ nombre, cantidad })),
  });
}
