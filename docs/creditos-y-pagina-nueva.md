# Créditos y la página nueva — la fase que viene

> **Decidido el 2026-09-24.** Los créditos van. No es una propuesta ni una alternativa a los
> pases: los dos conviven, y este documento manda sobre `estrategia-y-rediseno.md` §3 en todo lo
> que se contradigan.
>
> Estado verificado ese mismo día contra el código y contra producción. Todo lo que dice "ya está"
> se comprobó abriendo el archivo, no de memoria.

---

## 0. Qué decide este documento

1. **Los créditos ya existen en el código** con otro nombre: `postulaciones_extra`. No se construye
   un sistema paralelo — se termina el que hay y se le pone el nombre que la persona entiende.
2. **Un crédito es una postulación que llegó a la empresa.** Si no llegó, no se cobra; y si se
   cobró y después se supo que no llegó, se devuelve. Esa frase es la promesa, y §3.8 dice qué
   falta para que sea cierta.
3. **Antes de escribir una línea nueva hay que juntar las dos líneas del repo** (§2). Hoy `main` y
   `rama-roberto` tienen dos implementaciones distintas de lo mismo y una migración que rompe el
   deploy.
4. **La página entra en una fase nueva** (§4): la landing que vende criterio, precios con créditos,
   preguntas frecuentes, el chequeo de CV como puerta de entrada desde el celular, y por fin
   alguna forma de medir si algo de esto sirve.

Lo que este documento **no** cambia: los pases de 30 y 90 días (`pase-prepagado.md`), el plan
gratis a mano, la prueba de 5 postulaciones automáticas, ni la decisión de no sumar portales.

---

## 1. De dónde parte

### 1.1 Lo que ya está construido (verificado el 2026-09-24)

| Pieza | Dónde | Estado |
|---|---|---|
| Libro mayor de créditos | `backend/lib/extras.ts`, tabla `postulaciones_extra` | ✅ Cada movimiento con motivo y `clave` única: idempotente, y contesta "¿por qué tengo 43?" |
| Paquetes | `PAQUETES` en `lib/extras.ts` — 20 por $1.990, 50 por $3.990 | ✅ El monto sale del servidor, nunca del cliente |
| Compra | `/api/flow/checkout` → Flow → `lib/pagos.ts:179 acreditarPaquete()` | ✅ Con verificación de monto contra el catálogo y comprobante por correo |
| Gasto | `backend/app/api/applications/route.ts:196` | ✅ Solo cuando el cupo del mes está en cero |
| Una INCOMPLETA no cobra | misma ruta, condición `!incompleta` | ✅ Es la mitad de la promesa de §3.3 |
| Premios | `PREMIOS` — +10 por invitado que verifica correo, +5 por perfil listo | ✅ Con código de invitación de 6 letras sin 0/O ni 1/I/L |
| Pantalla | `backend/app/dashboard/premium/Extras.tsx`, `/api/account/extras` | ✅ Recién hecha, sin verificar a mano |
| Prueba automatizada | `backend/scripts/verificar-extras.ts` | ✅ |

**Conclusión: los créditos están al 80%.** Lo que falta no es el motor, es la devolución (§3.3),
el nombre (§4.5) y la boleta (§8).

### 1.2 Lo que cambió afuera

- **Flow está aprobado.** Queda el inicio de actividades en el SII y poner `FLOW_SANDBOX=false`.
  Hasta ese día no entra un peso, por muy terminado que esté el código.
- **`CRON_SECRET` quedó configurado el 19-09.** Los tres crons responden 401 y el purgado a 90
  días corre todos los días a las 7:00 UTC. Era una promesa publicada que no se estaba cumpliendo.
- **La extensión 2.13 está en revisión** en la Chrome Web Store, con la justificación del permiso
  `power`. En el repo ya hay una 2.14 sin publicar.

---

## 2. Paso 0 — juntar las dos líneas del repo

> Esto va **antes** que todo lo demás de este documento. No es orden por prolijidad: hay una
> migración que rompe el próximo deploy a producción.

### 2.1 Qué hay en cada lado

