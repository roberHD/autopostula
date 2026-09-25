# Pase prepagado: Premium por 30 o 90 días, sin cobro automático — especificación

> **Estado:** decidido por Roberto el 2026-09-19 (camino A). **Implementado el mismo día**, verificado
> contra una base Postgres real (`backend/scripts/verificar-pagos.ts`: acreditación idempotente, apilado,
> vigencia por fecha, monto alterado, cron de avisos) — **falta probarlo contra el sandbox de Flow**, que
> necesita las claves. Pendiente además: regenerar `docs/legal/` (Word y PDF), cambiar la descripción de
> la Chrome Web Store y todo el punto 0 de §9 (inicio de actividades y boleta).
>
> **Actualización 2026-09-24:** Flow **ya aprobó la cuenta de comercio**. Lo único que falta para
> cobrar de verdad es el inicio de actividades en el SII y poner `FLOW_SANDBOX=false`. Por la misma
> puerta de pago pasan ahora los paquetes de créditos (`creditos-y-pagina-nueva.md`).
> **Para:** el chat de producción.
> **Reemplaza:** la suscripción mensual con Cargo Automático de Flow.
> **Relacionado:** `revision-2026-09-16.md` §1.3 (límites antes de enviar) y §8.3 (qué cuenta como
> postulación), `rafagas-y-ponerse-al-dia.md` §4 (planes y prueba automática),
> `preguntas-abogado.md` §A1 y §E.

---

## 1. Por qué cambia

**El Cargo Automático de Flow es solo para empresas.** Sus requisitos exigen una cuenta corriente a
nombre de una empresa con RUT en el SII, un giro que ampare el servicio y datos de facturación del
mismo RUT. Para personas naturales dice textualmente que el servicio *"solo se encuentra disponible
para empresas"*. La página de Suscripciones de Flow confirma que ese producto **es** el Cargo
Automático: no hay una variante sin él.

**Todo el código de pagos actual depende de ese producto:**

| Endpoint de Flow | Dónde | Para qué |
|---|---|---|
| `/customer/create`, `/customer/register`, `/customer/getRegisterStatus` | `lib/flow.ts:63-69`, `app/api/flow/checkout`, `app/api/flow/registro-callback` | Registrar la tarjeta del cliente |
| `/plans/create`, `/plans/edit` | `lib/flow.ts:77-80`, `lib/flow-plan.ts` | El plan mensual |
| `/subscription/create`, `/subscription/get`, `/subscription/cancel` | `lib/flow.ts:88-100`, `registro-callback`, `webhook-cobro`, `cancelar` | La suscripción |

Roberto opera como persona natural. **Así como está, Premium no se puede cobrar.**

**Y el cambio calza con el producto.** Buscar trabajo es temporal. Una suscripción que se sigue
cobrando cuando la persona ya encontró trabajo produce reclamos y contracargos, y Flow descuenta
los contracargos de la siguiente transferencia. El pase cobra solo mientras la persona lo necesita,
y simplifica el derecho a retracto que está pendiente con el abogado.

> **Prerrequisito que no depende del código:** según Flow, desde abril de 2025 toda plataforma de
> pago debe exigir el **inicio de actividades** ante el SII y el cumplimiento tributario. Aplica a
> cualquier pasarela, no solo a Flow. Lo tramita Roberto (ver §7 y `preguntas-abogado.md` §E).

**Camino descartado por ahora:** suscripciones de Mercado Pago. Mantendrían la renovación
automática sin empresa, pero son una integración de pagos nueva mientras la Fase 1 de la revisión
sigue pendiente.

**Camino para después:** constituir una SpA y volver al Cargo Automático de Flow, que ya está
programado. Por eso el código de suscripción de `lib/flow.ts` **no se borra** (§5.5).

---

## 2. El producto

| Pase | Duración | Precio |
|---|---|---|
| **Premium 30 días** | 30 días corridos | **$3.990** (igual que hoy) |
| **Premium 90 días** | 90 días corridos | **$9.990** — propuesta; el precio final lo decide Roberto |

