import { NextResponse } from "next/server";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { aceptoDocumentosVigentes, registrarAceptacion } from "@/lib/consentimiento";

// La página /aceptar: anota que la persona aceptó los términos y la política
// vigentes y declaró ser mayor de edad (lib/consentimiento.ts).
export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) return NextResponse.json({ error }, { status: 401 });

  const cuerpo = await request.json().catch(() => null);
  if (cuerpo?.aceptaTerminos !== true || cuerpo?.mayorDeEdad !== true) {
    return NextResponse.json(
      { error: "Para seguir tienes que aceptar los términos y la política de privacidad, y tener 18 años o más." },
      { status: 400 }
    );
  }

  // Dos pestañas abiertas no dejan dos filas iguales.
  if (!(await aceptoDocumentosVigentes(userId))) await registrarAceptacion(userId, "aceptar");
  return NextResponse.json({ ok: true });
}
