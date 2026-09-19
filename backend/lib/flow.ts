import { createHmac } from "crypto";

// Stripe no opera en Chile -- Flow es la pasarela chilena que sí acepta
// cuentas de persona natural.
//
// Hoy AutoPostula usa SOLO el pago único (crearPago / estadoPago): Premium son
// pases prepagados de 30 o 90 días, sin renovación automática
// (docs/pase-prepagado.md). El Cargo Automático de Flow, del que dependen las
// suscripciones, es solo para empresas.
// Docs: https://developers.flow.cl/api (OpenAPI: es-openApiFlow.yaml)
const BASE_URL = process.env.FLOW_SANDBOX === "false" ? "https://www.flow.cl/api" : "https://sandbox.flow.cl/api";

function credenciales() {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error("Faltan FLOW_API_KEY o FLOW_SECRET_KEY");
  }
  return { apiKey, secretKey };
}

// Flow firma ordenando los parámetros alfabéticamente por nombre, los
// concatena como "nombre1valor1nombre2valor2..." y firma ese string con
// HMAC-SHA256 usando el secretKey -- así prueba que la petición viene de
// nuestro comercio y no fue alterada en el camino.
function firmar(params: Record<string, string | number>, secretKey: string) {
  const ordenado = Object.keys(params).sort();
  const paraFirmar = ordenado.map((k) => `${k}${params[k]}`).join("");
  return createHmac("sha256", secretKey).update(paraFirmar).digest("hex");
}

async function flowRequest<T = any>(
  path: string,
  params: Record<string, string | number>,
  method: "GET" | "POST" = "POST"
): Promise<T> {
  const { apiKey, secretKey } = credenciales();
  const completos = { ...params, apiKey };
  const s = firmar(completos, secretKey);
  const conFirma = { ...completos, s };

  const url = new URL(BASE_URL + path);
  let res: Response;
  if (method === "GET") {
    Object.entries(conFirma).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    res = await fetch(url.toString());
  } else {
    const body = new URLSearchParams();
    Object.entries(conFirma).forEach(([k, v]) => body.set(k, String(v)));
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje = (data as any)?.message ?? JSON.stringify(data);
    throw new Error(`Flow ${path} falló (${res.status}): ${mensaje}`);
  }
  return data as T;
}

// Estado de una orden de pago (payment/getStatus). Verificado contra el OpenAPI
// de Flow el 2026-09-19.
export const FLOW_PENDIENTE = 1;
export const FLOW_PAGADA = 2;
export const FLOW_RECHAZADA = 3;
export const FLOW_ANULADA = 4;

export type EstadoPagoFlow = {
  flowOrder: number;
  commerceOrder: string;
  status: number;
  currency: string;
  amount: number;
  payer: string;
};

export const flow = {
  // ── Pago único: lo único que se usa hoy ─────────────────────────────
  // Devuelve la url a la que redirigir al pagador: url + "?token=" + token.
  crearPago: (params: {
    commerceOrder: string;
    subject: string;
    currency: "CLP";
    amount: number;
    email: string;
    urlConfirmation: string;
    urlReturn: string;
  }) => flowRequest<{ url: string; token: string; flowOrder: number }>("/payment/create", params),

  estadoPago: (token: string) => flowRequest<EstadoPagoFlow>("/payment/getStatus", { token }, "GET"),

  // ── Suscripciones (Cargo Automático) ────────────────────────────────
  // Sin uso desde 2026-09-19 (docs/pase-prepagado.md). Se conservan para
  // volver a la renovación automática cuando AutoPostula opere como empresa:
  // el Cargo Automático de Flow es solo para empresas.
  crearCliente: (params: { name: string; email: string; externalId: string }) =>
    flowRequest<{ customerId: string }>("/customer/create", params),

  registrarTarjeta: (params: { customerId: string; url_return: string }) =>
    flowRequest<{ url: string; token: string }>("/customer/register", params),

  estadoRegistroTarjeta: (token: string) =>
    flowRequest<{ status: number; customerId: string }>("/customer/getRegisterStatus", { token }, "GET"),

  crearPlan: (params: {
    planId: string;
    name: string;
    amount: number;
    interval: number;
    urlCallback: string;
  }) => flowRequest("/plans/create", params),

  editarPlan: (params: { planId: string; urlCallback: string }) =>
    flowRequest("/plans/edit", params),

  crearSuscripcion: (params: { planId: string; customerId: string }) =>
    flowRequest<{
      subscriptionId: string;
      status: number;
      period_start: string;
      period_end: string;
    }>("/subscription/create", params),

  obtenerSuscripcion: (subscriptionId: string) =>
    flowRequest<{
      subscriptionId: string;
      status: number;
      period_start: string;
      period_end: string;
      cancel_at_period_end: number;
    }>("/subscription/get", { subscriptionId }, "GET"),

  cancelarSuscripcion: (params: { subscriptionId: string; at_period_end: 0 | 1 }) =>
    flowRequest("/subscription/cancel", params),
};
