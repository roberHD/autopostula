import fs from "fs";
import path from "path";

// Clasificación de títulos cosechados contra el catálogo CIUO-08.CL
// (docs/rediseno-filtrado-ofertas.md §7.4). Corre offline, nunca en el
// runtime de la extensión.

type OcupacionCatalogo = {
  ocupacion: string;
  ciuo: string;
  fuente: string;
  normalizado: string;
};
type Catalogo = { grupos: Record<string, string>; ocupaciones: OcupacionCatalogo[] };

let catalogoCache: Catalogo | null = null;
function cargarCatalogo(): Catalogo {
  if (!catalogoCache) {
    const ruta = path.join(__dirname, "..", "scripts", "data", "catalogo-ocupaciones-cl.json");
    catalogoCache = JSON.parse(fs.readFileSync(ruta, "utf8"));
  }
  return catalogoCache!;
}

// Misma normalización que el resto del sistema (lib/triaje.ts, extension/core.js
// AP.n, scripts/limpieza/parser.ts) -- tiene que ser idéntica o el matching por
// palabra nunca encuentra nada. Ver la trampa de normalización en §13.
export function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "en", "y", "a", "para", "con", "sin", "por", "los", "las",
  "un", "una", "del", "al", "o", "su", "que", "tareas", "combinadas",
]);

function tokenizar(s: string): string[] {
  return normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !PALABRAS_VACIAS.has(t));
}

export type Candidato = { ciuo: string; nombreGrupo: string; ejemplos: string[] };

const MAX_CANDIDATOS = 30;
const MAX_EJEMPLOS_POR_CODIGO = 2;
// Bajo este número de candidatos por solapamiento, se asume que el prefiltro
// se quedó sin señal -- caso "teleoperador": no comparte ninguna palabra con
// el nombre oficial "Empleados de centros de llamadas" (4222), así que el
// solapamiento por palabra da cero candidatos y ninguna IA podría elegir un
// código que ni siquiera se le mostró. Medido: de los 4 casos clave del §7.4,
// justo este es el que queda por debajo del umbral.
const MIN_CANDIDATOS_ANTES_DE_AMPLIAR = 8;

// Prefiltra el catálogo completo (3.484 ocupaciones) a ~30 códigos CIUO
// candidatos por solapamiento de palabras -- así no se le manda al modelo la
// lista completa en cada clasificación (§7.4: "No mandar los 3.484 nombres en
// cada prompt"). Puramente determinista, sin IA, gratis.
export function obtenerCandidatos(tituloNormalizado: string): Candidato[] {
  const catalogo = cargarCatalogo();
  const tokensTitulo = new Set(tokenizar(tituloNormalizado));

  const porCodigo = new Map<string, { score: number; ejemplos: { texto: string; score: number }[] }>();

  if (tokensTitulo.size) {
    for (const oc of catalogo.ocupaciones) {
      const tokensOc = tokenizar(oc.normalizado);
      if (!tokensOc.length) continue;
      let solapadas = 0;
      for (const t of tokensOc) if (tokensTitulo.has(t)) solapadas++;
      if (!solapadas) continue;

      let score = solapadas * 2;
      if (oc.normalizado === tituloNormalizado) score += 100;
      else if (tituloNormalizado.includes(oc.normalizado) || oc.normalizado.includes(tituloNormalizado)) score += 10;

      const actual = porCodigo.get(oc.ciuo) || { score: 0, ejemplos: [] };
      actual.score = Math.max(actual.score, score);
      actual.ejemplos.push({ texto: oc.ocupacion, score });
      porCodigo.set(oc.ciuo, actual);
    }
  }

  const principales = [...porCodigo.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, MAX_CANDIDATOS)
    .map(([ciuo, info]) => ({
      ciuo,
      nombreGrupo: catalogo.grupos[ciuo] || "(sin nombre de grupo)",
      ejemplos: info.ejemplos
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_EJEMPLOS_POR_CODIGO)
        .map((e) => e.texto),
    }));

  if (principales.length >= MIN_CANDIDATOS_ANTES_DE_AMPLIAR) return principales;

  // Respaldo: sin señal textual suficiente, se amplía a los 444 grupos
  // completos (solo código + nombre, sin ejemplos) para que el modelo elija
  // por conocimiento propio de la ocupación en vez de quedarse sin opciones
  // razonables. Es la excepción, no la regla -- la mayoría de los títulos
  // nunca llega hasta acá.
  const yaIncluidos = new Set(principales.map((c) => c.ciuo));
  const amplios = Object.entries(catalogo.grupos)
    .filter(([codigo]) => !yaIncluidos.has(codigo))
    .map(([codigo, nombre]) => ({ ciuo: codigo, nombreGrupo: nombre, ejemplos: [] as string[] }));
  return [...principales, ...amplios];
}

// El modelo elige por SEMÁNTICA de la ocupación, no por el nombre literal del
// título -- por eso "asesor comercial" tiene que resolver a 5223 aunque esa
// frase no exista en ningún catálogo oficial (§7.4).
export function construirPrompt(titulo: string, candidatos: Candidato[]): { system: string; user: string } {
  const lista = candidatos
    .map((c) => `${c.ciuo} — ${c.nombreGrupo}${c.ejemplos.length ? ` (ej: ${c.ejemplos.join("; ")})` : ""}`)
    .join("\n");

  const system =
    "Eres un clasificador de ocupaciones chilenas contra el estandar CIUO-08.CL. " +
    "Se te da un titulo de aviso de trabajo real -- puede usar lenguaje comercial, no el " +
    "nombre oficial de la ocupacion (ej: 'asesor comercial' es la ocupacion oficial " +
    "'Vendedor') -- y una lista de codigos CIUO candidatos, prefiltrados por coincidencia " +
    "de palabras. Elige el codigo de 4 digitos que mejor corresponde a la OCUPACION real " +
    "detras del titulo, no al texto literal. Si ninguno de los candidatos corresponde " +
    "razonablemente, responde exactamente la palabra 'ninguno'. " +
    "Responde SOLO con el codigo de 4 digitos o la palabra 'ninguno', nada mas.";

  const user =
    `Titulo del aviso: "${titulo}"\n\nCandidatos:\n` +
    (lista || "(el prefiltro no encontro candidatos por palabra -- evalua igual si puedes reconocer la ocupacion, si no, responde ninguno)");

  return { system, user };
}

// Solo acepta un código si viene en la lista de candidatos ofrecida -- por
// diseño el modelo elige entre esas opciones, no recuerda códigos de memoria
// (evita alucinar un CIUO que no existe o que no fue evaluado).
export function parsearRespuesta(texto: string, codigosValidos: Set<string>): string | null {
  const limpio = (texto || "").trim().toLowerCase();
  if (!limpio || limpio.startsWith("ninguno")) return null;
  const match = limpio.match(/\d{4}/);
  if (!match) return null;
  return codigosValidos.has(match[0]) ? match[0] : null;
}