- Da **exactamente los mismos beneficios** que hoy tiene el plan `PREMIUM` (`lib/plans.ts`).
- **No se renueva solo.** Al vencer, la cuenta vuelve al plan gratis sin perder historial, perfil
  ni preferencias.
- **Comprar con un pase vigente suma días**: el nuevo empieza cuando termina el anterior. Nadie
  pierde días por renovar antes.
- **Límite de postulaciones:** se mantiene por mes calendario, como hoy
  (`lib/postulacion-limits.ts`). Un pase de 30 días que cruza dos meses puede dar más de 80 en esos
  30 días. Es un borde menor y se acepta a cambio de no tocar esa lógica.

---

## 3. La vigencia se calcula por fecha, en un solo lugar

**Hoy**, que alguien sea Premium se decide consultando `Subscription` con `estado: "ACTIVA"` en
**14 lugares**, y era Flow quien cambiaba ese estado a través del webhook cuando la suscripción
vencía. Con pases **no hay nadie que lo cambie**: sin este paso, un pase de 30 días sería Premium
para siempre.

```ts
// lib/plan-vigente.ts
// Única fuente de verdad de "qué plan tiene esta persona ahora". Premium es
// un pase PAGADO cuyo período contiene el momento actual; no depende de que
// un cron o un webhook haya actualizado `estado` a tiempo.
export async function obtenerPlanVigente(userId: string) {
  const ahora = new Date();
  const pase = await prisma.subscription.findFirst({
    where: {
      userId,
      estado: "ACTIVA",
      plan: { tipo: "PREMIUM" },
      periodoInicio: { lte: ahora },
      periodoFin: { gt: ahora },
    },
    include: { plan: true },
    orderBy: { periodoFin: "desc" },
  });
  if (pase) return { tipo: "PREMIUM" as const, plan: pase.plan, venceEn: pase.periodoFin };
  return { tipo: "FREE" as const, plan: await planFree(), venceEn: null };
}
```

El rol `ADMIN` sigue su propio camino en cada lugar, como hoy.

**Reemplazar en los 14 lugares** (verificados el 2026-09-19):

```
app/api/account/busqueda-automatica/route.ts:15
app/api/account/eliminar/route.ts:36, :56
app/api/account/estado-automatico/route.ts:21
app/api/dashboard/estado/route.ts:29
app/api/flow/cancelar/route.ts:16            ← se retira (§5.5)
app/api/flow/checkout/route.ts:30
app/api/platform-accounts/route.ts:29, :82
lib/ai-usage.ts:39
lib/plan-beneficios.ts:17, :36
lib/postulacion-limits.ts:19
lib/prueba-automatica.ts:12
```

Este paso **se puede hacer ya**, antes que el resto: arregla un problema latente y no depende de
Flow.

---

## 4. Esquema

**`Subscription` pasa a representar un pase:** una fila por compra, con su propio `periodoInicio` y
`periodoFin`. `flowSubscriptionId` queda en `null`. No cambia la tabla.

**`Payment` necesita existir antes que el pase** (se crea al iniciar el pago, cuando todavía no hay
nada pagado):

```prisma
model Payment {
  id             String       @id @default(uuid())
  // Opcional: un pago PENDIENTE todavía no tiene pase. Se enlaza al acreditarse.
  subscriptionId String?      @map("subscription_id")
  // Directo al usuario porque el pago existe antes que el pase. SetNull por
  // la misma razón que Subscription: los registros de pago sobreviven al
  // borrado de la cuenta (normativa tributaria; política de privacidad §7).
  userId         String?      @map("user_id")
  // Lo generamos nosotros y se lo pasamos a Flow. Es lo que identifica el
  // pago cuando Flow avisa -- nunca el email del pagador.
  commerceOrder  String       @unique @map("commerce_order")
  pase           String                                   // "pase_30" | "pase_90"
  dias           Int
  flowOrder      String?      @map("flow_order")
  monto          Float
  estado         EstadoPago   @default(PENDIENTE)
  fecha          DateTime     @default(now())

  subscription Subscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)
  user         User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
}

enum EstadoPago {
  PENDIENTE   // nuevo
  PAGADO
  FALLIDO
  ANULADO     // nuevo: status 4 de Flow
  REEMBOLSADO
}

model Subscription {
  // … campos actuales …
  // Idempotencia de los avisos de vencimiento (§6).
  avisoPrevioEn DateTime? @map("aviso_previo_en")
  avisoFinalEn  DateTime? @map("aviso_final_en")
}
```

