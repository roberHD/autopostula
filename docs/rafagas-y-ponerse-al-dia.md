# Ráfagas: que se ponga al día cada vez que abres el computador — especificación

> **Estado:** implementada: los 10 pasos de §7 hechos y con test (`extension/verificar-rafagas.js`,
> `backend/scripts/verificar-texto-rafaga.ts`, `backend/scripts/verificar-recordatorio-rafaga.ts`, 2026-09-19).
> Falta publicar la versión 2.13.0 de la extensión con los textos de la ficha (§5) y **verificar a
> mano** el criterio de `powercfg /requests` (§3.3, criterios 2 y 3 de §8): el test cubre la lógica con
> `chrome.power` simulado, no el Windows real. Tampoco se vio la tarjeta del panel con una sesión iniciada
> (§3.5): está probado el texto y la consulta contra Postgres, no el dibujo en pantalla.
>
> **Lo que el paso 5 hizo distinto de §3.4** (por qué, en una línea cada uno):
> - `Rafaga.extensionId` + `@@unique([userId, extensionId])`: el mismo registro se reporta al empezar y al
>   terminar, y la extensión pone su propio id (`r_<ms>`) — la clave única por persona hace idempotentes los
>   reintentos y evita que alguien pise la fila de otra persona mandando su mismo id.
> - `Rafaga.observadas`: en modo solo observar no se postula, y una cuenta nueva arranca observando
>   (`postulacionHabilitada`); sin esta columna su tarjeta mostraría siempre "0".
> - `User.ultimaRafagaEn` se actualiza solo con una ráfaga **terminada** (no interrumpida) y con la hora del
>   **servidor**, no la del reloj de la persona.
> - Las otras dos columnas de `User` del bloque de §3.4 (`recordatorioRafagaEn`, `recordatoriosActivos`)
>   quedan para el paso 9, que es el que las usa.
>
> **Lo que el paso 7 hizo distinto de §3.6** (o que §3.6 no decía):
> - **Enfriamiento de 5 min** después de terminar una ráfaga. §3.6 dice "sin el umbral de §3.1" y así es
>   (el de 3 h no aplica), pero apretarlo diez veces seguidas abriría diez rondas de pestañas sobre los
>   portales, y un bloqueo caería sobre la cuenta de la persona. Con menos de 5 min desde la última no hay
>   nada nuevo que encontrar. Si molesta, es `ENFRIAMIENTO_MANUAL_MIN` en `background.js`.
> - **Recorre todos los objetivos** y no consume el contador de ciclos: las automáticas alternan (el
>   secundario, una de cada dos), pero quien pide "ponerme al día" pidió con TODO.
> - **Dónde aparece.** Popup: siempre que el plan lo incluya, deshabilitado y con la razón debajo si hoy no
>   se puede (pausa, cupo, sin objetivo…). Panel: dentro de la tarjeta de estado, **solo con la búsqueda
>   activa** (`activa` ya exige plan, sin pausa, con cupo y con portal) — en pausa la tarjeta ya dice qué
>   hacer y no lleva botón.
> - **La duración estimada sale de dos lados** con la misma definición (mediana de las últimas 5 terminadas):
>   el popup la lee de su propio historial local (`duracionesRafaga`), el panel de la tabla `Rafaga`.
> - `/api/account/estado-automatico` ahora devuelve `disponibleEnPlan` y `motivo`; el veredicto de "por qué
>   no corre" salió a `lib/estado-automatico.ts` y lo usan también la barra del dashboard y esa ruta, para que
>   el panel y el botón no digan cosas distintas de la misma cuenta.
> - **Sin extensión en el navegador** (el celular): el botón del panel explica que esto corre en el
>   computador y no manda nada.
> - Falta verificar a mano: el botón dentro de un Chrome real con la extensión cargada, y la tarjeta del
>   panel con sesión iniciada. El popup real se vio en el navegador con un `chrome` simulado (todos sus
>   estados), y el componente real del panel se montó con un `bridge.js` simulado (con extensión, sin
>   extensión, rechazo y extensión que no contesta); el endpoint y la mediana, contra Postgres real.
>
> **Lo que el paso 7b hizo distinto de §4.1** (o que §4.1 no decía):
> - **`desdeRafaga`, no `origen: "rafaga" | "manual"`.** `POST /api/applications` ya tenía un `origen` con otro
>   significado (`OrigenOferta`, del corpus de ofertas, y la extensión siempre manda `MANUAL`): mandarle
>   `"rafaga"` reventaba el enum. Y quien lo pone no es el adaptador sino el background: es "la pestaña que la
>   ráfaga tiene abierta AHORA" (`tabActual`, el mismo criterio de `ESCANEO_TERMINADO`), así que no hay carrera
>   con lo que el adaptador alcance a saber, y una pestaña que la persona abrió a mano nunca gasta la prueba.
> - **`Application.esDePrueba`.** §4.1 pide que "Ver las 5" filtre el historial por esas postulaciones, y su
>   esquema solo traía el contador: sin esta marca no hay cómo saber cuáles fueron. Se escribe en la misma
>   transacción que el descuento (`consumirPrueba`, condicionado a `> 0`).
> - **`puede-postular` se pregunta antes de CADA oferta**, no una vez por página, en Computrabajo y Trabajando
>   (Laborum ya procesaba una por pasada). Sin eso la prueba no podía cortarse "en medio" al llegar a 5
>   (criterio 2), y el tope de 20 del mes tampoco. De paso, al cortarse, `conteos.postular` cuenta lo que se
>   llegó a postular y no lo que se iba a postular (antes el ícono y la tarjeta contaban postulaciones que nunca
>   se enviaron).
> - **Al llegar a 5 se salta el resto de la ráfaga** (`cortadaPorPrueba`), no solo el portal en curso: si no,
>   abriría los demás portales para que cada uno se cortara en su primera oferta.
> - **`sin-plan` desaparece; nace `prueba-terminada`.** Con la prueba, ninguna cuenta gratis está "sin"
>   búsqueda automática desde el principio: la tiene y se le acaba. Los payloads traen `modo`
>   (`premium|prueba|manual`), `pruebaRestantes` y `pruebaTotal`. `disponibleEnPlan` sigue siendo solo del plan:
>   "Ponerme al día ahora" no existe en el plan gratis ni durante la prueba (y `escanearAutomatico('manual')` lo
>   rechaza aunque el pedido llegue por el panel).
> - **Compatibilidad con la extensión ya publicada.** La versión de la tienda no manda `desdeRafaga`: si a una
>   cuenta en prueba se le dijera `busquedaAutomatica: true`, postularía sola sin descontar nada, hasta el tope
>   de 20 al mes. La extensión nueva pide `?prueba=1`; a la vieja se le sigue diciendo `false`.
> - **Una cuenta en prueba puede pausarla** (barra y Ajustes): una acción que corre sola tiene que poder
>   pararse, aunque no sea del plan.
> - **Activación** (`disparador: 'activacion'`): `POST /api/account/habilitar-postulacion` responde
>   `recienActivada` (solo en la llamada que de verdad cambió el estado) y `modo`; el panel pide la ráfaga por
>   `bridge.js` (`autopostula:activacion`) y le cuenta a la persona qué pasó (empezó / cuándo empieza / por qué
>   no). Ignora el umbral de 3 h y el enfriamiento de 5 min. Si ya había una ráfaga en curso (necesariamente en
>   solo observar) no se encola: el aviso dice que esa termina sin enviar y que la siguiente sí postula, que
>   puede ser hasta 3 h después.
> - **Solo gasta la prueba lo que la ráfaga envía por sí misma.** Lo aprobado en "Por decidir" sigue su propio
>   camino (`revision-2026-09-16.md` §2.9), en pestañas que no son de la ráfaga, y no cuenta.
> - **El correo de "tu prueba terminó"** lo manda la petición que se lleva el último cupo (una sola, aun con
>   ráfagas en paralelo), solo a un correo verificado, esperando el envío y sin que un fallo rompa la postulación.
> - Falta verificar a mano: nada de esto se vio en un Chrome real con la extensión cargada; el correo se probó
>   en su contenido, no en su entrega (el entorno local no tiene claves de Resend); y la tarjeta, la barra, el
>   historial y el banner se vieron con los componentes reales del panel pero con `fetch` y `bridge.js`
>   simulados, no con una sesión iniciada. Contra Postgres real: el modo de cada tipo de cuenta (admin, Premium,
>   gratis con prueba, prueba gastada, pausada), `puede-postular` con y sin `origen`, el descuento (una
>   INCOMPLETA no descuenta, no baja de 0, y 8 postulaciones en paralelo con 5 de prueba dejan exactamente 5) y
>   la compatibilidad con la extensión vieja.
>
> **Lo que el paso 8 hizo distinto de §3.7** (o que §3.7 no decía):
> - **Se envía en todos los planes, sin "Abrir y postular"** (decidido por Roberto el 2026-09-19; cambia lo
>   que decía §3.7 para el plan gratis). `revision-2026-09-16.md` §2.9 ya se había construido así
>   (`procesarAprobadas()`: al aprobar en el panel con la extensión presente, al abrir Chrome y en cada
>   chequeo) y este paso no lo toca: solo cambió el documento. Cada envío cuenta dentro de las 20 del mes y no
>   gasta la prueba de §4.1, porque su pestaña no es de la ráfaga.
> - **Lo que quedaba por hacer era el orden y la cuenta.** Antes la cola arrancaba a la vez que la primera
>   búsqueda (dos pestañas del mismo portal al mismo tiempo) y lo enviado no aparecía en el resumen. Ahora es el
>   **primer paso** de la ráfaga (`tipo: 'aprobadas'`): en serie, dentro del bloqueo de suspensión y del tope de
>   25 min, y suma sus envíos a `postuladas`, así que el ícono, el popup y la tarjeta ya no cuentan de menos.
>   Solo cuenta lo que respondió `ok` (lo que devuelve `postular()`; `success` aparece únicamente en las negativas
>   de `DO_APPLY`). Si una cola ya la había arrancado el panel o abrir Chrome, la ráfaga espera a esa misma:
>   cada oferta se envía una vez.
> - **`processQueue` cambió por dentro** (era de §2.9): la bandera `busy` pasó a una promesa compartida (una
>   excepción la dejaba "ocupada" para siempre), una oferta que revienta ya no aborta a las demás, y
>   `applyInTab` ya no se cuelga si Chrome no puede abrir la pestaña.
> - **En solo observar (o con la cuenta en modo prueba) la ráfaga ya no encola aprobadas**: `DO_APPLY` las
>   rechaza por dentro y se abrían pestañas para nada.
> - **El seguro de tiempo del paso suma un minuto por oferta** (8 + N): una cola larga no debe cortarse a los
>   8. Si aun así se dispara, la ráfaga sigue con la búsqueda y el paso no avanza dos veces.
> - **Fuera de una ráfaga** (abrir Chrome, el chequeo, el panel) la cola sigue corriendo sola como antes, sin el
>   bloqueo de suspensión: si el equipo se suspende a la mitad, lo que falte se reintenta en el próximo ciclo.
> - Falta verificar a mano: nada de esto se vio con pestañas reales de un portal. Los tests simulan `DO_APPLY`
>   y anotan el orden de los eventos (la cola termina antes de abrir la primera búsqueda, una oferta a la vez).
>
> **Lo que el paso 9 hizo distinto de §3.8** (o que §3.8 no decía):
> - **Solo Premium.** "El plan la permite" es `modo === "premium"` (o admin), no la prueba: §4.1 dice que el
>   correo de fin de prueba es el único que recibe una cuenta gratis por este tema.
> - **`User.extensionConectadaEn`** (columna nueva; §3.4 no la traía). §3.8 pide avisar a quien "nunca" corrió
>   una ráfaga "con la extensión conectada hace más de 48 h", y sin la fecha de conexión no hay cómo saberlo.
>   Se anota solo la primera vez que se conecta. Las cuentas que ya estaban conectadas quedan con `null` y
>   **no reciben el aviso de "nunca"**: una extensión anterior a las ráfagas sigue buscando con su alarma de
>   siempre y nunca las reporta, y decirle "AutoPostula no se pone al día" a alguien cuya extensión funciona
>   sería mentirle. A esas les llega recién cuando corren una ráfaga y después pasan 48 h sin otra.
> - **Tope de 14 días sin actividad** (`DIAS_MAXIMOS_SIN_ACTIVIDAD`). §3.8 no lo dice; sin él, la regla manda un
>   correo cada 3 días PARA SIEMPRE a quien se fue. Con 14 salen como máximo cinco (días 2, 5, 8, 11 y 14).
> - **La baja.** El enlace lleva una firma HMAC del id de la persona (con `AUTH_SECRET`), sin vencimiento. La
>   página `/recordatorios/baja` da de baja al abrirse y ofrece "Fue sin querer: volver a recibirlos" (un
>   antivirus de correo puede abrir el enlace antes que la persona). Además el correo trae `List-Unsubscribe` y
>   `List-Unsubscribe-Post` (RFC 8058) para el "Cancelar suscripción" de Gmail y Outlook, que hace un POST a
>   `/api/recordatorios/baja`. Sin `AUTH_SECRET` no sale ningún correo: uno sin baja no debe salir.
> - **Un envío que Resend rechaza no se anota como enviado.** Resend no lanza: devuelve `{ error }`.
>   `enviarOFallar` lo vuelve un fallo y al día siguiente se reintenta; el correo de "tu prueba terminó" también
>   pasa ahora por ahí.
> - **Tope de 100 correos por corrida**; lo que sobra sale al día siguiente.
> - **Cron a las 14:00 UTC** (11:00 en Chile en horario de verano), con los ±59 min de Vercel Hobby.
> - Falta verificar a mano: la **entrega real** (el entorno local no tiene claves de Resend: se probó el
>   contenido, la lógica contra Postgres con envío simulado y las rutas por HTTP) y cómo se ve el correo en Gmail
>   y Outlook, incluido el botón "Cancelar suscripción". Tampoco se puede reactivar desde Ajustes: solo con el
>   enlace del último correo. Antes de desplegar hay que tener `CRON_SECRET`, `AUTH_SECRET` y `RESEND_*` en Vercel.
>
> **Lo que el paso 10 hizo distinto de §5** (o que §5 no decía):
> - **Más lugares que la tabla.** Además de los de §5, decían "postula sola" o "cada 2 horas" sin condiciones:
>   el paso 3 de la landing ("Define qué te sirve"), el subtítulo de precios de la landing, el subtítulo y la
>   confirmación "Ya eres Premium" de `/dashboard/premium`, los dos textos de Ajustes (el del plan gratuito y el de
>   Premium activo) y el aviso de pausa de la tarjeta del Inicio. Se cambiaron también.
> - **`/dashboard/premium`: la tabla tiene dos filas, no una.** La vieja "Búsqueda y postulación automática" se
>   reemplazó por "Postulaciones automáticas (sin entrar al portal)" (Gratis: "Prueba de 5", Premium: ✅) y "Se pone
>   al día sola al abrir tu computador" (solo Premium): son dos promesas distintas, y las dos son ciertas.
> - **Privacidad: se declaran los datos nuevos**, que §5 no mencionaba. Sin eso la política quedaría describiendo
>   lo que hace la extensión pero no lo que guardamos para hacerlo: §2.4 (el registro de cada puesta al día, la fecha
>   de conexión de la extensión y las postulaciones de la prueba), §3 (dos filas de finalidad), §6 (la puesta al día
>   automática con sus disparadores, las pestañas de a una, el bloqueo de suspensión con tope de 25 min y su límite
>   —la pantalla se puede apagar y cerrar la tapa suspende—, y los recordatorios por correo) y §7 (el registro se
>   elimina a los 90 días). **Conviene que el abogado lo vea**: es texto legal nuevo (`preguntas-abogado.md`), y las
>   copias en `docs/legal/` (.docx y .pdf, del 13-09) ya no coinciden con la página.
> - **Lo aprobado en "Por decidir"** ya aparece en la política como se envía de verdad (paso 8): en todos los planes.
> - **La ficha de la Chrome Web Store no está en el repositorio**: vive en el panel de la tienda. Abajo van los textos
>   listos para pegar. El criterio 10 de §8 se cumple hoy en la web (no queda ningún "cada dos horas" en el código
>   que ve una persona) y en la tienda recién cuando se peguen.
> - **Lo que no se tocó a propósito:** la descripción corta del `manifest.json` ("Postulación automática
>   inteligente…"), que no promete un intervalo, y los nombres de los planes (`estrategia-y-rediseno.md` propone
>   otros, sin decidir).
> - Falta verificar a mano, en un Chrome real, lo que ningún test alcanza: criterios 1, 2, 3, 6 y 8 de §8; la entrega
>   del correo del paso 9; y la página `/dashboard/premium`, que exige sesión (el cambio es de texto y compila).
> **Para:** el chat de producción.
> **Fecha:** 2026-09-17.
> **Va después de:** la Fase 1 de `revision-2026-09-16.md` (pasos 1 a 4d de su §6). No sirve ponerse
> al día más rápido si todavía postula mal.
> **Relacionado:** `revision-2026-09-16.md` §2.9 (el "Sí" que nunca se envía) y §8.2 (estados de
> Computrabajo), `celular-y-escritorio.md` §5 (qué hace el celular solo).

