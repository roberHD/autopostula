// docs/panel-de-revision-en-el-portal.md §2 y §3: lo que la persona hizo en el
// panel de revisión del portal, convertido en decisiones.
//
// Lógica pura, sin base de datos: la usa /api/extension/revision, y la prueba
// scripts/verificar-panel-revision.ts.
import {
  limpiarEntradaScorer,
  PORTALES_CONOCIDOS,
  puntajeONull,
  textoCorto,
  urlDePortal,
  type EntradaScorer,
} from "@/lib/entrada";

export type BandaMotor = "postular" | "gris" | "descartar";
const BANDAS: readonly string[] = ["postular", "gris", "descartar"];

export type OfertaRevisada = {
  externalId: string;
  titulo: string;
  empresa: string | null;
  url: string | null;
  /** Lo que decidió el motor. */
  banda: BandaMotor;
  /** Cómo quedó la casilla al apretar "Postular". */
  elegida: boolean;
  /** La cuenta ya postulaba y el motor la envió sola: no queda nada que decidir. */
  yaEnviada: boolean;
  scoreLocal: number | null;
  razones: unknown[] | null;
  entrada: EntradaScorer | undefined;
};

export type Tanda = { plataforma: string; ofertas: OfertaRevisada[] };

// Un listado trae 20 por página; con "ver más" el panel muestra hasta 60.
export const MAX_OFERTAS_POR_TANDA = 300;

/**
 * Lo que manda la extensión, recortado como todo lo que llega de afuera
 * (docs/revision-2026-09-28.md §1): el enlace solo si es https:// de ese
 * portal, y las razones solo si son una lista corta. Las ofertas sin id, sin
 * título o con una banda desconocida se botan; null si no hay tanda.
 */
export function limpiarTanda(plataforma: unknown, ofertas: unknown): Tanda | null {
  const portal = textoCorto(plataforma, 50);
  if (!portal || !PORTALES_CONOCIDOS.includes(portal) || !Array.isArray(ofertas)) return null;
  const vistas = new Set<string>();
  const limpias: OfertaRevisada[] = [];
  for (const o of ofertas.slice(0, MAX_OFERTAS_POR_TANDA)) {
    if (!o || typeof o !== "object") continue;
    const x = o as Record<string, unknown>;
    const externalId = textoCorto(x.externalId, 200);
    const titulo = textoCorto(x.titulo, 300);
    if (!externalId || !titulo || vistas.has(externalId)) continue;
    if (typeof x.banda !== "string" || !BANDAS.includes(x.banda)) continue;
    vistas.add(externalId);
    limpias.push({
      externalId,
      titulo,
      empresa: textoCorto(x.empresa, 200),
      url: urlDePortal(x.url, portal),
      banda: x.banda as BandaMotor,
      elegida: x.elegida === true,
      yaEnviada: x.yaEnviada === true,
      scoreLocal: puntajeONull(x.scoreLocal),
      razones: Array.isArray(x.razones) && JSON.stringify(x.razones).length < 5_000 ? x.razones.slice(0, 20) : null,
      entrada: limpiarEntradaScorer(x.entrada),
    });
  }
  return limpias.length ? { plataforma: portal, ofertas: limpias } : null;
}

// §3.3: marcar casi todo es apretar un botón, no decidir. Con 5 ofertas o más
// por decidir y más del 80% marcadas, lo de esa tanda queda con peso reducido:
// se postula igual (es su decisión), pero no entra a la compilación del perfil
// ni al umbral. Con menos de 5, marcarlas todas puede ser simplemente que
// calzaban todas.
export const MIN_OFERTAS_PARA_PESO = 5;
export const PROPORCION_MAXIMA = 0.8;

export function tandaConPesoReducido(ofertas: OfertaRevisada[]): boolean {
  const porDecidir = ofertas.filter((o) => !o.yaEnviada);
  if (porDecidir.length < MIN_OFERTAS_PARA_PESO) return false;
  return porDecidir.filter((o) => o.elegida).length / porDecidir.length > PROPORCION_MAXIMA;
}

export type Accion = "confirmar" | "quitar" | "aprobar" | "rescatar";

function esRepetida(o: OfertaRevisada): boolean {
  return (o.razones ?? []).some((r) => !!r && typeof r === "object" && (r as { tipo?: unknown }).tipo === "duplicado");
}

/**
 * Qué significa cada casilla (§3.1). Lo que la persona no tocó en "para que
 * decidas" y "no calza" no se registra: cerrar no es decidir, y esas ofertas
 * siguen en "Por decidir" y en los descartes, como estaban.
 *   confirmar: el motor la iba a postular y quedó marcada. Se envía; no corrige nada.
 *   quitar:    el motor la iba a postular y la desmarcó. Es el error que gasta cupo.
 *   aprobar:   estaba para que decida y la marcó. Lo mismo que un "sí" en Por decidir.
 *   rescatar:  el motor la descartó y la marcó. Lo mismo que "No era así".
 */
export function accionDe(o: OfertaRevisada): Accion | null {
  if (o.yaEnviada) return null;
  if (o.banda === "postular") return o.elegida ? "confirmar" : "quitar";
  // Una repetida ya se postuló antes: no se vuelve a enviar.
  if (!o.elegida || esRepetida(o)) return null;
  return o.banda === "gris" ? "aprobar" : "rescatar";
}

/**
 * Lo que entra a la compilación del perfil (§3.4): las decisiones de verdad.
 * Quedan fuera las de una tanda con peso reducido y, del panel, las que el
 * motor ya iba a postular y la persona dejó marcadas: no corrigen nada.
 */
export function cuentaParaAprender(d: {
  fuente: string;
  bandaMotor: string | null;
  veredicto: string;
  pesoReducido: boolean;
}): boolean {
  if (d.pesoReducido) return false;
  return !(d.fuente === "PANEL_REVISION" && d.bandaMotor === "postular" && d.veredicto === "SI");
}
