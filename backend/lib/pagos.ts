import type { Payment } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { flow, FLOW_PAGADA, FLOW_RECHAZADA, FLOW_ANULADA, type EstadoPagoFlow } from "@/lib/flow";
import { PASES, esIdPase } from "@/lib/pases";
import { asegurarPlanesBase } from "@/lib/plans";
import { finDelUltimoPase } from "@/lib/plan-vigente";
import { enviarComprobantePase } from "@/lib/correo";

// docs/pase-prepagado.md §5.2: acredita un pago de Flow. Lo llaman las DOS
// puertas por las que Flow avisa -- la confirmación (servidor a servidor) y el
// retorno (el navegador de la persona) -- y pueden llegar en cualquier orden,
// más de una vez y hasta a la vez. Por eso es idempotente: acreditar el mismo
// pago dos veces da un solo pase.

export type ResultadoPago =
  | { estado: "PAGADO"; nuevo: boolean; venceEn: Date | null }
  | { estado: "PENDIENTE" }
  | { estado: "FALLIDO" }
  | { estado: "ANULADO" }
  // El pago existe en Flow pero no se pudo acreditar (monto que no calza con el
  // catálogo, cuenta borrada, pase desconocido). Queda en el log; nunca se
  // acredita un pase por un pago que no cuadra.
  | { estado: "ERROR"; motivo: string }
  | { estado: "DESCONOCIDO" };

async function planPremium() {
  const existente = await prisma.plan.findFirst({ where: { tipo: "PREMIUM" } });
  if (existente) return existente;
  const planes = await asegurarPlanesBase();
  return planes.find((p) => p.tipo === "PREMIUM")!;
}

/**
 * Con el token que manda Flow: consulta el estado real del pago a Flow (nunca se
 * confía en lo que llega en la petición), busca el Payment por commerceOrder --
 * NUNCA por el email del pagador, que puede ser distinto del de la cuenta -- y lo
 * acredita.
 */
export async function procesarTokenDePago(token: string): Promise<ResultadoPago> {
  const estadoFlow = await flow.estadoPago(token);
  const payment = await prisma.payment.findUnique({ where: { commerceOrder: estadoFlow.commerceOrder } });
  if (!payment) {
    console.error("[pagos] Flow avisó de un pago que no reconocemos:", estadoFlow.commerceOrder);
    return { estado: "DESCONOCIDO" };
  }
  return acreditarPago(payment, estadoFlow);
}