---

## 1. El problema

La búsqueda automática promete *"busca y postula sola"*, y en la práctica eso significa **el
computador prendido todo el día**. No es así como se usa un notebook: se cierra la tapa, se
suspende por inactividad, se acaba la batería. Y quien busca trabajo desde un notebook no lo va a
dejar encendido 10 horas para que corra un ciclo cada 2.

Lo que dice la documentación de Chrome (`chrome.alarms`, verificado el 2026-09-17):

> Una alarma **no despierta** el dispositivo. Mientras está suspendido no corre nada. Cuando
> despierta, las alarmas perdidas se disparan.

Y además Chrome tiene que estar abierto: si la persona lo cierra, no pasa nada hasta que lo vuelva a
abrir.

### 1.1 La pregunta de fondo: ¿hace falta correr cada 2 horas?

**No.** En las pruebas del 2026-09-16, los avisos visibles decían *"hace 2 días"*, *"hace 9
días"*, *"hace 21 días"* (Trabajando) y *"publicado hace más de 15 días"* (Laborum). **Las ofertas
duran días o semanas, no horas.** Postular a las 10:00 o a las 19:00 casi no cambia nada; lo que
cambia es no postular. El intervalo de 2 horas es arbitrario.

> **La decisión:** ráfagas, no vigilancia. Cada vez que el computador está disponible —se abre
> Chrome, despierta de la suspensión, o la persona lo pide—, AutoPostula **se pone al día solo** con
> todo lo que pasó desde la última vez, en una ráfaga corta, y lo dice.

