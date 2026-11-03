import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * La misma oferta puede volver con otro enlace. Trabajando le agrega lo que se
 * buscó (/trabajo-empleo/vendedor/trabajo/6141491-… y
 * /trabajo-empleo/asistente-de-ventas/trabajo/6141491-…) y Computrabajo la
 * muestra suelta (…-ID) o en el panel de un listado (trabajo-de-…#ID). El número
 * del aviso no cambia: es el que usa cada adaptador de la extensión para
 * reconocerla (getId en extension/adapters/*.js).
 *
 * Sirve para no volver a preguntar en «Por decidir» por una oferta que la
 * persona ya decidió (docs/aprobadas-y-portal-desconectado-2026-11-03.md §3).
 * Si el enlace no trae el número, se compara el enlace entero.
 */
type Regla = { patron: RegExp; mayusculas?: boolean; fragmento: (id: string) => string };

const REGLAS: Record<string, Regla[]> = {
  Trabajando: [{ patron: /\/trabajo\/(\d+)(?=[-/?#]|$)/, fragmento: (id) => `/trabajo/${id}` }],
  Laborum: [{ patron: /-(\d+)\.html(?=[?#]|$)/, fragmento: (id) => `-${id}.html` }],
  // Los ID de Computrabajo son de 32 caracteres hexadecimales. Con menos se
  // corre el riesgo de tomar un trozo del nombre ("…-cafe1234") por un ID.
  Computrabajo: [
    { patron: /#([A-F0-9]{32})$/i, mayusculas: true, fragmento: (id) => id },
    { patron: /-([A-F0-9]{32})(?=[?#]|$)/i, mayusculas: true, fragmento: (id) => id },
  ],
};

function calce(url: string | null | undefined, plataforma: string | null | undefined) {
  if (!url || !plataforma) return null;
  for (const regla of REGLAS[plataforma] ?? []) {
    const m = url.match(regla.patron);
    if (m) return { regla, id: regla.mayusculas ? m[1].toUpperCase() : m[1] };
  }
  return null;
}

/** "Trabajando:6141491", o null si el enlace no trae el número del aviso. */
export function claveDeOferta(url: string | null | undefined, plataforma: string | null | undefined): string | null {
  const c = calce(url, plataforma);
  return c ? `${plataforma}:${c.id}` : null;
}

export function esLaMismaOferta(
  a: { url: string | null; plataforma: string | null },
  b: { url: string | null; plataforma: string | null },
): boolean {
  if (a.url && a.url === b.url) return true;
  const clave = claveDeOferta(a.url, a.plataforma);
  return clave !== null && clave === claveDeOferta(b.url, b.plataforma);
}

/**
 * Para buscar en la base las decisiones que pueden ser de la misma oferta: el
 * mismo enlace o, si trae el número del aviso, cualquier enlace de ese portal
 * que lo contenga. Lo que vuelve hay que confirmarlo con esLaMismaOferta (un
 * "contiene" de la base no sabe dónde termina el número).
 */
export function filtroMismaOferta(url: string, plataforma: string | null): Prisma.DecisionOfertaWhereInput {
  const c = calce(url, plataforma);
  if (!c || !plataforma) return { url };
  return { OR: [{ url }, { plataforma, url: { contains: c.regla.fragmento(c.id), mode: "insensitive" } }] };
}
