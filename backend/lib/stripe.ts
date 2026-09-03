import Stripe from "stripe";

let instancia: Stripe | null = null;

// Lazy a propósito: el SDK de Stripe tira una excepción en el constructor si
// la apiKey viene vacía, y este archivo se evalúa al armar el build (Next
// recolecta las rutas) -- sin esto, el build se rompe apenas STRIPE_SECRET_KEY
// no está seteada todavía (igual que pasó antes con AUTH_SECRET en Vercel).
// Al pedirlo lazy, recién truena si de verdad se intenta usar sin la key.
export function getStripe(): Stripe {
  if (!instancia) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("Falta STRIPE_SECRET_KEY");
    }
    // apiVersion fija a propósito -- Stripe cambia la forma de los eventos
    // entre versiones, y sin esto un upgrade silencioso de la cuenta de
    // Stripe podría romper el webhook sin que el código haya cambiado.
    instancia = new Stripe(apiKey, { apiVersion: "2026-08-26.dahlia" });
  }
  return instancia;
}