| | Commits propios | Qué trae |
|---|---|---|
| `origin/main` (lo que está desplegado) | 10 | `ENTREVISTA` y `origen_estado`, la pantalla `/dashboard/seguimiento`, "el panel dice sobre qué sabe y sobre qué no", la IA que aprende de las correcciones, fixes de ubicación y de la tasa de respuesta |
| `rama-roberto` | 7 | La landing que vende criterio, el fix de Computrabajo (abría 15-20 avisos antes de postular), el Hoy nuevo, un solo estado para la extensión, las postulaciones extra |

`git merge-tree` da **8 archivos en conflicto**: `schema.prisma`, `lib/estado-postulacion.ts`
(add/add), `api/applications/status/route.ts`, `api/dashboard/resumen/route.ts`,
`dashboard/page.tsx`, `dashboard/Sidebar.tsx`, `components/SwipeTriaje.tsx` y `theme.css`.

### 2.2 La migración que rompe el deploy

`main` ya aplicó en producción `20260921120000_entrevista_y_origen_estado`, que crea el enum
`OrigenEstado` y agrega tres columnas a `applications`.

La rama trae `20260922120001_estado_real_y_descartes`, que **vuelve a crear lo mismo sin guarda**:

```sql
CREATE TYPE "OrigenEstado" AS ENUM ('PORTAL', 'USUARIO', 'SISTEMA');   -- ya existe → 42710
ALTER TABLE "applications" ADD COLUMN "origen_estado" ... ;            -- ya existe → 42701
```

El día que esa rama llegue a producción, la migración falla y el deploy se cae con la base a
medio migrar. **Arreglo:** dejar en esa migración solo lo que de verdad es nuevo — la columna
`origen` en `application_status_history` y la tabla `descartes` — y borrar el resto. Lo ya
aplicado no se vuelve a declarar.

Hay una diferencia de criterio escondida ahí, y hay que elegir una: `main` creó la columna con
`DEFAULT 'SISTEMA'` y la rama la declara `@default(PORTAL)` en el esquema. **Gana `PORTAL`**: una
fila vieja cuyo estado vino del portal es exactamente eso, y así `portalPuedeCambiar()` no trata
las filas históricas como intocables. Va como `ALTER TABLE ... ALTER COLUMN "origen_estado" SET
DEFAULT 'PORTAL'` en una migración nueva, no editando la que ya corrió.

La otra migración de la rama, `20260922120000_entrevista`, **sí es segura**: usa
`ADD VALUE IF NOT EXISTS`.

### 2.3 Decisión archivo por archivo

El conflicto de `lib/estado-postulacion.ts` asusta menos de lo que parece: no son dos versiones de
lo mismo, son **dos archivos distintos con el mismo nombre**.

| Archivo | Qué hace cada lado | Decisión |
|---|---|---|
| `lib/estado-postulacion.ts` | `main`: la regla de precedencia (`decidirCambioEstado`). Rama: el vocabulario del panel (`FRASE_ESTADO`, `COLOR_ESTADO`, `OPCIONES_PERSONA`) | **Se separan.** La regla queda en `lib/estado-real.ts` (rama), que además trae la cadencia de preguntas y tiene prueba propia (`scripts/verificar-estado-real.ts`). El vocabulario se renombra a **`lib/palabras-estado.ts`**. Ningún archivo queda con dos significados |
| `api/applications/status/route.ts` | Dos formas de decidir si el portal pisa a la persona | **Rama**, con `portalPuedeCambiar()`. Antes de mergear, correr `verificar-estado-real.ts` |
| `dashboard/page.tsx`, `api/dashboard/resumen/route.ts`, `theme.css` | `main`: "el panel dice sobre qué sabe y sobre qué no". Rama: el Hoy de tres tareas de `estrategia-y-rediseno.md` §5.2 | **Base: la rama** (es el Hoy que el diseño pide), y se **trae adentro** el bloque de `main` sobre lo que no se sabe. Eso no se descarta: es el principio 5, nunca descartar en silencio |
| `dashboard/Sidebar.tsx` + `/dashboard/seguimiento` + `/api/seguimiento` (solo en `main`) | Un ítem de menú nuevo para "¿supiste algo?" | **Se quita.** `estrategia-y-rediseno.md` §5.3 define un menú de 9 entradas y ninguna es Seguimiento: la pregunta va **dentro de Postulaciones** (`SupisteAlgo.tsx`, rama) y como una de las tres tareas del Hoy. Dos puertas a lo mismo es justo lo que este rediseño vino a sacar |
| `components/SwipeTriaje.tsx` | Cambios de ambos lados | Revisar a mano: son chicos y no se contradicen |
| `lib/detectar-patrones.ts`, `components/RefinamientosEstilo.tsx`, `/api/style/refinamientos` (solo en `main`) | La IA aprende de las correcciones — `banco-de-preguntas.md` §6 | **Se quedan tal cual.** No hay conflicto |

