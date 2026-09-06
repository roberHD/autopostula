# El objetivo laboral deja de salir del CV — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-04.
> **Relacionado:** `docs/rediseno-filtrado-ofertas.md` (§5 perfil compilado, §7.1 catálogo,
> §8.3 triaje). Este documento no lo reemplaza: corrige de dónde sale el dato que alimenta todo eso.

---

## 1. El problema

> **El CV es evidencia de dónde estuviste. El objetivo laboral es una declaración de a dónde vas.
> No son el mismo dato, y hoy el sistema los confunde.**

Hoy `cargoObjetivo` lo extrae la IA del texto del CV
(`app/api/cv/upload/analizar/route.ts`) y de ahí se propaga a todo:

```
CV → IA extrae cargoObjetivo → ancla el triaje → alimenta compilar-perfil
                              ↘ arma la URL de búsqueda automática
```

Para quien **se cambia de rubro**, el CV es la peor fuente posible: describe exactamente lo que
quiere dejar de hacer. Y quien se cambia de rubro es justamente quien más necesita automatizar
postulaciones.

**Caso real (Roberto):** su CV es de ventas. Más adelante va a buscar ingeniería informática. El
CV nunca va a decir eso.

## 2. Por qué NO se arregla moviendo el triaje después de la conversación

Fue la primera idea y no funciona. El prompt de la conversación
(`app/api/style/onboarding/mensaje/route.ts:78`) dice literalmente:

> *"Esto es lo que ya se sabe de esta persona por su CV — **no se lo vuelvas a preguntar**"*

…y en esa lista va `cargoObjetivo` (línea 53). **La conversación tiene prohibido preguntar qué
busca la persona**, porque asume que el CV ya lo contestó.

Mover el triaje después solo haría que herede el mismo objetivo equivocado, más tarde.

**El arreglo es preguntar, no reordenar.**

## 3. Los tres problemas, separados

| # | Problema | ¿Lo arregla preguntar en el onboarding? |
|---|---|---|
| **P1** | El triaje se ancla en un objetivo inferido del CV, que puede estar equivocado desde el día uno | Sí |
| **P2** | El objetivo cambia con el tiempo, y hoy cambiarlo **no recompila nada** | No — ver §6 |
| **P3** | En una transición se quieren **dos** objetivos a la vez | No — ver §5 |

### P2 es un bug vivo, no una mejora pendiente

`app/api/perfil/route.ts:39` hace `upsert` del campo y devuelve. No sube `versionPerfil`, no
llama a `compilar-perfil`, no ofrece rehacer el triaje. Y `compilar-perfil` solo se dispara **a
mano desde `/dashboard/filtros`**.

Consecuencia hoy, si alguien cambia su cargo objetivo:

| Componente | Qué usa | Qué pasa |
|---|---|---|
| Búsqueda automática | `cargoObjetivo` directo (`extension/background.js:359`) | ✅ busca el rubro nuevo |
| Scorer local | `perfilCompilado` | ❌ sigue puntuando con el rubro viejo |

**Buscaría ofertas del rubro nuevo y las descartaría todas.** Silenciosamente, porque el scorer
descarta sin avisar (banda `descartar`).

### P3: el modelo de datos ya lo soporta, la interfaz no

El prompt de `compilar-perfil` (línea 103) ya pide:

> *"1 a 4 roles… con un peso de 0 a 1 según qué tan central es ese rol (1.0 = objetivo principal,
> 0.3-0.6 = lo aceptaría pero no lo busca activamente)"*

**`perfilCompilado.roles[]` ya entiende varios objetivos con pesos.** Los cuellos de botella son:

- `CvProfile.cargoObjetivo` es un solo string
- La búsqueda automática arma **un** slug (`extension/background.js:359`)

La arquitectura va más adelantada que la interfaz.

---

## 4. El paso nuevo: «¿Qué buscas?»

Una pantalla, entre **Tu CV** y **Preferencias**.

