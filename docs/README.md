# Documentos de diseño de AutoPostula

> Índice y estado del trabajo. **Actualizado: 2026-09-07.**
> Si vas a implementar algo, empieza por acá: dice qué está hecho, qué falta y en qué orden.

---

## Los documentos

| Documento | De qué trata | Estado |
|---|---|---|
| [`rediseno-filtrado-ofertas.md`](rediseno-filtrado-ofertas.md) | El rediseño completo del filtrado: perfil compilado, scorer local, catálogo CIUO, triaje, banda gris | ✅ **Implementado** |
| [`objetivo-laboral.md`](objetivo-laboral.md) | El objetivo deja de inferirse del CV y pasa a declararlo la persona | ✅ **Implementado** |
| [`visibilidad-y-etapa2.md`](visibilidad-y-etapa2.md) | Ver por qué se filtra, leer el aviso de las grises, enriquecer la tarjeta de decisión | 🔨 **Pendiente — es lo que sigue** |
| [`revision-scorer-2026-09-04.md`](revision-scorer-2026-09-04.md) | Revisión que encontró 3 bugs del scorer | ✅ Corregidos (`abe563b`) |
| [`preguntas-abogado.md`](preguntas-abogado.md) | Preguntas legales concretas, contra lo que el código hace | ⏸ Esperando al abogado |
| [`legal/`](legal/) | Política de privacidad y Términos, en Word y PDF, para revisión legal | ⏸ Esperando al abogado |

**Convención:** los documentos citan secciones como `§5`, `§7.3`. Cuando un cambio invalida una
sección, se marca dentro del propio documento con un bloque de aviso — no se borra la versión
vieja sin dejar rastro de por qué cambió.

---

## Lo que ya está construido

Todo esto está en producción. No hay que rehacerlo; sirve como contexto de cómo funciona el
sistema hoy.

### Filtrado de ofertas

- **Perfil de Búsqueda compilado** (`SearchPreferences.perfilCompilado`, `lib/compilar-perfil.ts`) —
  roles con sinónimos y pesos, vetos con razón, señales, umbrales. Se compila con IA cuando la
  persona cambia algo, no por oferta.
- **Scorer local** (`AP.puntuarOferta`, `extension/core.js`) — puntúa 0-100 sin IA, en tres
  bandas: postular / gris / descartar. Convive con el filtro viejo detrás de
  `AP.cfg.scorer.usarScorerLocal`.
- **Catálogo oficial** (`scripts/data/catalogo-ocupaciones-cl.json`) — 3.484 ocupaciones chilenas
  del CIUO-08.CL del INE y de ChileValora, con código CIUO. Se importa con
  `scripts/importar-catalogo.ts`.
- **Parser de títulos** (`scripts/limpieza/`) — 672 términos de comunas, malls, jornada y ruido de
  marketing, escritos a mano. Extrae a campos estructurados, no borra.
- **Clasificador** (`lib/clasificador-titulos.ts`, `scripts/clasificar-titulos.ts`) — mapea títulos
  cosechados a códigos CIUO con Opus, en batch, periódico.
- **Cosecha pasiva** (`/api/extension/titulos-vistos`, `/api/extension/avistamientos`) — la extensión
  reporta todo lo que ve, no solo lo que postula.
- **Banda gris** (`/api/banda-gris`, `/dashboard/por-decidir`) — las ofertas ambiguas van a la cola
  de decisión de la persona, no a la IA.
- **Facetas del portal** en la URL de búsqueda automática (`extension/background.js`).

### Objetivo laboral

- **`ObjetivoLaboral`** — tabla propia, plural, con peso. Separada de `CvProfile.cargoObjetivo`,
  que pasó a ser solo una sugerencia.
- **Paso «¿Qué buscas?»** en el onboarding, con autocompletado contra el catálogo.
- **Cadena de recompilación** (`/api/objetivos`) — cambiar el objetivo recompila el perfil y
  ofrece rehacer el triaje si cambió el gran grupo CIUO.
