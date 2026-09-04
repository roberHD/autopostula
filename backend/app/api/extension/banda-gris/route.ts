import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Reporta una oferta que el scorer local (§6) dejó en banda gris -- entra a
// la cola de decisión del usuario (§8), no se descarta ni se postula sola.
// Mismo patrón de auth por token que el resto de rutas que llama la extensión.
async function getUserFromToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

// TTL de la cola (§8.4): generoso, pero corta el pudrimiento de ofertas viejas.
const DIAS_TTL = 7;

export async function POST(request: Request) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Token inválido o ausente" }, { status: 401 });
  }

  const { titulo, url, empresa, plataforma, scoreLocal, razones } = await request.json().catch(() => ({}));
  if (!titulo) {
    return NextResponse.json({ error: "Falta titulo" }, { status: 400 });
  }

  // Evita duplicados si un escaneo posterior (la alarma corre cada 2h) vuelve
  // a ver la misma oferta mientras sigue pendiente de decisión.
  if (url) {
    const existente = await prisma.decisionOferta.findFirst({
      where: { userId: user.id, url, fuente: "BANDA_GRIS", veredicto: "PENDIENTE" },
    });
    if (existente) {
      return NextResponse.json({ ok: true, yaExistia: true });
    }
  }

  const venceEn = new Date();
  venceEn.setDate(venceEn.getDate() + DIAS_TTL);

  await prisma.decisionOferta.create({
    data: {
      userId: user.id,
      tituloCrudo: titulo,
      url: url || null,
      empresa: empresa || null,
      plataforma: plataforma || null,
      scoreLocal: typeof scoreLocal === "number" ? scoreLocal : null,
      razones: Array.isArray(razones) ? razones : undefined,
      fuente: "BANDA_GRIS",
      veredicto: "PENDIENTE",
      venceEn,
    },
  });

  return NextResponse.json({ ok: true });
}
