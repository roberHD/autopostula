# Cuatro pendientes de lanzamiento — 2026-10-07

> **Estado:** plan de trabajo, 2026-10-07. Sale de la revisión completa de la extensión 2.17.1.
> **Para:** Roberto (§1 y §2) y el chat de producción (§3 y §4).
> **Relacionado:** `creditos-y-pagina-nueva.md` §4 y §5, `amplitud-de-busqueda.md` §4,
> `rediseno-filtrado-ofertas.md` §7.1, `primera-busqueda-guiada.md`.

---

## 0. Lo esencial

Ninguno de los cuatro es una función nueva. Los cuatro desbloquean cosas **que ya están
construidas y hoy no le sirven a nadie**:

| # | Pendiente | Qué desbloquea | Quién |
|---|---|---|---|
| 1 | Subir la **2.17.1** a la tienda | Todo lo de las últimas dos semanas, para cualquier usuario | Roberto |
| 2 | **Importar el catálogo** CIUO en producción | La amplitud de búsqueda, que hoy no devuelve ni un oficio | Roberto |
| 3 | **Analítica** del sitio | Saber si algo de esto sirve | Producción |
| 4 | **`/precios` y `/preguntas-frecuentes`** | Una URL que mandar, y entrar por Google | Producción |

---

## 1. Subir la extensión 2.17.1

Es el cuello de botella real. Hoy la gente instala desde la tienda una versión anterior a:

- los tres portales postulando de verdad y sincronizando estado,
- el scorer arreglado (las tres reglas de `revision-scorer-2026-09-30.md`),
- la amplitud y el modo "cualquier trabajo",
- la primera búsqueda guiada con la marca en cada oferta,
- la jornada leída en el scorer.

### Pasos

1. El paquete ya está hecho: `autopostula-2.17.1.zip` en la raíz del repo.
2. En el panel de desarrollador, subir el zip como versión nueva.
3. **Los permisos no cambiaron** (`storage`, `tabs`, `alarms`, `power`) y las justificaciones ya
   están aceptadas de la 2.13: no debería pedirlas de nuevo. Si las pide, están en
   `rafagas-y-ponerse-al-dia.md` §5.
4. Guardar el borrador antes de enviar a revisión.
5. Cuando quede aprobada: **instalar la versión de la tienda en un Chrome limpio y probar ahí.** La
   que está cargada a mano no sirve como prueba.

### Mientras tanto

Los CV de prueba que se repartieron sirven igual, pero lo que reporten los amigos es de la versión
vieja. Conviene decírselo, o esperar a que la 2.17.1 esté aprobada antes de pedirles la prueba en
serio.

---

## 2. Importar el catálogo CIUO en producción

**El síntoma:** el control de amplitud ("eso y trabajos parecidos", "cualquier cosa de mi rubro")
está construido, probado y desplegado, y en producción **no agrega ni un oficio**.

**La causa:** la expansión sale de consultar `TituloCanonico` y `GrupoCiuo` en la base
(`lib/amplitud.ts`), y esas tablas están vacías en producción. El catálogo —3.484 oficios chilenos
del CIUO-08.CL y 444 grupos— vive en el repo como JSON y se importa con un script que nunca se
corrió contra la base real.

### Cómo se hace

```bash
npx tsx scripts/importar-catalogo.ts
```

Desde `backend/`, con la `DATABASE_URL` **de producción** en el entorno de esa terminal.

Tres cosas que conviene saber antes:

- **Es idempotente.** Hace `upsert` por `formaCruda` y por `codigo`: correrlo dos veces no duplica
  nada. Si se corta a la mitad, se vuelve a correr y listo.
- **No borra nada.** Los títulos que la extensión ya cosechó (`origen: COSECHADO`) no se tocan.
- **No pongas la URL de producción en el `.env` del repo.** Pásala solo en esa terminal y después
  ciérrala.

### Cómo comprobar que quedó

```bash
npx tsx scripts/verificar-amplitud.ts
```

Ese script ya existe. Imprime cuántos grupos y oficios hay en la base y, cuenta por cuenta, qué
oficios entrarían con cada nivel de amplitud. Si dice *"Sin catálogo importado"*, no quedó.

Y con una cuenta real: entrar a **Filtros de búsqueda**, elegir "eso y trabajos parecidos" y
revisar que la línea de abajo nombre oficios que la persona reconozca como suyos.

---

## 3. Analítica

Es la cuarta vez que aparece en los documentos. Hoy no se sabe cuánta gente entra a autopostula.cl,
cuántas se registran ni cuántas llegan al final del onboarding.

### Qué poner

**Vercel Web Analytics.** El sitio ya está en Vercel, es un paquete y una línea en el layout, y
—esto es lo importante— **no usa cookies**, así que no obliga a un banner de consentimiento en la
primera pantalla, que es justo donde se mide la conversión. Plausible sirve igual y cuesta; para
partir, la de Vercel alcanza.

### Los seis números

Aparte de las visitas, una pantalla de admin con seis consultas que ya se pueden escribir hoy:

| Número | De dónde sale |
|---|---|
| Cuentas creadas (semana y total) | `User` |
| Cuántas suben CV | `CvProfile` |
| Cuántas conectan la extensión | `User.apiToken` usado alguna vez |
| Cuántas postulan al menos una vez | `Application` por `userId` |
| Cuántas vuelven a los 7 días | última actividad contra `createdAt` |
| Qué proporción termina INCOMPLETA | `Application.estadoActual` |

