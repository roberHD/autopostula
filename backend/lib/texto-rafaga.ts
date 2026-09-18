// Texto de la tarjeta de estado del Inicio -- docs/rafagas-y-ponerse-al-dia.md
// §3.5. Sin imports de servidor a propósito: la usa la página (cliente) y la
// verifica scripts/verificar-texto-rafaga.ts.

export type ResumenRafaga = {
  postuladas: number;
  observadas: number;
  descartadas: number;
  gris: number;
  errores: number;
};

// `en` es la hora del servidor en que terminó (User.ultimaRafagaEn), no la del
// reloj de la persona. `resumen` es null si la fila ya se purgó.
export type UltimaRafaga = { en: string; resumen: ResumenRafaga | null };

// Pasado esto sin ponerse al día, la tarjeta deja de celebrar la última vez y
// pasa a decir qué hacer -- que es lo que la persona necesita saber.
const HORAS_SIN_PONERSE_AL_DIA = 48;

const PEDIR_QUE_ABRA_CHROME = "Abre Chrome en tu computador y se pone al día sola.";

// Mismo texto que la línea del popup de la extensión (extension/popup.js,
// textoRafaga): las dos superficies tienen que decir lo mismo de la misma
// ráfaga. En modo solo observar nada se postuló, y "0 postulaciones" sería
// mentir por omisión, así que se cuenta lo que HABRÍA postulado.
export function detalleConteos(r: ResumenRafaga | null): string {
  if (!r) return "";
  const partes: string[] = [];
  if (r.postuladas === 0 && r.observadas > 0) partes.push(`habría postulado a ${r.observadas}`);
  else partes.push(`${r.postuladas} ${r.postuladas === 1 ? "postulación" : "postulaciones"}`);
  if (r.gris > 0) partes.push(`${r.gris} por decidir`);
  if (r.descartadas > 0) partes.push(`${r.descartadas} ${r.descartadas === 1 ? "descartada" : "descartadas"}`);
  if (r.errores > 0) partes.push(`${r.errores} ${r.errores === 1 ? "búsqueda no terminó" : "búsquedas no terminaron"}`);
  return partes.join(" · ");
}

// "hoy 09:14", "ayer 21:30". Se compara por día calendario (no por 24 h): lo
// que terminó anoche a las 23:50 es "ayer" aunque hayan pasado 10 horas.
function cuando(fecha: Date, ahora: Date): string {
  const hora = fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diasAtras = Math.round((dia(ahora) - dia(fecha)) / 86_400_000);
  if (diasAtras <= 0) return `hoy ${hora}`;
  if (diasAtras === 1) return `ayer ${hora}`;
  // Menos de 48 h pueden ser 2 días calendario (hace 47 h, a las 00:10).
  return `el ${fecha.toLocaleDateString("es-CL", { weekday: "long" })} ${hora}`;
}

export function textoTarjetaRafaga(ultima: UltimaRafaga | null, ahora: Date): { t: string; d: string } {
  if (!ultima) {
    return { t: "Todavía no se puso al día", d: PEDIR_QUE_ABRA_CHROME };
  }

  const fecha = new Date(ultima.en);
  const horas = (ahora.getTime() - fecha.getTime()) / 3_600_000;

  if (horas >= HORAS_SIN_PONERSE_AL_DIA) {
    return { t: `Hace ${Math.floor(horas / 24)} días que no se pone al día`, d: PEDIR_QUE_ABRA_CHROME };
  }
  return { t: `Última puesta al día: ${cuando(fecha, ahora)}`, d: detalleConteos(ultima.resumen) };
}