> ⚠️ `Payment → Subscription` hoy es `onDelete: Cascade`. Pasa a `SetNull`: un pase que se borra
> (por ejemplo, al eliminar la cuenta con el cambio `1018b20`, las suscripciones quedan sin dueño
> pero existen) no puede arrastrar el registro del pago.

No hay pagos reales en producción (Flow aprobó la cuenta el 24-09, pero todavía en sandbox), así que no hay datos que migrar.

**Catálogo de pases en código**, no en la base:

```ts
// lib/pases.ts
export const PASES = {
  pase_30: { dias: 30, monto: 3990, nombre: "AutoPostula Premium · 30 días" },
  pase_90: { dias: 90, monto: 9990, nombre: "AutoPostula Premium · 90 días" },
} as const;
```

---

## 5. Flujo de pago

Con los endpoints de pago único de Flow (`/payment/create` + `/payment/getStatus`).
**Verificar nombres de parámetros y códigos de estado contra https://www.flow.cl/docs/api.html
antes de programar**; lo de abajo es el contrato esperado, no una copia de la documentación.

### 5.1 Checkout — `POST /api/flow/checkout` `{ pase: "pase_30" | "pase_90" }`

1. Sesión y **correo verificado** (igual que hoy).
2. Crear `Payment` en `PENDIENTE`, con `commerceOrder = "ap_" + payment.id`, `userId`, `pase`,
   `dias`, `monto` del catálogo. **El monto sale del servidor, nunca del cliente.**
3. `flow.crearPago({ commerceOrder, subject, currency: "CLP", amount, email: user.email,
   urlConfirmation, urlReturn })`.
4. Responder `{ url: resp.url + "?token=" + resp.token }` y redirigir a Flow.

`urlConfirmation` y `urlReturn` se arman con **`getBaseUrl()`** (`lib/base-url.ts`), no con el
header `Origin` como hace hoy `checkout/route.ts`. El comentario de `base-url.ts` explica por qué:
el header es falsificable.

**Ya no se bloquea comprar teniendo Premium vigente**: se apila (§2).

### 5.2 Confirmación — `POST /api/flow/confirmacion-pago` (Flow → servidor)

```
token → flow.estadoPago(token)
      → buscar Payment por commerceOrder (NUNCA por el email del pagador)
      → acreditarPago(payment, estadoFlow)
      → 200 siempre que se haya procesado, aunque haya sido rechazado
```

**`acreditarPago` es idempotente y va en una transacción:**

| Estado de Flow | Qué hace |
|---|---|
| Pagada | Si el `Payment` ya está `PAGADO` → nada. Si no: verificar que `amount` y `currency` coinciden con el catálogo (si no, log de error y no acreditar); `Payment` → `PAGADO` + `flowOrder`; crear la `Subscription` con `periodoInicio = max(ahora, fin del último pase vigente)` y `periodoFin = inicio + dias`; enlazar el `Payment`; mandar el comprobante (§7) |
| Rechazada | `Payment` → `FALLIDO` |
| Anulada | `Payment` → `ANULADO` |
| Pendiente | Nada; se espera el siguiente aviso |

Flow puede avisar más de una vez: la idempotencia no es opcional.

**Diferencia con hoy:** `webhook-cobro` identifica al usuario por `pago.payer`, el email con que se
pagó, que puede ser distinto del de la cuenta. Con `commerceOrder` eso deja de pasar.

