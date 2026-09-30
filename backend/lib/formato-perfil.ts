// Formato chileno para dos campos del perfil que la gente escribe "pelado":
// la renta ("300000" → "300.000") y el RUT ("123456789" → "12.345.678-9").
// Se usa al escribir (para que se vea bien) y al guardar (para que lo que
// llega por el CV o por la API quede igual).

function conPuntos(digitos: string) {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Pone el separador de miles a cada número de 4 dígitos o más, sin tocar el
 * resto del texto: "$500000 - 600000 líquidos" → "$500.000 - 600.000 líquidos".
 * Un punto solo cuenta como separador si le siguen dígitos, así "30." mientras
 * se escribe no se pierde.
 */
export function formatearRenta(texto: string) {
  return texto.replace(/\d+(?:\.\d+)*/g, (numero) => {
    const digitos = numero.replace(/\./g, "");
    return digitos.length >= 4 ? conPuntos(digitos) : numero;
  });
}

/**
 * RUT con puntos y guion: el último carácter es el dígito verificador (0-9 o K).
 * Se ignora cualquier otro carácter, así da igual cómo lo escriba la persona.
 */
export function formatearRut(texto: string) {
  const limpio = texto.toUpperCase().replace(/[^0-9K]/g, "");
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/K/g, "").slice(0, 8);
  const dv = limpio.slice(-1);
  return `${conPuntos(cuerpo)}-${dv}`;
}

/** Qué campos del perfil tienen formato automático. */
export const FORMATO_POR_CAMPO: Record<string, ((texto: string) => string) | undefined> = {
  rut: formatearRut,
  expectativaRenta: formatearRenta,
};

/**
 * Para el onChange de un input: devuelve el valor formateado y deja el cursor
 * donde estaba (React lo mandaría al final al cambiar el valor).
 */
export function valorFormateado(campo: string, input: HTMLInputElement) {
  const formato = FORMATO_POR_CAMPO[campo];
  const antes = input.value;
  if (!formato) return antes;
  const nuevo = formato(antes);
  if (nuevo !== antes && document.activeElement === input) {
    const cursor = cursorTrasFormato(antes, input.selectionStart ?? antes.length, nuevo);
    requestAnimationFrame(() => input.setSelectionRange(cursor, cursor));
  }
  return nuevo;
}

/**
 * Dónde queda el cursor después de reformatear: detrás del mismo número de
 * caracteres "reales" (letras y dígitos) que tenía antes, para que agregar un
 * punto no lo mande al final del campo.
 */
export function cursorTrasFormato(anterior: string, posicion: number, nuevo: string) {
  const significativos = anterior.slice(0, posicion).replace(/[^0-9a-zA-Z]/g, "").length;
  if (significativos === 0) return 0;
  let vistos = 0;
  for (let i = 0; i < nuevo.length; i++) {
    if (/[0-9a-zA-Z]/.test(nuevo[i])) vistos++;
    if (vistos === significativos) return i + 1;
  }
  return nuevo.length;
}
