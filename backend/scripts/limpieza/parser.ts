import type { TerminoLimpieza } from "./cl";

// El parser determinista de la Etapa 1 (docs/rediseno-filtrado-ofertas.md, §7.3).
// Sin IA, sin heurísticas de "parece una ubicación" -- solo la lista blanca cerrada
// que se le pase. Portable a propósito (sin imports de Node ni del navegador): la
// idea es que el mismo código, copiado o compartido, sea el que corra después en
// el scorer local de la extensión (§6), que necesita extraer jornada/comuna en
// runtime con la misma lógica exacta -- eso es trabajo del paso 6, no de este.

export type ResultadoParseo = {
  rolLimpio: string;
  comuna: string | null;
  region: string | null;
  jornada: string | null;
  modalidad: string | null;
  contrato: string | null;
  ruido: string[];
};

// Misma normalización que AP.n() en extension/core.js y que el endpoint
// /api/extension/titulos-vistos -- tiene que ser idéntica en todos lados, o un
// término con tilde en la lista y sin tilde en el título (o viceversa) no
// calza nunca y el bug queda silencioso (§13).
export function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// \b de JS solo tiene sentido en los bordes que sean caracteres de palabra --
// para términos que empiezan o terminan en algo como "(" o "/" (los marcadores
// de género), envolver en \b no funciona como cabría esperar, así que se omite
// justo en ese lado. Es lo que permite exigir "frase completa, nunca subcadena"
// (regla dura del §7.3) sin romper términos de puntuación.
function construirPatron(terminoNormalizado: string): RegExp {
  const escapado = escaparRegex(terminoNormalizado);
  const prefijo = /^\w/.test(terminoNormalizado) ? "\\b" : "";
  const sufijo = /\w$/.test(terminoNormalizado) ? "\\b" : "";
  return new RegExp(prefijo + escapado + sufijo, "g");
}

// Regla dura: "más largo primero, siempre" -- si no se ordena así, un término
// corto (ej. "chillan") puede consumir el texto antes de que un término más
// específico que lo contiene (ej. "chillan viejo") tenga oportunidad de matchear.
function ordenarPorLargo(entradas: TerminoLimpieza[]): TerminoLimpieza[] {
  return [...entradas].sort(
    (a, b) => normalizar(b.termino).split(" ").length - normalizar(a.termino).split(" ").length
  );
}

export function parsearTitulo(tituloCrudo: string, lista: TerminoLimpieza[]): ResultadoParseo {
  const tituloNormalizado = normalizar(tituloCrudo);
  let texto = " " + tituloNormalizado + " ";

  const ruido: string[] = [];
  let comuna: string | null = null;
  let region: string | null = null;
  let jornada: string | null = null;
  let modalidad: string | null = null;
  let contrato: string | null = null;

  const porTipo = (tipo: TerminoLimpieza["tipo"]) => ordenarPorLargo(lista.filter((e) => e.tipo === tipo));

  // Para campos de valor único (comuna, jornada, etc.): se detiene en el primer
  // match (ya viene ordenado de más largo/específico a más corto) y de ahí saca
  // el valor -- pero igual limpia el texto si encuentra el término, haya o no
  // terminado usándolo (ver el caso de "region" más abajo).
  function extraerUnico(tipo: TerminoLimpieza["tipo"], setter: (entrada: TerminoLimpieza) => void) {
    for (const entrada of porTipo(tipo)) {
      const t = normalizar(entrada.termino);
      if (construirPatron(t).test(texto)) {
        setter(entrada);
        texto = texto.replace(construirPatron(t), " ");
        return;
      }
    }
  }

  // Para categorías que solo descartan (mall, género, ruido de marketing): no hay
  // "un solo valor", así que se sacan TODAS las que aparezcan, no solo la primera.
  function descartarTodos(tipo: TerminoLimpieza["tipo"]) {
    for (const entrada of porTipo(tipo)) {
      const t = normalizar(entrada.termino);
      if (construirPatron(t).test(texto)) {
        ruido.push(t);
        texto = texto.replace(construirPatron(t), " ");
      }
    }
  }

  // Orden fijo del §7.3: malls -> comunas -> regiones -> resto (de lo más
  // específico a lo más general).
  descartarTodos("mall");

  extraerUnico("comuna", (entrada) => {
    if (entrada.tipo !== "comuna") return;
    comuna = normalizar(entrada.termino);
    region = entrada.region;
  });

  extraerUnico("region", (entrada) => {
    if (entrada.tipo !== "region") return;
    if (!region) region = entrada.region; // la comuna, si hubo, ya trae su región
  });

  extraerUnico("jornada", (entrada) => {
    if (entrada.tipo === "jornada") jornada = entrada.valor;
  });

  extraerUnico("modalidad", (entrada) => {
    if (entrada.tipo === "modalidad") modalidad = entrada.valor;
  });

  extraerUnico("contrato", (entrada) => {
    if (entrada.tipo === "contrato") contrato = entrada.valor;
  });

  descartarTodos("genero");
  descartarTodos("marketing");

  // Códigos y números sueltos -- regex, no lista (§7.3). Al final a propósito:
  // así no se come frases como "20 horas" antes de que jornada las capture.
  const patronesNumericos = [/[#°]\s*\d+\b/g, /\(\s*\d+\s*\)/g, /\b\d{3,}\b/g];
  for (const patron of patronesNumericos) {
    const encontrados = texto.match(patron);
    if (encontrados) {
      ruido.push(...encontrados.map((m) => m.trim()).filter(Boolean));
      texto = texto.replace(patron, " ");
    }
  }

  // Puntuación separadora que queda huérfana una vez que se sacaron las frases
  // de los dos lados (ej. el "-" entre "vespucio" y "ñuñoa" en el ejemplo del
  // documento) -- no es parte de la lista, es limpieza de lo que sobra.
  texto = texto.replace(/[-,;:|/()*]+/g, " ");
  texto = texto.replace(/\s+/g, " ").trim();

  // Red de seguridad (§7.3, regla 4): si no queda casi nada, mejor el título
  // normalizado completo que una fila vacía o basura de alta frecuencia.
  const rolLimpio = texto.length >= 3 ? texto : tituloNormalizado;

  return { rolLimpio, comuna, region, jornada, modalidad, contrato, ruido };
}
