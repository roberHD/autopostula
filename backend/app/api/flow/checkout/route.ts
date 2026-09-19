import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flow } from "@/lib/flow";
import { getUsuarioSesion } from "@/lib/auth-helpers";
import { getBaseUrl } from "@/lib/base-url";
import { PASES, esIdPase } from "@/lib/pases";

// docs/pase-prepagado.md §5.1: inicia el pago de un pase de 30 o 90 días con el
// pago único de Flow (payment/create). Ya no hay suscripción, cliente ni
// tarjeta registrada: es un pago que se hace una vez y no se renueva solo.
//
// Comprar teniendo Premium vigente está permitido: el pase nuevo se apila (§2).
export async function POST(request: Request) {
  const { userId, error } = await getUsuarioSesion();
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { pase } = await request.json().catch(() => ({}));
  if (!esIdPase(pase)) {
    return NextResponse.json({ error: "Elige un pase de 30 o de 90 días" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerificado: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // docs/verificacion-de-correo.md §5: no se le cobra a una dirección que no
  // existe -- el comprobante y los avisos de vencimiento van por correo.
  if (!user.emailVerificado) {
    return NextResponse.json(
      { error: "Verifica tu correo para contratar Premium", requiereVerificacion: true },
      { status: 403 }
    );
  }

  // El monto sale del catálogo del servidor, nunca del cliente.
  const catalogo = PASES[pase];

  // El pago se crea ANTES de ir a Flow, en PENDIENTE: es lo que después
  // identifica al pago cuando Flow avisa (commerceOrder), en vez del correo del
  // pagador, que puede ser otro.
  const pago = await prisma.payment.create({
    data: {
      userId,
      pase,
      dias: catalogo.dias,
      monto: catalogo.monto,
      commerceOrder: `ap_${crypto.randomUUID()}`,
    },
  });

  try {
    // getBaseUrl() y no el header Origin: el header es falsificable (ver
    // lib/base-url.ts) y esto termina en una URL a la que Flow le habla a
    // nuestro servidor.
    const base = getBaseUrl();
    const orden = await flow.crearPago({
      commerceOrder: pago.commerceOrder,
      subject: catalogo.nombre,
      currency: "CLP",
      amount: catalogo.monto,
      email: user.email,
      urlConfirmation: `${base}/api/flow/confirmacion-pago`,
      urlReturn: `${base}/api/flow/retorno-pago`,
    });

    await prisma.payment.update({ where: { id: pago.id }, data: { flowOrder: String(orden.flowOrder) } });
    return NextResponse.json({ url: `${orden.url}?token=${orden.token}` });
  } catch (err) {
    console.error("Error iniciando el pago en Flow:", err);
    // Nunca llegó a ser un pago: se marca para que no quede pendiente para siempre.
    await prisma.payment.update({ where: { id: pago.id }, data: { estado: "FALLIDO" } }).catch(() => {});
    return NextResponse.json(
      { error: "No se pudo iniciar el pago — intenta de nuevo en un momento" },
      { status: 500 }
    );
  }
}
