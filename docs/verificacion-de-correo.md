# Verificación de correo — especificación

> **Estado:** ✅ Implementado (2026-09-12). El §1 (dominio en Resend) se resolvió en `323f2a4`.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-09.

---

## 1. 🔴 Prerrequisito duro: Resend

```js
// app/api/auth/forgot-password/route.ts:46
from: process.env.RESEND_FROM_EMAIL || "AutoPostula <onboarding@resend.dev>"
```

Ese fallback es el **dominio compartido de prueba de Resend, que solo entrega correos a la
dirección dueña de la cuenta**. Con eso puesto en producción:

- La recuperación de contraseña **está rota hoy** para todos los usuarios reales, en silencio.
- Si además se activa verificación, **nadie podría confirmar su cuenta** y se bloquea el registro
  entero.

**Antes de tocar nada de este documento:**

1. Verificar `autopostula.cl` en Resend (registros SPF/DKIM en el DNS).
2. Setear `RESEND_FROM_EMAIL` en producción.
3. **Quitar el fallback.** Si falta la variable, que falle ruidosamente:

```js
function remitente() {
  const from = process.env.RESEND_FROM_EMAIL;
  // Sin remitente propio, Resend solo entrega al dueño de la cuenta. Fallar acá
  // es infinitamente mejor que "enviar" correos que nadie recibe -- principio
  // #5: nunca fallar en silencio.
  if (!from) throw new Error("Falta RESEND_FROM_EMAIL");
  return from;
}
```

---

## 2. La decisión de diseño

> **Verificar antes de dejar que la cuenta *actúe*, no antes de dejar que *mire*.**

No se bloquea el ingreso. Alguien sin verificar puede registrarse, subir su CV, hacer el triaje y
conversar con la IA — todo lo que construye su interés y no cuesta nada.

Lo que **no** puede hacer es **conectar la extensión**, que es lo único que postula a trabajos en
su nombre.

| Acción | Sin verificar |
|---|---|
| Registrarse e iniciar sesión | ✅ |
| Subir CV, perfil, objetivo laboral | ✅ |
| Triaje de preferencias | ✅ |
| Conversación con la IA de estilo | ✅ |
| Ver el dashboard | ✅ |
| **Obtener el token de la extensión** | ❌ |
| **Contratar Premium** | ❌ |

Dos razones para trazar la línea ahí:

1. **Se explica solo**, al usuario y a un revisor de la Chrome Web Store: *"no dejamos que una
   identidad sin verificar postule a trabajos en tu nombre"*.
2. **No se pierde a nadie que importe.** Quien abandona antes de conectar la extensión no iba a
   ser usuario igual.

El checkout de Premium se gatea por una razón distinta: **no se le cobra a una dirección que no
existe.** El comprobante y la confirmación de cancelación van ahí.

### Por qué NO bloquear el login

Bloquear el ingreso convierte cualquier problema de entrega —un correo que cae en spam, un
dominio corporativo que filtra, un typo— en una **cuenta muerta sin salida**. La persona ni
siquiera puede entrar a pedir el reenvío.

---

## 3. Por qué se hace (el orden real de las razones)

Conviene tenerlo claro para no sobre-diseñar:

| Razón | Peso |
|---|---|
| **Errores de tipeo** (`gmial.com`): la persona queda sin poder recuperar su contraseña, y el soporte tampoco puede ayudarla porque la política dice "escríbenos desde el correo registrado" | **Alto** — es la mayoría de los casos |
| **Reputación de envío**: los rebotes a direcciones inválidas degradan un dominio recién verificado, sin historial. Si te throttlean, dejan de llegar los correos **a todos** | **Alto** |
| **Coherencia con lo prometido**: Términos §3 exige "información veraz" y la política ofrece borrado escribiendo desde el correo registrado | Medio |
| **Abuso del plan gratuito** | **Bajo** — para usar el producto hay que conectar una cuenta real de portal y subir un CV, que es una barrera mucho más alta que un correo |

---

## 4. Esquema

Campos propios, **no reusar los de reset**: una persona puede tener los dos flujos abiertos a la
vez y se pisarían.

```prisma
model User {
  // … campos actuales …

  // null = sin verificar. Con fecha = cuándo se verificó (más útil que un
  // booleano para soporte y para métricas de conversión del registro).
  emailVerificado    DateTime? @map("email_verificado")
  verifyToken        String?   @unique @map("verify_token")
  verifyTokenExpiry  DateTime? @map("verify_token_expiry")
  // Para el límite de reenvíos (§6). Sin esto, el endpoint de reenvío es un
  // vector para bombardear de correos a una dirección ajena.
  verifyUltimoEnvio  DateTime? @map("verify_ultimo_envio")
}
```

### ⚠️ Migración: los usuarios existentes se dan por verificados

```sql
UPDATE users SET email_verificado = NOW() WHERE email_verificado IS NULL;
```

**Es importante hacerlo.** Sin eso, todas las cuentas actuales quedarían bloqueadas de golpe, y
las que ya tienen la extensión conectada dejarían de funcionar. Son cuentas de prueba conocidas;
no hay nada que ganar exigiéndoles verificar.

