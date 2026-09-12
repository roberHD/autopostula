# Documentos de diseño de AutoPostula

> Índice y estado del trabajo. **Actualizado: 2026-09-12.**
> Si vas a implementar algo, empieza por acá: dice qué está hecho, qué falta y en qué orden.

---

## Los documentos

| Documento | De qué trata | Estado |
|---|---|---|
| [`rediseno-filtrado-ofertas.md`](rediseno-filtrado-ofertas.md) | El rediseño completo del filtrado: perfil compilado, scorer local, catálogo CIUO, triaje, banda gris | ✅ **Implementado** |
| [`objetivo-laboral.md`](objetivo-laboral.md) | El objetivo deja de inferirse del CV y pasa a declararlo la persona | ✅ **Implementado** |
| [`visibilidad-y-etapa2.md`](visibilidad-y-etapa2.md) | Ver por qué se filtra, leer el aviso de las grises, enriquecer la tarjeta de decisión | ✅ **Implementado** |
| [`banco-de-preguntas.md`](banco-de-preguntas.md) | Las preguntas de los formularios como activo: pre-respuestas del usuario, aprender de sus correcciones, coherencia entre postulaciones | 🔨 Pendiente — §3 (capturar la corrección) ya está |
| [`modo-solo-observar.md`](modo-solo-observar.md) | Escanear y cosechar sin postular. Destraba la recolección de corpus y es el modo "pruébalo antes de dejarlo actuar" para usuarios nuevos | ✅ **Implementado** |
| [`verificacion-de-correo.md`](verificacion-de-correo.md) | Verificar el correo antes de dejar que la cuenta actúe (token de la extensión, checkout), no antes de dejarla mirar | ✅ **Implementado** |
| [`estado-real-de-postulaciones.md`](estado-real-de-postulaciones.md) | Las métricas del dashboard están mal: 2 de 3 portales no rastrean estado y lo importante pasa por correo. La persona como fuente de verdad | 🔨 Pendiente |
| [`celular-y-escritorio.md`](celular-y-escritorio.md) | La extensión no corre en teléfonos y el 98,9% del tráfico llega por ahí: que el registro móvil no choque contra un muro, código de enlace, y qué puede hacer el celular solo | 🔨 Pendiente |
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

### Visibilidad y Etapa 2

- **Desglose del overlay** (`AP.mensajeEscaneo`, `extension/core.js`) — "2 postuladas · 6 por
  decidir · 12 descartadas" en vez de "0 de 20 coinciden", con la razón de descarte más frecuente.
- **Razones estructuradas** — el scorer emite objetos (`{tipo, ...}`) en vez de texto ya
  formateado; cada superficie (log, overlay, tarjeta) los renderiza a su manera
  (`backend/lib/formatear-razon.ts`). Las filas viejas en string siguen renderizando.
- **Etapa 2** (`extraerFacetasAviso()`) — antes de mandar una oferta gris a la cola de decisión,
  la extensión abre el aviso (facetas + cuerpo real) y vuelve a puntuar; si resuelve, se aplica
  esa banda; si sigue en gris, se guarda con el detalle del aviso (`DecisionOferta.detalleAviso`).
- **Tarjeta de "Por decidir" enriquecida** — comuna real, chips de jornada/modalidad/contrato,
  sueldo, antigüedad, rating de la empresa, extracto, y las razones como intercambio
  "a favor / en contra". Degrada bien en filas sin Etapa 2 o de antes del cambio.
- **Filtro de IA viejo** — solo corre si el scorer local está desactivado (`!usarScorerLocal`);
  antes podía vetar ofertas que el scorer ya había aprobado con el objetivo declarado.

### Modo solo observar

- **`soloObservar`** (`AP.cfg`, popup con su propio toggle azul junto al maestro) — escanea,
  puntúa y corre la Etapa 2 igual que siempre, pero no abre el aviso para postular ni llama a la
  IA de postulación. Gana sobre "revisar antes de enviar" (no hay nada que revisar si no se
  envía nada) y bloquea también las aprobaciones de banda gris (`DO_APPLY`, `core.js`) — sin
  reintento silencioso: la decisión queda pendiente hasta que se apague el modo.
- **Log con status propio** (`observado`, `extension/historial.js`) — nunca se ve ni se cuenta
  como una postulación real.
- Desbloquea el protocolo de recolección de corpus del Apéndice de
  [`modo-solo-observar.md`](modo-solo-observar.md), para `scripts/solapamiento-portales.ts`.

### Verificación de correo

- **`emailVerificado`** (`User`, null = sin verificar) — se gatea "que la cuenta actúe", no "que
  mire": sin verificar se puede registrar, subir CV, hacer el triaje y conversar con la IA, pero
  no conectar la extensión (`/api/account/token`) ni contratar Premium (`/api/flow/checkout`).
  Login nunca se bloquea, para no crear cuentas muertas por un typo de correo.
- **Cuentas de Google se dan por verificadas solas** (`backend/auth.ts`) — Google ya confirma sus
  correos, no se le vuelve a pedir a la persona.
- **Reenvío con límite** (`/api/auth/reenviar-verificacion`) — un intervalo mínimo entre envíos
  hace de tope tanto al "1 por minuto" como al "5 por hora" del diseño original con un solo campo
  (`verifyUltimoEnvio`). El límite solo se quema si el correo salió de verdad.
- **Banner persistente en el dashboard** y aviso en el paso "Extensión" del onboarding, ambos con
  botón de reenviar. Página `/verificar` con sus tres estados (verificado / vencido / inválido).
- Cuentas existentes se dieron por verificadas en la migración — nadie quedó bloqueado de golpe.

### Costos

El rediseño llevó el costo de IA de **~US$3,40 a ~US$0,58 por usuario premium al mes**
(ver `rediseno-filtrado-ofertas.md` §1 y §10 para el detalle y los supuestos).

---

## Lo que sigue

### 1. Banco de preguntas — [`banco-de-preguntas.md`](banco-de-preguntas.md)

El paso 1 (§3, capturar `respuestaIa`/`fueEditada` de verdad) ya está — era chico y urgente,
se hizo fuera de orden. Queda el resto, en orden:

| # | Tarea | § | Depende de |
|---|---|---|---|
| ~~1~~ | ~~Capturar `respuestaIa` / `fueEditada` de verdad~~ | §3 | ✅ Hecho |
| 2 | Normalización determinista de preguntas | §4.1 | — |
| 3 | Semilla de ~20 preguntas canónicas escrita a mano | §4.2 | Lo escribe Roberto |
| 4 | Clasificador de preguntas contra la semilla, con `ninguna` | §4.2 | 2, 3 |
| 5 | `PreguntaCanonica` + `RespuestaGuardada` en el esquema | §10 | 3 |
| 6 | Pantalla de pre-respuestas + reuso en el flujo de postulación | §5 | 4, 5 — **el pago de todo** |
| 7 | Detección de patrones → `StyleRefinement` | §6 | 1 |
| 8 | Chequeo de coherencia | §7 | 5 |

### 2. Lanzamiento

Fuera de los documentos de diseño, esto es lo que falta para publicar.

| Tarea | Estado | Bloquea a |
|---|---|---|
| Revisión legal de privacidad y términos | ⏸ Con el abogado | Chrome Web Store |
| Definir la política de devolución (`§7.2` de Términos, hoy en borrador) | ⏸ Con el abogado | Chrome Web Store |
| Verificar dominio en Resend + `RESEND_FROM_EMAIL` | ✅ Resuelto en `323f2a4` | Recuperación de contraseña real |
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