```
Bienvenida → Tu CV → ¿Qué buscas? ← NUEVO → Preferencias → Conversación
           → Extensión → Portales → Listo
```

### Contenido

```
Por tu CV, parece que buscas:   [ Vendedor ]

  ✓ Sí, es eso          ✗ Busco otra cosa
```

Si elige **"Busco otra cosa"** → buscador con autocompletado **contra `TituloCanonico`**
(3.484 ocupaciones con código CIUO, ver `rediseno-filtrado-ofertas.md` §7.1).

Y debajo, opcional:

```
  + También me interesa…   (segundo objetivo, peso menor)
```

### Por qué elegir del catálogo y no escribir texto libre

Dos razones, y la segunda no es obvia:

1. El objetivo queda anclado a un **código CIUO**, no a un string. El triaje deja de hacer
   matching difuso.

2. **Resuelve la ambigüedad de §8.3 en el origen.** Ese documento midió que `operario`,
   `auxiliar`, `ayudante` y `encargado` caen en 3 a 5 grandes grupos distintos, y que ninguna
   heurística de string lo arregla. Si la persona **elige** "Operario de bodega" de una lista, la
   ambigüedad no existe: la resolvió quien sabe la respuesta.

   El fallback de §8.3 (repartir el triaje entre familias cuando el objetivo es ambiguo) sigue
   siendo necesario, pero pasa a ser el caso raro en vez del caso común.

### El CV sigue sirviendo

Propone. **Deja de decidir.** La extracción de `cargoObjetivo` en `cv/upload/analizar` no se
toca — solo cambia de significado: pasa de ser *el objetivo* a ser *la sugerencia inicial*.

---

## 5. Modelo de datos

### 5.1 Tabla nueva

`cargoObjetivo` en `CvProfile` es un dato del CV y ahí debe quedarse (como sugerencia). El
objetivo del usuario es otra cosa y necesita su propia tabla.

```prisma
// Lo que la persona declara que busca. Distinto de CvProfile.cargoObjetivo,
// que es lo que la IA infirió de su CV -- el CV dice de dónde viene, esto dice
// a dónde va. Ver docs/objetivo-laboral.md §1.
model ObjetivoLaboral {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  // Código CIUO cuando lo eligió del catálogo; null si escribió libre.
  ciuo      String?  @db.VarChar(4)
  // Nombre mostrable, siempre presente (del catálogo o tal cual lo escribió).
  etiqueta  String
  // 1.0 = objetivo principal. 0.3-0.6 = lo aceptaría pero no lo busca activamente.
  // Alimenta directo el `peso` de perfilCompilado.roles[] (§5 del otro doc).
  peso      Float    @default(1.0)
  orden     Int      @default(0)
  creadoEn  DateTime @default(now()) @map("creado_en")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, orden])
  @@map("objetivos_laborales")
}
```

### 5.2 Bandera de confirmación

En `User` (o en `SearchPreferences`, donde calce mejor):

```prisma
// Distingue "la IA lo sacó del CV" de "la persona lo confirmó". Sin esto, la
// reanudación del onboarding (§7) no puede saber si el paso se contestó.
objetivoConfirmado Boolean @default(false) @map("objetivo_confirmado")
```

**Es imprescindible:** sin esta bandera no hay forma de distinguir a alguien que aceptó la
sugerencia del CV de alguien que nunca vio la pantalla.

---

## 6. La cadena de recompilación

Esto arregla P2 y es lo más importante del documento después del paso nuevo.

**Cuando cambian los objetivos** —desde el onboarding o desde el dashboard— hay que disparar,
en este orden:

1. Guardar los `ObjetivoLaboral` nuevos y poner `objetivoConfirmado = true`.
2. **Llamar a `compilar-perfil`.** Ya sube `versionPerfil` solo
   (`compilar-perfil/route.ts:142`), así que basta con invocarlo.
