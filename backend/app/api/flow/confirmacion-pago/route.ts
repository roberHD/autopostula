import { NextResponse } from "next/server";
import { procesarTokenDePago } from "@/lib/pagos";

// docs/pase-prepagado.md §5.2: la "urlConfirmation" de Flow. Flow le pega acá,
// de servidor a servidor, cada vez que cambia el estado de un pago (puede ser
// más de una vez por el mismo pago). Solo trae un `token`: el estado real se
// le pregunta a Flow (procesarTokenDePago), no se confía en la petición.
//
// Responde 200 siempre que el aviso se haya PROCESADO, aunque el pago haya sido
// rechazado o no se haya podido acreditar (eso ya quedó en el log): un 200
// significa "recibido", y Flow reintenta solo ante un error de servidor.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Falta token" }, { status: 400 });
  }

  try {
    const resultado = await procesarTokenDePago(token);
    return NextResponse.json({ ok: true, estado: resultado.estado });
  } catch (err) {
    console.error("Error procesando la confirmación de un pago de Flow:", err);
    return NextResponse.json({ error: "Error procesando el aviso" }, { status: 500 });
  }
}
