// Formatea una razón del scorer (docs/visibilidad-y-etapa2.md §C) en una
// oración legible para el dashboard. Las razones nuevas son objetos
// estructurados ({tipo, ...}, ver extension/core.js AP.puntuarOferta); las
// filas guardadas antes del cambio siguen siendo strings ya formateados y
// no hay migración (razones es Json?) -- este formateador acepta las dos
// formas y no revienta con ninguna.
export type RazonEstructurada =
  | { tipo: "rol"; rol: string; termino: string; campo?: string }
  | { tipo: "sin_rol" }
  | { tipo: "veto"; patron: string; razon: string; donde: "titulo" | "empresa" | "cuerpo" }
  | { tipo: "ubicacion"; ofertaEn: string | null; buscadas: string[] }
  | { tipo: "senal"; patron: string; delta: number }
  | { tipo: "sin_senales" };

// §D: la tarjeta de "Por decidir" ya no lista las razones como bullets del
// cálculo, sino como el intercambio que se le pide decidir a la persona
// ("Calza contigo... / Pero..."). Solo los objetos estructurados saben si
// son a favor o en contra -- un string legacy no trae esa información, así
// que no se puede clasificar (se muestra aparte, sin ✓/✗).
export function esRazonPositiva(r: unknown): boolean | null {
  if (typeof r === "string") return null;
  if (!r || typeof r !== "object" || !("tipo" in r)) return null;
  const razon = r as RazonEstructurada;
  if (razon.tipo === "rol") return true;
  if (razon.tipo === "senal") return razon.delta >= 0;
  if (razon.tipo === "sin_rol" || razon.tipo === "veto" || razon.tipo === "ubicacion" || razon.tipo === "sin_senales") return false;
  return null;
}

export function formatearRazon(r: unknown): string {
  if (typeof r === "string") return r;
  if (!r || typeof r !== "object" || !("tipo" in r)) return "sin razón";
  const razon = r as RazonEstructurada;
  switch (razon.tipo) {
    case "rol":
      return `calza con "${razon.rol}" (${razon.termino})`;
    case "sin_rol":
      return "no se encontró ninguno de los roles buscados";
    case "veto":
      return razon.donde === "cuerpo"
        ? `${razon.razon} (mención en el cuerpo del aviso, no en título/empresa)`
        : razon.razon;
    case "ubicacion":
      return razon.ofertaEn
        ? `${razon.ofertaEn} no está en tus comunas${razon.buscadas?.length ? ` (buscas ${razon.buscadas.join(", ")})` : ""}`
        : "fuera de las comunas que buscas";
    case "senal":
      return `${razon.delta >= 0 ? "+" : ""}${razon.delta} por "${razon.patron}"`;
    case "sin_senales":
      return "sin señales claras";
    default:
      return "sin razón";
  }
}
