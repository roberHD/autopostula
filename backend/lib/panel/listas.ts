import { prisma } from "@/lib/prisma";
import { usuarioTieneAnaliticaAvanzada } from "@/lib/plan-beneficios";
import { datosDeLaOferta } from "@/lib/datos-postulacion";
import { urlDePortal } from "@/lib/entrada";
import { estadoExtension } from "@/lib/estado-extension";
import { filtroSinNoticias } from "@/lib/estado-real";

// Las listas del panel (Postulaciones y Por decidir). Las usan sus rutas de la
// API y las páginas mismas, que las arman en el servidor para llegar con los
// datos puestos en vez de pedirlos después de cargar el JavaScript
// (docs/optimizacion-2026-09-29.md §1).

/** Lo que devuelve GET /api/applications. */
export async function listarPostulaciones(userId: string) {
  const [applications, analiticaAvanzada] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      include: {
        jobOffer: { include: { platform: true } },
      },
      orderBy: { enviadaEn: "desc" },
    }),
    usuarioTieneAnaliticaAvanzada(userId),
  ]);

  return {
    applications: applications.map((a) => {
      const { titulo, empresa } = datosDeLaOferta(a);
      return {
        id: a.id,
        titulo,
        empresa,
        portal: a.jobOffer.platform.nombre,
        estado: a.estadoActual,
        notaAtencion: a.notaAtencion,
        enviadaEn: a.enviadaEn,
        // Una de las 5 de la prueba automática -- lo usa "Ver las 5" (§4.1).
        esDePrueba: a.esDePrueba,
        // Si el estado lo contó la persona, la lista lo dice ("lo contaste tú").
        contadoPorTi: a.origenEstado === "USUARIO",
      };
    }),
    analiticaAvanzada,
  };
}

/**
 * Lo que devuelve GET /api/applications/sin-noticias: las postulaciones por las
 * que toca preguntar "¿Supiste algo?" (docs/estado-real-de-postulaciones.md §6.1).
 * Se muestran de a pocas: más de tres seguidas ya no es una pregunta.
 */
export async function listarSinNoticias(userId: string) {
  const donde = filtroSinNoticias(userId);
  const [total, primeras] = await Promise.all([
    prisma.application.count({ where: donde }),
    prisma.application.findMany({
      where: donde,
      orderBy: { enviadaEn: "asc" },
      take: 3,
      select: {
        id: true,
        enviadaEn: true,
        estadoActual: true,
        titulo: true,
        empresa: true,
        jobOffer: { select: { titulo: true, platform: { select: { nombre: true } } } },
      },
    }),
  ]);

  return {
    total,
    postulaciones: primeras.map((a) => {
      const { titulo, empresa } = datosDeLaOferta(a);
      return {
        id: a.id,
        titulo,
        empresa,
        portal: a.jobOffer.platform.nombre,
        estado: a.estadoActual,
        enviadaEn: a.enviadaEn,
      };
    }),
  };
}

/** Lo que devuelve GET /api/banda-gris: la cola de "Por decidir". */
export async function listarPorDecidir(userId: string) {
  // Vencimiento perezoso (§8.4): antes de listar, lo que ya pasó su venceEn
  // sin decisión se marca EXPIRADA -- silencio ahí sería peor que avisar.
  await prisma.decisionOferta.updateMany({
    where: { userId, fuente: "BANDA_GRIS", veredicto: "PENDIENTE", venceEn: { lt: new Date() } },
    data: { veredicto: "EXPIRADA" },
  });

  const [pendientes, expiradasSinRevisar] = await Promise.all([
    prisma.decisionOferta.findMany({
      where: { userId, fuente: "BANDA_GRIS", veredicto: "PENDIENTE" },
      orderBy: { venceEn: "asc" },
    }),
    prisma.decisionOferta.count({
      where: { userId, fuente: "BANDA_GRIS", veredicto: "EXPIRADA", decididoEn: null },
    }),
  ]);

  // docs/revision-2026-09-28.md §1: el enlace "Ver oferta" de la tarjeta solo
  // si es https:// del portal (las filas de antes no se validaban al guardar).
  return {
    pendientes: pendientes.map((d) => ({ ...d, url: urlDePortal(d.url, d.plataforma) })),
    expiradasSinRevisar,
  };
}

/**
 * Cuántas hay en "Por decidir", para el número del menú. Antes el menú pedía la
 * lista entera (con el extracto de cada aviso, unos 20 KB) en cada cambio de
 * página solo para contarla. Cuenta lo mismo que queda en la lista después del
 * vencimiento perezoso, pero sin escribir en la base.
 */
export async function contarPorDecidir(userId: string) {
  return prisma.decisionOferta.count({
    where: {
      userId,
      fuente: "BANDA_GRIS",
      veredicto: "PENDIENTE",
      OR: [{ venceEn: null }, { venceEn: { gte: new Date() } }],
    },
  });
}

/** El `estado` de GET /api/account/opciones-extension (cómo trabaja la extensión). */
export async function leerEstadoExtension(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { busquedaAutomaticaActiva: true, soloObservar: true, revisarAntesDeEnviar: true, postulacionHabilitada: true },
  });
  return user ? estadoExtension(user) : null;
}