### 2.4 Cómo se verifica que quedó bien

Después del merge, antes de desplegar:

1. `npx tsc --noEmit` en `backend/` — tiene que salir en 0.
2. `npx prisma migrate deploy` contra una base **de prueba** restaurada desde producción. Si esa
   no corre limpia, no se despliega.
3. `scripts/verificar-estado-real.ts`, `verificar-extras.ts`, `verificar-estado-extension.ts` y
   `verificar-pagos.ts`.
4. Abrir el panel y que no queden dos formas de contestar "¿supiste algo?".

---

## 3. Créditos — las reglas

### 3.1 Qué es un crédito

**Un crédito = una postulación enviada que llegó a la empresa.** Nada más. No se compran con
créditos el chequeo de CV, ni la preparación de entrevista, ni reescribir una respuesta.

La tentación de convertirlo en una moneda para todo es grande y hay que resistirla: en el momento
en que un crédito compra dos cosas distintas, la devolución deja de tener sentido y la persona
deja de poder contar. Lo que se vende es criterio y autonomía; el crédito solo cuenta cuántas
veces se ejerció.

En la interfaz se llaman **créditos**. En la base siguen siendo `postulaciones_extra` — el nombre
interno no se toca, porque renombrar tablas por una palabra de la pantalla es cómo se rompen las
migraciones.

### 3.2 Cuándo se descuenta

El orden es siempre el mismo, y está implementado así en `api/applications/route.ts`:

1. **Primero, el cupo del mes** del plan (20 gratis / 80 con pase vigente). Lo que ya está pagado
   se usa primero.
2. **Recién cuando ese cupo está en cero**, se descuenta un crédito.
3. Si no quedan créditos, no se postula: el límite se revisa **antes** de enviar
   (`revision-2026-09-16.md` §0), nunca después.

No descuentan nada: escanear, puntuar, la Etapa 2, mandar una oferta a Por decidir, el chequeo de
CV, corregir una respuesta, ni una postulación que quedó **INCOMPLETA**.

### 3.3 Devolución — lo que falta

Hoy el crédito no se cobra si la postulación nació INCOMPLETA. Falta el otro caso, que es el que
va a llegar a soporte: **se cobró como enviada y después se supo que no llegó.**

Regla: cuando una postulación pasa a INCOMPLETA **después** de haber descontado un crédito —
porque la persona respondió "no aparece en el portal" en `SupisteAlgo`, o porque un escaneo lo
corrige— se anota un movimiento inverso:

```ts
anotarExtra({ userId, cantidad: +1, motivo: "AJUSTE",
              clave: `devolucion:${applicationId}`,
              detalle: "No llegó al portal — te devolvimos el crédito" })
```

La `clave` con el id de la postulación es lo que impide devolver dos veces la misma. Y el
movimiento tiene que **verse** en Plan y créditos con ese texto: una devolución silenciosa vale
lo mismo que no devolver, porque nadie se entera.

### 3.4 No vencen

Los créditos **no tienen fecha de vencimiento**. Es lo más simple de explicar, lo que menos
reclamos genera, y lo que hace la competencia que cobra por crédito.

Un pase sí vence (30 o 90 días); un crédito no. Si el pase vence y quedan créditos, la persona
sigue pudiendo postular a mano en los portales gastándolos. Eso es coherente con que el plan
gratis siempre sea a mano.

### 3.5 Precios

| | Precio | Por postulación |
|---|---|---|
| Pase 30 días (80 al mes) | $3.990 | $50 |
| Pase 90 días (240 en total) | $9.990 | $42 |
| Paquete 20 créditos | $1.990 | $99 |
| Paquete 50 créditos | $3.990 | $80 |

Está bien que el crédito suelto sea más caro: paga la conveniencia de no comprometerse. Lo que
**no** hay que hacer es publicar esa tabla de "precio por postulación" en la landing: Postula
Fácil sale a unos $20 por postulación y esa comparación se pierde siempre. El precio por unidad es
para decidir adentro, no para vender afuera.

