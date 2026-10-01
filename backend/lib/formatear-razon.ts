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
  // region: el código ("VA") cuando el aviso solo decía la región y ninguna
  // comuna tuya está ahí (docs/revision-scorer-2026-09-30.md §2.5).
  | { tipo: "ubicacion"; ofertaEn: string | null; buscadas: string[]; region?: string }
  // ofertaEn: lo que dice el aviso, tal cual ("Gran Santiago", "Región Metropolitana").
  | { tipo: "ubicacion_desconocida"; ofertaEn: string | null }
  // docs/revision-scorer-2026-09-30.md §4.1: el cargo que buscas aparece, pero
  // no en el título. Deja la oferta en "Por decidir", nunca la postula sola.
  | { tipo: "rol_fuera_del_titulo"; rol: string; termino: string; campo: "empresa" | "cuerpo" }
  | { tipo: "sin_perfil" }
  | { tipo: "nivel"; termino: string; certeza?: "desconocida" }
  | { tipo: "duplicado"; fecha: string | null }
  | { tipo: "senal"; patron: string; delta: number }
  | { tipo: "sin_senales" }
  | { tipo: "jornada"; declarada: "full_time" | "part_time" }
  | { tipo: "jornada_desconocida"; declarada: "full_time" | "part_time" }
  // docs/amplitud-de-busqueda.md §5, modo "cualquier trabajo".
  | { tipo: "requisito"; que: "titulo" | "licencia" | "ingles" }
  | { tipo: "modo_abierto" };

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
  if (razon.tipo === "sin_rol" || razon.tipo === "veto" || razon.tipo === "ubicacion" || razon.tipo === "ubicacion_desconocida" || razon.tipo === "rol_fuera_del_titulo" || razon.tipo === "nivel" || razon.tipo === "duplicado" || razon.tipo === "sin_senales" || razon.tipo === "jornada" || razon.tipo === "jornada_desconocida" || razon.tipo === "requisito") return false;
  if (razon.tipo === "modo_abierto") return true;
  return null;
}

// En palabras de quien busca trabajo, no del cálculo: nada de puntajes
// ("+2 por…") ni de "roles" o "escaneo". La tarjeta ya separa "Calza contigo"
// de "Pero", así que cada frase no repite si es a favor o en contra.
export function formatearRazon(r: unknown): string {
  if (typeof r === "string") return r;
  if (!r || typeof r !== "object" || !("tipo" in r)) return "Sin razón registrada";
  const razon = r as RazonEstructurada;
  switch (razon.tipo) {
    case "rol":
      // Calzó fuera del título: no se dice que el aviso "es de" eso, porque al
      // lado va rol_fuera_del_titulo diciendo que el título es de otro cargo.
      if (razon.campo === "cuerpo") return `La descripción habla de ${razon.rol}, lo que buscas`;
      if (razon.campo === "empresa") return `El nombre de la empresa dice "${razon.termino || razon.rol}"`;
      // El término es la palabra del aviso que calzó; solo se dice si agrega algo.
      return razon.termino && razon.termino.toLowerCase() !== razon.rol.toLowerCase()
        ? `Es de ${razon.rol}, lo que buscas (dice "${razon.termino}")`
        : `Es de ${razon.rol}, lo que buscas`;
    case "rol_fuera_del_titulo":
      return `El título es de otro cargo: ${razon.rol} solo aparece en ${razon.campo === "empresa" ? "el nombre de la empresa" : "la descripción"}`;
    case "sin_rol":
      return "El cargo no se parece a lo que buscas";
    case "veto":
      return razon.donde === "cuerpo" ? `${razon.razon} (lo dice el aviso)` : razon.razon;
    case "ubicacion":
      if (razon.ofertaEn && razon.region) {
        return `Es en ${razon.region === "RM" ? "la Región Metropolitana" : `la región de ${razon.ofertaEn}`}, y no buscas ahí`;
      }
      return razon.ofertaEn ? `Queda en ${razon.ofertaEn}, fuera de tus comunas` : "Queda fuera de tus comunas";
    case "ubicacion_desconocida":
      return razon.ofertaEn
        ? `Dice "${razon.ofertaEn}" y no sabemos si queda en tus comunas`
        : "No dice en qué comuna es";
    case "nivel":
      return razon.certeza === "desconocida"
        ? `Es jefatura ("${razon.termino}") y no sabemos si buscas ese nivel`
        : `Es jefatura ("${razon.termino}") y buscas otro nivel`;
    case "duplicado":
      return razon.fecha
        ? `Ya postulaste a este cargo en esta empresa el ${new Date(razon.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`
        : "Se repite en esta misma búsqueda";
    case "senal":
      return `El aviso dice "${razon.patron}"`;
    case "sin_senales":
      return "El aviso no trae nada claro a favor ni en contra";
    case "jornada": {
      const buscada = razon.declarada === "part_time" ? "part time" : "jornada completa";
      const delAviso = razon.declarada === "part_time" ? "jornada completa" : "part time";
      return `Es de ${delAviso} y buscas ${buscada}`;
    }
    case "jornada_desconocida": {
      const buscada = razon.declarada === "part_time" ? "part time" : "jornada completa";
      return `No dice la jornada, y buscas ${buscada}`;
    }
    // docs/amplitud-de-busqueda.md §5, modo "cualquier trabajo".
    case "requisito": {
      const que =
        razon.que === "titulo"
          ? "un título que no está en tu CV"
          : razon.que === "licencia"
            ? "una licencia de conducir profesional que no está en tu CV"
            : "inglés, y tu CV no lo menciona";
      return `Pide ${que}`;
    }
    case "modo_abierto":
      return "Cumple tus condiciones (buscas cualquier trabajo)";
    case "sin_perfil":
      return "Tu perfil de búsqueda todavía no estaba listo";
    default:
      return "Sin razón registrada";
  }
}
