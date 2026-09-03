# Rediseño del filtrado de ofertas — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción (implementación).
> **Origen:** sesión de diseño sobre el código actual de `extension/` y `backend/`.
> **Fecha del diseño:** 2026-09-03.

---

## Índice

1. [Cómo leer esto](#0-cómo-leer-esto)
2. [Diagnóstico: dónde está el costo real](#1-diagnóstico-dónde-está-el-costo-real)
3. [Diagnóstico: por qué el filtro actual es malo](#2-diagnóstico-por-qué-el-filtro-actual-es-malo)
4. [La idea central: compilar vs. ejecutar](#3-la-idea-central-compilar-vs-ejecutar)
5. [Arquitectura por capas](#4-arquitectura-por-capas)
6. [El Perfil de Búsqueda compilado](#5-el-perfil-de-búsqueda-compilado)
7. [El scorer local](#6-el-scorer-local)
8. [El corpus de títulos](#7-el-corpus-de-títulos)
9. [Triaje y banda gris](#8-triaje-y-banda-gris-el-mismo-componente)
10. [Cambios de esquema Prisma](#9-cambios-de-esquema-prisma)
11. [Arreglo independiente: batchear responder-pregunta](#10-arreglo-independiente-batchear-responder-pregunta)
12. [Orden de construcción](#11-orden-de-construcción)
13. [Criterios de aceptación](#12-criterios-de-aceptación)
14. [Trampas y notas sueltas](#13-trampas-y-notas-sueltas)

---

## 0. Cómo leer esto

Este documento describe **un rediseño completo del filtrado de ofertas**, más **un arreglo de costo independiente** que se puede hacer por separado y primero.

Las secciones 1 y 2 son diagnóstico — explican *por qué* se hacen los cambios. Si vas directo a implementar, lo mínimo que tienes que leer es:

- **§5** (el formato del perfil compilado)
- **§6** (el scorer)
- **§7.3** (el parser de títulos — la parte que Roberto escribe a mano)
- **§9** (esquema)
- **§11** (orden)

Las decisiones ya están tomadas. Donde hay alternativas viables se dice explícitamente cuál se eligió y por qué, para que no se relitiguen.

---

## 1. Diagnóstico: dónde está el costo real

Precios de referencia (Claude Haiku 4.5): **$1,00 / millón de tokens de entrada**, **$5,00 / millón de salida**.

### Costo actual estimado, por usuario premium al mes

| Llamada | Entrada aprox. | Costo/llamada | Frecuencia | **Costo/mes** |
|---|---|---|---|---|
| `clasificar-ofertas` | ~500 tok | $0,00075 | ~70/día | **~$1,60** |
| `analizar-oferta` | ~2.400 tok (CV completo) | $0,0039 | 1 por postulación | ~$0,31 |
| `responder-pregunta` | ~2.900 tok (CV + estilo + calibración + aviso) **por cada pregunta** | $0,0037 | ~5 por postulación | **~$1,48** |
| | | | **Total** | **~$3,40** |

**Ingreso:** $3.990 CLP ≈ US$4. **Margen bruto ≈ 15%**, antes de Flow, Neon y hosting.

### Supuestos de ese cálculo

- CV extraído ≈ 1.200 tokens; estilo + calibración ≈ 400; aviso recortado a 3.000–4.000 caracteres ≈ 750–1.000 tokens.
- 80 postulaciones/mes (tope del plan premium, ver `lib/plans.ts`).
- ~5 preguntas de formulario por postulación.
- Búsqueda automática cada 2 horas (`INTERVALO_MINUTOS = 120`, `extension/background.js:145`) × 2 portales, más rescans del `MutationObserver` (`extension/core.js:508`) y paginación.

### Las dos conclusiones

1. **El grueso del gasto de hoy NO está en el filtrado**, está en `responder-pregunta`: `extension/adapters/computrabajo.js:206` en adelante hace un `for` que llama a la IA **una vez por pregunta**, y cada llamada remanda el CV completo, el estilo, la calibración y el aviso entero. Cinco preguntas = cinco copias del mismo prefijo. Ver §10 — es el arreglo con mejor relación esfuerzo/ahorro de todo el documento, y es independiente del rediseño.

2. **El filtrado es el que no escala.** `clasificar-ofertas` crece con las ofertas **vistas**, no con las postuladas. Hoy son 12 escaneos automáticos al día por portal. Si sube la frecuencia, se suman portales o se suman usuarios, ese número se dispara linealmente mientras el ingreso no se mueve.

---

## 2. Diagnóstico: por qué el filtro actual es malo

### 2.1 `AP.coincideFiltros` (`extension/core.js:106`)

Tres defectos estructurales — no son cosa de ajustar parámetros:

**a) `includes()` sobre `tarjeta.innerText` completo.**

No es matching de cargo, es búsqueda de subcadena sobre la tarjeta entera: título, empresa, comuna, beneficios, "Postúlate ahora". Falla en las dos direcciones:

- Excluir `"comisión"` → una tarjeta que dice *"sueldo fijo, **sin** comisión"* queda descartada. La subcadena no tiene polaridad.
- Incluir `"aseo"` → matchea `"p**aseo**"`, y matchea *"aseo de vitrinas"* dentro de un aviso de bodeguero.
- Incluir `"vendedor"` → un aviso de *"Ejecutivo comercial"* **no matchea nunca**, aunque sea exactamente lo que el usuario quiere.

**b) Es booleano.** Una oferta pasa o no pasa. No hay forma de expresar "prefiero part time pero acepto full time", ni "esto me interesa menos, pero postula si no hay nada mejor". Toda la intención del usuario se aplasta a dos listas de strings.

**c) Modalidad y jornada se olfatean por palabras sueltas** (`extension/core.js:91-104`). El comentario del propio código admite la derrota: `"presencial"` y `"cualquiera"` no filtran nada. Se está adivinando un dato estructurado que el portal ya tiene en sus facets.

### 2.2 La capa de IA (`extension/adapters/computrabajo.js:498`)

- El `objetivo` que se manda es un blob de texto libre (`estilo.objetivos` o `perfil.cargo`, ver `AP.obtenerObjetivoLaboral` en `extension/core.js:172`).
- **Es no determinista:** el mismo título puede aceptarse en un escaneo y rechazarse en el siguiente.
- **No tiene memoria:** cada batch reevalúa desde cero títulos que ya juzgó cientos de veces.
- El log de descarte dice *"no calza con tu objetivo laboral"* (`computrabajo.js:504`), que no le sirve al usuario para corregir nada.

### 2.3 `matchScore` se calcula después de decidir

`extension/adapters/computrabajo.js:406` llama a `analizarOferta` **después** de haber abierto el aviso y hecho click en postular. Se paga por un número de relevancia que nunca se usa como compuerta. Mismo patrón en `extension/adapters/laborum.js:164`.

---

## 3. La idea central: compilar vs. ejecutar

> **El 95% de lo que hace `clasificar-ofertas` es reconocer sinónimos — y los sinónimos son una propiedad del *cargo*, no de la *oferta*.**

Que "asesor comercial" ≈ "vendedor" es cierto hoy, mañana y para los 500 avisos del mes. No hay ninguna razón para preguntárselo a la IA 500 veces. Se pregunta **una vez**, cuando el usuario define su perfil, y se guarda.

Eso parte el sistema en dos tiempos:

| | Cuándo | Costo | Quién |
|---|---|---|---|
| **Compilación** | Cuando el usuario cambia algo (~2 veces/mes) | Caro, con IA | Backend |
| **Ejecución** | En cada tarjeta, miles de veces | **Cero**, determinista | Extensión, JS puro |

La compilación produce un **Perfil de Búsqueda estructurado** a partir de CV + conversación + feedback. La ejecución es un scorer que evalúa contra ese perfil: gratis, instantáneo, reproducible y **explicable** — se le puede decir al usuario exactamente por qué se descartó una oferta.

### Corolario contraintuitivo

**Barato en runtime, caro en compilación.** El paso de compilación (§7.4) debe usar el **mejor modelo disponible (Opus 5)**, no el más barato, porque corre una vez y su calidad se amortiza sobre todos los usuarios y todas las ofertas para siempre. Un error en la taxonomía —decir que "asesor comercial" no es ventas— se propaga a cada usuario en cada escaneo indefinidamente.

---

## 4. Arquitectura por capas

De más barato a más caro. Cada capa reduce el volumen que llega a la siguiente.

```
Capa 0  ·  Facets del portal en la URL de búsqueda        →  costo cero, nunca se scrapea
Capa 1  ·  Scorer local contra el perfil compilado        →  costo cero, JS puro
Capa 2  ·  Caché de veredictos por título                 →  costo cero después de la primera vez
Capa 3  ·  Banda gris → cola de decisión del usuario      →  costo cero, y genera etiquetas
```

**Nota: no hay capa de IA en runtime.** Se eliminó a propósito. La banda gris va al usuario, no al modelo — ver §8.2 para el razonamiento.

### Capa 0 — Facets del portal

`URL_BUSQUEDA_POR_PORTAL` (`extension/background.js:169`) hoy solo usa el slug del cargo:

```
https://cl.computrabajo.com/trabajo-de-vendedor
```

Computrabajo y Laborum tienen facets propios de comuna, jornada, modalidad, fecha de publicación y renta. **Cada oferta que filtra el portal es una oferta que nunca se scrapea, nunca se puntúa y nunca se clasifica.** Y elimina el hack de olfatear "part time" en el texto: pasa a ser un dato estructurado pedido al portal.

**Tarea:** mapear los parámetros reales de cada portal (verificar contra el sitio, no asumir) y extender el builder para que reciba el perfil compilado, no solo el slug.

---

## 5. El Perfil de Búsqueda compilado

Reemplaza `SearchPreferences.palabrasIncluir / palabrasExcluir / modalidad / jornada` (`backend/schema.prisma:256`).

Se guarda como `Json` versionado en la misma tabla (columna nueva, ver §9). El campo `version` es un entero que se incrementa en cada recompilación e **invalida el caché de veredictos**.

```jsonc
{
  "version": 3,

  // Roles que el usuario SÍ quiere. Los sinónimos los pre-expande la IA
  // en la compilación — es el trabajo que hoy se hace por batch en runtime.
  "roles": [
    {
      "canonico": "vendedor",
      "sinonimos": [
        "asesor comercial", "ejecutivo de ventas", "ejecutivo comercial",
        "promotor", "dependiente", "vendedora", "asesor de ventas"
      ],
      "peso": 1.0
    },
    {
      "canonico": "cajero",
      "sinonimos": ["cajera", "atencion de caja", "operador de caja"],
      "peso": 0.5
    }
  ],

  // Descarte duro. `razon` se muestra en el log — hoy el log no explica nada.
  "vetos": [
    { "patron": "comision pura", "razon": "no acepta renta 100% variable" },
    { "patron": "call center",   "razon": "descartado en la conversación" }
  ],

  // Ajustes graduales al puntaje. No descartan, mueven.
  "senales": [
    { "patron": "part time",        "delta":  15 },
    { "patron": "sin experiencia",  "delta":  10 },
    { "patron": "licencia clase a", "delta": -40 }
  ],

  "ubicacion": {
    "comunas": ["nunoa", "providencia", "santiago centro"],
    "aceptaRemoto": true
  },

  "jornada":  "part_time",   // cualquiera | full_time | part_time
  "modalidad": "cualquiera", // cualquiera | remoto | hibrido | presencial

  "umbralPostular": 65,      // >= esto  → postular directo
  "umbralGris":     45       // <= esto  → descartar. Entre medio → cola de decisión
}
```

### Qué cambia respecto a las listas planas

| Antes | Ahora |
|---|---|
| `palabrasIncluir: string[]` | Roles canónicos con sinónimos pre-expandidos y peso |
| Booleano pasa/no pasa | Puntaje 0–100 con tres bandas |
| Exclusiones sin explicación | Vetos con `razon` mostrable |
| Sin versión | `version` que invalida caché |

### Quién lo produce

`POST /api/ai/compilar-perfil` (reemplaza `sugerir-filtros`, `backend/app/api/ai/sugerir-filtros/route.ts`). Entrada:

- CV (`CvProfile.textoExtraido`)
- `StyleProfile` confirmado (objetivo, motivaciones, fortalezas)
- **Todas las etiquetas de `DecisionOferta` del usuario** (§8) — esto es lo nuevo y lo que más señal aporta

Se recompila **como máximo una vez al día**, en batch, con todo el feedback acumulado. Nunca una recompilación por evento de feedback.

---

## 6. El scorer local

Reemplaza `AP.coincideFiltros` (`extension/core.js:106`). Vive en `extension/core.js`, portal-agnóstico como el actual: cada adaptador le pasa strings planos.

### Firma

```js
// Devuelve { score, banda, razones[] } — nunca un booleano pelado.
// banda: 'postular' | 'gris' | 'descartar'
AP.puntuarOferta = function (campos, perfil) { ... }

// campos = { titulo, empresa, cuerpo, ubicacion }
```

**El adaptador debe pasar los campos por separado**, no un blob. Hoy `pasa()` (`computrabajo.js:56`) manda `tarjeta.innerText` entero — ese es el origen de la mitad de los bugs.

### Los tres arreglos sobre el matching actual

**1. Límites de palabra, no subcadena.** Tokenizar y comparar tokens. Se acaba `"p**aseo**"`.

**2. Stemming ligero español** para género y plural: `vendedor / vendedora / vendedores → vendedor`. Un sufijador simple (`-a`, `-as`, `-os`, `-es`) cubre casi toda la varianza de títulos chilenos. No hace falta una librería.

**3. Campos con peso distinto:**

| Campo | Peso |
|---|---|
| `titulo` | ×3 |
| `empresa` | ×1 |
| `cuerpo` | ×0,5 |
| `ubicacion` | solo para el chequeo de comuna |

Hoy todo es un blob plano — por eso una palabra de exclusión en el *boilerplate* mata una oferta buena.

### Orden de evaluación

```
1. Vetos          → si matchea alguno, banda = 'descartar', razones = [veto.razon]. Corta acá.
2. Roles          → puntaje base según mejor match (canónico o sinónimo) × peso del rol
3. Ubicación      → si hay comunas configuradas y no matchea (y no acepta remoto), penalización fuerte
4. Señales        → suma/resta los deltas que apliquen
5. Clamp 0–100    → asignar banda según umbralPostular / umbralGris
```

### Las tres bandas

```
score >= umbralPostular (65)   →  postular. Sin IA.
score <= umbralGris     (45)   →  descartar. Sin IA. Log con razones.
entre medio                    →  cola de decisión del usuario (§8). Sin IA.
```

`razones[]` se llena siempre y se guarda en el log y en la cola. Es lo que hace el sistema explicable.

---

## 7. El corpus de títulos

### 7.1 Scrape semilla — una sola vez

**Decisión: el scrape NO es un pipeline, es un arranque en frío.** Se corre una vez a mano desde la máquina de Roberto y se acabó.

**Script:** `backend/scripts/scrape-corpus.ts`, mismo patrón que `backend/scripts/set-admin.ts` — uso manual, no expuesto por HTTP, no referenciado desde la app.

**Portales: Computrabajo y Laborum. NO Indeed.** No es precaución legal, es un problema de diseño: se le van a mostrar al usuario títulos para predecir su comportamiento frente a ofertas de Computrabajo. Los títulos no se escriben igual en cada portal — convenciones distintas, `(a)` vs `/a`, cuánta ubicación y marca meten, qué tan largos son. Entrenar sobre una distribución y ejecutar sobre otra da peores resultados. Además Indeed bloquea agresivamente.

**Qué extraer:** no ofertas — **títulos distintos con frecuencia**.

```
vendedor part time mall plaza vespucio   → 847
asesor comercial                         → 412
ejecutivo de ventas terreno              → 203
```

La frecuencia es la mitad del valor: es lo que permite mostrar los títulos **más comunes** del área del usuario, que es donde cada swipe rinde más información.

**Volumen:** los títulos están en las páginas de listado, no en el detalle. Una request ≈ 20 títulos. Para ~3.000 títulos distintos se necesitan del orden de 300–500 requests.

**Reglas de ejecución:**

- Ritmo lento: **1 request cada 2–3 segundos**. No paralelizar.
- `User-Agent` identificable, no falsificado.
- Guardar el resultado crudo en disco (`scripts/data/corpus-crudo.json`) para no repetir el scrape al iterar la limpieza.
- Correrlo **una sola vez**. Si hace falta más corpus, viene de §7.2.

**Nota de contexto:** los ToS de estos portales generalmente prohíben el scraping automatizado. Lo que se extrae son títulos de cargo públicos y factuales, una vez, a volumen bajo, para construir una taxonomía que no se redistribuye. El riesgo es bajo pero no es cero, y por eso el diseño lo limita a un arranque en frío y lo reemplaza inmediatamente por §7.2.

### 7.2 Cosecha por extensión — para siempre

Después del día uno hay una fuente mejor y gratis: **la extensión ya lee todas las tarjetas de todos los usuarios.**

`extension/adapters/computrabajo.js:481` recorre `article.box_offer` y saca el `h2` de cada una. Hoy tira ese texto a la basura si la oferta no pasa el filtro.

**Tarea:** reportar los títulos vistos al backend (batch, junto con el reporte de postulación existente vía `chrome.runtime.sendMessage` → `background.js`, que es el que tiene privilegios para el fetch sin CORS — ver `AP.reportarPostulacion`, `extension/core.js:72`).

Costo cero, riesgo cero, sin infraestructura nueva: corre sobre la sesión del propio usuario, que es exactamente lo que la extensión ya hace para postular.

```
Día 0:   scrape manual   →  ~3.000 títulos      (una tarde, una vez)
Día 1+:  extensión       →  crece solo          (costo cero, riesgo cero)
```

### 7.3 Etapa 1 — el parser determinista

**Esta es la parte que Roberto escribe a mano.** Sin IA. Gratis.

#### Reencuadre: no es un limpiador, es un parser

La tentación es escribir `quitarComunas(titulo)` que **borra**. No se borra — se **extrae a campos estructurados**:

```
"Vendedor(a) Part Time Mall Plaza Vespucio - Ñuñoa"
        ↓
{
  rolLimpio: "vendedor",
  comuna:    "nunoa",
  jornada:   "part_time",
  ruido:     ["mall plaza vespucio", "(a)"]
}
```

**Por qué importa:** esos datos que se iban a tirar son exactamente los que necesita el resto del rediseño.

- La comuna extraída alimenta el chequeo de ubicación del scorer, que hoy compara con `includes()` (`extension/core.js:120`).
- El `part time` extraído **es** el dato que hoy se adivina olfateando palabras en `AP_KEYWORDS_JORNADA` (`extension/core.js:102`). El comentario de ese bloque admite que el método no funciona. Acá se obtiene bien, del título, gratis.

Es la misma pasada. Si se borra, hay que hacerla dos veces y la segunda mal.

#### Qué va en las listas

No es una lista, son varias con destinos distintos:

| Categoría | Destino | Volumen aprox. |
|---|---|---|
| **Comunas** (346 en Chile) | → campo `comuna` | 346 |
| **Regiones** (16) + ciudades coloquiales | → campo `region` | ~40 |
| **Malls y centros comerciales** | → descartar | ~60 |
| **Jornada** | → campo `jornada` | ~15 |
| **Modalidad** | → campo `modalidad` | ~10 |
| **Tipo de contrato** (plazo fijo, reemplazo, temporada) | → campo `contrato` | ~10 |
| **Marcadores de género** (`(a)`, `/a`, `o/a`) | → descartar | ~8 |
| **Ruido de marketing** | → descartar | ~40 |
| **Códigos y números** | → descartar (regex, no lista) | — |

El ruido de marketing es el que más sorprende por volumen: `URGENTE`, `¡Postula ya!`, `Gran oportunidad`, `Se necesita`, `Buscamos`, `Importante empresa`, `Con o sin experiencia`, `Ingreso inmediato`.

#### ⚠️ Lo que NO se puede tocar

> **La jerarquía no es ruido.** `Junior`, `Senior`, `Jefe`, `Supervisor`, `Encargado`, `Coordinador`, `Asistente`, `Ayudante`, `Practicante` **cambian el rol**, no lo decoran.

"Jefe de local" y "Vendedor de local" no son el mismo trabajo. Si se colapsan al mismo canónico, el sistema postula a un practicante a jefaturas y viceversa. **Es el error más caro posible de esta etapa porque es invisible:** el corpus se ve más limpio y el sistema empeora.

**Regla dura:** la lista de stripping es una **lista blanca cerrada**. Si algo no está explícitamente en ella, se conserva. Nunca "quitar palabras cortas", nunca "quitar lo que parezca ubicación", nunca heurísticas.

#### Trampas específicas de las comunas chilenas

| Comuna | Colisión |
|---|---|
| **Estación Central** | Si no se exige la frase completa, `central` se come *"central de llamados"*, *"central de operaciones"* |
| **Coronel** | Comuna en Biobío **y** grado militar / apellido |
| **Independencia** | Comuna y sustantivo común |
| **Providencia** | Comuna y sustantivo común |
| **Corral** | Comuna y sustantivo común |
| **Quinta Normal** | `quinta` suelta rompe cosas |
| **La Unión** | Comuna, pero `unión` aparece en otros contextos |
| **Los Ángeles** | Comuna en Biobío, y también ciudad de EE.UU. en avisos remotos |

Y la trampa de orden: **los malls contienen nombres de comunas y de calles.** `Mall Plaza Vespucio` tiene que salir antes de que nada intente matchear `Vespucio` o `Plaza`. Igual `Portal La Dehesa` antes de `La Dehesa`.

#### Reglas duras de aplicación

1. **Match por frase completa con límites de palabra.** Nunca subcadena — es el mismo bug que tiene `coincideFiltros` hoy.
2. **Más largo primero, siempre.** Ordenar cada lista por número de palabras descendente antes de aplicar. `Pedro Aguirre Cerda` antes que cualquier cosa que empiece con `Pedro`.
3. **Orden entre listas: malls → comunas → regiones → resto.** De lo más específico a lo más general.
4. **Red de seguridad:** si después de limpiar quedan **menos de 3 caracteres**, devolver el título original. Un aviso llamado literalmente "Providencia" es basura, pero convertirlo en `""` contamina el corpus con una fila vacía de alta frecuencia.

#### Formato de la lista

El destino importa tanto como el término:

```ts
{ termino: "estacion central",     tipo: "comuna",  destino: "comuna",  region: "RM" }
{ termino: "mall plaza vespucio",  tipo: "mall",    destino: "descartar" }
{ termino: "media jornada",        tipo: "jornada", destino: "jornada", valor: "part_time" }
```

**Los términos van ya normalizados** (minúsculas, sin tildes), igual que hace `AP.n` (`extension/core.js:50`). Si se escribe "Ñuñoa" con tilde en la lista y el matcher normaliza el título pero no la lista, **no matchea nunca y el bug es silencioso**.

#### Namespace por país desde el día uno

Archivo `limpieza/cl.ts`, **no** `limpieza.ts`, con la firma recibiendo el país. Cuesta nada ahora y es una refactorización fea el día que se agregue Perú o Colombia (salto natural en Computrabajo).

### 7.4 Etapa 2 — agrupación con IA

Corre **una sola vez**, offline, sobre la salida de §7.3.

- Entrada: las ~800 formas limpias distintas que quedan después del parser.
- Batches de 200 → **4 llamadas**.
- **Usar la Batch API** (50% de descuento; la latencia no importa porque corre offline).
- **Usar Opus 5 (`claude-opus-5`), no Haiku.** Ver §3 — corre una vez y su calidad se amortiza sobre todos los usuarios para siempre. Costo total: unos pocos dólares.

Salida: cada forma limpia mapeada a un `rolCanonico` con sus sinónimos. Se guarda en `TituloCanonico` (§9).

---

## 8. Triaje y banda gris — el mismo componente

### 8.1 La unificación

El triaje de onboarding y la banda gris son **literalmente la misma interacción**: *"¿postularías a esto? Sí / No"*.

- Una corre **una vez**, con títulos del corpus.
- La otra corre **siempre**, con ofertas reales.
- **Ambas escriben en la misma tabla** (`DecisionOferta`), que es lo que recompila el perfil.

**Construir un solo componente de swipe y usarlo en los dos lugares.**

### 8.2 Por qué la banda gris va al usuario y no a la IA

**Decisión tomada: la banda gris se acumula en el dashboard, no se manda a la IA.**

Razón: cada decisión humana es una **etiqueta de entrenamiento**, así que el perfil aprende y la banda se encoge. La IA no deja nada — se paga y se vuelve a empezar desde cero la próxima vez.

**De ahí sale la métrica de salud del sistema:**

> Si la banda gris no se achica con el tiempo, el perfil no está aprendiendo.

Es un número graficable que dice si el rediseño funciona.

### 8.3 Cuáles 20 títulos se muestran en el triaje

No al azar. Se busca **máxima información por swipe**, y eso significa mostrar **casos de frontera**, no casos obvios:

| Cuántos | De dónde | Qué enseña |
|---|---|---|
| ~5 | Núcleo obvio del `cargoObjetivo` | Confirma el centro. Si dice que no, algo está muy mal en el perfil |
| ~10 | **Roles vecinos ambiguos** | Acá está toda la señal. ¿"Cajero" sí o no para quien busca vendedor? ¿"Promotor"? ¿"Reponedor"? |
| ~5 | Claramente fuera pero plausibles por rubro | Da los vetos gratis |

Veinte títulos obvios de "vendedor" no enseñan nada. Diez fronteras bien elegidas definen el borde entero del perfil.

Los títulos se eligen del corpus filtrando por frecuencia alta (títulos raros no representan lo que el usuario va a ver).

### 8.4 El problema difícil: la caducidad

Este es el punto débil real del modelo. Línea de tiempo:

```
oferta aparece → cae gris → espera en dashboard → usuario entra (¿2 días?)
→ aprueba → extensión la toma en la próxima alarma (≤2h) → postula
```

Peor caso ~3 días desde el avistamiento hasta la postulación. La mayoría de los avisos de Computrabajo viven semanas, pero los buenos se llenan rápido.

**Diseño:**

- **TTL de 5–7 días** en la cola (`venceEn`). Generoso, pero corta el pudrimiento.
- **Ordenar por "vence antes", no por más reciente.** Lo urgente arriba por defecto.
- Mostrar `publicadaEn` en relativo ("hace 4 días") para que el usuario calibre solo.
- Al aprobar, la extensión visita la URL. **Si ya no existe o no hay botón de postular, marcar `EXPIRADA` y decírselo al usuario.** Silencio ahí sería peor que el error.

### 8.5 El riesgo de que sea un cementerio

Si el usuario no entra al dashboard, las grises se pudren y el sistema postula **menos** que antes. Mitigaciones obligatorias:

- **Badge con contador en el sidebar** (`backend/app/dashboard/Sidebar.tsx:24`), en un ítem nuevo tipo "Por decidir".
- Cuando vencen sin revisar, decirlo explícitamente: *"se te vencieron 12 ofertas sin revisar"*.
- **Modo swipe rápido:** si hay 30 pendientes, el usuario tiene que poder liquidarlas en ~40 segundos. Ese es el mismo componente de §8.1.

### 8.6 Cómo vuelve la aprobación a la extensión

El canal ya existe: `/api/extension/perfil` (`backend/app/api/extension/perfil/route.ts:17`) se consulta antes de cada búsqueda automática (`actualizarFiltrosDesdeBackend`, `background.js:176`).

- Agregar ahí las **URLs aprobadas pendientes**.
- `abrirYEscanear` (`background.js:238`) ya sabe abrir una pestaña, escanear y cerrarla sola — solo hay que apuntarla a una URL de oferta concreta en vez de una de búsqueda.

Es reutilización casi literal, no código nuevo.

---

## 9. Cambios de esquema Prisma

### 9.1 Tablas nuevas

```prisma
// El corpus compilado. GLOBAL, no por usuario — un título canónico vale
// para todos. Esta es la tabla que hace que el usuario N+1 sea casi gratis.
model TituloCanonico {
  id            String   @id @default(uuid())
  formaCruda    String   @unique @map("forma_cruda")   // "vendedor part time mall plaza vespucio"
  formaLimpia   String   @map("forma_limpia")           // "vendedor"  (salida de §7.3)
  rolCanonico   String?  @map("rol_canonico")           // "ventas"    (salida de §7.4, null hasta agrupar)
  frecuencia    Int      @default(1)
  platformId    String?  @map("platform_id")
  actualizadoEn DateTime @updatedAt @map("actualizado_en")

  platform JobPlatform? @relation(fields: [platformId], references: [id])

  @@index([rolCanonico])
  @@index([frecuencia])
  @@map("titulos_canonicos")
}

// Etiquetas del usuario. UNA sola tabla para las tres fuentes — es lo que
// hace que recompilar el perfil sea una query trivial.
model DecisionOferta {
  id          String          @id @default(uuid())
  userId      String          @map("user_id")
  jobOfferId  String?         @map("job_offer_id")   // null si viene del triaje de onboarding
  tituloCrudo String          @map("titulo_crudo")
  scoreLocal  Int?            @map("score_local")     // el puntaje que la dejó en gris
  razones     Json?                                   // por qué cayó ahí — para mostrárselo
  fuente      FuenteDecision
  veredicto   Veredicto       @default(PENDIENTE)
  venceEn     DateTime?       @map("vence_en")
  decididoEn  DateTime?       @map("decidido_en")
  creadoEn    DateTime        @default(now()) @map("creado_en")

  user     User      @relation(fields: [userId], references: [id])
  jobOffer JobOffer? @relation(fields: [jobOfferId], references: [id])

  @@index([userId, veredicto, venceEn])
  @@map("decisiones_oferta")
}

enum FuenteDecision {
  TRIAJE_ONBOARDING
  BANDA_GRIS
  HISTORIAL          // pulgar abajo en /dashboard/historial
}

enum Veredicto {
  PENDIENTE
  SI
  NO
  EXPIRADA
}
```

Recompilar el perfil es entonces:

```ts
prisma.decisionOferta.findMany({ where: { userId, veredicto: { in: ["SI", "NO"] } } })
```

### 9.2 Cambio en `SearchPreferences`

Agregar la columna del perfil compilado. **Mantener las columnas viejas durante la transición** para poder hacer rollback sin migración inversa:

```prisma
model SearchPreferences {
  // ... campos actuales, se conservan durante la transición ...
  perfilCompilado  Json? @map("perfil_compilado")
  versionPerfil    Int   @default(0) @map("version_perfil")
}
```

### 9.3 Decisión sobre `JobOffer`

**Decisión tomada: `JobOffer` deja de ser "ofertas postuladas" y pasa a ser el corpus de avistamientos.**

Hoy solo nace cuando se postula (`backend/schema.prisma:284`). Es exactamente la tabla que la cosecha de §7.2 necesita llenar.

**Consecuencias que hay que manejar:**

- Crece con **avistamientos**, no con postulaciones — órdenes de magnitud más filas. Revisar índices.
- `enum OrigenOferta { MANUAL, AUTOMATICO }` (`schema.prisma:42`) se queda corto: hace falta distinguir "vista" de "postulada". Agregar valor o agregar un booleano `postulada`.
- **Retención:** definir purga de avistamientos sin postulación (sugerido: 90 días).

*Alternativa descartada:* tabla separada de avistamientos. Más limpio conceptualmente, pero duplica título/empresa/url y obliga a reconciliar cuando una vista se convierte en postulación.

---

## 10. Arreglo independiente: batchear `responder-pregunta`

> **Esto no depende de nada del resto del documento y es el mejor cambio esfuerzo/ahorro. Hacerlo primero.**

### El problema

`extension/adapters/computrabajo.js:206` en adelante (y `laborum.js:174`) recorren las preguntas del formulario en un `for` y llaman a `aiResponde` **por cada una**. Cada llamada a `backend/app/api/ai/responder-pregunta/route.ts` remanda:

- CV completo (`construirMensajesCV`, `backend/lib/ai-messages.ts`)
- `StyleProfile` + `StyleCalibrationAnswer`
- El aviso entero (hasta 4.000 caracteres)

Cinco preguntas = cinco copias del mismo prefijo.

### La solución

**Una sola llamada** que reciba el aviso, el perfil y **todas las preguntas del formulario**, y devuelva un JSON con todas las respuestas. El aviso y el CV viajan una vez en vez de seis.

Además, **fusionar `analizar-oferta` en la misma llamada** — hoy es una llamada aparte (`computrabajo.js:406`) que manda el mismo CV y el mismo aviso otra vez. El `matchScore` sale en el mismo JSON.

| | Entrada/postulación | Costo/postulación |
|---|---|---|
| Hoy | ~17.000 tok | **$0,022** |
| Batcheado | ~3.200 tok | **$0,007** |

A 80 postulaciones/mes: de **$1,79** a **$0,56**.

### Nota sobre prompt caching

**No sirve acá.** El prefijo mínimo cacheable de Haiku 4.5 es de **4.096 tokens**, y CV + estilo + aviso ronda los 2.400. Se pondría el marcador `cache_control` y no cachearía nada, **en silencio** (`cache_creation_input_tokens: 0`, sin error).

Batchear las preguntas es más simple y ahorra más. No perder tiempo en caching.

### Nota sobre el model ID

El código actual usa `"claude-haiku-4-5-20251001"`. El ID correcto y completo es **`claude-haiku-4-5`**, sin sufijo de fecha. Corregir donde aparezca (`analizar-oferta`, `clasificar-ofertas`, `responder-pregunta`, `sugerir-filtros`).

---

## 11. Orden de construcción

Ordenado para que cada paso entregue valor solo y no bloquee al siguiente.

| # | Tarea | Depende de | Toca producción |
|---|---|---|---|
| **0** | **Batchear `responder-pregunta` + fusionar `analizar-oferta`** (§10) | — | Sí, pero aislado |
| **1** | **Cosecha por extensión** — reportar títulos vistos al backend (§7.2) | — | Sí, aditivo |
| **2** | **Script de scrape + parser determinista** (§7.1, §7.3) | Lista de Roberto | No (offline) |
| **3** | **Agrupación con Opus en batch** → taxonomía (§7.4) | 2 | No (offline) |
| **4** | **Componente de swipe** + tabla `DecisionOferta` (§8, §9.1) | 3 | Sí, ruta nueva |
| **5** | **Triaje en onboarding** (usa el componente con títulos del corpus) | 4 | Sí |
| **6** | **Scorer local con bandas** + cola gris (usa el mismo componente) | 4, 5 | **Sí — cambia el comportamiento de postulación** |
| **7** | **Facets del portal en la URL** (§4, capa 0) | — | Sí |

**Los pasos 1–3 son backend/offline puro y no tocan el comportamiento de la extensión en producción.** El paso 4 se usa dos veces. Recién en el 6 cambia de verdad cómo se postula.

Los pasos **0** y **7** son independientes de todo lo demás y se pueden intercalar cuando convenga.

---

## 12. Criterios de aceptación

### Del parser de títulos (§7.3)

Se puede **medir**, no adivinar — para eso se hace el corpus antes que la lista.

1. Correr la limpieza sobre los ~3.000 títulos crudos.
2. Contar formas distintas antes y después. **Si no baja de 3.000 a bastante menos de 1.000, falta lista.**
3. Ordenar lo que quedó sin colapsar **por frecuencia** y mirar el top 100 → **esa es la lista de tareas exacta**. No se adivina qué falta: los datos dicen qué ruido es el más caro que sigue suelto. Dos o tres iteraciones y converge.
4. **Revisión cualitativa:** mirar las 50 formas limpias más frecuentes. **Todas tienen que leerse como cargos reconocibles.** Si aparece un fragmento tipo `de local` o `part`, hay un bug de orden o de límites de palabra.
5. **Regresión de jerarquía:** verificar que `Jefe de local`, `Supervisor de ventas` y `Vendedor` NO colapsaron al mismo canónico.

### Del scorer (§6)

- Tomar 100 ofertas reales del corpus con veredicto humano conocido (del triaje) y medir cuántas caen en la banda correcta.
- **Ninguna oferta debe caer en `descartar` sin al menos una `razon` en el log.**

### Del sistema completo

- **Métrica de salud (§8.2): el tamaño de la banda gris por usuario debe decrecer con el tiempo.** Si no decrece, el perfil no está aprendiendo y hay que revisar la recompilación.
- **Costo/mes/usuario premium: objetivo < US$0,60** (desde ~$3,40).

---

## 13. Trampas y notas sueltas

- **Normalización consistente.** `AP.n` (`extension/core.js:50`) hace lowercase + quita tildes. **Todo** —listas, títulos, perfil compilado, claves de caché— tiene que pasar por la misma función. Un desajuste acá produce bugs silenciosos (no matchea nunca, sin error).

- **El `MutationObserver` (`extension/core.js:508`) dispara rescans con debounce de 2,5s.** Con el scorer local esto deja de importar (es gratis), pero verificar que `AP.vistos` siga evitando reprocesar tarjetas ya evaluadas.

- **`AP.vistos` es memoria de sesión, no persistente.** Al recargar la página se pierde. Con el caché de veredictos (§9.1) esto deja de ser un problema de costo, pero sí de trabajo repetido.

- **El log de descarte hoy no explica nada** (`computrabajo.js:504`). Con `razones[]` del scorer, pasar la razón real. Es lo que le permite al usuario corregir su perfil.

- **No borrar `coincideFiltros` hasta que el scorer esté validado.** Dejar las dos rutas conviviendo detrás de un flag en `AP.cfg` durante la transición.

- **`checkAndLogAiUsage` (`backend/lib/ai-usage.ts`)** cuenta llamadas, no tokens. Con el batcheo de §10 el número de llamadas baja mucho más que el costo real, así que los límites de plan (`limiteLlamadasIaMes`: 150 free / 600 premium) van a quedar muy holgados. **Recalibrarlos después de medir**, o cambiar la métrica a tokens.

- **Retención del corpus.** `TituloCanonico` es global y crece lento (formas distintas, no avistamientos). `JobOffer` con avistamientos crece rápido — definir purga (§9.3).

- **Chile tiene 346 comunas y 16 regiones.** Verificar que la lista esté completa contra la fuente oficial antes de dar por buena la etapa 1.
