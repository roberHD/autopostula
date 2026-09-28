// Chequeo de CV (docs/estrategia-y-rediseno.md §4.2): reglas simples sobre lo
// que ya se guarda al subir el CV. Sin IA y sin inventar un puntaje de 0 a 100:
// se dice qué está bien, qué hay que arreglar y por qué importa.
//
// Solo entran revisiones que se pueden hacer con certeza razonable. Las que
// dependen de adivinar el diseño del PDF (por ejemplo, si está en dos
// columnas) se dejan fuera hasta tener una forma confiable de saberlo.

export type EstadoRevision = "ok" | "aviso" | "mal";

export type Revision = {
  clave: string;
  estado: EstadoRevision;
  titulo: string;
  detalle: string;
};

export type Experiencia = { cargo?: string; empresa?: string; periodo?: string };

export type DatosCv = {
  texto: string | null;
  email: string | null;
  telefono: string | null;
  comuna: string | null;
  experiencia: Experiencia[] | null;
};

// Menos que esto, y lo que salió del PDF no alcanza para ser un CV: es una
// foto, un escaneo o un PDF armado con imágenes.
const MINIMO_CARACTERES_LEGIBLES = 300;

// Un año suelto (1990-2039) no es una cifra de logro: son fechas.
const RE_ANIO = /\b(19[89]\d|20[0-3]\d)\b/g;
const RE_VINETA = /^\s*(?:[-•·▪◦*]|\d+[.)])\s+\S/;

function lineasDeTareas(texto: string): string[] {
  return texto.split(/\r?\n/).filter((l) => RE_VINETA.test(l));
}

export function chequearCv(d: DatosCv): { legible: boolean; revisiones: Revision[]; porArreglar: number } {
  const texto = (d.texto ?? "").replace(/\s+/g, " ").trim();
  const legible = texto.length >= MINIMO_CARACTERES_LEGIBLES;
  const revisiones: Revision[] = [];

  revisiones.push(
    legible
      ? {
          clave: "legible",
          estado: "ok",
          titulo: "Se puede leer",
          detalle: "El texto de tu PDF es seleccionable: los sistemas de los portales lo leen bien.",
        }
      : {
          clave: "legible",
          estado: "mal",
          titulo: "Tu CV parece una foto o un escaneo",
          detalle:
            "Casi no pudimos sacar texto de tu PDF, y los portales tampoco van a poder. Expórtalo de nuevo desde Word o Google Docs como PDF, sin escanearlo.",
        },
  );

  // Sin texto no tiene sentido revisar lo demás: todo saldría mal por la misma causa.
  if (!legible) return { legible, revisiones, porArreglar: 1 };

  const faltan = [
    !d.email && !/\S+@\S+\.\S+/.test(texto) ? "tu correo" : null,
    !d.telefono && !/(\+?56)?\s*9\s*\d{4}\s*\d{4}/.test(texto) ? "tu teléfono" : null,
    !d.comuna ? "tu comuna" : null,
  ].filter((x): x is string => !!x);
  revisiones.push(
    faltan.length === 0
      ? {
          clave: "contacto",
          estado: "ok",
          titulo: "Datos de contacto completos",
          detalle: "Correo, teléfono y comuna: lo primero que busca quien lee tu CV.",
        }
      : {
          clave: "contacto",
          estado: "aviso",
          titulo: `Falta ${faltan.join(" y ")}`,
          detalle: "Sin eso, una empresa interesada no tiene cómo llamarte, o no sabe si vives cerca.",
        },
  );

  const experiencias = (d.experiencia ?? []).filter((e) => e && (e.cargo || e.empresa));
  const sinFechas = experiencias.filter((e) => !e.periodo || !/\d/.test(e.periodo));
  if (experiencias.length > 0) {
    const ej = sinFechas[0];
    revisiones.push(
      sinFechas.length === 0
        ? {
            clave: "fechas",
            estado: "ok",
            titulo: "Cada experiencia tiene fechas",
            detalle: "Con ellas se calculan tus años de experiencia, que es lo primero que filtran muchos avisos.",
          }
        : {
            clave: "fechas",
            estado: "aviso",
            titulo: sinFechas.length === 1 ? "Una experiencia no tiene fechas" : `${sinFechas.length} experiencias no tienen fechas`,
            detalle: `${[ej.cargo, ej.empresa].filter(Boolean).join(" en ")}. Con las fechas se calculan tus años de experiencia.`,
          },
    );
  }

  const tareas = lineasDeTareas(d.texto ?? "");
  if (tareas.length >= 3) {
    const conCifra = tareas.filter((l) => /\d/.test(l.replace(RE_ANIO, "")));
    revisiones.push(
      conCifra.length > 0
        ? {
            clave: "cifras",
            estado: "ok",
            titulo: "Tus tareas dicen cuánto",
            detalle: "Las cifras (pedidos al día, clientes, metas) hacen que un logro se crea.",
          }
        : {
            clave: "cifras",
            estado: "aviso",
            titulo: "Tus tareas no dicen cuánto",
            detalle: "«Preparación de pedidos» dice menos que «preparaba unos 120 pedidos al día». Agrega un número donde sea cierto.",
          },
    );
  }

  return { legible, revisiones, porArreglar: revisiones.filter((r) => r.estado !== "ok").length };
}
