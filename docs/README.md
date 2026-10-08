# Documentos de diseño de AutoPostula

> Índice y estado del trabajo. **Actualizado: 2026-10-08.**
> Si vas a implementar algo, empieza por acá: dice qué está hecho, qué falta y en qué orden.

> ✅ **`main` y `rama-roberto` ya son una sola línea** ([`creditos-y-pagina-nueva.md`](creditos-y-pagina-nueva.md)
> §2): las dos implementaciones de "¿supiste algo?" se unificaron en una (vive en Postulaciones,
> `lib/estado-real.ts` + `lib/palabras-estado.ts`), y la migración que repetía un enum ya aplicado en
> producción quedó corregida antes de tocar el deploy.

> ⏳ **Lo que queda de [`revision-2026-09-16.md`](revision-2026-09-16.md) no es código.** Sus 25
> hallazgos están implementados (verificado el 22-09 contra el código, sección por sección). Faltan
> dos cosas que no se pueden cerrar desde el editor:
>
> 1. **Importar el catálogo de ocupaciones en la base de producción** (`scripts/importar-catalogo.ts`).
>    El §2.4 ya no lee un JSON gitignored sino `TituloCanonico` con `origen=CATALOGO_OFICIAL`, pero si
>    esas filas no están en Vercel, el autocompletado de "¿Qué buscas?" sigue vacío y los objetivos se
>    guardan sin CIUO.
> 2. **Repetir el Apéndice A con la versión publicada en la tienda** — es el criterio de aceptación
>    de la revisión completa (§7), y se hace a mano con la extensión instalada.

---

## Los documentos

