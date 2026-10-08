/**
 * Verificación del panel de revisión del portal (docs/panel-de-revision-en-el-portal.md
 * §2.2 y §3): qué decisión deja cada casilla, cuándo una tanda entra con peso
 * reducido y qué entra a la compilación del perfil. Lógica pura, sin base de
 * datos:
 *
 *   npx tsx scripts/verificar-panel-revision.ts
 */
import {
  accionDe,
  cuentaParaAprender,
  limpiarTanda,
  MAX_OFERTAS_POR_TANDA,
  tandaConPesoReducido,
  type OfertaRevisada,
} from "../lib/panel-revision";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (cond) console.log("✓ " + desc);
  else {
    fallos++;
    console.error("✗ " + desc + (detalle !== undefined ? " " + JSON.stringify(detalle) : ""));
  }
}

const URL_CT = "https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-vendedor-ABC";
function oferta(cambios: Partial<OfertaRevisada> = {}): OfertaRevisada {
  return {
    externalId: "A1", titulo: "Vendedor", empresa: "Tienda", url: URL_CT, banda: "postular",
    elegida: true, yaEnviada: false, scoreLocal: 70, razones: [], entrada: undefined, ...cambios,
  };
}

// ── 1. Lo que llega de la extensión ───────────────────────────────
{
  check("un portal que no es de los tres: no hay tanda", limpiarTanda("OtroPortal", [{ externalId: "A", titulo: "X", banda: "postular" }]) === null);
  check("sin lista de ofertas: no hay tanda", limpiarTanda("Computrabajo", "nada") === null);
  check("una lista sin ninguna que sirva: no hay tanda", limpiarTanda("Computrabajo", [{ titulo: "sin id", banda: "gris" }]) === null);

  const t = limpiarTanda("Computrabajo", [
    { externalId: "A", titulo: "  Vendedor  ", banda: "postular", elegida: true, url: URL_CT, scoreLocal: 71.6, razones: [{ tipo: "rol" }] },
    { externalId: "B", titulo: "Cajero", banda: "inventada", elegida: true },
    { externalId: "", titulo: "Sin id", banda: "gris" },
    { externalId: "C", titulo: "", banda: "gris" },
    { externalId: "A", titulo: "Repetida en la lista", banda: "gris" },
    { externalId: "D", titulo: "Promotor", banda: "gris", elegida: "true", url: "https://otro-sitio.example/oferta" },
    { externalId: "E", titulo: "Bodeguero", banda: "descartar", elegida: true, razones: [{ tipo: "x", texto: "y".repeat(6000) }] },
  ])!;
  check("se quedan solo las que tienen id, título y una banda conocida, sin repetir", t.ofertas.map((o) => o.externalId).join(",") === "A,D,E", t.ofertas.map((o) => o.externalId));
  check("el título llega recortado", t.ofertas[0].titulo === "Vendedor");
  check("el puntaje, como entero", t.ofertas[0].scoreLocal === 72);
  check("elegida solo si es true de verdad (no el texto \"true\")", t.ofertas[1].elegida === false);
  check("un enlace que no es de ese portal se guarda como null", t.ofertas[1].url === null);
  check("unas razones enormes no se guardan", t.ofertas[2].razones === null);

  const muchas = Array.from({ length: MAX_OFERTAS_POR_TANDA + 50 }, (_, i) => ({ externalId: "X" + i, titulo: "T" + i, banda: "descartar" }));
  check("como mucho " + MAX_OFERTAS_POR_TANDA + " por tanda", limpiarTanda("Laborum", muchas)!.ofertas.length === MAX_OFERTAS_POR_TANDA);
}

// ── 2. Qué decisión deja cada casilla (§3.1) ──────────────────────
{
  check("te sirve y quedó marcada: se confirma (se envía, no corrige nada)", accionDe(oferta({ banda: "postular", elegida: true })) === "confirmar");
  check("te sirve y la desmarcó: se quita (el error que gasta cupo)", accionDe(oferta({ banda: "postular", elegida: false })) === "quitar");
  check("para que decidas y la marcó: se aprueba, como en Por decidir", accionDe(oferta({ banda: "gris", elegida: true })) === "aprobar");
  check("no calza y la marcó: se rescata, como \"No era así\"", accionDe(oferta({ banda: "descartar", elegida: true })) === "rescatar");
  check("para que decidas sin marcar: nada (cerrar no es decidir; sigue en Por decidir)", accionDe(oferta({ banda: "gris", elegida: false })) === null);
  check("no calza sin marcar: nada", accionDe(oferta({ banda: "descartar", elegida: false })) === null);
  check("una repetida (ya se postuló) no se rescata aunque la marque", accionDe(oferta({ banda: "descartar", elegida: true, razones: [{ tipo: "duplicado", fecha: "2026-10-03" }] })) === null);
  check("la cuenta ya postulaba y el motor la envió: no hay nada que decidir", accionDe(oferta({ banda: "postular", elegida: false, yaEnviada: true })) === null);
}

// ── 3. Marcar casi todo (§3.3) ────────────────────────────────────
{
  const tanda = (total: number, marcadas: number, yaEnviadas = 0) => [
    ...Array.from({ length: total }, (_, i) => oferta({ externalId: "O" + i, banda: "descartar", elegida: i < marcadas })),
    ...Array.from({ length: yaEnviadas }, (_, i) => oferta({ externalId: "Y" + i, banda: "postular", elegida: true, yaEnviada: true })),
  ];
  check("menos de 5 por decidir: marcarlas todas puede ser que calzaban todas", tandaConPesoReducido(tanda(4, 4)) === false);
  check("5 de 5 marcadas: peso reducido", tandaConPesoReducido(tanda(5, 5)) === true);
  check("8 de 10 (justo el 80%): todavía no", tandaConPesoReducido(tanda(10, 8)) === false);
  check("9 de 10: peso reducido", tandaConPesoReducido(tanda(10, 9)) === true);
  check("las que el motor ya envió no cuentan para el 80%", tandaConPesoReducido(tanda(4, 4, 6)) === false);
}

// ── 4. Qué entra a la compilación del perfil (§3.4) ───────────────
{
  const d = (fuente: string, bandaMotor: string | null, veredicto: string, pesoReducido = false) => cuentaParaAprender({ fuente, bandaMotor, veredicto, pesoReducido });
  check("un sí o un no de Por decidir entra, como siempre", d("BANDA_GRIS", null, "SI") && d("BANDA_GRIS", null, "NO"));
  check("del panel, una que el motor iba a postular y la persona dejó marcada: no corrige nada, no entra", !d("PANEL_REVISION", "postular", "SI"));
  check("del panel, una que el motor iba a postular y la persona quitó: entra", d("PANEL_REVISION", "postular", "NO"));
  check("del panel, un rescate de \"no calza\": entra", d("PANEL_REVISION", "descartar", "SI"));
  check("una aprobada en el panel que estaba en Por decidir: entra", d("BANDA_GRIS", "gris", "SI"));
  check("nada de una tanda con peso reducido", !d("PANEL_REVISION", "descartar", "SI", true) && !d("BANDA_GRIS", "gris", "SI", true));
}

console.log("\n" + (fallos === 0 ? "Todo OK (0 fallos)." : `${fallos} fallo(s).`));
process.exit(fallos === 0 ? 0 : 1);