export async function acreditarPago(payment: Payment, estadoFlow: EstadoPagoFlow): Promise<ResultadoPago> {
  const status = Number(estadoFlow.status);

  if (status === FLOW_RECHAZADA || status === FLOW_ANULADA) {
    const nuevo = status === FLOW_RECHAZADA ? "FALLIDO" : "ANULADO";
    // Solo un pago que sigue pendiente: uno ya PAGADO no se degrada porque
    // llegue un aviso viejo o repetido.
    await prisma.payment.updateMany({
      where: { id: payment.id, estado: "PENDIENTE" },
      data: { estado: nuevo, flowOrder: String(estadoFlow.flowOrder) },
    });
    const actual = await prisma.payment.findUnique({ where: { id: payment.id }, select: { estado: true } });
    return actual?.estado === "PAGADO" ? pagado(payment, false) : { estado: nuevo };
  }

  if (status !== FLOW_PAGADA) return { estado: "PENDIENTE" };

  if (payment.estado === "PAGADO") return pagado(payment, false);

  // El monto y la moneda que reporta Flow tienen que ser los del catálogo: si
  // no, algo alteró la orden (o el catálogo cambió a mitad de un pago).
  if (!esIdPase(payment.pase)) {
    console.error("[pagos] Pago con un pase que no está en el catálogo:", payment.commerceOrder, payment.pase);
    return { estado: "ERROR", motivo: "pase_desconocido" };
  }
  const catalogo = PASES[payment.pase];
  if (Number(estadoFlow.amount) !== catalogo.monto || estadoFlow.currency !== "CLP") {
    console.error(
      "[pagos] El monto de Flow no coincide con el catálogo; no se acredita:",
      payment.commerceOrder,
      { flow: `${estadoFlow.amount} ${estadoFlow.currency}`, catalogo: `${catalogo.monto} CLP` },
    );
    return { estado: "ERROR", motivo: "monto_no_coincide" };
  }
  if (!payment.userId) {
    // La cuenta se borró entre que se inició el pago y que se pagó. No hay a
    // quién darle el pase: queda registrado para resolverlo a mano.
    console.error("[pagos] Pago recibido de una cuenta que ya no existe; hay que resolverlo a mano:", payment.commerceOrder);
    await prisma.payment.updateMany({
      where: { id: payment.id, estado: "PENDIENTE" },
      data: { estado: "PAGADO", flowOrder: String(estadoFlow.flowOrder) },
    });
    return { estado: "ERROR", motivo: "cuenta_inexistente" };
  }

  const plan = await planPremium();
  const userId = payment.userId;

  let acreditado: { inicio: Date; fin: Date } | null = null;
  // Dos avisos del mismo pago (o dos pagos del mismo usuario) llegando juntos
  // chocan bajo Serializable: Postgres aborta a uno con P2034. Se reintenta --
  // la segunda vez el pago ya está PAGADO (y devuelve "ya acreditado") o el otro
  // pase ya existe (y este arranca después de él). Solo si sigue chocando se
  // le deja el error a Flow, que reintenta el aviso.
  for (let intento = 1; ; intento++) {
    try {
      acreditado = await prisma.$transaction(
        async (tx) => {
          // El que llega primero gana: si otra llamada ya lo marcó PAGADO, esta no
          // hace nada. Es lo que vuelve idempotente al conjunto.
          const marcado = await tx.payment.updateMany({
            where: { id: payment.id, estado: { not: "PAGADO" } },
            data: { estado: "PAGADO", flowOrder: String(estadoFlow.flowOrder) },
          });
          if (marcado.count === 0) return null;

          // Comprar con un pase vigente suma días: el nuevo empieza cuando termina
          // el anterior (§2).
          const ahora = new Date();
          const finAnterior = await finDelUltimoPase(userId, ahora, tx);
          const inicio = finAnterior && finAnterior > ahora ? finAnterior : ahora;
          const fin = new Date(inicio.getTime() + catalogo.dias * 24 * 3_600_000);

          const pase = await tx.subscription.create({
            data: { userId, planId: plan.id, estado: "ACTIVA", periodoInicio: inicio, periodoFin: fin },
          });
          await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: pase.id } });
          return { inicio, fin };
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (err) {
      const choque = (err as { code?: string })?.code === "P2034";
      if (!choque || intento >= 4) {
        console.error("[pagos] No se pudo acreditar el pago (se reintenta con el próximo aviso):", payment.commerceOrder, err);
        throw err;
      }
      await new Promise((r) => setTimeout(r, 40 * intento));
    }
  }

  if (!acreditado) return pagado(payment, false);

  // El comprobante es un correo: si falla, el pase ya está acreditado y no se
  // deshace por eso.
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) {
      await enviarComprobantePase(user.email, {
        pase: catalogo.nombre,
        monto: catalogo.monto,
        desde: acreditado.inicio,
        hasta: acreditado.fin,
        flowOrder: String(estadoFlow.flowOrder),
      });
    }
  } catch (err) {
    console.error("[pagos] El pase quedó acreditado pero no se pudo enviar el comprobante:", payment.commerceOrder, err);
  }

  return { estado: "PAGADO", nuevo: true, venceEn: acreditado.fin };
}

// La vigencia que se le muestra a la persona: hasta cuándo llega su Premium
// ahora (con pases apilados, el que termina último).
async function pagado(payment: Payment, nuevo: boolean): Promise<ResultadoPago> {
  const venceEn = payment.userId ? await finDelUltimoPase(payment.userId) : null;
  return { estado: "PAGADO", nuevo, venceEn };
}
