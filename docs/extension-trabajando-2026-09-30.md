# La extensión en trabajando.com — 2026-09-30

> **Estado:** ✅ corregido y verificado contra el sitio real, sin enviar ninguna postulación.
> **Para:** Roberto y el chat de producción.
> **Cómo se verificó:** en el Chrome de Roberto (con su sesión de trabajando.com), leyendo el código
> del propio sitio y recorriendo el flujo real, más el código nuevo de la extensión corriendo sobre
> esas mismas páginas con el clic final bloqueado (detalle al final). "Mis postulaciones" de
> trabajando.com seguía diciendo "Aún no tienes postulaciones" al terminar.
> **Relacionado:** `revision-2026-09-16.md` §8.1 (confirmación de la postulación),
> `amplitud-de-busqueda.md` §6 (jornada).

---

## 0. Lo esencial

En trabajando.com la extensión **nunca había logrado enviar una postulación**: la cuenta de Roberto
no tenía ninguna. Y la búsqueda automática no encontraba ofertas.

| Problema | Qué pasaba | § |
|---|---|---|
| "Comenzar" | El modal de preguntas trae dos botones "Comenzar" (celular y computador). La extensión tomaba el de celular, oculto, y no lo apretaba nunca: la postulación quedaba detenida ahí | §1 |
| Pantalla de preguntas | Después de "Comenzar" el sitio cambia de pantalla. La extensión buscaba campos en todo el documento: preguntas duplicadas (el panel de celular), el buscador de arriba tratado como pregunta, y el campo de número (renta) con texto que el sitio rechaza | §1 |
| Postulación enviada | El sitio dice "¡Has postulado al empleo!" y la extensión no lo reconocía: una postulación sin preguntas (se envía en un clic) quedaba como error y **no se guardaba en AutoPostula** | §2 |
| Búsqueda automática | Con "toda la región", los tres portales buscaban solo en la primera comuna en orden alfabético: **"vendedor en Alhué", 0 ofertas** | §3 |
| Jornada | Las ofertas part time de Sodimac ("Jornada PT20 hrs") traen la ficha "Jornada Completa": para quien busca part time, se descartaban todas | §4 |
| Aprobadas de "Por decidir" | La pestaña que abre la aprobada también trae el listado, y se ponía a escanearlo antes de la orden de postular: podía postular a otras y terminar enviando la aprobada a la oferta equivocada | §5 |
| Preguntas que la IA no sabe | Una sola sin respuesta (licencia, disponibilidad; muchas son listas Sí/No) dejaba la postulación sin enviar, y los seguros de tiempo cerraban la pestaña a la mitad | §7 |

---

## §1. Postular: "Comenzar" y la pantalla de preguntas

Lo que hace el sitio al apretar "Postula fácil" (leído en su código, `controladorPostulacion`):

- **Sin preguntas:** la envía en ese mismo clic y muestra "¡Has postulado al empleo!". No hay
  confirmación intermedia: el modal "Confirma tu postulación" (`#modalConfirmarPostulacion`) sigue en
  la página, pero el sitio ya no lo abre.
- **Con preguntas:** abre `#modalConfirmarPreguntas` con dos "Comenzar" (`d-md-none` y
  `d-none d-md-block`). "Comenzar" reemplaza el panel de la oferta por la pantalla "Estás postulando
  a…": `#detalleOferta` deja de existir y las preguntas quedan en `#formularioPreguntasOferta`.
- **CV incompleto, estudios de una institución, CV en archivo:** otro modal que pide algo a la
  persona.

La pantalla de preguntas tiene tres tipos de campo, y ningún radio ni casilla: TEXTO (`textarea`,
hasta 3.000), MULTIPLE (`select`) y NUMERO (`input` que solo acepta un número de hasta 11
caracteres). El "Postular" de arriba (`#cabeceraPreguntasEscritorio`) sigue deshabilitado hasta que
todas las respuestas son válidas, y ese clic ya envía.

**Arreglo** (`adapters/trabajando.js`, `postular()` y `responderPreguntas()`):

- Se aprieta el "Comenzar" que se ve, después de que el modal termina de abrirse.
- Se responde **solo** dentro de `#formularioPreguntasOferta`. El sitio dibuja otra copia de cada
  pregunta, con los mismos ids, en su panel de celular (`#offCanvasPreguntasMobile`, oculto con
  `visibility:hidden` pero con `offsetParent`), y el buscador de arriba son inputs de texto visibles.
- Una sola llamada a la IA para todas las preguntas (antes eran dos, cada una con el CV y el aviso
  completos). A la de número se le pide "solo el número", y además se saca el número de la respuesta
  (`soloNumero`: "$800.000 líquidos" → 800000, "800 mil" → 800000).
