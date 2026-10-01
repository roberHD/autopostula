// docs/revision-scorer-2026-09-30.md §6: el banco de casos. El scorer contra la
// persona, caso por caso: lo que decidió en "Por decidir" (sí o no, con el
// puntaje que dejó la oferta ahí) y los descartes que corrigió con "No era así".
//
// Lógica pura: la lectura de la base y la impresión están en
// scripts/banco-de-casos.ts, y la prueba en scripts/verificar-banco-de-casos.ts.
//
// Ojo con el sesgo (§6): de lo que el scorer postuló solo no hay veredicto, y
// de lo que descartó solo hay el de quien se dio el trabajo de corregirlo. El
// banco mide la zona de duda, que es donde se juega, no el scorer entero.
import { esTopeDelScorer } from "@/lib/calibracion-umbral";

export type Veredicto = "SI" | "NO";
export type Banda = "postular" | "gris" | "descartar";

export type DecisionDelBanco = {
  id: string;
  titulo: string;
  empresa: string | null;
  scoreLocal: number | null;
  veredicto: Veredicto;
  razones: unknown;
};

export type DescarteDelBanco = {
  id: string;
  titulo: string;
  empresa: string | null;
  razon: unknown;
  scoreLocal: number | null;
  corregido: boolean;
};

export type Tramo = { desde: number; hasta: number; si: number; no: number };

export type InformeBanco = {
  gris: {
    /** Decisiones sí/no con puntaje. Las sin puntaje (perfil sin compilar, "No era así") no cuentan. */
    conPuntaje: number;
    sinPuntaje: number;
    /** Las que dejó en duda el puntaje (sin topes), por tramos de 5 puntos. */
    porPuntaje: Tramo[];
    /** Las que dejó en duda un tope (comuna ilegible, jornada sin confirmar...), por el primero. */
    porTope: { razon: string; si: number; no: number }[];
    promedioSi: number | null;
    promedioNo: number | null;
    /**
     * De 0 a 1: la probabilidad de que un "sí" tenga más puntaje que un "no"
     * (solo las que dejó en duda el puntaje). 0,5 es que el puntaje no separa
     * nada: el problema no es el umbral, es lo que mide (§6.1).
     */
    separacion: number | null;
    /** Los "no" con más puntaje: casi se postulan solos. */
    noAltos: DecisionDelBanco[];
    /** Los "sí" con menos puntaje: casi se descartan sin preguntar. */
    siBajos: DecisionDelBanco[];
  };
  descartes: {
    total: number;
    corregidos: number;
    porRazon: { razon: string; total: number; corregidos: number }[];
    /** Los que la persona corrigió: falsos negativos, la lista que más enseña. */
    ejemplosCorregidos: DescarteDelBanco[];
  };
};

/** Una razón del scorer como clave para agrupar: el tipo, más el matiz cuando cambia lo que significa. */
export function claveDeRazon(r: unknown): string {
  if (typeof r === "string") return "(razón vieja, en texto)";
  if (!r || typeof r !== "object" || !("tipo" in r)) return "(sin razón)";
  const x = r as { tipo: unknown; donde?: unknown; certeza?: unknown };
  if (x.tipo === "veto") return `veto en ${x.donde === "cuerpo" ? "la descripción" : x.donde === "empresa" ? "la empresa" : "el título"}`;
  if (x.tipo === "nivel") return x.certeza === "desconocida" ? "nivel sin confirmar" : "nivel";
  return String(x.tipo);
}

function primerTope(razones: unknown): unknown | null {
  if (!Array.isArray(razones)) return null;
  return razones.find(esTopeDelScorer) ?? null;
}

