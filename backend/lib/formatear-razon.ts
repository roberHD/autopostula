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