- La opción de una lista se elige por calce exacto, después "empieza con" y recién al final
  "contiene" (`opcionQueCalza`): con solo "contiene", "No, sin licencia" caía en "Si".
- Si el sitio no habilita "Postular", no se envía y el historial dice qué preguntas faltan.
- **"Revisar antes de enviar":** en una oferta sin preguntas, "Postula fácil" ya envía, así que la
  confirmación se pide **antes** de ese clic. Se sabe si tiene preguntas porque el sitio solo arma
  `#offCanvasPreguntasMobile` cuando las hay (comprobado contra los datos del sitio en ofertas con 7,
  6 y 0 preguntas). En una con preguntas, lo que se revisa son las respuestas, antes del "Postular"
  final.
- Se borró el relleno genérico que recorría todo el documento (`rellenar`,
  `manejarGruposDeOpciones`, `getLabel` y compañía): ya no calzaba con ninguna pantalla del sitio.

## §2. La postulación enviada

La evidencia de éxito ahora es la pantalla de éxito del sitio (`.seccion-postulacion-ok`) o su
texto ("¡Has postulado al empleo!", "Has iniciado tu inscripción al empleo"). Se dejó de usar
"ya no hay botón de postular" como señal: en la pantalla de preguntas tampoco hay panel ni botón, y
eso es una postulación a medio hacer. Y `obtenerBotonPostular()` ya no busca fuera del panel de la
oferta: en todo el documento encontraba el enlace "Mis postulaciones" del menú.

## §3. La búsqueda automática buscaba en una sola comuna

`background.js` armaba las tres búsquedas con `filtros.comunas[0]`. Con "toda la región", el perfil
compilado trae todas sus comunas (con variantes sin tilde y abreviaturas) en orden alfabético.
Verificado en los tres sitios:

| Búsqueda | Con Alhué (antes) | Con la región (ahora) |
|---|---|---|
| Trabajando, vendedor | 0 | 431 (`?region=1`) |
| Trabajando, asistente de ventas | 0 | 279 |
| Computrabajo, vendedor part time | 0 | 1.274 (`-en-rmetropolitana`) |
| Laborum, vendedor part time | 0 | 328 (`en-region-metropolitana/`) |

**Arreglo** (`ubicacionDeBusqueda` en `background.js`): una sola comuna → esa comuna, como antes;
varias de una región → la región en el portal que la tiene; comunas de varias regiones → sin
ubicación (el scorer igual descarta las comunas que no se pidieron). Las variantes de una comuna
cuentan como una (sin tilde, y las abreviaturas que la tabla trae como entradas propias: "stgo",
"pac", "e. central", "pto montt"). Probado contra la tabla completa: cada comuna sola da su comuna y
cada una de las 16 regiones completa da su región.

- Para saber la región de cada comuna, `background.js` carga `data/comunas-cl.js` con
  `importScripts`. El archivo (generado por `backend/scripts/generar-comunas-extension.ts`) ahora usa
  `window` o, en el service worker, `self`.
- Las regiones de cada portal salen de sus propios filtros: Trabajando usa ids (RM = 1, Valparaíso =
  6…), Computrabajo los nombres de su filtro "Región" (sin Ñuble: pone Chillán en Biobío). En
  Laborum solo la RM está verificada: "en-valparaiso", "en-araucania" y "en-nuble" dan 0 ofertas, así
  que fuera de la RM se busca sin ubicación.

## §4. Jornada: el título manda

Sodimac publica sus part time con el título "Vendedor/a Sodimac La Reina Jornada PT20 hrs", la ficha
"Jornada Completa" y "turnos rotativos jornada completa" en la descripción. El scorer descartaba ante
cualquier mención de la jornada contraria, en cualquier parte del aviso. Y "PT20" no se reconocía
como part time (`\bpt\b` no calza pegado al número).

**Arreglo** (`AP.puntuarOferta`, paso 3b, en `core.js`): si el título dice la jornada buscada, calza
(aunque diga las dos); si no, una mención de la contraria descarta y, si nada dice la buscada, queda
la duda, como antes. "PT20", "PT30HRS" y "FT42" se reconocen (`AP_JORNADA_CON_HORAS`).

Con el perfil de Roberto (part time, vendedor, toda la RM), la primera página de "vendedor" en la RM
pasó de **1 oferta a postular a 5**: Paris "PT30HRS", tres Sodimac part time y "Vendedores en
Terreno… Part time". Las que dicen jornada completa en el título o solo en la ficha siguen fuera.