El último es el que dice si se puede abrir la venta de paquetes
(`creditos-y-pagina-nueva.md` §3.6): sin eso, "solo pagas lo que llegó" no se puede afirmar.

### Lo que no se mide

Nada de grabar sesiones ni mapas de calor. Son datos personales de gente buscando trabajo, con la
Ley 21.719 encima. Seis números agregados alcanzan para decidir.

---

## 4. `/precios` y `/preguntas-frecuentes`

### 4.1 Las preguntas ya existen: hay que sacarlas a su propia URL

La landing **ya tiene** un bloque de 6 preguntas con su marcado `FAQPage` de schema.org. Lo que
falta es que vivan en `/preguntas-frecuentes`, entren al `sitemap.ts` (que hoy solo lista la
portada, términos y privacidad) y que la landing enlace ahí.

La misma lista de `PREGUNTAS` sirve para las dos páginas: se mueve a un archivo compartido y se usa
en los dos lados. Nada de mantener dos copias.

**Faltan cinco preguntas**, y son justo las que la gente escribe en Google:

> **¿Tengo que darles mi clave de Computrabajo?**
> No, y no te la vamos a pedir nunca. La extensión trabaja dentro de tu propio navegador, con la
> sesión que tú ya iniciaste en el portal. Tus claves de los portales no pasan por AutoPostula ni
> quedan guardadas en ninguna parte.

> **¿Cuánto cuesta?**
> Gratis son 20 postulaciones al mes. Con un pase son 80 al mes: $3.990 por 30 días o $9.990 por
> 90 días, de pago único, sin cobro automático. Y si se te acaban las del mes, hay paquetes de 20
> por $1.990 o 50 por $3.990.

> **¿Vencen las postulaciones que compro aparte?**
> No. Las del plan se renuevan cada mes; las que compras en paquete no tienen fecha de
> vencimiento y quedan ahí hasta que las uses.

> **¿Puedo probarla sin que postule nada?**
> Sí. La primera vez entra en modo mirar: marca las ofertas del portal una por una y te dice qué
> haría con cada una, pero no envía nada hasta que tú aprietes "Empezar a postular".

> **¿Qué hacen con mi CV y mis datos?**
> Tu CV se usa para completar los formularios de postulación, y nada más. Puedes descargar todo lo
> que tenemos tuyo o borrar tu cuenta cuando quieras, desde Ajustes. Las ofertas que la extensión
> vio y descartó se borran solas a los 90 días.

### 4.2 `/precios`

Hoy los precios viven dentro de la landing y del panel. No existe una URL que mandar por WhatsApp
cuando alguien pregunta cuánto vale, y `/precios` devuelve 404.

Los valores vigentes, que salen del servidor (`lib/pases.ts`, `lib/extras.ts`, `lib/plans.ts`):

| | Qué incluye | Precio |
|---|---|---|
| **Gratis** | 20 postulaciones al mes. Entras tú a los portales | $0 |
| **Pase 30 días** | 80 postulaciones al mes, búsqueda automática | $3.990 |
| **Pase 90 días** | Lo mismo, por 3 meses | $9.990 |
| **20 postulaciones extra** | Se usan cuando se acaban las del mes. No vencen | $1.990 |
| **50 postulaciones extra** | Igual | $3.990 |

Tres reglas que la página tiene que decir, porque son las preguntas que llegan a soporte:

1. **Primero se gastan las del mes**, y recién después las compradas.
2. **Una postulación que no llegó a la empresa no se cobra.**
3. **No hay cobro automático.** Cuando el pase vence, la cuenta vuelve al plan gratis sola.

**Lo que no va en esa página:** el precio por postulación. Postula Fácil sale a unos $20 por
postulación y esa comparación se pierde siempre
(`creditos-y-pagina-nueva.md` §3.5). El precio por unidad es para decidir adentro, no para vender
afuera.

---

## 5. Orden

| # | Tarea | Quién | Depende de |
|---|---|---|---|
| **1** | Subir la 2.17.1 | Roberto | — |
| **2** | Importar el catálogo en producción | Roberto | — |
| **3** | Analítica en la landing | Producción | — |
| 4 | `/preguntas-frecuentes` + sitemap + las 5 preguntas nuevas | Producción | — |
| 5 | `/precios` | Producción | — |
| 6 | Pantalla de admin con los seis números | Producción | 3 |

Los cinco primeros son independientes entre sí: se pueden hacer en paralelo. El 1 y el 2 no
necesitan escribir código.

---

## 6. Criterios de aceptación

1. La ficha de la Chrome Web Store muestra la **2.17.1**, y una instalación limpia desde la tienda
   marca las ofertas en el portal.
2. `npx tsx scripts/verificar-amplitud.ts` lista oficios reales para una cuenta con objetivo
   declarado, en vez de "Sin catálogo importado".
3. En Filtros de búsqueda, subir la amplitud un nivel **nombra oficios concretos**.
4. Se puede responder "¿cuánta gente entró ayer?" sin adivinar.
5. `autopostula.cl/precios` y `autopostula.cl/preguntas-frecuentes` responden 200 y están en el
   sitemap.
6. Las preguntas frecuentes se mantienen **en un solo lugar** del código, no en dos.
