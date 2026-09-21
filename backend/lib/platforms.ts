import { prisma } from "@/lib/prisma";

// Portales que la extensión sabe automatizar. Si agregas un portal nuevo acá,
// también agrégalo a extension/manifest.json (content_scripts) y crea su
// adaptador en extension/adapters/.
export const PLATAFORMAS_BASE = [
  { nombre: "Computrabajo", urlBase: "https://www.computrabajo.cl", adapterVersion: "v1" },
  { nombre: "Laborum", urlBase: "https://www.laborum.cl", adapterVersion: "v1" },
  { nombre: "Trabajando", urlBase: "https://www.trabajando.cl", adapterVersion: "v1" },
] as const;

// Portales cuyo adaptador sabe leer "mis postulaciones" y sincronizar el
// estado (escanearMisPostulaciones + su MAPA_ESTADO_*). Hoy solo Computrabajo:
// lo postulado por los otros dos queda congelado en ENVIADO para siempre.
//
// docs/estado-real-de-postulaciones.md §4: mientras esto sea parcial, ninguna
// métrica de respuesta puede presentarse como si cubriera todo. Al agregarle
// seguimiento a un portal (§5, pasos 5 y 6), se suma acá y las métricas del
// dashboard se corrigen solas.
export const PORTALES_CON_SEGUIMIENTO: readonly string[] = ["Computrabajo"];

export function portalSigueEstado(nombre: string) {
  return PORTALES_CON_SEGUIMIENTO.includes(nombre);
}

// Se llama desde cualquier endpoint que necesite la lista de portales, en vez
// de depender de que alguien haya corrido `npx tsx seed.ts` a mano. Los
// upserts son baratos e idempotentes, así que no hay problema en llamarlo en
// cada request.
export async function asegurarPlataformasBase() {
  await Promise.all(
    PLATAFORMAS_BASE.map((p) =>
      prisma.jobPlatform.upsert({
        where: { nombre: p.nombre },
        update: {},
        create: p,
      })
    )
  );
}