La promesa pasa de algo que en un notebook no se cumple a algo que sí:

| Antes | Después |
|---|---|
| "Busca y postula sola cada 2 horas" | "Abre tu computador y se pone al día sola" |
| Implícito: el computador prendido todo el día | Explícito: unos minutos al día, sin estar mirando |

---

## 2. Lo que hay hoy en el código

| Pieza | Dónde | Comentario |
|---|---|---|
| Alarma cada 120 min | `extension/background.js:204,210` | Creada en el **nivel superior** del service worker |
| Disparo | `background.js:491` (`onAlarm` → `escanearAutomatico`) | Único disparador automático |
| Gate de plan | `escanearAutomatico()`, `background.js:366` | `estado.busquedaAutomatica` = plan permite + activa + hay cupo |
| Búsquedas | `background.js:423-449` | `setTimeout` encadenados cada 45 s, una pestaña por objetivo × portal |
| Pestaña de búsqueda | `abrirYEscanear()`, `background.js:454` | Se cierra con `setTimeout` de 5 min y un seguro de 6 min |
| Arranque de Chrome | — | **No hay `chrome.runtime.onStartup`** |
| Permisos | `manifest.json` | `storage`, `tabs`, `alarms` |

### 2.1 🐛 La alarma se reinicia cada vez que despierta el service worker

