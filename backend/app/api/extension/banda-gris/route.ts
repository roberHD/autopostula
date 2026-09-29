import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { textoCorto, urlDePortal } from "@/lib/entrada";

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

  const cuerpo = await request.json().catch(() => ({}));
  const { scoreLocal, razones, detalleAviso } = cuerpo ?? {};
  // docs/revision-2026-09-28.md §1 y §25: lo que llega se recorta, y el enlace
  // (que la extensión abre después para postular) tiene que ser https:// del
  // portal. Uno que no lo es se guarda como null: la decisión igual sirve para
  // que el perfil aprenda.
  const titulo = textoCorto(cuerpo?.titulo, 300);
  const plataforma = textoCorto(cuerpo?.plataforma, 50);
  const empresa = textoCorto(cuerpo?.empresa, 200);
  const url = urlDePortal(cuerpo?.url, plataforma);
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

  // docs/revision-2026-09-16.md §2.3: se recibía detalleAviso pero nunca se
  // escribía acá -- 0 de 39 pendientes en producción lo tenían, aunque la
  // extensión sí lo extraía bien. El límite de tamaño es defensivo: esto es
  // para pintar la tarjeta ("Por decidir"), no para guardar el aviso entero.
  const detalleAvisoValido =
    detalleAviso && typeof detalleAviso === "object" && JSON.stringify(detalleAviso).length < 10_000
      ? detalleAviso
      : undefined;

  await prisma.decisionOferta.create({
    data: {
      userId: user.id,
      tituloCrudo: titulo,
      url: url || null,
      empresa: empresa || null,
      plataforma: plataforma || null,
      scoreLocal: typeof scoreLocal === "number" && Number.isFinite(scoreLocal) ? Math.round(scoreLocal) : null,
      razones: Array.isArray(razones) && JSON.stringify(razones).length < 5_000 ? razones.slice(0, 20) : undefined,
      detalleAviso: detalleAvisoValido,
      fuente: "BANDA_GRIS",
      veredicto: "PENDIENTE",
      venceEn,
    },
  });

  return NextResponse.json({ ok: true });
}