3. **Ofrecer rehacer el triaje** si el cambio es grande: *"Cambiaste de rubro. ¿Recalibramos qué
   ofertas te mostramos?"*

### Cuándo considerar que "cambió de rubro"

Regla concreta, usando la jerarquía CIUO que ya está en `GrupoCiuo`:

> Si el **gran grupo** (primer dígito del CIUO) del objetivo principal cambió, es cambio de
> rubro → ofrecer re-triaje. Si solo cambió el grupo primario dentro del mismo gran grupo, con
> recompilar basta.

Ejemplo: `5223` (vendedor) → `2512` (desarrollador de software) cambia de `5` a `2`. Rubro
distinto, hay que recalibrar. `5223` → `5230` (cajero) se queda en `5`: recompilar y seguir.

### Dónde engancharlo

`app/api/perfil/route.ts` **no** es el lugar: mezcla datos de contacto con el objetivo. Mejor un
endpoint propio:

```
PUT  /api/objetivos     → guarda, marca confirmado, dispara compilar-perfil,
                          responde si conviene re-triaje
GET  /api/objetivos     → los objetivos actuales + la sugerencia del CV
```

Y **dejar `cargoObjetivo` fuera del `PUT /api/perfil`**, o al menos que editarlo ahí ya no sea
lo que manda. Hoy ese campo es editable en `/dashboard/perfil` y no dispara nada: o se saca de
ahí, o se conecta a la misma cadena.

---

## 7. Cambios en el onboarding

### 7.1 Los índices se corren

`app/onboarding/page.tsx` tiene los pasos hardcodeados por índice
(`PASOS`, `paso === 0`, `irAPaso(2)`, …). Insertar en la posición 2 corre todo lo que sigue.

| Paso | Antes | Después |
|---|---|---|
| Bienvenida | 0 | 0 |
| Tu CV | 1 | 1 |
| **¿Qué buscas?** | — | **2** |
| Preferencias (triaje) | 2 | 3 |
| Conversación | 3 | 4 |
| Extensión | 4 | 5 |
| Portales | 5 | 6 |
| Listo | 6 | 7 |

### 7.2 ⚠️ El paso guardado en localStorage queda corrido

`LLAVE_PASO_GUARDADO` (`ap_onboarding_paso`) guarda un **índice numérico** en el navegador. Quien
esté a medio onboarding tiene ahí un número que después del cambio apunta al paso equivocado —
alguien en "Conversación" (3) aterrizaría en "Preferencias".

**Arreglo:** cambiar la llave a `ap_onboarding_paso_v2`. El valor viejo se ignora solo y la
lógica de `determinarInicio()` recalcula desde el servidor, que es la fuente confiable.

### 7.3 La reanudación necesita una rama nueva

En `determinarInicio()`:

```ts
const objetivoListo = !!objetivo?.objetivoConfirmado;

let calculado = 0;
if (!cvListo) calculado = 0;
else if (!objetivoListo) calculado = 2;      // ← nuevo
else if (!triajeListo) calculado = 3;        // ← corrido
else if (!conversacionLista) calculado = 4;  // ← corrido
else if (!extensionLista) calculado = 5;
else if (!portalConectado) calculado = 6;
else calculado = 7;
```

Y agregar `fetch("/api/objetivos")` al `Promise.all` de arriba.

### 7.4 El triaje pasa a anclarse en el objetivo, no en el CV

`app/api/onboarding/triaje/route.ts:17-19` hoy lee `cv.cargoObjetivo`. Debe leer los
`ObjetivoLaboral` del usuario.

`seleccionarTitulosTriaje()` (`lib/triaje.ts:155`) recibe hoy un string. Debe recibir la lista de
objetivos —con sus códigos CIUO cuando existan— y repartir los 20 títulos entre ellos según su
peso. Con dos objetivos 1.0 / 0.6, algo como 12 títulos del principal y 8 del secundario,
manteniendo dentro de cada uno el reparto 5/10/5 de §8.3.

