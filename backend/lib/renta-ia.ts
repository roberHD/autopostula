// La pretensión de renta en los formularios (docs/extension-laborum-2026-10-01.md §9).
//
// Es un dato de la persona, no algo que la IA pueda suponer: la regla 1b de los
// prompts (procesar-postulacion, responder-pregunta) lo dice. Aun así, el
// 2026-10-01 el modelo respondió "$1.800.000" a "Indique expectativa de renta"
// sin ningún dato en el perfil, y como lo enviado vuelve al prompt como "lo que
// el candidato YA envió", la cifra se repitió en las postulaciones siguientes
// (dos de trabajando.com y una de Laborum, todas part time). Dos resguardos que
// no dependen del modelo:
//   - preguntaPideRenta + rentaDeclarada: si la pregunta pide la renta y la
//     persona nunca la dijo, queda como dato faltante, escriba lo que escriba el
//     modelo. La extensión se la pregunta una vez y queda guardada.
//   - esPreguntaPorUnHecho: lo que se respondió a una pregunta por un hecho
//     (renta, licencia, vehículo, título) no vuelve al prompt como ejemplo, salvo
//     que la persona lo haya escrito o corregido.

const HABLA_DE_RENTA = /renta|sueldo|salari|remunera|econ[oó]mic/i;
const PIDE_LO_SUYO = /pretensi|expectativa|aspiraci|esperad|pretendid/i;

/** "Indícanos tus pretensiones de renta líquida", "Indique expectativa de renta", "¿Cuánto esperas ganar?". */
export function preguntaPideRenta(pregunta: string): boolean {
  if (/cu[aá]nto\s+(esperas|pretendes|quieres|te gustar[ií]a)\s+ganar/i.test(pregunta)) return true;
  return HABLA_DE_RENTA.test(pregunta) && PIDE_LO_SUYO.test(pregunta);
}

/** La renta esperada del perfil, o un dato adicional que la diga ("pretensión de renta: $600.000"). */
export function rentaDeclarada(renta: string | null | undefined, info: string[]): boolean {
  if (renta && renta.trim()) return true;
  return info.some((t) => HABLA_DE_RENTA.test(t) || /pretensi/i.test(t));
}

const PREGUNTA_POR_UN_HECHO = /renta|sueldo|salari|remunera|pretensi|licencia|veh[ií]culo|t[ií]tulo|certificaci/i;

export function esPreguntaPorUnHecho(pregunta: string): boolean {
  return PREGUNTA_POR_UN_HECHO.test(pregunta);
}

/** Lo que la persona dijo o corrigió vale como ejemplo; lo que la IA respondió a un hecho, no. */
export function sirveComoEjemplo(a: { pregunta: string; fueEditada: boolean }): boolean {
  return a.fueEditada || !esPreguntaPorUnHecho(a.pregunta);
}

/**
 * Las respuestas del modelo, con la renta como dato faltante donde se pidió y
 * la persona no la declaró. `preguntas` son las que se le mandaron (id + texto).
 */
export function sinRentaInventada<R extends { id?: string; respuesta: string | null; datoFaltante: string | null }>(
  respuestas: R[],
  preguntas: { id: string; pregunta: string }[],
  renta: string | null | undefined,
  info: string[],
): R[] {
  if (rentaDeclarada(renta, info)) return respuestas;
  return respuestas.map((r) => {
    const q = preguntas.find((x) => x.id === r.id);
    if (!q || !preguntaPideRenta(q.pregunta) || r.datoFaltante) return r;
    return { ...r, respuesta: null, datoFaltante: "pretensión de renta" };
  });
}