```js
// background.js:210 — nivel superior del script
chrome.alarms.create(NOMBRE_ALARMA_AUTOMATICA, { periodInMinutes: INTERVALO_MINUTOS });
```

En MV3 el código de nivel superior **vuelve a correr en cada arranque del service worker**, y Chrome
lo apaga tras ~30 segundos sin actividad y lo levanta con cualquier evento (un mensaje de un content
script, una pestaña, el popup). Como `alarms.create` con el mismo nombre **reemplaza** la alarma
existente, cada arranque vuelve el reloj a 120 minutos.

**Consecuencia probable:** mientras la persona usa los portales, el worker despierta seguido y **la
alarma nunca llega a dispararse**. Justo cuando más sentido tendría que corriera.

**Arreglo** (el patrón que recomienda la documentación de Chrome):

```js
async function asegurarAlarma() {
  const existente = await chrome.alarms.get(NOMBRE_ALARMA);
  if (!existente) await chrome.alarms.create(NOMBRE_ALARMA, { periodInMinutes: PERIODO_CHEQUEO_MIN });
}
chrome.runtime.onInstalled.addListener(asegurarAlarma);
chrome.runtime.onStartup.addListener(asegurarAlarma);
```

**Aceptación:** con la persona navegando portales durante 3 horas seguidas, la alarma se dispara en
su horario.

### 2.2 🐛 Trabajo largo colgado de `setTimeout` en el service worker

