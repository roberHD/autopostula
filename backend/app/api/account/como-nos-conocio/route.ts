import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioSesion } from "@/lib/auth-helpers";

// Primera pregunta del onboarding. Es lo único que responde "¿de qué sirvió la
// plata que pusimos en publicidad?": sin esto solo se ve cuánta gente entra,
// no por dónde llegó.

// Valores cerrados a propósito. Si fuera texto libre, el reporte sería
// "instagram", "Instagram", "IG" y "insta" como cuatro canales distintos.
export const CANALES = [
  { id: "instagram", etiqueta: "Instagram" },
  { id: "tiktok", etiqueta: "TikTok" },
  { id: "facebook", etiqueta: "Facebook" },
  { id: "buscador", etiqueta: "Buscando en Google" },
  { id: "youtube", etiqueta: "YouTube" },
  { id: "recomendacion", etiqueta: "Me lo recomendaron" },
  { id: "chrome_store", etiqueta: "La tienda de Chrome" },
  { id: "otro", etiqueta: "Otro" },
] as const;

const IDS = CANALES.map((c) => c.id) as readonly string[];

// El texto libre solo aplica a "Otro" y se recorta: es para leerlo en un
// reporte, no un campo de notas.
const MAX_OTRO = 120;

export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  try {
    const { canal, otro } = await request.json();

    if (!IDS.includes(canal)) {
      return NextResponse.json({ error: "Canal desconocido" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        comoNosConocio: canal,
        comoNosConocioOtro:
          canal === "otro" && typeof otro === "string" && otro.trim()
            ? otro.trim().slice(0, MAX_OTRO)
            : null,
        comoNosConocioEn: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error en /api/account/como-nos-conocio:", err);
    // No se le corta el onboarding a nadie porque esto falle: es un dato para
    // nosotros, no algo que la persona necesite para usar la app.
    return NextResponse.json({ error: "No pudimos guardarlo" }, { status: 500 });
  }
}