| Documento | De qué trata | Estado |
|---|---|---|
| [`rediseno-filtrado-ofertas.md`](rediseno-filtrado-ofertas.md) | El rediseño completo del filtrado: perfil compilado, scorer local, catálogo CIUO, triaje, banda gris | ✅ **Implementado y encendido** — `usarScorerLocal` pasó a `@default(true)` (revisión §1.4) |
| [`objetivo-laboral.md`](objetivo-laboral.md) | El objetivo deja de inferirse del CV y pasa a declararlo la persona | ⚠️ Implementado — el autocompletado ya lee de `TituloCanonico` en vez de un JSON gitignored (revisión §2.4). **Falta importar el catálogo en la base de producción** o sigue vacío |
| [`visibilidad-y-etapa2.md`](visibilidad-y-etapa2.md) | Ver por qué se filtra, leer el aviso de las grises, enriquecer la tarjeta de decisión | ✅ **Implementado** — `detalleAviso` se valida y se guarda (revisión §2.3) |
| [`banco-de-preguntas.md`](banco-de-preguntas.md) | Las preguntas de los formularios como activo: pre-respuestas del usuario, aprender de sus correcciones, coherencia entre postulaciones | ⚠️ **Pasos 1 y 7** — capturar `respuestaIa`/`fueEditada` (§3) y aprender de las correcciones (§6): `StyleRefinement` quedó cableado y el ajuste fino pregunta cuando detecta un patrón. Faltan el 2 (normalizar preguntas), el 5 (`PreguntaCanonica`/`RespuestaGuardada`), el 6 (pre-respuestas) y el 8 (coherencia). El **paso 3, la semilla de ~20 preguntas, lo escribe Roberto** y bloquea al 4 |
| [`modo-solo-observar.md`](modo-solo-observar.md) | Escanear y cosechar sin postular. Destraba la recolección de corpus y es el modo "pruébalo antes de dejarlo actuar" para usuarios nuevos | ✅ **Implementado** |
| [`verificacion-de-correo.md`](verificacion-de-correo.md) | Verificar el correo antes de dejar que la cuenta actúe (token de la extensión, checkout), no antes de dejarla mirar | ✅ **Implementado** |
| [`estado-real-de-postulaciones.md`](estado-real-de-postulaciones.md) | Las métricas del dashboard están mal: 2 de 3 portales no rastrean estado y lo importante pasa por correo. La persona como fuente de verdad | ⚠️ **5 de 7 pasos** — hechos 1, 2, 3, 4 y 7: métrica honesta con cobertura declarada, estado `ENTREVISTA`, la regla de que el portal nunca pisa lo que reportó la persona, y la pantalla «¿Supiste algo?» (ya unificada, `creditos-y-pagina-nueva.md` §2.3). Faltan los pasos 5 y 6 (escaneo de estado en Laborum y Trabajando), que **necesitan selectores verificados contra el sitio real** |
| [`celular-y-escritorio.md`](celular-y-escritorio.md) | La extensión no corre en teléfonos y el 98,9% del tráfico llega por ahí: que el registro móvil no choque contra un muro, código de enlace, y qué puede hacer el celular solo | ⚠️ Parcial — la parte A está (el onboarding móvil ya no choca contra el paso de la extensión, §3.2/§3.3); falta el resto |
| [`revision-2026-09-16.md`](revision-2026-09-16.md) | Prueba integral: sitio, panel, cuenta nueva de punta a punta y extensión en los 3 portales. Postula a todo sin perfil, ubicación inferida y mal leída, límites que se revisan después de enviar, panel que no cuadra | ✅ Implementada — los 25 hallazgos, verificados el 22-09 contra el código. Falta importar el catálogo en producción (§2.4) y repetir el Apéndice A con la versión de la tienda (§7) |
| [`rafagas-y-ponerse-al-dia.md`](rafagas-y-ponerse-al-dia.md) | La búsqueda automática exige el computador prendido todo el día y un notebook se suspende. Pasa a ráfagas: se pone al día sola al abrir Chrome o despertar, sin suspenderse a la mitad. Incluye 2 bugs latentes de la alarma actual y por qué se descartó la nube | ✅ Hecho — los 10 pasos hechos; falta que la Chrome Web Store apruebe la 2.13 (en revisión) |
| [`estrategia-y-rediseno.md`](estrategia-y-rediseno.md) | Cómo venderlo frente a la competencia (Postula Fácil da ~200 postulaciones por $3.990), créditos sin suscripción, qué filtra de verdad un "ATS" en Chile y el rediseño pantalla por pantalla, con mockups en el lienzo «Rediseño AutoPostula» | 🔨 En ejecución — 3 de 13 (landing, Hoy, estado único de la extensión). Los créditos de su §3 pasaron a `creditos-y-pagina-nueva.md` |
| [`creditos-y-pagina-nueva.md`](creditos-y-pagina-nueva.md) | Los créditos van sí o sí: el motor ya existe como `postulaciones_extra`. Reglas, devolución cuando la postulación no llegó, precios, y la fase nueva de la página (landing, precios, preguntas frecuentes, chequeo de CV público, medición). Incluye el plan para juntar las dos ramas | 🔴 **Prioridad 1** — decidido el 24-09. El **paso 0** (juntar las ramas) ya está hecho; quedan los pasos 1 a 9 |
| [`pase-prepagado.md`](pase-prepagado.md) | El Cargo Automático de Flow es solo para empresas y Roberto opera como persona natural: Premium pasa a pases de 30 y 90 días de pago único, sin renovación. Vigencia por fecha en un solo helper (hoy hay 14 lugares que miran `estado: "ACTIVA"`) | ✅ **Implementado** — los 7 pasos programables del §9, verificados el 24-09: `obtenerPlanVigente`, esquema, checkout/confirmación/retorno, `acreditarPago` idempotente, ruta de cancelar retirada, cron de avisos y comprobante por correo. Falta el **paso 0** (inicio de actividades y boletas), que es de Roberto con el contador y bloquea cobrar de verdad, no programar |
| [`amplitud-de-busqueda.md`](amplitud-de-busqueda.md) | Un caso real que calzaba perfecto y quedó en "Por decidir" por patrones que nunca calzaban; más el control de amplitud por CIUO ("vendedor en general") y el modo "cualquier trabajo", donde el eje deja de ser el cargo y pasan a mandar las condiciones | ✅ **Los 8 pasos hechos** (§2, §4, §5, §6). Queda **recompilar los perfiles existentes** (paso 2): gasta una llamada de IA por cuenta, es decisión de Roberto — hasta que se haga, las cuentas de hoy siguen con los patrones viejos |
| [`revision-2026-09-28.md`](revision-2026-09-28.md) | Revisión de seguridad y errores de la página y la extensión: otra cuenta podía cambiarte el enlace "Ver oferta" (phishing), tomar una cuenta antes de que existiera, correos que decían "enviado" sin salir, la revisión en pestañas de fondo, aprobadas atascadas, sin límite de intentos ni tope de gasto en IA | ✅ **Implementada** — los 24 hallazgos más el §25, verificados en local con el build de producción. Falta **desplegar** (migración aditiva), **subir la extensión 2.15.0** a la tienda, decidir el correo de contacto y poner `FLOW_SANDBOX="true"` en tu `.env` local |
| [`optimizacion-2026-09-29.md`](optimizacion-2026-09-29.md) | El panel mostraba "Cargando…" varios segundos en el celular: bajaba el JavaScript y recién ahí pedía los datos. Ahora Hoy, Postulaciones, Por decidir y la barra de arriba llegan con sus datos desde el servidor, el gráfico se baja aparte y el menú pide solo un número | ✅ **Hecho** — en un celular de gama media el contenido real pasó de 4,2–5,3 s a ~2,3 s y los saltos de diseño de 0,22–0,45 a 0, sin cambiar cómo se ve. Quedan como idea las demás páginas del panel y el onboarding |
| [`extension-trabajando-2026-09-30.md`](extension-trabajando-2026-09-30.md) | En trabajando.com la extensión nunca había enviado una postulación: tomaba el "Comenzar" oculto, no reconocía la pantalla de preguntas ni "¡Has postulado al empleo!". Además, con "toda la región" los tres portales buscaban solo en Alhué (0 ofertas), y las part time de Sodimac con ficha "Jornada Completa" se descartaban | ✅ **Hecho y verificado en vivo sin enviar nada** — el sitio habilitó su propio "Postular" con las respuestas de la extensión; la búsqueda usa la región (431 ofertas en vez de 0); lo que la IA no sabe (licencia, disponibilidad) se le pregunta a la persona una vez y queda en su perfil (§7). **Decisión pendiente:** qué hacer con las ofertas que se terminan en el sitio de la empresa (Sodimac/Falabella) |
| [`extension-laborum-2026-10-01.md`](extension-laborum-2026-10-01.md) | En las ráfagas Laborum abría avisos y cerraba sin postular: no leía la ficha del aviso (donde dice "Part-time"), así que toda la búsqueda part time quedaba en duda; daba la página por cargada antes de que existiera; la ráfaga cerraba la pestaña a la mitad; y la pestaña de una aprobada escaneaba los avisos relacionados. Además, la "pretensión de renta" dejaba las postulaciones incompletas sin preguntar | ✅ **Corregido y verificado en vivo sin enviar nada** — la búsqueda part time real: cada aviso se resolvió una vez, 4 habrían ido a postular (clics bloqueados), las "Full-time" se descartan con su razón; lo que la IA no sabe se pide con el panel de Trabajando. Lo mismo pasaba en Computrabajo (§7), y las horas del título ("30 hrs", "42 hrs") ahora dicen la jornada (§8). Falta recargar la extensión y postular de verdad |
| [`primera-busqueda-guiada.md`](primera-busqueda-guiada.md) | Qué ve alguien que recién instaló: en vez de un tutorial, la primera búsqueda mira ofertas reales, las etiqueta en el portal y no envía nada hasta que la persona lo autoriza mirando el resultado. Más las tres frases que sí hay que decir y el guion del video de 60 segundos para la ficha y la landing | ✅ **Panel (§10), portal (§11) y las tres frases del popup (§12) hechos**: la tarjeta «Probemos» en Hoy (desplegada el 01-10); en la extensión, la marca en cada oferta con su razón y la tarjeta del final con «Empezar a postular» (2.17.0), y la línea de «qué necesita de ti» en el popup, con la detección de sesión arreglada en los tres portales (2.17.1). Falta desplegar (trae migración) y subir la 2.17.1. Queda el video |
| [`revision-scorer-2026-09-30.md`](revision-scorer-2026-09-30.md) | Por qué el filtrado falla: el puntaje suma tres cosas que no se pueden sumar (si es lo que busco, si puedo tomarlo, cuánto me gusta). Tres casos verificados contra el código real, tres reglas para arreglarlo, y el banco de casos que convierte "no funciona muy bien" en una cifra con datos que ya se están guardando | ✅ **Implementado el 30-09** en `rama-roberto`, con dos fallas más (señales que calzan con otra palabra, ofertas que solo dicen la región), el banco de casos (`scripts/banco-de-casos.ts`) y el umbral por cuenta en Filtros. Falta desplegar (trae migración) |
| [`pendientes-de-lanzamiento-2026-10-07.md`](pendientes-de-lanzamiento-2026-10-07.md) | Cuatro cosas construidas que hoy no le sirven a nadie: la 2.17.1 sin subir a la tienda, el catálogo CIUO sin importar en producción (por eso la amplitud no trae ni un oficio), el sitio sin analítica, y `/precios` y `/preguntas-frecuentes` en 404. Con los textos listos | 🔨 **2 de 4** — analítica y las páginas `/precios` y `/preguntas-frecuentes` hechas (`4e93455`). Faltan los dos de Roberto: subir la extensión (ahora la 2.18.0, que trae lo de la 2.17.1 y ya tiene su servidor en producción) y correr el importador del catálogo |
| [`panel-de-revision-en-el-portal.md`](panel-de-revision-en-el-portal.md) | La extensión pasa de decidir a proponer: el panel lista las ofertas escaneadas en tres grupos y la persona marca «esta también» o «esta no» antes de que salga nada. Cada corrección es la etiqueta que hoy falta — el banco de casos solo ve la banda gris, nunca lo que el scorer resolvió solo. Más el atajo para probarla apenas queda conectada | ✅ **Hecho (§8, extensión 2.18.0)**: el panel desde la tarjeta del final y desde el ícono, lo marcado se postula por la cola de aprobadas (revisando el cupo antes de cada una), cada corrección queda con su puntaje y razones, y «Probémosla ahora» al cerrar el onboarding. El servidor quedó en producción el 08-10 (PR #33, con sus migraciones); falta subir la 2.18.0 a la tienda, y la tarea 5: el banco de casos con el tercer grupo |
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

### 1. Créditos y la página nueva — [`creditos-y-pagina-nueva.md`](creditos-y-pagina-nueva.md)

Los créditos están decididos y el motor ya existe con otro nombre (`postulaciones_extra`): libro
mayor, paquetes, premios, compra por Flow y comprobante. Falta la devolución cuando la postulación
no llegó (§3.3), verificar 10 postulaciones reales antes de abrir la venta (§3.6) y la fase nueva
de la página: landing desplegada, precios en una URL propia, preguntas frecuentes, chequeo de CV
público y alguna forma de medir (§4, §5). Su §6 tiene el orden completo.

### 1b. Señales que nunca calzan — [`amplitud-de-busqueda.md`](amplitud-de-busqueda.md) §2

**Los pasos 1 a 5 (del 8 del §8) ya están.** Los patrones de señales y vetos se normalizan a un
solo término al compilar (`lib/normalizar-patron.ts`), con una salvedad que el documento no cubría:
partir por "/" o coma es correcto para una lista plana (`"moda, vestuario, calzado, fashion"`), pero
un veto como `"retail genérico sin especialidad en moda/vestuario/calzado"` es una FRASE con una
lista adentro, no una lista — partirla y salvar los fragmentos cortos ("vestuario", "calzado")
habría creado vetos con el sentido invertido, y la oferta de ejemplo se habría descartado en vez de
postularse. Por eso la normalización es todo-o-nada: si algún fragmento no sirve como término, se
descarta la frase entera (y para vetos, se guarda igual la `razon`, visible en Filtros de búsqueda
como "esto no se está aplicando"). También: sinónimos con una preposición de enlace ("vendedor de
retail" calza con "vendedor retail"), el multiplicador por campo aplicado a las señales igual que a
los roles, la jornada por fin leída en el scorer (§6), y `scripts/verificar-patrones.ts` para que no
vuelva a pasar en silencio. Probado contra el caso real del documento (extension/verificar-scorer.js)
y con `tsc`/`next build` limpios.

**Pendiente, a propósito:** el **paso 2** (recompilar los perfiles ya existentes) no se hizo solo —
gasta una llamada de IA por cuenta y **es una decisión de Roberto**, no algo para automatizar en
silencio. Los pasos 6 a 8 (control de amplitud por CIUO, modo "cualquier trabajo") quedan para
después, según el orden del documento.

### 2. Banco de preguntas — [`banco-de-preguntas.md`](banco-de-preguntas.md)

Dos de ocho. Lo que paga todo es el paso 6 (pre-respuestas), y la que lo destraba es la semilla del
paso 3, que se escribe a mano.

| # | Tarea | § | Depende de |
|---|---|---|---|
| ~~1~~ | ~~Capturar `respuestaIa` / `fueEditada` de verdad~~ | §3 | ✅ Hecho |
| 2 | Normalización determinista de preguntas | §4.1 | — |
| 3 | Semilla de ~20 preguntas canónicas escrita a mano | §4.2 | Lo escribe Roberto |
| 4 | Clasificador de preguntas contra la semilla, con `ninguna` | §4.2 | 2, 3 |
| 5 | `PreguntaCanonica` + `RespuestaGuardada` en el esquema | §10 | 3 |
| 6 | Pantalla de pre-respuestas + reuso en el flujo de postulación | §5 | 4, 5 — **el pago de todo** |
| ~~7~~ | ~~Detección de patrones → `StyleRefinement`~~ | §6 | ✅ Hecho (`046bc8a`) |
| 8 | Chequeo de coherencia | §7 | 5 |

### 3. Lanzamiento

Fuera de los documentos de diseño, esto es lo que falta para publicar.

| Tarea | Estado | Bloquea a |
|---|---|---|
| Revisión legal de privacidad y términos | ⏸ Con el abogado | Chrome Web Store |
| Definir la política de devolución (`§7.2` de Términos), **para pases y ahora también créditos** | ⏸ Con el abogado | Cobrar de verdad |
| **Inicio de actividades en el SII** | ✅ **Hecho el 28-09-2026** — folio 17252490, primera categoría, afecto a IVA, micro empresa. Giros `631200` (portales web) y `631100` (procesamiento de datos y hospedaje) | — |
| Régimen tributario | ✅ **Pro Pyme Transparente (14 D N°8)** con contabilidad simplificada, desde el 28-09-2026 (folio 45061802851) | — |
| Certificado digital, boleta electrónica y patente municipal | ⚠️ Lo hace Roberto; el certificado digital bloquea la boleta | Cobrar de verdad |
| Cuenta de comercio Flow | ✅ **Aprobada** (24-09) | — |
| `FLOW_SANDBOX=false` en producción | 🔨 Ya se puede: Flow aprobado + SII hecho | Cobrar de verdad |
| Verificar dominio en Resend + `RESEND_FROM_EMAIL` | ✅ Resuelto en `323f2a4`; verificado en Vercel el 19-09 | Recuperación de contraseña real |
| `CRON_SECRET` en producción | ✅ Puesto el 19-09 — las tres rutas responden 401 y el purgado a 90 días corre | Cumplir la promesa de borrado de la política |
| Cobro con pases prepagados ([`pase-prepagado.md`](pase-prepagado.md)) | ✅ Programado; falta probarlo contra el sandbox de Flow | Cobrar de verdad |
| Créditos ([`creditos-y-pagina-nueva.md`](creditos-y-pagina-nueva.md)) | 🔨 Motor listo; falta devolución, verificación y boleta | Cobrar por unidad |
| Ficha y envío a la Chrome Web Store | ✅ Publicada | — |
| Versión 2.13.0 de la extensión (ráfagas y permiso `power`) | 🔨 **En revisión** en la tienda; en el repo ya hay una 2.14 sin publicar | Que la landing y la tienda digan lo mismo |
| Analítica del sitio | ❌ No existe | Saber si algo de esto sirve |

> **Plazo legal real:** la **Ley 21.719** (protección de datos personales) entra en vigencia a
> fines de 2026 y es bastante más exigente que la 19.628 — ver `preguntas-abogado.md` §B. Es la
> única fecha límite dura detectada en toda la documentación; conviene que el abogado la tenga
> presente al responder, no solo las preguntas bloqueantes de la Chrome Web Store.

---

## Principios que se repiten

Seis ideas que atraviesan todos los documentos. Si hay que decidir algo que no está escrito,
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

6. **Nunca actuar sin saber.** Sin perfil no se postula; una lista vacía significa "no sé qué
   buscas", no "acepto todo". Lo que la persona tiene que declarar (objetivo, ubicación) se le
   pregunta, no se infiere del CV. Un límite se revisa antes de enviar, no después.
   *(`revision-2026-09-16.md` §0.)*