### 5.3 Retorno — `POST /api/flow/retorno-pago` (navegador de la persona)

Mismo `token` → `estadoPago` → `acreditarPago` (idempotente: el retorno puede llegar **antes** que la
confirmación) → redirigir a `/dashboard/premium?pago=exito|pendiente|rechazado`.

La página muestra:
- éxito → *"Premium activo hasta el 19-10-2026"*;
- pendiente → *"Tu pago se está procesando. Te avisamos por correo apenas se confirme."*;
- rechazado → *"El pago no se completó. No se hizo ningún cobro."*.

### 5.4 Lo que se retira

- Rutas `app/api/flow/registro-callback`, `webhook-cobro` y `cancelar`.
- Crear `flowCustomerId` en el checkout.
- En Ajustes, el botón **"Cancelar suscripción"** y su `confirm()` (`app/dashboard/ajustes/page.tsx:98-112,195-197`).
- En el borrado de cuenta (`app/api/account/eliminar`), la cancelación en Flow solo aplica si
  `flowSubscriptionId` existe (datos viejos); los pases vigentes se marcan `CANCELADA` como ya hace.

### 5.5 Lo que se conserva

Las funciones de suscripción de `lib/flow.ts` (`crearCliente`, `registrarTarjeta`, `crearPlan`,
`crearSuscripcion`, …) **se quedan**, con un comentario arriba:

```ts
// Sin uso desde 2026-09-19 (docs/pase-prepagado.md). Se conservan para
// volver a la renovación automática cuando AutoPostula opere como empresa:
// el Cargo Automático de Flow es solo para empresas.
```

---

## 6. Avisos de vencimiento

Cron diario `GET /api/cron/avisos-pase` (Vercel Hobby permite crons diarios con ±59 min;
`CRON_SECRET` igual que el de purgado).

| Cuándo | Condición | Correo |
|---|---|---|
| 5 días antes | pase vigente, sin otro pase apilado después, `avisoPrevioEn` nulo | *"Tu Premium vence el 19-10. [Renovar 30 días] [Renovar 90 días]"* |
| 1 día antes | ídem, y el aviso de 5 días ya salió hace ≥ 3 días | Mismo texto, *"vence mañana"* |
| El día que vence | `periodoFin` ya pasó, sin pase posterior, `avisoFinalEn` nulo | *"Tu Premium terminó. Volviste al plan gratis; tu historial y tu perfil siguen intactos. [Renovar]"* |

- Los enlaces de renovar llevan directo al checkout del pase, con sesión o pasando por el login.
- Solo con `emailVerificado`. Remitente: `remitente()`.
- De paso, el cron marca `estado: "VENCIDA"` en los pases vencidos: es orden, **no** control de
  acceso, que ya se resuelve por fecha (§3).

**En el panel:** aviso arriba desde 5 días antes, *"Tu Premium vence en 3 días · Renovar"*, y la
tarjeta de Ajustes dice *"Premium hasta el 19-10-2026"* en vez de *"Plan actual"*.

---

## 7. Comprobante y boleta

- **Comprobante por correo** al acreditar: pase, monto, vigencia (desde–hasta), número de orden de
  Flow. **No es una boleta.**
- **Boleta electrónica:** con inicio de actividades, cada venta a persona natural requiere boleta.
  Cómo emitirla (el sistema gratuito del SII venta por venta, o un proveedor con API) queda en
  `preguntas-abogado.md` §E. **No se empieza a cobrar de verdad sin resolverlo.**

---

## 8. Textos que cambian

