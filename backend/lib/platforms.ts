import { prisma } from "@/lib/prisma";

// Portales que la extensión sabe automatizar. Si agregas un portal nuevo acá,
// también agrégalo a extension/manifest.json (content_scripts) y crea su
// adaptador en extension/adapters/.
export const PLATAFORMAS_BASE = [
  { nombre: "Computrabajo", urlBase: "https://www.computrabajo.cl", adapterVersion: "v1" },
  { nombre: "Laborum", urlBase: "https://www.laborum.cl", adapterVersion: "v1" },
] as const;

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