function promedio(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

/** Probabilidad de que un "sí" al azar tenga más puntaje que un "no" al azar (empates cuentan la mitad). */
export function separacion(si: number[], no: number[]): number | null {
  if (!si.length || !no.length) return null;
  let favor = 0;
  for (const s of si) for (const n of no) favor += s > n ? 1 : s === n ? 0.5 : 0;
  return favor / (si.length * no.length);
}

export function analizarBanco(
  decisiones: DecisionDelBanco[],
  descartes: DescarteDelBanco[],
  opciones: { ejemplos?: number } = {}
): InformeBanco {
  const ejemplos = opciones.ejemplos ?? 10;
  const conPuntaje = decisiones.filter((d) => typeof d.scoreLocal === "number");
  const porElPuntaje = conPuntaje.filter((d) => !primerTope(d.razones));
  const porUnTope = conPuntaje.filter((d) => primerTope(d.razones));

  const tramos = new Map<number, Tramo>();
  for (const d of porElPuntaje) {
    const desde = Math.floor((d.scoreLocal as number) / 5) * 5;
    const tramo = tramos.get(desde) ?? { desde, hasta: desde + 4, si: 0, no: 0 };
    if (d.veredicto === "SI") tramo.si++;
    else tramo.no++;
    tramos.set(desde, tramo);
  }

  const topes = new Map<string, { razon: string; si: number; no: number }>();
  for (const d of porUnTope) {
    const razon = claveDeRazon(primerTope(d.razones));
    const fila = topes.get(razon) ?? { razon, si: 0, no: 0 };
    if (d.veredicto === "SI") fila.si++;
    else fila.no++;
    topes.set(razon, fila);
  }

  const puntajes = (lista: DecisionDelBanco[], v: Veredicto) =>
    lista.filter((d) => d.veredicto === v).map((d) => d.scoreLocal as number);

  const porRazon = new Map<string, { razon: string; total: number; corregidos: number }>();
  for (const d of descartes) {
    const razon = claveDeRazon(d.razon);
    const fila = porRazon.get(razon) ?? { razon, total: 0, corregidos: 0 };
    fila.total++;
    if (d.corregido) fila.corregidos++;
    porRazon.set(razon, fila);
  }

  return {
    gris: {
      conPuntaje: conPuntaje.length,
      sinPuntaje: decisiones.length - conPuntaje.length,
      porPuntaje: [...tramos.values()].sort((a, b) => a.desde - b.desde),
      porTope: [...topes.values()].sort((a, b) => b.si + b.no - (a.si + a.no)),
      promedioSi: promedio(puntajes(conPuntaje, "SI")),
      promedioNo: promedio(puntajes(conPuntaje, "NO")),
      separacion: separacion(puntajes(porElPuntaje, "SI"), puntajes(porElPuntaje, "NO")),
      noAltos: conPuntaje
        .filter((d) => d.veredicto === "NO")
        .sort((a, b) => (b.scoreLocal as number) - (a.scoreLocal as number))
        .slice(0, ejemplos),
      siBajos: conPuntaje
        .filter((d) => d.veredicto === "SI")
        .sort((a, b) => (a.scoreLocal as number) - (b.scoreLocal as number))
        .slice(0, ejemplos),
    },
    descartes: {
      total: descartes.length,
      corregidos: descartes.filter((d) => d.corregido).length,
      porRazon: [...porRazon.values()].sort((a, b) => b.total - a.total),
      ejemplosCorregidos: descartes.filter((d) => d.corregido).slice(0, ejemplos * 2),
    },
  };
}

// ── Volver a correr el scorer (§6.2) ────────────────────────────────

export type CasoParaReCorrer = {
  /** De dónde sale el veredicto: "Por decidir", un descarte corregido, o un descarte sin corregir (sin veredicto). */
  origen: "por_decidir" | "no_era_asi" | "descarte";
  veredicto: Veredicto | null;
  titulo: string;
  antes: Banda;
  ahora: Banda;
  scoreAntes: number | null;
  scoreAhora: number;
};

// Qué tan bien queda un caso según lo que dijo la persona: con un "sí",
// postular es lo mejor y descartar lo peor; con un "no", al revés.
function rango(banda: Banda, veredicto: Veredicto): number {
  const orden: Banda[] = veredicto === "SI" ? ["descartar", "gris", "postular"] : ["postular", "gris", "descartar"];
  return orden.indexOf(banda);
}

export type ResumenReCorrida = {
  conVeredicto: Record<Veredicto, Record<Banda, number>>;
  /** Descartes sin corregir: no hay veredicto, solo cuántos cambiarían de banda. */
  sinVeredicto: Record<Banda, number>;
  /** Casos que quedan más cerca de lo que dijo la persona... */
  mejoran: CasoParaReCorrer[];
  /** ...y más lejos. Un "no" que ahora se postularía solo es lo más grave. */
  empeoran: CasoParaReCorrer[];
};

export function resumirReCorrida(casos: CasoParaReCorrer[]): ResumenReCorrida {
  const vacio = (): Record<Banda, number> => ({ postular: 0, gris: 0, descartar: 0 });
  const resumen: ResumenReCorrida = {
    conVeredicto: { SI: vacio(), NO: vacio() },
    sinVeredicto: vacio(),
    mejoran: [],
    empeoran: [],
  };
  for (const c of casos) {
    if (!c.veredicto) {
      resumen.sinVeredicto[c.ahora]++;
      continue;
    }
    resumen.conVeredicto[c.veredicto][c.ahora]++;
    const antes = rango(c.antes, c.veredicto);
    const ahora = rango(c.ahora, c.veredicto);
    if (ahora > antes) resumen.mejoran.push(c);
    else if (ahora < antes) resumen.empeoran.push(c);
  }
  // Lo más grave primero: un "no" que se postularía solo.
  resumen.empeoran.sort((a, b) => Number(b.ahora === "postular" && b.veredicto === "NO") - Number(a.ahora === "postular" && a.veredicto === "NO"));
  return resumen;
}