Las búsquedas se escalonan con `setTimeout(…, 45 s × n)` y cada pestaña se cierra con `setTimeout(…,
5 min)`. **Los temporizadores no mantienen vivo al service worker**: si Chrome lo apaga entre medio,
se pierden. Resultados posibles: el segundo y tercer portal nunca se abren, o las pestañas quedan
abiertas para siempre. El commit `1e69a35` (*"los reportes al backend no mantenían vivo el service
worker"*) ya se topó con un problema de la misma familia.

**Arreglo:** la ráfaga es una máquina de estados guardada en `chrome.storage`, que avanza por
**eventos** y no por temporizadores (§3.2).

---

## 3. Diseño

### 3.1 Disparadores

Una ráfaga se intenta en cuatro momentos:

| Disparador | Cómo | Nota |
|---|---|---|
| **Se abre Chrome** | `chrome.runtime.onStartup` | Hoy no existe |
| **El computador despierta** | La alarma perdida se dispara al despertar | Ya lo hace Chrome |
| **Chequeo periódico** | Alarma cada **60 min** (§2.1), mientras Chrome esté abierto | Deja de ser "el" mecanismo; pasa a ser una red de seguridad |
| **La persona lo pide** | Botón "Ponerme al día ahora" (§3.6) | Ignora el umbral |

Todos, salvo el botón, pasan por la misma regla antes de correr:

```js
const UMBRAL_HORAS = 3;
async function quizasRafaga(disparador) {
  const { rafaga, ultimaRafagaFin } = await chrome.storage.local.get(['rafaga', 'ultimaRafagaFin']);
  if (rafaga && rafaga.estado === 'en_curso') return;                // ya hay una
  if (ultimaRafagaFin && Date.now() - ultimaRafagaFin < UMBRAL_HORAS * 3600e3) return;
  const estado = await consultarEstadoAutomatico();                 // gate de plan, cupo, pausa
  if (!estado.busquedaAutomatica) return;
  await iniciarRafaga(disparador);
}
```

El umbral evita que abrir y cerrar la tapa diez veces seguidas dispare diez ráfagas.

### 3.2 La ráfaga como máquina de estados

Estado persistido en `chrome.storage.local`:

```js
rafaga = {
  id: 'r_1726570000000',
  disparador: 'inicio_chrome' | 'despertar' | 'chequeo' | 'manual',
  inicio: 1726570000000,
  latido: 1726570042000,        // se actualiza en cada paso; sirve para detectar abandono
  pasos: [
    { tipo: 'refrescar_perfil' },
    { tipo: 'cola_aprobadas', items: [...] },                         // revision §2.9
    { tipo: 'busqueda', portal: 'Computrabajo', url: '…' },
    { tipo: 'busqueda', portal: 'Laborum', url: '…' },
    { tipo: 'estados', portal: 'Computrabajo', url: 'https://candidato.cl.computrabajo.com/candidate/match/' }, // revision §8.2
  ],
  pasoActual: 2,
  tabActual: 1234,
  conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 },
  estado: 'en_curso' | 'terminada' | 'interrumpida',
}
```

**Avance por eventos, no por tiempo:**

1. Paso de búsqueda: abrir **una** pestaña oculta y guardar `tabActual`.
2. El content script, al terminar **todo** su escaneo (incluidas las postulaciones), manda
   `{ type: 'ESCANEO_TERMINADO', rafagaId, conteos }`. Hoy ese mensaje no existe: hay que agregarlo
   al final de `escanear()` en los tres adaptadores.
3. Al recibirlo: sumar conteos, cerrar la pestaña, `pasoActual++`, actualizar `latido` y abrir el
   siguiente paso.
4. **Seguro de tiempo con `chrome.alarms`** (`rafaga-seguro`, 8 min por paso), no con `setTimeout`.
   Si vence: cerrar la pestaña, marcar el paso con error y seguir.
5. Al arrancar el service worker: si hay una `rafaga` en curso con `latido` de hace menos de 10 min,
   se retoma desde `pasoActual`; si es más vieja, se marca `interrumpida` y se cierran las pestañas
   que queden abiertas.

Una pestaña a la vez, en serie, igual que hoy (`objetivo-laboral.md` §8: menos carga simultánea
sobre cada portal).

### 3.3 Que no se suspenda a la mitad

```js
// Al iniciar la ráfaga
chrome.power.requestKeepAwake('system');   // evita la suspensión por inactividad; la pantalla sí se apaga
// Al terminar, interrumpirse, o vencer el tope
chrome.power.releaseKeepAwake();
```

- **Permiso nuevo:** `power`.
- **Tope duro:** 25 minutos por ráfaga, con su propia alarma. Si se alcanza, se libera el bloqueo
  aunque la ráfaga siga (la persona no puede quedar con el computador sin suspender por un bug).
- **Qué hace y qué no:** evita la suspensión **por inactividad**. **No** evita que se suspenda al
  cerrar la tapa o al apretar el botón de apagado, y está bien que así sea: eso lo decide la
  persona.
- **Batería:** acotada a la duración de la ráfaga, no al día completo.

Con esto el caso real funciona: la persona abre el notebook, se va a hacer otra cosa, y la ráfaga
termina igual.

**Aceptación en Windows:** durante una ráfaga, `powercfg /requests` muestra a Chrome en `SYSTEM`; al
terminar, ya no aparece.

### 3.4 Registro en el backend

```prisma
model Rafaga {
  id           String    @id @default(uuid())
  userId       String    @map("user_id")
  disparador   String                       // inicio_chrome | despertar | chequeo | manual
  inicio       DateTime
  fin          DateTime?
  estado       String                       // terminada | interrumpida
  postuladas   Int       @default(0)
  descartadas  Int       @default(0)
  gris         Int       @default(0)
  errores      Int       @default(0)
  duracionMs   Int?      @map("duracion_ms")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, inicio])
  @@map("rafagas")
}

model User {
  // … campos actuales …
  ultimaRafagaEn          DateTime? @map("ultima_rafaga_en")
  recordatorioRafagaEn    DateTime? @map("recordatorio_rafaga_en")    // último recordatorio enviado
  recordatoriosActivos    Boolean   @default(true) @map("recordatorios_activos")
}
```

- `POST /api/extension/rafaga` con `{ id, disparador, inicio }` al empezar, y con `{ id, fin, estado,
  conteos, duracionMs }` al terminar. Actualiza `User.ultimaRafagaEn`.
- Retención: filas de `Rafaga` de más de 90 días se purgan en el mismo cron de
  `lib/purgar-avistamientos.ts`. Son datos de uso, no personales, pero no hay razón para
  acumularlos.

### 3.5 Decirle a la persona qué pasó

**No debe ser invisible**: si se puso al día mientras la persona hacía otra cosa, tiene que enterarse.

- **Ícono de la extensión:** `chrome.action.setBadgeText({ text: '7' })` con las postulaciones de la
  última ráfaga; se limpia al abrir el popup. No requiere permiso nuevo.
- **Popup:** arriba, *"Te pusimos al día hace 12 min · 7 postulaciones · 14 descartadas"*.
- **Panel, tarjeta de inicio:** *"Última puesta al día: hoy 09:14 · 7 postulaciones"*. Si hace más de
  48 h: *"Hace 2 días que no se pone al día — abre Chrome en tu computador"*. Reemplaza la tarjeta
  "Tu asistente está activo", que hoy contradice al aviso de "En pausa"
  (`revision-2026-09-16.md` §3.2).

Notificaciones del sistema (`chrome.notifications`) quedan fuera por ahora: suman un permiso y el
ícono con número alcanza.

### 3.6 Botón "Ponerme al día ahora"

**Solo Premium** (§4). En una cuenta gratis el botón no aparece.

- En el **popup** y en el **panel**. Desde el panel viaja por `bridge.js` con un evento
  `autopostula:ponerse-al-dia`, igual que `autopostula:conectar`.
- Corre una ráfaga con `disparador: 'manual'`, **sin** el umbral de §3.1.
- Muestra una duración estimada: la **mediana de las últimas 5 ráfagas** de esa persona (*"unos 8
  minutos"*). **No promete un número de ofertas**: no se sabe cuántas hay hasta escanear.
- Si no hay extensión detectada (por ejemplo, en el celular), el botón explica que esto corre en el
  computador y no hace nada más.

### 3.7 La cola del celular va primero

Lo que la persona aprobó en "Por decidir" (sobre todo desde el teléfono) se envía **en el primer paso de
la siguiente ráfaga**, antes de buscar ofertas nuevas: son decisiones ya tomadas, no dejarlas esperando.
Es la forma de arreglar `revision-2026-09-16.md` §2.9 para quien no tiene la extensión abierta en el
momento de aprobar.

**Se envía en todos los planes** (decidido por Roberto el 2026-09-19). No hace falta una ráfaga: al
aprobar en el panel con la extensión presente, al abrir Chrome y en cada chequeo, la extensión pide sus
aprobadas y las envía (`revision-2026-09-16.md` §2.9). Cada una es una oferta que la persona aprobó a
mano, así que la línea entre planes sigue siendo quién **busca**, no quién ejecuta lo ya decidido; y cuenta
dentro de las 20 del mes, no de la prueba de §4.1. Se descartó el botón "Abrir y postular" para el plan
gratis: le pedía un clic más por oferta a quien ya había dicho que sí, sin proteger nada que no proteja ya
el tope mensual. Nunca debe quedar un "Sí" aprobado sin decir cuándo se envía: eso lo dice el panel
("Por decidir").

### 3.8 Recordatorio por correo

Cron diario `GET /api/cron/recordatorio-rafaga` (Vercel Hobby permite crons diarios, con precisión
de ±59 minutos: alcanza). Protegido con `CRON_SECRET`, igual que el de purgado.

Se manda **un** correo si se cumplen todas:

- `busquedaAutomaticaActiva` y el plan la permite
- `extensionConectada` y `emailVerificado`
- `ultimaRafagaEn` de hace **48 h o más** (o nunca, con la extensión conectada hace más de 48 h)
- `recordatorioRafagaEn` de hace **72 h o más**, o nulo
- `recordatoriosActivos`

**Contenido honesto**, sin inventar cifras:

```
Asunto: AutoPostula no se pone al día hace 2 días

Abre Chrome en tu computador unos minutos y se pone al día solo.
[Si hay aprobadas pendientes:] Tienes 3 ofertas que aprobaste esperando para enviarse.

Dejar de recibir estos avisos
```

- **No decir "hay N ofertas nuevas que calzan contigo"** hasta que exista el puntaje del lado del
  servidor (`celular-y-escritorio.md` §5). Hoy no se sabe.
- Enlace para darse de baja → `recordatoriosActivos = false`, sin iniciar sesión (token firmado en el
  enlace).
- Remitente: `remitente()` de `lib/correo.ts`.

---

## 4. Planes — decidido por Roberto (2026-09-17)

> **La línea entre planes es quién entra a los portales.** En el plan gratis, **la persona entra a
> mano** a Computrabajo, Laborum o Trabajando y busca; desde ahí la extensión hace todo sola:
> escanea, decide, completa los formularios y postula. En Premium, **ni siquiera hay que entrar**: las
> ráfagas abren las búsquedas solas. El plan gratis tiene además **una prueba única de 5
> postulaciones automáticas**, para que la persona vea eso funcionando antes de pagar.
>
> Lo que la persona ya aprobó con un "Sí" en "Por decidir" se envía solo en los dos planes (§3.7): la
> línea es quién **busca**, no quién ejecuta lo ya decidido.

| | Gratis | Premium |
|---|---|---|
| Escanear, completar formularios y postular **cuando la persona entra al portal** | ✅ hasta 20 al mes | ✅ hasta 80 al mes |
| Ráfagas automáticas (abrir Chrome, despertar, chequeo) | **Solo la prueba:** 5 postulaciones, una vez por cuenta | ✅ |
| Botón "Ponerme al día ahora" | — | ✅ |
| Recordatorio por correo | — | ✅ |
| Lo aprobado en "Por decidir" (celular incluido) | Se envía solo al abrir Chrome en el computador, o al aprobar si ya está abierto; cuenta dentro de las 20 | Igual, y va primero en cada ráfaga |

### 4.1 La prueba de 5 postulaciones automáticas

**Qué es.** Las primeras 5 postulaciones que envían las ráfagas en una cuenta gratis. Una sola vez
por cuenta, no por mes. **Cuentan dentro de las 20 del mes** (son postulaciones como cualquier otra).

**Cuándo arranca.** Apenas la persona activa la postulación desde el panel
(`revision-2026-09-16.md` §1.2, `postulacionHabilitada`): se corre una ráfaga de inmediato, con
`disparador: 'activacion'`. No es un botón que se pueda repetir: ocurre una vez, en el momento en
que la persona acaba de decir "sí, actúa". Esperar hasta el siguiente chequeo (hasta 60 min) mataría
justo el momento en que más interesada está. Si esa primera ráfaga no llega a las 5 (por ejemplo, no
había ofertas que calzaran), las siguientes se completan con los disparadores normales de §3.1 hasta
llegar a 5.

**Esquema:**

```prisma
model User {
  // … campos actuales …
  // Postulaciones automáticas de prueba que le quedan a una cuenta gratis.
  // Se descuenta solo con postulaciones realmente enviadas desde una ráfaga
  // (no INCOMPLETA ni NO_ENVIADA, revision-2026-09-16.md §8.3).
  pruebaAutomaticaRestantes Int @default(5) @map("prueba_automatica_restantes")
}
```

**Backend.**

- `/api/account/estado-automatico` deja de responder solo `busquedaAutomatica`:
  ```ts
  const modo =
    user.rol === "ADMIN" || plan.busquedaAutomatica ? "premium"
    : user.pruebaAutomaticaRestantes > 0            ? "prueba"
    :                                                 "manual";
  const busquedaAutomatica = modo !== "manual" && user.busquedaAutomaticaActiva && estadoPostulaciones.permitido;
  return { busquedaAutomatica, modo, pruebaRestantes: modo === "prueba" ? user.pruebaAutomaticaRestantes : null, /* … */ };
  ```
- `POST /api/applications` recibe `origen: "rafaga" | "manual"` desde la extensión. Si `origen ===
  "rafaga"`, la cuenta es gratis y la postulación quedó realmente enviada, descuenta 1 con un
  `update … decrement` **condicionado a `> 0`** (dos ráfagas en paralelo no pueden bajarlo de 0).
- `GET /api/extension/puede-postular` (revisión §1.3) suma el motivo `"prueba_terminada"`: con
  `origen: "rafaga"` en modo prueba y 0 restantes → `permitido: false`. La ráfaga se corta **en medio**
  si llega a 5, no al terminar.

**Lo que ve la persona.**

- Mientras dura: popup y panel, *"Prueba automática: 3 de 5 postulaciones"*.
- Al terminar, en el popup, la tarjeta del panel y un correo (el único que recibe una cuenta gratis
  por este tema):
  ```
  Tu prueba terminó: AutoPostula envió 5 postulaciones sin que entraras a ningún portal.
  [ver las 5]

  Con Premium sigue así, cada vez que abres tu computador.
  Con el plan gratis, entra a Computrabajo, Laborum o Trabajando y la extensión postula por ti.
  [Pasar a Premium]
  ```
- "Ver las 5" filtra el historial por esas postulaciones: la prueba se demuestra con resultados
  concretos, no con un mensaje.

**Abuso.** Crear cuentas para repetir la prueba ya está prohibido en los Términos (§8, *"Crear
múltiples cuentas para eludir los límites del plan gratuito"*), y conectar la extensión exige el
correo verificado. Son 5 postulaciones: no vale la pena más control que eso.

**Aceptación.**
1. Cuenta gratis nueva: al activar la postulación arranca una ráfaga sin hacer nada más.
2. Llegando a 5 postulaciones enviadas, la ráfaga se corta aunque queden ofertas por postular.
3. Una postulación INCOMPLETA en la ráfaga de prueba **no** descuenta.
4. Terminada la prueba, abrir Chrome, despertar el computador o esperar el chequeo **no** dispara
   ráfagas; entrar a mano a un portal sigue postulando normalmente, dentro de las 20 del mes.
5. Premium y admin no ven nada de la prueba.

---

## 5. Textos que cambian

Todo lo que hoy promete "cada dos horas" o "sola" sin condiciones:

| Dónde | Hoy | Pasa a |
|---|---|---|
| Landing, hero | *"Tú revisas y envías, o lo dejas corriendo solo."* | *"Tú revisas y envías, o deja que se ponga al día sola cada vez que abres tu computador."* |
| Landing, precios Premium | *"Busca y postula sola, según tus filtros"* | *"Se pone al día sola cada vez que abres tu computador"* |
| Landing, precios Gratis | *"Postulación asistida: la IA responde, tú envías"* | *"Entras al portal y la extensión postula por ti"* + *"Prueba: 5 postulaciones automáticas"* |
| `/dashboard/premium`, tabla | — | Fila nueva: *"Postulaciones automáticas (sin entrar al portal)"* → Gratis: *"Prueba de 5"*, Premium: ✅ |
| Términos §6.1, plan gratuito | Límites mensuales de postulaciones, portales e IA | Agregar la prueba única de 5 postulaciones automáticas y que, fuera de ella, las búsquedas las inicia la persona |
| `/dashboard/premium` | *"Búsqueda y postulación automática"* | *"Se pone al día sola al abrir tu computador"* |
| Política de privacidad §6, "Búsqueda automática" | *"…abre cada dos horas una pestaña en segundo plano…"* | Describir las ráfagas: cuándo se disparan, que abren pestañas en segundo plano una a la vez, y que **mientras dura una ráfaga evitan que el computador se suspenda por inactividad** |
| Chrome Web Store, descripción | *"…búsqueda automática cada dos horas mientras tengas Chrome abierto."* | *"…se pone al día sola cada vez que abres tu computador."* |
| Chrome Web Store, justificación `alarms` | *"Programar la búsqueda automática cada dos horas…"* | *"Revisar periódicamente si corresponde ponerse al día, y poner un tope de tiempo a cada paso."* |
| Chrome Web Store, justificación **`power`** (nueva) | — | *"Evitar que el computador se suspenda por inactividad solo mientras la extensión termina una búsqueda en curso (máximo 25 minutos). Se libera al terminar."* |

El permiso `power` obliga a publicar una versión nueva en la tienda y pasa por revisión. Conviene
mandarlo junto con los arreglos de la Fase 1, en la misma versión.

### Textos para la ficha de la Chrome Web Store

La ficha vive en el panel de la tienda, no en el repositorio: hay que pegar esto ahí, **junto con la versión
nueva de la extensión** (`manifest.json` en 2.13.0, que ya trae el permiso `power`; permisos actuales: `storage`,
`tabs`, `alarms`, `power`). Al agregar un permiso, la tienda revisa la versión otra vez.

**Descripción.** Donde hoy dice *"…búsqueda automática cada dos horas mientras tengas Chrome abierto."*, poner:

> …se pone al día sola cada vez que abres tu computador.

Si conviene un párrafo entero en vez de la frase:

> Con Premium, AutoPostula se pone al día sola cada vez que abres tu computador: abre las búsquedas en pestañas
> en segundo plano, de a una, y postula a lo que calza con tu perfil. En el plan gratuito, entras al portal y la
> extensión postula por ti; además tienes una prueba de 5 postulaciones automáticas.

**Justificación del permiso `alarms`** (reemplaza a *"Programar la búsqueda automática cada dos horas…"*):

> Revisar periódicamente si corresponde ponerse al día, y poner un tope de tiempo a cada paso.

**Justificación del permiso `power`** (nueva):

> Evitar que el computador se suspenda por inactividad solo mientras la extensión termina una búsqueda en curso
> (máximo 25 minutos). Se libera al terminar.

---

## 6. Lo que se descartó

**Postular desde la nube.** Resolvería también a quien nunca abre el computador, pero:

- Requiere guardar la sesión de los portales de cada persona en el servidor, y eso rompe la política
  de privacidad (§2.9: *"no pedimos ni almacenamos las contraseñas"*).
- Los portales bloquean servidores (Computrabajo ya respondió 403). Evitarlo exige proxies
  residenciales y navegadores que se hacen pasar por personas, algo que `rediseno-filtrado-ofertas.md`
  §13 prohíbe.
- Un bloqueo afecta a todos los usuarios a la vez.
- **Costo** por usuario Premium al mes, con precios de Browserbase de 2026-09: navegador ~12 h ×
  US$0,10–0,12 ≈ **US$1,5**; proxies residenciales ~1–2 GB × US$10–12 ≈ **US$10–25**; IA ≈ US$0,6.
  **Total ~US$12–27, contra un ingreso de ~US$4.**

**Mantener el computador despierto todo el día** (`requestKeepAwake` permanente): gasta batería,
no evita la suspensión al cerrar la tapa, y es exactamente la carga que este diseño quiere sacarle a
la persona.

**Despertar el computador a una hora programada** (tareas programadas del sistema operativo):
requiere una aplicación nativa instalada aparte, con permisos del sistema. Demasiado invasivo para lo
que resuelve.

**Lo que este diseño no resuelve:** la persona que nunca abre el computador. Esa se atiende desde el
celular, con *"estas ofertas calzan contigo"* y postulación a mano (`celular-y-escritorio.md` §5).

---

## 7. Orden

| # | Tarea | § | Nota |
|---|---|---|---|
| ~~**1**~~ | ~~La alarma deja de reiniciarse~~ | 2.1 | ✅ Hecho |
| ~~**2**~~ | ~~Ráfaga como máquina de estados + `ESCANEO_TERMINADO` en los 3 adaptadores~~ | 2.2, 3.2 | ✅ Hecho |
| ~~3~~ | ~~Disparadores (`onStartup`, despertar, chequeo 60 min) + umbral~~ | 3.1 | ✅ Hecho — el botón manual queda para el 7 |
| ~~4~~ | ~~`requestKeepAwake` durante la ráfaga + tope de 25 min~~ | 3.3 | ✅ Hecho — permiso `power` puesto en el manifest → **nueva versión en la tienda** |
| ~~5~~ | ~~`Rafaga` + `ultimaRafagaEn` + endpoint~~ | 3.4 | ✅ Hecho — ver el bloque de abajo con lo que difiere del esquema de §3.4 |
| ~~6~~ | ~~Número en el ícono, popup y tarjeta del panel~~ | 3.5 | ✅ Hecho — el ícono cuenta las postulaciones de la última ráfaga (en gris, lo que *habría* postulado, si está en solo observar) y una ráfaga sin novedades lo limpia; el popup lo limpia al abrir |
| ~~7~~ | ~~Botón "Ponerme al día ahora"~~ | 3.6 | ✅ Hecho, solo Premium — ver "Lo que el paso 7 hizo distinto de §3.6" arriba |
| ~~7b~~ | ~~Prueba de 5 postulaciones automáticas~~ | 4.1 | ✅ Hecho — ver "Lo que el paso 7b hizo distinto de §4.1" arriba |
| ~~8~~ | ~~Cola del celular primero~~ | 3.7 | ✅ Hecho, y se envía en todos los planes — ver "Lo que el paso 8 hizo distinto de §3.7" arriba |
| ~~9~~ | ~~Recordatorio por correo~~ | 3.8 | ✅ Hecho — ver "Lo que el paso 9 hizo distinto de §3.8" arriba |
| ~~10~~ | ~~Textos: landing, Premium, privacidad, ficha de la tienda~~ | 5 | ✅ Hecho en la web; los textos de la ficha están listos para pegar (§5) — ver "Lo que el paso 10 hizo distinto de §5" arriba |

---

## 8. Criterios de aceptación

1. **Tapa cerrada 8 horas, se abre:** en menos de 1 minuto desde que Chrome está disponible empieza
   una ráfaga, termina sola, y el ícono, el popup y el panel muestran el resultado.
2. **La persona se va a la mitad** sin tocar nada: el computador no se suspende por inactividad hasta
   que la ráfaga termina. Al terminar, `powercfg /requests` ya no muestra a Chrome.
3. **Tope:** una ráfaga que se cuelga libera el bloqueo de suspensión a los 25 minutos.
4. **Abrir y cerrar la tapa 5 veces en una hora** produce **una** ráfaga, no cinco.
5. **Chrome cerrado y vuelto a abrir** después de 3 horas → ráfaga.
6. **Service worker detenido a la mitad** (desde `chrome://serviceworker-internals`): la ráfaga se
   retoma o se marca interrumpida, y **no quedan pestañas huérfanas**.
7. **Navegando portales 3 horas seguidas**, la alarma de chequeo se dispara igual (§2.1).
8. **Los tres portales** se recorren en una ráfaga; hoy, con los `setTimeout`, eso no está garantizado.
9. **Sin ráfagas por 48 h** → llega un correo; no llega otro antes de 72 h; darse de baja lo detiene.
10. **Ningún texto** de la landing, el panel, la política de privacidad ni la ficha de la tienda
    sigue diciendo "cada dos horas".
11. **Plan gratis:** se cumplen los 5 criterios de la prueba (§4.1), y fuera de la prueba no existe
    el botón "Ponerme al día ahora" ni corre ninguna ráfaga.