| Dónde | Hoy | Pasa a |
|---|---|---|
| Landing, precios | *"$3.990 al mes"* | *"$3.990 por 30 días"*, más el pase de 90 |
| `/dashboard/premium` | *"/mes"* · *"Cancela cuando quieras"* · *"Puedes gestionar o cancelar tu suscripción desde Ajustes"* | *"por 30 días"* · *"Sin renovación automática: pagas solo cuando lo necesitas"* · *"Tu Premium vence el …"* |
| `/dashboard/premium/pago` (`:112`, `:237`, `:268`) | *"Cargo automático mensual a tu cuenta bancaria"*, consentimiento de suscripción, *"Puedes cancelar cuando quieras"* | Pago único, sin renovación; el consentimiento describe el pase |
| Ajustes | *"Cancelar suscripción"* | *"Premium hasta el …"* + *"Renovar"* |
| Términos §6.2 | *"$3.990 CLP mensuales … suscripción de renovación automática … se renueva automáticamente cada mes … Si un cobro falla…"* | Pases de 30 y 90 días de pago único; no se renuevan; al vencer vuelve al plan gratis; se avisa antes |
| Términos §6.3 | Precio nuevo *"en el período siguiente"* | Un cambio de precio no afecta pases ya comprados |
| Términos §7 | Cancelación de la suscripción | No hay nada que cancelar; el pase dura lo comprado. La devolución (borrador 7.2) se adapta a pases, con el abogado |
| Política de privacidad §2.7 | *"guardamos un identificador de cliente de la pasarela de pagos…"* | Ya no hay identificador de cliente: número de orden de Flow, monto, fecha y estado |
| Política de privacidad §3 | Datos de pago → *"Gestionar tu suscripción…"* | *"Activar tu pase y emitir el comprobante"* |
| Chrome Web Store, descripción | *"Premium ($3.990 CLP al mes)"* | *"Premium ($3.990 CLP por 30 días)"* |
| `docs/legal/` (Word y PDF) | Suscripción mensual | Regenerar después de cambiar términos y privacidad |

---

## 9. Orden

| # | Tarea | § | Nota |
|---|---|---|---|
| **0** | **Inicio de actividades** y cómo se emiten las boletas | 1, 7 | Lo hace Roberto con el abogado o contador. **Bloquea cobrar de verdad**, no programar |
| **1** | `obtenerPlanVigente` y reemplazo en los 14 lugares | 3 | Independiente de todo lo demás; se puede hacer ya |
| 2 | Esquema y migración | 4 | |
| 3 | Checkout, confirmación, retorno y `acreditarPago` idempotente | 5.1–5.3 | En sandbox |
| 4 | Retirar suscripción: rutas y botón de cancelar | 5.4, 5.5 | |
| 5 | Avisos de vencimiento y aviso en el panel | 6 | |
| 6 | Comprobante por correo | 7 | |
| 7 | Textos (web, términos, privacidad, tienda) y regenerar `docs/legal/` | 8 | Mismo deploy que el 3 |

---

## 10. Criterios de aceptación (en sandbox)

1. **Comprar 30 días** → Premium activo con `periodoFin` = hoy + 30; el pago aparece `PAGADO`.
2. **Comprar con un pase vigente** → el nuevo empieza el día en que termina el anterior.
3. **Pagar y cerrar el navegador antes de volver** → el pase se acredita igual (por la confirmación).
4. **Flow confirma dos veces el mismo pago** → un solo pase.
5. **El día 31**, sin que haya corrido ningún cron → la cuenta ya es gratis: 20 postulaciones, un
   portal, sin ráfagas.
6. **Avisos** a los 5 días, 1 día y al vencer, cada uno una sola vez; ninguno si hay otro pase
   apilado.
7. **Pago rechazado** → `FALLIDO`, sin pase, mensaje claro.
8. **Monto alterado** (el `amount` de Flow no coincide con el catálogo) → no se acredita y queda en
   el log.
9. **Ninguna pantalla ni documento** dice "mensual", "cargo automático" ni "cancelar suscripción".
10. **Borrar la cuenta con un pase vigente** → el pase queda `CANCELADA`, el `Payment` se conserva sin
    dueño. Si corresponde devolver algo, lo define el abogado (`preguntas-abogado.md` §A1).