---

## 5. Flujo

Es el mismo esqueleto que recuperar contraseña, que **ya funciona** — token aleatorio,
expiración, correo con enlace, endpoint que valida y consume.

```
POST /api/register
   → crea el usuario (emailVerificado = null)
   → genera verifyToken (crypto.randomBytes(32).toString("hex"))
   → expiración: 24 h  (más largo que la 1 h del reset: verificar no es urgente
     y la gente revisa el correo más tarde)
   → envía el correo
   → responde igual que hoy (el registro NO falla si el correo no sale)

GET /verificar?token=…            (página)
POST /api/auth/verificar-email    (valida y consume)
   → token inexistente o vencido → mensaje claro + botón de reenviar
   → válido → emailVerificado = now(), limpia token y expiry
```

**El registro no debe fallar si el envío falla.** Se crea la cuenta igual y se le muestra el
aviso con el botón de reenviar — si no, un problema puntual de Resend impide registrarse.

### Qué se gatea, y cómo

`app/api/account/token/route.ts`, en **`POST` y en `GET`**:

```ts
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { apiToken: true, emailVerificado: true },
});
if (!user?.emailVerificado) {
  return NextResponse.json(
    { error: "Verifica tu correo para conectar la extensión", requiereVerificacion: true },
    { status: 403 }
  );
}
```

El `GET` también, si no alguien con un token ya emitido lo lee igual. (Con la migración de §4
esto no afecta a nadie existente.)

Mismo chequeo en `app/api/flow/checkout/route.ts`.

El campo `requiereVerificacion: true` deja que el frontend distinga esto de un 403 cualquiera y
muestre el botón de reenviar en vez de un error genérico.

---

## 6. Reenvío, con límite

```
POST /api/auth/reenviar-verificacion   (autenticado)
```

**Necesita límite de frecuencia.** Sin él, cualquiera con una cuenta puede usar tu servidor para
bombardear de correos la dirección que puso — y de paso quemarte la reputación de envío que este
documento existe para proteger.

- **1 envío por minuto** y **5 por hora** por cuenta, con `verifyUltimoEnvio`.
- Al pasarse: `429` con el tiempo que falta.

Cada reenvío genera un token nuevo e invalida el anterior.

---

## 7. Interfaz

- **Banner persistente en el dashboard** mientras `emailVerificado` sea null: *"Confirma tu
  correo para conectar la extensión"* + botón de reenviar. Que diga **qué se desbloquea**, no
  solo que falta verificar.
- **En el paso de la extensión del onboarding**: si no está verificado, explicar por qué está
  bloqueado ahí mismo, con el botón de reenviar. No mandarlo a buscar.
- **Página `/verificar`**: los tres estados —éxito, token vencido, token inválido— cada uno con
  su salida. Un token vencido debe ofrecer reenviar, no ser un callejón.

---

## 8. Nota adjacente: enumeración de correos

`app/api/register/route.ts` responde **409 "Ese correo ya está registrado"**, lo que permite a
cualquiera averiguar si una dirección tiene cuenta.

`forgot-password` ya lo evita bien: responde el mismo mensaje genérico exista o no el usuario.

**No es requisito de este documento** —quitarlo empeora la experiencia de registro y muchos
productos lo aceptan— pero conviene que sea una decisión consciente y no un descuido. Si algún
día importa, la salida es responder siempre igual y avisar por correo al dueño de la cuenta.

---

## 9. Orden

| # | Tarea | Nota |
|---|---|---|
| **1** | **Verificar dominio en Resend + `RESEND_FROM_EMAIL`** | Bloquea todo lo demás. Y arregla que la recuperación de contraseña esté rota hoy |
| **2** | Quitar el fallback a `onboarding@resend.dev` (§1) | Que falle ruidosamente |
| 3 | Esquema + migración que marca verificados a los existentes (§4) | El `UPDATE` no se puede olvidar |
| 4 | Envío en el registro + `/verificar` + endpoint de validación (§5) | Copia del flujo de reset |
| 5 | Gatear `/api/account/token` y `/api/flow/checkout` (§5) | |
| 6 | Reenvío con límite de frecuencia (§6) | El límite va desde el principio, no después |
| 7 | Banner y paso del onboarding (§7) | |

---

## 10. Criterios de aceptación

1. **Un correo real recibe el enlace y verifica.** Probado con una dirección que no sea la dueña
   de la cuenta de Resend — es el caso que hoy está roto y que nadie ha probado.
2. **Sin verificar no se obtiene token**, ni por `POST` ni por `GET`, y la respuesta trae
   `requiereVerificacion: true`.
3. **Sin verificar no se llega al checkout de Flow.**
4. **Sin verificar sí se puede** subir CV, hacer el triaje y conversar con la IA.
5. **Las cuentas existentes siguen funcionando** después de la migración, con su extensión
   conectada, sin verificar nada.
6. **El reenvío está limitado**: dos seguidos dan `429`.
7. **Un token vencido no es un callejón**: la página ofrece reenviar.
8. **Si Resend falla durante el registro, la cuenta igual se crea** y la persona puede reenviar
   después.
