import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// Misma normalización que AP.n en extension/core.js -- tiene que ser exactamente la
// misma en los dos lados, o formaCruda nunca calza entre lo que manda la extensión y
// lo que ya hay guardado (bug silencioso, ver docs/rediseno-filtrado-ofertas.md, §13).
function normalizar(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Cosecha pasiva del corpus de títulos (ver docs/rediseno-filtrado-ofertas.md, §7.2):
// cada escaneo de la extensión reporta acá los títulos que vio -- los haya pasado el
// filtro o no, esa es la parte que antes se tiraba a la basura. Solo acumula frecuencia
// en TituloCanonico; no hay IA de por medio y no cuesta nada. El parser (§7.3) y la
// agrupación con IA (§7.4) se corren después, aparte, en batch sobre lo acumulado.
export async function POST(request: Request) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
    }

    const { platformNombre, titulos } = await request.json();
    if (!platformNombre || !Array.isArray(titulos) || !titulos.length) {
      return NextResponse.json({ error: "Faltan platformNombre o titulos" }, { status: 400 });
    }

    const platform = await prisma.jobPlatform.findUnique({ where: { nombre: platformNombre } });
    if (!platform) {
      return NextResponse.json({ error: `Portal desconocido: ${platformNombre}` }, { status: 400 });
    }

    // Un mismo escaneo puede traer el mismo título repetido (dos avisos con
    // exactamente el mismo texto) -- se cuenta cada aparición, no se deduplica.
    const conteos = new Map<string, number>();
    for (const t of titulos.slice(0, 200)) {
      const formaCruda = normalizar(typeof t === "string" ? t : "");
      if (formaCruda.length < 3) continue;
      conteos.set(formaCruda, (conteos.get(formaCruda) || 0) + 1);
    }

    for (const [formaCruda, veces] of conteos) {
      await prisma.tituloCanonico.upsert({
        where: { formaCruda },
        create: { formaCruda, formaLimpia: formaCruda, frecuencia: veces, platformId: platform.id },
        update: { frecuencia: { increment: veces } },
      });
    }

    return NextResponse.json({ ok: true, procesados: conteos.size });
  } catch (err) {
    console.error("Error en /api/extension/titulos-vistos:", err);
    return NextResponse.json(
      { error: "Error al guardar los títulos vistos — revisa la terminal del servidor" },
      { status: 500 }
    );
  }
}
