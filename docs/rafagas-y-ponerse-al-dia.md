# Ráfagas: que se ponga al día cada vez que abres el computador — especificación

> **Estado:** diseño aprobado, sin implementar.
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

- En el **popup** y en el **panel**. Desde el panel viaja por `bridge.js` con un evento
  `autopostula:ponerse-al-dia`, igual que `autopostula:conectar`.
- Corre una ráfaga con `disparador: 'manual'`, **sin** el umbral de §3.1.
- Muestra una duración estimada: la **mediana de las últimas 5 ráfagas** de esa persona (*"unos 8
  minutos"*). **No promete un número de ofertas**: no se sabe cuántas hay hasta escanear.
- Si no hay extensión detectada (por ejemplo, en el celular), el botón explica que esto corre en el
  computador y no hace nada más.

### 3.7 La cola del celular va primero

Lo que la persona aprobó en "Por decidir" desde el teléfono se ejecuta **en el primer paso de la
siguiente ráfaga**, antes de buscar ofertas nuevas: son decisiones ya tomadas, no dejarlas esperando.
Es la forma de arreglar `revision-2026-09-16.md` §2.9 para quien no tiene la extensión abierta en el
momento de aprobar.

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

## 4. Planes — decisión abierta de Roberto

| | Gratis | Premium |
|---|---|---|
| Ráfagas automáticas (abrir Chrome, despertar, chequeo) | — | ✅ |
| Recordatorio por correo | — | ✅ |
| Botón "Ponerme al día ahora" | **¿?** | ✅ |
| Cola del celular en la siguiente ráfaga | **¿?** | ✅ |

**Recomendación:** dar el botón manual también al plan gratis, dentro de sus 20 postulaciones al mes.
Es la mejor demostración del producto, no agrega costo de IA (el límite ya existe) y el automático
sigue siendo la razón para pagar. La cola del celular también: sin ella el "Sí" del plan gratis
nunca se envía (§2.9 de la revisión).

---

## 5. Textos que cambian

Todo lo que hoy promete "cada dos horas" o "sola" sin condiciones:

| Dónde | Hoy | Pasa a |
|---|---|---|
| Landing, hero | *"Tú revisas y envías, o lo dejas corriendo solo."* | *"Tú revisas y envías, o deja que se ponga al día sola cada vez que abres tu computador."* |
| Landing, precios Premium | *"Busca y postula sola, según tus filtros"* | *"Se pone al día sola cada vez que abres tu computador"* |
| `/dashboard/premium` | *"Búsqueda y postulación automática"* | *"Se pone al día sola al abrir tu computador"* |
| Política de privacidad §6, "Búsqueda automática" | *"…abre cada dos horas una pestaña en segundo plano…"* | Describir las ráfagas: cuándo se disparan, que abren pestañas en segundo plano una a la vez, y que **mientras dura una ráfaga evitan que el computador se suspenda por inactividad** |
| Chrome Web Store, descripción | *"…búsqueda automática cada dos horas mientras tengas Chrome abierto."* | *"…se pone al día sola cada vez que abres tu computador."* |
| Chrome Web Store, justificación `alarms` | *"Programar la búsqueda automática cada dos horas…"* | *"Revisar periódicamente si corresponde ponerse al día, y poner un tope de tiempo a cada paso."* |
| Chrome Web Store, justificación **`power`** (nueva) | — | *"Evitar que el computador se suspenda por inactividad solo mientras la extensión termina una búsqueda en curso (máximo 25 minutos). Se libera al terminar."* |

El permiso `power` obliga a publicar una versión nueva en la tienda y pasa por revisión. Conviene
mandarlo junto con los arreglos de la Fase 1, en la misma versión.

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
| **1** | La alarma deja de reiniciarse | 2.1 | Bug latente; chico |
| **2** | Ráfaga como máquina de estados + `ESCANEO_TERMINADO` en los 3 adaptadores | 2.2, 3.2 | La base de todo lo demás |
| 3 | Disparadores (`onStartup`, despertar, chequeo 60 min) + umbral | 3.1 | |
| 4 | `requestKeepAwake` durante la ráfaga + tope de 25 min | 3.3 | Permiso `power` → nueva versión en la tienda |
| 5 | `Rafaga` + `ultimaRafagaEn` + endpoint | 3.4 | |
| 6 | Número en el ícono, popup y tarjeta del panel | 3.5 | |
| 7 | Botón "Ponerme al día ahora" | 3.6 | |
| 8 | Cola del celular primero | 3.7 | Depende de `revision-2026-09-16.md` §2.9 |
| 9 | Recordatorio por correo | 3.8 | |
| 10 | Textos: landing, Premium, privacidad, ficha de la tienda | 5 | En el mismo deploy que el 4 |

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
