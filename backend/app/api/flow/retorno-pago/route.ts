import { NextResponse } from "next/server";
import { procesarTokenDePago } from "@/lib/pagos";
import { getBaseUrl } from "@/lib/base-url";

// docs/pase-prepagado.md §5.3: la "urlReturn" de Flow -- el navegador de la
// persona vuelve acá al terminar (o abandonar) el pago. Hace lo mismo que la
// confirmación, porque el retorno puede llegar ANTES que ella: es idempotente,
// así que da igual quién acredite primero.
//
// El pago se identifica por el token, no por la sesión: el navegador puede
// llegar sin la cookie de sesión (petición POST desde otro sitio).
async function volver(token: string | null): Promise<NextResponse> {
  let resultado: "exito" | "pendiente" | "rechazado" = "pendiente";
  if (token) {
    try {
      const pago = await procesarTokenDePago(token);
      if (pago.estado === "PAGADO") resultado = "exito";
      else if (pago.estado === "FALLIDO" || pago.estado === "ANULADO") resultado = "rechazado";
      // PENDIENTE y ERROR: "se está procesando". Un ERROR (un monto que no
      // cuadra, por ejemplo) ya quedó en el log para revisarlo; no se le muestra
      // a la persona un rechazo que no es suyo.
    } catch (err) {
      console.error("Error procesando el retorno de un pago de Flow:", err);
    }
  }
  // 303: el retorno llega por POST y la página de destino se pide con GET.
  return NextResponse.redirect(`${getBaseUrl()}/dashboard/premium?pago=${resultado}`, 303);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  return volver(typeof token === "string" ? token : null);
}

// Por si Flow (o el navegador) vuelve con un GET y el token en la URL.
export async function GET(request: Request) {
  return volver(new URL(request.url).searchParams.get("token"));
}