Los premios (§1.1) son la respuesta a "está caro": +10 por invitar a alguien, +5 por dejar el
perfil listo.

### 3.6 Lo que falta para que la promesa sea verdad

"Solo pagas lo que llegó" exige saber si llegó. Hoy:

- **Trabajando.com** — resuelto: el adapter cierra el modal "Confirma tu postulación al cargo"
  (`adapters/trabajando.js:571`). Antes decía "enviada" sin haber enviado nada.
- **Laborum** — espera confirmación y marca INCOMPLETA si no la ve (`adapters/laborum.js:478`).
- **Computrabajo** — el que más cambia de selectores. Es el que hay que revisar antes de cobrar
  por unidad.

**Antes de vender el primer paquete:** 10 postulaciones reales, una por una, comparando lo que
dice AutoPostula con lo que dice el portal. Si las 10 calzan, se abre la venta. Si no, se arregla
primero. Vender "20 postulaciones" y que 3 no hayan salido no es un bug: es cobrar por algo que no
se entregó, y eso tiene nombre en la Ley 19.496.

Queda pendiente decidir qué se hace con las **2 postulaciones de Trabajando** que figuran
enviadas y no existen en el portal (`revision-2026-09-16.md` §8.1).

---

## 4. La página nueva

### 4.1 Landing y precios

La landing nueva **ya está escrita** en `rama-roberto` (`4378b2b`, `0f0ddab`) y no está desplegada:
producción todavía dice *"Postula 80 veces al mes"*, que es competir por volumen contra alguien
que da 200 por el mismo precio. Sale con el merge de §2.

Falta la sección de precios con las tres formas de pagar juntas —gratis, pase, créditos— y una
frase que diga en qué se diferencia cada una. Hoy `/precios` y `/planes` devuelven 404: los
precios viven dentro de la landing y del panel, y no hay una URL para mandarle a nadie.

### 4.2 Preguntas frecuentes

No existe. Es la página más barata de escribir y la única que puede traer gente desde Google sin
pagar publicidad: *"¿es seguro dar mi clave de Computrabajo?"* (no se pide), *"¿postula solo?"*,
*"¿qué pasa si no me sirve?"*, *"¿vencen los créditos?"* (no).

Va como página propia en `/preguntas-frecuentes`, en el sitemap, con el encabezado que corresponde
para que Google la muestre desplegada.

### 4.3 Chequeo de CV público

`lib/chequeo-cv.ts` y `components/ChequeoCv.tsx` ya existen en la rama, adentro del panel. El
valor está en sacarlo afuera: **una persona en el celular sube su CV y recibe algo útil sin
instalar nada.** El 98,9% del tráfico llega por celular y ahí la extensión es una pared.

Sin puntaje inventado de 0 a 100 y sin IA: reglas sobre lo que ya se extrae del PDF. Al final, una
sola invitación — "esto mismo, aplicado a las ofertas que aparecen hoy" — y el registro.

### 4.4 Plan y créditos

Una pantalla, no dos. Saldo arriba, de dónde salió cada movimiento abajo (compra, premio, uso,
devolución), el pase con su fecha de término, los paquetes, y el enlace para invitar.

El movimiento de devolución de §3.3 es el que más importa que se vea.

### 4.5 Las palabras

`estrategia-y-rediseno.md` §5.4 ya tiene la lista. Se le agrega:

| Hoy | Cambia a |
|---|---|
| "postulaciones extra" | créditos |
| "paquete extra_20" | 20 créditos |
| "saldo de extras" | tus créditos |

Y una nota sobre las citas: en el código había 19 comentarios que apuntaban a
`estrategia-y-rediseno.md §7` para hablar de las extra, y **§7 de ese documento es "Lo que NO se
hace"** — la sección correcta siempre fue §3. Los 18 que están en código ya apuntan a §3 de este
documento. El que queda sin tocar es el de
`lib/migrations/20260924140000_postulaciones_extra/migration.sql`, a propósito: Prisma guarda un
checksum de cada migración aplicada y editarla, aunque sea un comentario, hace fallar
`migrate deploy` con "migration was modified after it was applied".

---

## 5. Medir

