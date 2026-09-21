import { limpiarTitulo } from "@/lib/text";

// docs/revision-2026-09-16.md §2.8: "Asesor Comercial Remoto | AVAN-C Chile"
// se postuló 3 veces el mismo día en Laborum. El portal le da a cada
// publicación su propio id, así que el id no sirve para detectar que es el
// mismo cargo de la misma empresa publicado de nuevo -- la clave es
// título + empresa normalizados.

export const DIAS_VENTANA_DUPLICADOS = 30;

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Día calendario en Chile (no en UTC): una postulación a las 22:00 de Santiago
// ya es "mañana" en UTC, y "mismo día" se lee desde la persona, no del servidor.
function diaEnChile(fecha: Date): string {
  return fecha.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
}

// Sin empresa, título solo es demasiado poco para llamarlo "el mismo aviso"
// (hay cientos de "Vendedor" a la vez en un portal) -- se exige además que sea
// el mismo día.
export function claveDuplicado(titulo: string, empresa: string | null | undefined, fecha: Date): string {
  const t = normalizar(limpiarTitulo(titulo));
  const e = normalizar(empresa);
  return e ? `${t}|${e}` : `${t}||${diaEnChile(fecha)}`;
}