De paso, `AP.formatearRazonCorta` no conocía las razones `jornada`, `jornada_desconocida`,
`requisito` ni `modo_abierto`, y el historial decía "sin razón" en cada descarte por jornada. Ahora
usa las mismas palabras que el panel (`backend/lib/formatear-razon.ts`).

## §5. Las aprobadas de "Por decidir"

- Una pestaña que se **abre** en una oferta puntual (`/trabajo/{id}-…`) ya no se escanea sola
  (`CARGADA_EN_OFERTA`): espera la orden de postular. Un escaneo pedido (búsqueda automática, botón
  Escanear, activar desde el popup) sí corre; `core.js` lo marca con `AP.escaneoPedido`.
- El título de la oferta se lee del `<h1>` de su página propia (en el listado es `<h3>`): antes esas
  postulaciones quedaban registradas como "Oferta".
- En la segunda pasada del escaneo, una oferta ya postulada (el panel dice "Ya postulaste") no se
  manda a "Por decidir".

## §6. El panel de "Revisar antes de enviar" con listas

Al cambiar una respuesta de lista (`select`) en el panel, la extensión intentaba "hacer clic" en un
`<option>`, que no tiene efecto, y "Sin elegir" no la borraba en la página. Ahora se elige en su
`<select>` (`AP.elegirOpcion`, `core.js`). Lo editado en la pregunta de número se vuelve a dejar como
número antes de enviar.

## §7. Segunda vuelta: las preguntas que la IA no sabe responder

Roberto probó la versión corregida: ya abría los formularios, pero "a veces rellena, no rellena
todas las preguntas, se cierra y ni siquiera postula", y "las preguntas de selección (Sí/No)
quedan sin elegir". Las causas:

1. **La IA no veía lo que la persona busca.** Recibía el CV, el perfil y los datos adicionales,
   pero no la jornada, la modalidad ni los lugares declarados. "¿Tiene disponibilidad para trabajar
   presencialmente en La Dehesa?" quedaba sin respuesta, y con la regla 1b (no inventar hechos
   verificables) también "¿Cuenta con licencia clase B?". Muchas de esas son listas Sí/No: por eso
   quedaban en "Selecciona".
2. **Sin "Revisar antes de enviar", una sola pregunta vacía abortaba la postulación**, sin
   preguntarle nada a nadie (§8.4 de la revisión del 16-09 lo dejó así a propósito: nada se
   inventa).
3. **Los seguros de tiempo cerraban la pestaña a la mitad.** 90 s la de una aprobada de "Por
   decidir" y 8 min el paso de una ráfaga, que ahora sí encuentra ofertas (§3) y postula a varias.

**Arreglos:**

- **Servidor** (`api/ai/procesar-postulacion`): el prompt lleva "Lo que el candidato declaró que
  busca" (jornada, modalidad, dónde puede trabajar, si acepta remoto), con la regla 1c: lo declarado
  no es un dato faltante. Un horario exacto (turnos, fines de semana) sigue siendo regla 1b. Con
  "Usar mi perfil" apagado no va, igual que el CV. Los nombres de jornada, modalidad y región pasaron
  a `lib/busqueda-declarada.ts`, que también usa la página Hoy.
- **Extensión — se pide lo que falta en vez de abortar:** sin "Revisar antes de enviar", si quedan
  preguntas sin respuesta se abre el mismo panel con el título "Falta información para postular" y
  2 minutos de plazo. Lo que la persona conteste lo puede guardar en su perfil, **ahora también en
  las preguntas de lista**. Se guarda con su nombre ("licencia clase B: Si", antes un "Si" suelto) y
  la pestaña lo usa desde la oferta siguiente. Si el panel vence sin respuesta, en esa pestaña no se
  vuelve a preguntar: las demás ofertas con datos faltantes se saltan directo, con el dato en el
  historial. Si la IA misma falló (cupo del mes, red), no hay nada puntual que preguntar: se dice y
  se sigue.
- **Extensión — latido** (`AP.latido` → mensaje `POSTULANDO`): en cada etapa de una postulación (y
  antes y después de la IA, en los tres portales) el background vuelve a contar desde cero el seguro
  de la pestaña. Si la pestaña se cuelga, deja de avisar y el seguro la cierra igual.

**Verificado** en un simulador de la pantalla de postulación (con lo verificado en el sitio real:
los dos "Comenzar", la lista, el texto y el número, y el "Postular" que solo se habilita con todo
válido), corriendo `core.js` y `trabajando.js` reales en el navegador integrado:

