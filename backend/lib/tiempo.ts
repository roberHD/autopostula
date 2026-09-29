// "hace 2 min", "hace 3 h", "ayer" — sin librería, que es una línea de texto.
// Lo usan la barra de arriba del panel y "Lo último que hizo".
export function haceCuanto(iso: string | Date, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace un mes" : `hace ${m} meses`;
}

// ── Días y meses en hora de Chile (docs/revision-2026-09-28.md §15) ──────
//
// El servidor corre en UTC (Vercel). Con setHours(0,0,0,0) o getMonth() del
// servidor, el cupo del mes se renovaba a las 21:00 del último día (20:00 en
// invierno) y "enviadas hoy" volvía a 0 a esa misma hora. Estos cortes son en
// hora de Chile. Solo se usan en el servidor: en el navegador ya rige la hora
// de la persona.

const ZONA_CHILE = "America/Santiago";
const HORA_MS = 3_600_000;

/** "2026-09-28": el día calendario en Chile de ese instante. */
export function diaEnChile(fecha: Date): string {
  return fecha.toLocaleDateString("sv-SE", { timeZone: ZONA_CHILE });
}

// Cuánto va Chile respecto de UTC en ese instante, en ms (negativo).
function desfaseChile(instante: Date): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_CHILE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  const comoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

// El instante en que empieza ese día en Chile. El desfase se toma al mediodía,
// que nunca cae en un cambio de hora (en Chile se cambia a medianoche): los
// dos días del año en que se cambia, el corte puede correrse una hora, lo que
// para contar postulaciones no importa.
function inicioDeDia(y: number, m: number, d: number): Date {
  const base = Date.UTC(y, m - 1, d);
  return new Date(base - desfaseChile(new Date(base + 12 * HORA_MS)));
}

function partesDeDia(dia: string): [number, number, number] {
  const [y, m, d] = dia.split("-").map(Number);
  return [y, m, d];
}

/** 00:00 de hoy (o del día de `fecha`) en Chile. */
export function inicioDelDiaChile(fecha: Date = new Date()): Date {
  return inicioDeDia(...partesDeDia(diaEnChile(fecha)));
}

/** 00:00 del día que está `dias` días después (o antes, si es negativo) del de `fecha`, en Chile. */
export function inicioDeOtroDiaChile(fecha: Date, dias: number): Date {
  const [y, m, d] = partesDeDia(diaEnChile(fecha));
  const otro = new Date(Date.UTC(y, m - 1, d + dias));
  return inicioDeDia(otro.getUTCFullYear(), otro.getUTCMonth() + 1, otro.getUTCDate());
}

/** 00:00 del día 1 del mes en curso (o del de `fecha`), en Chile. */
export function inicioDelMesChile(fecha: Date = new Date()): Date {
  const [y, m] = partesDeDia(diaEnChile(fecha));
  return inicioDeDia(y, m, 1);
}
