# Análisis de usuarios reales — 2026-10-28

> **Estado:** diagnóstico, 2026-10-28. Primera mirada a la base de producción con usuarios que no
> son Roberto.
> **Para:** Roberto y el chat de producción (las recomendaciones 1, 3, 4 y 5 son de código).
> **Método:** cinco consultas de solo lectura en el SQL Editor de Neon (rama `main`, base `neondb`),
> todas con totales. Las cuentas se identifican solo por los primeros 6 caracteres del id: ningún
> nombre, correo ni CV salió de la base. Las cuentas con `rol = ADMIN` (las de prueba de Roberto)
> se separan siempre.
> **Ojo con el tamaño:** son 17 personas. Todo lo de abajo son señales, no estadística.

---

## 0. Lo esencial

1. **La extensión falla casi siempre en el computador de los usuarios.** El 92% de sus ráfagas
   termina con error, contra el 27% en las cuentas de Roberto. Y la base guarda **cuántos** errores
   hubo, pero no **cuáles**: hoy no hay forma de saber qué falla.
2. **De 6 personas que conectaron la extensión, 4 no consiguieron nada.** Una aprobó 8 ofertas que
   nunca se enviaron; otra tiene 580 esperando en «Por decidir» porque llegó a la extensión sin CV.
3. **Solo 2 de 17 cuentas postularon algo** (30 postulaciones), y ninguna de esas postulaciones
   tiene todavía una respuesta de empresa.
4. **El cuello de botella no es cobrar.** Es que la extensión funcione en el computador de otra
   persona.

---

## 1. El embudo

Sin cuentas de admin:

| Paso | Cuentas | Nota |
|---|---|---|
| Se registraron | **17** | 7 en los últimos 14 días, 4 en los últimos 7 |
| Entraron con Google | 12 | |
| Verificaron el correo | 14 | |
| Subieron CV | 11 | ningún CV quedó sin texto: los 6 que faltan nunca lo subieron |
| Declararon qué buscan | 10 | |
| Conectaron un portal | 10 | Computrabajo 9, Laborum 4, Trabajando 3 |
| Terminaron el onboarding | 13 | se puede terminar sin CV |
| Conectaron la extensión | **6** | |
| Tuvieron al menos una ráfaga | 6 | |
| Postularon al menos una vez | **2** | 30 postulaciones en total |
| Llegaron por invitación | 0 | |
| Pagaron | **0** | 1 pago quedó pendiente |

Las caídas fuertes están en **portal → extensión** (10 → 6) y, sobre todo, **extensión → postular**
(6 → 2).

---

## 2. Usuarios reales contra las cuentas de Roberto

| | Cuentas | Postulaciones | Incompletas | Con respuesta | Ráfagas | Ráfagas con error | Última ráfaga |
|---|---|---|---|---|---|---|---|
| Admin (Roberto) | 2 | 119 | 24 (20%) | 17 | 15 | 4 (27%) | 05-10 |
| **Usuarios** | 17 | 30 | 2 (7%) | **0** | 73 | **67 (92%)** | 28-10 (hoy) |

Tres cosas salen de esta tabla:

- **El 92% está concentrado, pero no es una sola cuenta.** `036249` aporta 61 ráfagas y 99
  errores. Sin ella quedan 12 ráfagas, y más de la mitad igual termina con error.
- **Las cuentas de Roberto no fallan como las de los usuarios.** Algo del entorno real (otro
  computador, otra sesión en el portal, otro perfil, otra versión de la extensión) rompe lo que en
  las pruebas funciona.
- **La última ráfaga de prueba de Roberto fue el 05-10.** En las tres semanas siguientes los
  usuarios chocaron con esto y nadie lo estaba mirando.

---

## 3. Las cuentas con extensión, una por una

| Cuenta | Creada | Ráfagas | Errores | Por decidir | Dijo sí | Dijo no | Postulaciones | Última ráfaga | Qué pasó |
|---|---|---|---|---|---|---|---|---|---|
| `63b2e7` | 06-10 | 3 | 2 | 0 | 22 | 70 | **25** | 06-10 | El usuario más activo, y **se fue**: no vuelve desde hace tres semanas |
| `19d721` | 23-10 | 1 | 0 | 7 | 12 | 4 | **5** | 23-10 | Llegó por buscador. Es el único caso que funcionó de punta a punta |
| `ca0c18` | 26-10 | 1 | 1 | 0 | **8** | 12 | 0 | 27-10 | Aprobó 8 y **ninguna se envió**: postulación sin habilitar |
| `036249` | 16-10 | **61** | **99** | **580** | 0 | 0 | 0 | 28-10 | **Sin CV.** El motor no tiene con qué filtrar y llena la cola |
| `8a01be` | 27-10 | 5 | 4 | 1 | 0 | 0 | 0 | 28-10 | Ayer se registró; 4 de 5 ráfagas con error, no ve ofertas |
| `3bddef` | 01-10 | 2 | 0 | 0 | 0 | 0 | 0 | 01-10 | No vio nada y dejó de usarla |

