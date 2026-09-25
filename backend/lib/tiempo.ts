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
