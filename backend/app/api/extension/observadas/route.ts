import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { puntajeONull, urlDePortal } from "@/lib/entrada";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

/**
 * Las ofertas a las que la extensión habría postulado al mirar un portal en
 * modo "solo mirar" (docs/primera-busqueda-guiada.md §11). Antes quedaban solo
 * en el historial del navegador: la tarjeta "Probemos" del panel no podía decir
 * cuáles ni cuántas, y si todas las de la página calzaban no le llegaba ningún
 * rastro de que la extensión había mirado.
 *
 * Best-effort como los descartes: si falla, el escaneo sigue igual. La misma
 * oferta vista en otro escaneo no se duplica (se queda la primera vez).
 */
export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const { plataforma, ofertas } = await request.json().catch(() => ({}));
  if (!plataforma || typeof plataforma !== "string" || !Array.isArray(ofertas)) {
    return NextResponse.json({ error: "Faltan plataforma u ofertas" }, { status: 400 });
  }

  const portal = plataforma.slice(0, 50);
  const filas = ofertas
    .slice(0, 200)
    .filter((o: any) => o && typeof o.externalId === "string" && o.externalId && typeof o.titulo === "string" && o.titulo)
    .map((o: any) => ({
      userId: user.id,
      plataforma: portal,
      externalId: o.externalId.slice(0, 200),
      titulo: o.titulo.slice(0, 300),
      empresa: typeof o.empresa === "string" && o.empresa ? o.empresa.slice(0, 200) : null,
      // docs/revision-2026-09-28.md §1: el panel la muestra como enlace -- solo
      // https:// del mismo portal.
      url: urlDePortal(o.url, portal),
      // La razón a favor tal como la dio el scorer: un objeto { tipo, ... }.
      razon:
        o.razon && (typeof o.razon === "object" || typeof o.razon === "string") && JSON.stringify(o.razon).length < 2_000
          ? o.razon
          : undefined,
      scoreLocal: puntajeONull(o.score),
    }));

  if (!filas.length) return NextResponse.json({ ok: true, guardados: 0 });

  const { count } = await prisma.ofertaObservada.createMany({ data: filas, skipDuplicates: true });
  return NextResponse.json({ ok: true, guardados: count });
}