- **`perfilDesactualizado`** — si la recompilación falla, todo va a banda gris en vez de
  descartarse en silencio.

### Costos

El rediseño llevó el costo de IA de **~US$3,40 a ~US$0,58 por usuario premium al mes**
(ver `rediseno-filtrado-ofertas.md` §1 y §10 para el detalle y los supuestos).

---

## Lo que sigue

### 1. Visibilidad y Etapa 2 — [`visibilidad-y-etapa2.md`](visibilidad-y-etapa2.md)

En orden. Los pasos 1, 2 y 3 son independientes entre sí.

| # | Tarea | §  |
|---|---|---|
| **1** | **Desglose en el overlay** — "2 postuladas · 6 por decidir · 12 descartadas" en vez de "0 de 20 coinciden" | §A |
| 2 | Razones estructuradas — hoy dicen "fuera de las comunas que buscas" sin decir cuál comuna | §C |
| 3 | `extraerFacetasAviso()` con selectores verificados contra el sitio real | §B |
| 4 | Etapa 2 en el bucle de escaneo, solo para banda gris | §B |
| 5 | `detalleAviso` en el esquema y en el reporte de banda gris | §E |
| 6 | Tarjeta de "Por decidir" enriquecida | §D |
| 7 | Sacar el filtro de IA viejo del bucle de escaneo | §G |

> **El paso 1 va primero.** Sin él no se puede verificar nada de lo demás: el overlay no dice si
> una oferta se descartó o quedó en gris, así que cualquier prueba es a ciegas.

### 2. Lanzamiento

Fuera de los documentos de diseño, esto es lo que falta para publicar.

| Tarea | Estado | Bloquea a |
|---|---|---|
| Revisión legal de privacidad y términos | ⏸ Con el abogado | Chrome Web Store |
| Definir la política de devolución (`§7.2` de Términos, hoy en borrador) | ⏸ Con el abogado | Chrome Web Store |
| Verificar dominio en Resend + `RESEND_FROM_EMAIL` | ⚠️ **Verificar** | Recuperación de contraseña real |
| Cuenta de comercio Flow aprobada + `FLOW_SANDBOX=false` | ⚠️ Verificar | Cobrar de verdad |
| Plan de Flow con el `urlCallback` del dominio propio | ⚠️ Verificar | Renovaciones |
| Ficha y envío a la Chrome Web Store | Pendiente | — |

> **Ojo con Resend:** mientras el `from` sea el dominio de prueba, los correos de recuperación de
> contraseña **solo llegan a la propia cuenta** y fallan en silencio para todos los demás.

---

## Principios que se repiten

Cinco ideas que atraviesan todos los documentos. Si hay que decidir algo que no está escrito,
decidir con esto:

1. **Compilar vs. ejecutar.** Lo caro y con IA corre una vez, cuando la persona cambia algo. Lo
   que corre en cada oferta es determinista y gratis. *(§3 del rediseño.)*

2. **Barato en runtime, caro en compilación.** El paso que corre una vez y se amortiza sobre
   todos los usuarios usa el mejor modelo; el que corre miles de veces no usa modelo. *(§3.)*

3. **Incierto = preguntarle a la persona, no a la IA.** La banda gris va al usuario porque su
   respuesta es una etiqueta de entrenamiento; la de la IA no deja nada. Todo lo que el sistema
   no puede decidir con confianza degrada a gris, nunca a un descarte silencioso. *(§8.2.)*

4. **Parsear, no grepear.** Cuando el dato existe estructurado —una faceta etiquetada, un código
   CIUO, un campo del portal— se lee de ahí. Buscar palabras sueltas en texto corrido es el bug
   que este rediseño vino a arreglar. *(§2.1c, §7.3.)*

5. **Nunca descartar en silencio.** Toda decisión trae su razón, con los valores adentro, y la
   razón se muestra donde la persona está mirando. Una oferta que desaparece sin explicación es
   el peor modo de falla del producto. *(§6, y `visibilidad-y-etapa2.md` §A y §C.)*