### Los dos casos que más enseñan

**`ca0c18`: hizo todo el trabajo y no pasó nada.** Decidió 20 ofertas en «Por decidir», aprobó 8,
y tiene `postulacion_habilitada = false`. Las aprobadas esperan a algo que la persona no sabe que
tiene que hacer. Es el peor caso posible: la intención más alta del producto convertida en cero
resultado, sin aviso.

**`036249`: 580 ofertas que nadie va a decidir.** Llegó hasta la extensión **sin subir un CV**,
porque el onboarding lo permite. Sin CV no hay perfil con qué puntuar, así que casi todo cae en
gris: 220 ofertas grises en ráfagas y 580 decisiones pendientes. La guarda de la Fase 1 ("sin perfil
no se postula") funcionó —no se envió nada—, pero la extensión **siguió escaneando y llenando la
cola**. No postular está bien; fabricar una lista imposible no.

---

## 4. Otras señales

- **De dónde llegan** (solo quienes contestaron la pregunta, que existe desde el 29-09):
  recomendación 5, buscador 1. El único que llegó por Google es el que funcionó bien.
- **Las ráfagas sí se disparan solas:** 31 por chequeo, 29 al abrir Chrome, 24 al despertar el
  computador, 3 al activar, 1 manual. El mecanismo de `rafagas-y-ponerse-al-dia.md` funciona; lo
  que falla es lo que pasa adentro.
- **INCOMPLETA en usuarios: 2 de 30 (7%).** En las cuentas de Roberto: 24 de 119 (20%). El criterio
  de verificar 10 postulaciones reales antes de vender paquetes
  (`creditos-y-pagina-nueva.md` §3.6) sigue pendiente.
- **Decisiones registradas:** 1.010 de banda gris (580 de una sola cuenta) y 86 del triaje del
  onboarding.

---

## 5. Recomendaciones, en orden

| # | Qué | Quién | Por qué |
|---|---|---|---|
| **1** | **Guardar el motivo del error en cada ráfaga** | Producción | Hoy `rafagas.errores` es un número. Sin el motivo, el 92% no se puede arreglar. Basta con el tipo del error más repetido de la tanda y el portal donde pasó |
| **2** | **Mirar hoy los logs de Vercel** de `/api/extension/rafaga` para `8a01be` y `036249` | Roberto | Las dos están activas hoy: el error está pasando ahora mismo |
| **3** | **No correr ráfagas sin CV** | Producción | Si no hay CV ni perfil compilado, la extensión no busca y el popup pide subirlo. Hoy se fabrica una cola que nadie puede usar |
| **4** | **Tope a «Por decidir»** | Producción | Pasadas ~30 pendientes, no agregar más y avisar: *"Tienes 30 ofertas esperando tu decisión"* |
| **5** | **Decir por qué no se envían las aprobadas** | Producción | *"Aprobaste 8 ofertas. Para que se envíen, activa la postulación"*, con el botón ahí mismo |
| **6** | **Hablar con tres personas**: `63b2e7`, `ca0c18` y `19d721` | Roberto | Por qué se fue el más activo, qué esperaba la que aprobó 8, y qué le funcionó al que llegó por Google |

Y lo que puede esperar: **cobrar.** Con 2 personas postulando y 0 respuestas de empresa, abrir la
venta ahora sería cobrar por algo que todavía no le funciona a la mayoría.

---

## 6. Cómo repetir este análisis

Las consultas quedaron en el historial del SQL Editor de Neon. La de la tabla de §3 es la que más
dice: une `users`, `cv_profiles`, `platform_accounts`, `rafagas`, `ofertas_observadas`,
`decisiones_oferta` y `applications` por cuenta, excluyendo `rol = 'ADMIN'`.

Conviene volver a correrla **una vez por semana** hasta que exista la pantalla de admin con los
seis números de `pendientes-de-lanzamiento-2026-10-07.md` §3. Cuando la recomendación 1 esté hecha,
sumarle el motivo de error más repetido por cuenta.