No hay analítica de ningún tipo en el sitio. No sabemos cuánta gente entró hoy, cuántas se
registraron, ni cuántas llegaron al final del onboarding. Cualquier decisión que se tome sobre la
página sin eso es opinión.

Dos cosas, las dos chicas:

1. **Analítica en la landing.** Una que no necesite banner de cookies (Plausible o la de Vercel),
   porque un banner en la primera pantalla arruina justo la métrica que se quiere medir.
2. **Una pantalla de admin con seis números**, que salen todos de consultas que ya se pueden
   escribir hoy: cuentas creadas, cuántas suben CV, cuántas conectan la extensión, cuántas
   postulan al menos una vez, cuántas vuelven a los 7 días, y cuántas postulaciones terminaron
   INCOMPLETA sobre el total. El último es el que dice si §3.6 se puede cumplir.

---

## 6. Orden

| # | Tarea | § | Depende de |
|---|---|---|---|
| **0** | Juntar las dos líneas del repo y la migración | §2 | — |
| **1** | Desplegar la landing nueva + precios + preguntas frecuentes | §4.1, §4.2 | 0 |
| **2** | Verificar 10 postulaciones reales contra los portales | §3.6 | 0 |
| **3** | Devolución del crédito y movimientos visibles | §3.3, §4.4 | 0 |
| 4 | Inicio de actividades SII + `FLOW_SANDBOX=false` + boleta | §8 | Lo hace Roberto |
| 5 | Abrir la venta de paquetes | §3 | 2, 3, 4 |
| 6 | Analítica y pantalla de admin | §5 | 1 |
| 7 | Chequeo de CV público | §4.3 | 1 |
| 8 | Onboarding de 5 pasos y código de enlace | `celular-y-escritorio.md` §4, §5 | 7 |
| 9 | Banco de preguntas §4 a §6 | `banco-de-preguntas.md` | La semilla de preguntas |

Del 0 al 3 es una semana de trabajo y desbloquea cobrar. El 4 no es código y es el único que puede
frenar todo lo demás.

---

## 7. Criterios de aceptación

1. `npx prisma migrate deploy` corre limpio sobre una copia de producción.
2. No existen dos formas de contestar "¿supiste algo?".
3. Una postulación que no llegó **devuelve** su crédito, y el movimiento se lee en Plan y créditos
   con esas palabras.
4. Escanear, Por decidir y el chequeo de CV no descuentan nada.
5. Ninguna pantalla dice "extras", "scorer", "banda gris" ni "INCOMPLETA".
6. Hay una URL con los precios que se le puede mandar a alguien por WhatsApp.
7. Sé cuánta gente entró ayer a autopostula.cl.

---

## 8. Para el abogado

Se suman a `preguntas-abogado.md`:

1. **Retracto sobre créditos.** La Ley 19.496 art. 3° bis da 10 días para retractarse en compras a
   distancia. ¿Aplica a un paquete de créditos? ¿Y si ya gastó 3 de 20 — se devuelve a prorrata o
   se pierde el derecho?
2. **Créditos que no vencen** (§3.4). ¿Obliga a algo? ¿Qué pasa si más adelante se quisiera poner
   vencimiento a los nuevos?
3. **Cuenta borrada con saldo.** Si alguien borra su cuenta con 40 créditos comprados, ¿hay que
   devolver el dinero, o basta con avisarlo antes de borrar?
4. **Premios por invitación** (+10). ¿Es promoción sujeta a bases? ¿Tiene efecto tributario
   entregar algo con valor sin cobrarlo?
5. **Boleta por paquete.** Cada compra necesita su documento. ¿Basta el comprobante que ya manda
   `lib/pagos.ts`, o hay que emitir boleta electrónica por cada una?

---

## 9. Lo que no se hace en esta fase

- **Sumar LinkedIn ni ningún portal.** Tres es lo que se puede mantener.
- **Créditos que compren otra cosa que no sea una postulación** (§3.1).
- **Suscripción con cobro automático**: sigue siendo solo para empresas en Flow
  (`pase-prepagado.md`).
- **Plan ilimitado** ni **cobrar por éxito** (`estrategia-y-rediseno.md` §3.4).
- **Publicar precio por postulación** (§3.5).
- **Mover la ejecución a la nube** (`rafagas-y-ponerse-al-dia.md` §7): cuesta más que lo que se
  cobra y obliga a guardar claves de los portales, que la política promete no guardar.
