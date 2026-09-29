import { prisma } from "@/lib/prisma";
import { listaDeTextos, textoCorto } from "@/lib/entrada";

// Lo que la extensión manda a las rutas de IA, limpio y con tope
// (docs/revision-2026-09-28.md §19). Antes no había ningún límite de tamaño:
// una sola llamada podía llevar megas de texto, y cada una se paga por token.

export type PerfilIA = {
  bio: string | null;
  nombre: string | null;
  email: string | null;
  tel: string | null;
  comuna: string | null;
  cargo: string | null;
  renta: string | null;
  disp: string | null;
};

const PERFIL_VACIO: PerfilIA = { bio: null, nombre: null, email: null, tel: null, comuna: null, cargo: null, renta: null, disp: null };

export function limpiarPerfilIA(valor: unknown): PerfilIA {
  const p = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  return {
    bio: textoCorto(p.bio, 3000),
    nombre: textoCorto(p.nombre, 120),
    email: textoCorto(p.email, 200),
    tel: textoCorto(p.tel, 50),
    comuna: textoCorto(p.comuna, 100),
    cargo: textoCorto(p.cargo, 200),
    renta: textoCorto(p.renta, 100),
    disp: textoCorto(p.disp, 200),
  };
}

/** Los "datos para la IA" que escribió la persona (licencia, disponibilidad...). */
export function limpiarInfoIA(valor: unknown): string[] {
  return listaDeTextos(valor, 30, 300);
}

export type PreguntaIA = { id: string; pregunta: string; opciones: string[] | null };

/** Un formulario real tiene unas pocas preguntas; esto solo corta lo absurdo. */
export function limpiarPreguntasIA(valor: unknown): PreguntaIA[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((q: any): PreguntaIA | null => {
      const id = textoCorto(q?.id, 100);
      const pregunta = textoCorto(q?.pregunta, 600);
      if (!id || !pregunta) return null;
      const opciones = listaDeTextos(q?.opciones, 40, 200);
      return { id, pregunta, opciones: opciones.length ? opciones : null };
    })
    .filter((q): q is PreguntaIA => !!q)
    .slice(0, 40);
}

/** El texto del aviso, recortado (ya se recortaba, pero sin revisar que fuera texto). */
export function limpiarAviso(valor: unknown, max: number): string | null {
  return textoCorto(valor, max);
}

// ── "Usar mi perfil" y "Evitar respuestas repetidas" (Entrenar IA) ─────────
//
// docs/revision-2026-09-28.md §10: los dos interruptores se guardaban pero
// ninguna ruta de IA los leía. Quien apagaba "Usar mi perfil" creía que sus
// datos dejaban de usarse, y se seguían usando.

/**
 * Con "Usar mi perfil" apagado, la IA no recibe el CV, ni los datos del perfil,
 * ni los "datos para la IA": solo el aviso, la pregunta y cómo escribe la
 * persona. Las respuestas salen más generales, y lo que dependa de un dato
 * concreto queda para que la persona lo complete (regla 1b del prompt).
 */
export function aplicarUsarPerfil(usarPerfil: boolean | null | undefined, perfil: PerfilIA, info: string[]) {
  if (usarPerfil === false) return { perfil: PERFIL_VACIO, info: [] as string[], incluirCv: false };
  return { perfil, info, incluirCv: true };
}

// Va después de las reglas en los dos prompts que lo usan (procesar-postulacion
// y responder-pregunta), y cada uno deja una pregunta en blanco a su manera
// (datoFaltante / SINRESPUESTA): por eso nombra los dos y no dice "de abajo".
export const AVISO_SIN_PERFIL =
  "IMPORTANTE: el candidato pidió que NO se usen su CV ni sus datos personales. No tienes esa información: " +
  "no la inventes. Responde de forma honesta y general. Si la pregunta necesita un dato concreto del candidato " +
  "(experiencia, estudios, licencias, renta, disponibilidad), no lo supongas: déjala sin responder como indican " +
  "las reglas de arriba (datoFaltante o SINRESPUESTA) y, si las reglas no permiten dejarla en blanco, responde " +
  "sin afirmar ningún dato concreto.\n\n";

/**
 * Con "Evitar respuestas repetidas" encendido (viene así por defecto), la IA ve
 * lo último que la persona ya envió en otras postulaciones, para no mandar el
 * mismo texto palabra por palabra a todas las empresas.
 */
export async function bloqueRespuestasAnteriores(userId: string, evitarRepetidas: boolean | null | undefined): Promise<string> {
  if (evitarRepetidas === false) return "";
  const anteriores = await prisma.applicationAnswer.findMany({
    where: { application: { userId, estadoActual: { not: "INCOMPLETA" } }, respuestaFinal: { not: "" } },
    orderBy: { respondidoEn: "desc" },
    take: 6,
    select: { pregunta: true, respuestaFinal: true },
  });
  if (!anteriores.length) return "";
  return (
    "Respuestas que el candidato YA envió en otras postulaciones (no las copies: si la pregunta se parece, " +
    "di lo mismo con otras palabras y conectado con ESTE aviso):\n" +
    anteriores
      .map((a) => `- A "${a.pregunta.slice(0, 120)}" respondió: "${a.respuestaFinal.slice(0, 300)}"`)
      .join("\n") +
    "\n\n"
  );
}