**Bonus:** cuando el objetivo trae código CIUO, `buscarCandidatos()` puede filtrar por código en
vez de hacer matching difuso sobre el nombre — que es lo que causaba el bug del ancla
("vendedor" → "vendedor de seguros").

---

## 8. Búsqueda automática: una URL por rol

`extension/background.js:358-359` hoy:

```js
if (!estado.cargoObjetivo) return;
const slug = normalizarParaUrl(estado.cargoObjetivo);
```

Un solo objetivo → un solo slug → una URL por portal.

**Cambio:** `/api/account/estado-automatico` devuelve la lista de objetivos, y
`escanearAutomatico()` arma **una URL por (objetivo × portal)**.

Cuidado con el volumen: 2 objetivos × 2 portales = 4 pestañas cada 2 horas, contra 2 hoy.
Conviene:

- Recorrerlas **en serie**, no abrir las 4 a la vez.
- Considerar visitar el objetivo secundario con menos frecuencia que el principal (por ejemplo,
  uno de cada dos ciclos), en proporción a su peso.

---

## 9. Lo que esto habilita

No es solo un arreglo. *"Estoy cambiándome de rubro"* es una situación real, común y mal
atendida, y con esto queda soportada sin construir nada nuevo:

Alguien con **vendedor 1.0** y **desarrollador 0.6**:

- Las ofertas de ventas puntúan alto → **postula solo**.
- Las de desarrollo puntúan más bajo (el CV no las respalda) → **caen en banda gris** → se las
  muestra una por una para que decida.

Que es exactamente para lo que existe la banda gris (§8 del otro documento). El caso difícil
—postular a lo que puedes conseguir mientras persigues lo que quieres— sale gratis del diseño
que ya está construido.

---

## 10. Orden de construcción

| # | Tarea | Depende de |
|---|---|---|
| 1 | Tabla `ObjetivoLaboral` + bandera `objetivoConfirmado` (§5) | — |
| 2 | `GET`/`PUT /api/objetivos` con la cadena de recompilación (§6) | 1 |
| 3 | **Enganchar el cambio de objetivo desde el dashboard** (§6) — arregla el bug vivo de P2 | 2 |
| 4 | Paso «¿Qué buscas?» con autocompletado del catálogo (§4) | 2 |
| 5 | Correr índices del onboarding + llave `_v2` + rama de reanudación (§7.1–7.3) | 4 |
| 6 | Triaje anclado en objetivos, repartido por peso (§7.4) | 4 |
| 7 | Una URL por rol en la búsqueda automática (§8) | 2 |

**El paso 3 se puede hacer solo y primero.** No necesita la pantalla nueva ni tocar el
onboarding, y arregla el bug de que cambiar el rubro deje el scorer desincronizado — que es lo
único de este documento que hoy rompe algo en producción.

---

## 11. Criterios de aceptación

1. **El caso del cambio de rubro.** Usuario con CV de ventas declara "desarrollador de
   software". El triaje le muestra títulos de informática, no de ventas.
2. **La cadena se dispara.** Cambiar el objetivo desde el dashboard sube `versionPerfil` y deja
   `perfilCompilado.roles[]` con el rol nuevo. Verificable con una query.
3. **Doble objetivo.** Con vendedor 1.0 y desarrollador 0.6, `perfilCompilado.roles[]` trae los
   dos con esos pesos, y el triaje reparte títulos entre ambos.
4. **Detección de cambio de rubro.** Pasar de `5223` a `2512` ofrece re-triaje; pasar de `5223` a
   `5230` no.
5. **Reanudación.** Un usuario a medio onboarding con el `localStorage` viejo no aterriza en un
   paso equivocado.
6. **Sin objetivo declarado** (usuario antiguo, `objetivoConfirmado = false`): el sistema sigue
   funcionando con `cargoObjetivo` del CV como hasta ahora. **Nada se rompe para quien ya está
   dentro.**
