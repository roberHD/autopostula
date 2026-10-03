// La tarjeta "Probemos" de Hoy (docs/primera-busqueda-guiada.md §10): lógica pura,
// sin base de datos ni navegador, para que scripts/verificar-primera-busqueda.ts
// la pruebe sin levantar el panel.
//
// Una cuenta nueva no ve un tablero en cero: ve una sola misión, con pasos que
// son la acción de verdad y se marcan solos. Instalar y conectar la extensión,
// abrir su portal con su búsqueda armada para ver qué haría con cada oferta, y
// recién ahí decidir si empieza a postular.

import type { ModoAutomatico } from "@/lib/estado-automatico";

export type ClavePaso = "instalar" | "conectar" | "mirar" | "computador" | "decidir";
export type EstadoPaso = "hecho" | "ahora" | "despues";

export type EntradaPasos = {
  /** El navegador no puede instalar extensiones (teléfono o tablet). */
  enMovil: boolean;
  /** La extensión está en este navegador; null = todavía no se sabe. */
  extensionAqui: boolean | null;
  /** User.extensionConectada: la extensión ya usó el token de esta cuenta. */
  extensionConectada: boolean;
  /** Ya hay rastro de que miró ofertas: un descarte, una para decidir, una ráfaga o una postulación. */
  yaMiro: boolean;
};

// Los pasos en orden, y en cuál va la persona: el primero que falta es "ahora";
// los demás, "despues". Lo que ya pasó cuenta aunque se haya hecho por otro lado
// (la extensión conectada desde Portales, una ráfaga que miró sola).
export function pasosPrimeraBusqueda(e: EntradaPasos): { clave: ClavePaso; estado: EstadoPaso }[] {
  const hechos: [ClavePaso, boolean][] = e.enMovil
    ? [
        ["computador", e.extensionConectada || e.yaMiro],
        ["mirar", e.yaMiro],
        ["decidir", false],
      ]
    : [
        ["instalar", e.extensionConectada || e.extensionAqui === true || e.yaMiro],
        ["conectar", e.extensionConectada || e.yaMiro],
        ["mirar", e.yaMiro],
        ["decidir", false],
      ];
  let yaHayUnoAhora = false;
  return hechos.map(([clave, hecho]) => {
    if (hecho) return { clave, estado: "hecho" as const };
    if (yaHayUnoAhora) return { clave, estado: "despues" as const };
    yaHayUnoAhora = true;
    return { clave, estado: "ahora" as const };
  });
}

function cantidad(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// Lo que encontró la primera vez, con las cifras que tiene el servidor. Cuántas
// habría postulado solo se sabe si miró en una ráfaga (Rafaga.observadas): al
// abrir un portal a mano, la extensión lo muestra ahí y no lo manda (falta en
// la 2.17, docs/primera-busqueda-guiada.md §10).
export function textoLoQueMiro(c: { porDecidir: number; descartadas: number; habriaPostulado: number | null }): string {
  const partes: string[] = [];
  if (c.habriaPostulado) partes.push(`habría postulado a ${c.habriaPostulado}`);
  if (c.porDecidir) partes.push(`te dejó ${cantidad(c.porDecidir, "oferta", "ofertas")} para que decidas`);
  if (c.descartadas) partes.push(`descartó ${cantidad(c.descartadas, "que no calzaba", "que no calzaban")}`);
  if (!partes.length) return "Ya revisó ofertas para ti.";
  const lista = partes.length === 1 ? partes[0] : partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
  const conRazon = c.porDecidir || c.descartadas ? ", cada una con su razón" : "";
  return "Ya revisó ofertas para ti: " + lista + conRazon + ".";
}

// Qué pasa al activarla, según el plan (lib/estado-automatico.ts).
export function textoAlActivar(modo: ModoAutomatico | null, pruebaTotal: number): string {
  if (modo === "prueba") return `Al activarla envía sola tus primeras ${pruebaTotal} postulaciones de prueba, sin que entres a ningún portal.`;
  if (modo === "premium") return "Al activarla se pone al día sola cada vez que abres Chrome.";
  if (modo === "manual") return "Al activarla, postula por ti cada vez que entres a Computrabajo, Laborum o Trabajando.";
  return "Al activarla empieza a postular a las que calzan contigo.";
}

// "“Vendedora”, en Ñuñoa, part time": lo que se va a buscar, en palabras.
export function textoBusqueda(b: { objetivo: string; lugares: string[]; jornada: string | null }): string {
  const partes = [`“${b.objetivo}”`];
  if (b.lugares.length === 1) partes.push("en " + b.lugares[0]);
  else if (b.lugares.length > 1) partes.push("en " + b.lugares.slice(0, -1).join(", ") + " y " + b.lugares[b.lugares.length - 1]);
  if (b.jornada) partes.push(b.jornada.toLowerCase());
  return partes.join(", ");
}

// La cookie con que la persona ocultó la tarjeta ("Ya sé cómo funciona"). Es
// cookie y no localStorage para que el servidor la lea y la página llegue sin
// la tarjeta, en vez de mostrarla y quitarla al cargar.
export const COOKIE_MISION_OCULTA = "ap_mision_oculta";

// La barra de arriba vive en el layout y no se vuelve a armar al navegar: si la
// tarjeta conecta un portal o la extensión, se lo avisa para que vuelva a pedir
// su estado (si no, seguía diciendo "Sin portales conectados").
export const EVENTO_PANEL_CAMBIO = "ap:panel-cambio";