| Escenario | Resultado |
|---|---|
| Falta la licencia y la persona está | Panel "Falta información", elige "Si", "Guardar esto en mi perfil" → se guarda "licencia clase B: Si" → enviada |
| La oferta siguiente, misma pestaña | Sin panel: la IA ya tiene el dato → enviada con las 3 respuestas |
| Falta un dato y no hay nadie | El panel vence → "Faltaban respuestas (licencia clase B) y nadie contestó a tiempo"; la siguiente se salta sin abrir el panel |
| La IA sin cupo | Sin panel → "La IA no pudo responder el formulario (…)" |
| Con "Revisar antes de enviar" | El panel de siempre ("Revisa antes de enviar", 3 min) |

Más 4 comprobaciones nuevas del latido en `verificar-rafagas.js`, `npm run typecheck` del
backend y las suites del backend que no necesitan base de datos.

---

## Cómo se verificó

- **Sin la extensión de por medio:** las páginas de trabajando.com se cargaron dentro de un
  `<iframe>` del mismo sitio (en su `robots.txt`). Los content scripts solo corren en la ventana
  principal (`all_frames` no está activado), así que la extensión de Roberto, que estaba **activa y
  sin "Revisar antes de enviar"**, no podía postular sola mientras se miraba.
- **El código nuevo, sobre el sitio real:** `core.js` y `trabajando.js` se subieron al marco (con
  la herramienta de subir archivos) y se corrieron con la IA y el guardado simulados. Un escucha en
  fase de captura bloqueaba todo clic que envía (el "Postular" final, el modal de confirmación y
  "Postula fácil" en ofertas sin preguntas). Resultados:
  - **Con preguntas** ("Vendedor de Vehículos - La Dehesa", 7 preguntas): apretó el "Comenzar"
    visible, respondió las 7 solo en el formulario de computador (la IA recibió 7, no 14), dejó el
    buscador intacto, eligió "No" para "No, sin licencia", escribió 800000 para "$800.000 líquidos",
    y **el sitio habilitó su botón "Postular"** (su propia validación pasó). El clic quedó bloqueado:
    la extensión lo registró como no confirmado y no lo reportó.
  - **Con "Revisar antes de enviar":** el panel apareció antes del envío; cambiar la licencia a "Si"
    llegó a la página, y "$950.000" quedó como 950000.
  - **Sin preguntas y con revisión:** la confirmación apareció antes de cualquier clic; con "Saltar",
    no se apretó nada.
  - **Sin preguntas y sin revisión:** apretó el botón correcto y, sin respuesta del sitio, no
    inventó un éxito.
- **Filtro:** el scorer de antes y el de ahora se corrieron con el perfil de Roberto sobre las
  ofertas reales de "vendedor" y "asistente de ventas" en la RM, con el texto completo de cada aviso
  (API del propio sitio). Ver §4.
- **Suites** (`node extension/verificar-*.js`): 7 suites, 592 comprobaciones, 0 fallos. Nuevas: la
  búsqueda por comuna o región en los tres portales, la evidencia de éxito, `soloNumero`,
  `opcionQueCalza`, la jornada por título, las razones cortas y el latido.

## Lo que queda

- **Ofertas que se terminan en el sitio de la empresa** (Sodimac → falabella.airavirtual.com): en
  trabajando.com solo queda una "inscripción inicial". Hoy la extensión la hace y el historial dice
  "la empresa pide terminarla en su sitio", pero en el panel cuenta como postulada. **Decisión de
  Roberto:** seguir así, o mandarlas a "Por decidir" (se sabe antes de postular con
  `/api/ofertas/{id}`, campo `linkPostulacionExterno`).
- **Pestañas de fondo lentas:** Chrome estira los temporizadores de las pestañas que no se ven (las
  de las ráfagas se abren así). En la prueba, con la pestaña oculta hacía rato, una postulación con
  7 preguntas tardó cerca de 2 minutos y el modal "Comenzar" quedó dibujado encima (no bloquea: los
  clics de la extensión no pasan por la pantalla). Se quitaron las pausas que no hacían falta; el
  resto es de todos los portales.
- **Laborum fuera de la RM:** busca sin ubicación hasta verificar cómo escribe sus regiones.
- **§7 necesita las dos partes:** el cambio del servidor sale con el deploy (push a la rama que
  despliega Vercel) y el de la extensión al recargarla. Con solo la extensión, la IA sigue sin ver
  lo que la persona busca y el panel "Falta información" aparece más seguido.
- **Lo más rápido para no ver el panel:** completar en el perfil la disponibilidad y los datos que
  los avisos piden seguido (licencia, renta), o contestarlos una vez con "Guardar esto en mi perfil".
- **Probarlo con la extensión real:** recargar la extensión en `chrome://extensions` (o subir la
  versión nueva a la tienda) y hacer una postulación de verdad a una oferta elegida.
