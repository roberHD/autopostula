# El panel de revisión en el portal, y probarla apenas se conecta

> **Estado:** propuesta, 2026-10-08. Sale de dos ideas de Roberto: probar la extensión apenas queda
> conectada, en el onboarding, y que el panel del escaneo liste todas las ofertas para que la
> persona corrija lo que el motor decidió. **Implementado el mismo día (§8, extensión 2.18.0)**,
> salvo el banco de casos con el tercer grupo.
> **Para:** el chat de producción.
> **Relacionado:** `primera-busqueda-guiada.md` §10 y §11 (ya implementados en la 2.17),
> `revision-scorer-2026-09-30.md` §6 (el banco de casos), `rediseno-filtrado-ofertas.md` §8.2.

---

## 0. Lo esencial

1. **El panel convierte la extensión de algo que decide en algo que propone.** Hoy marca cada
   oferta y cierra preguntando si empieza a postular. Lo que falta es que la persona pueda decir
   *"esta también, y esta no"* antes de que salga nada.
2. **Cada corrección es la etiqueta más cara del sistema.** Un "sí" sobre algo que el motor iba a
   descartar vale más que diez decisiones de la banda gris, porque es justo el dato que hoy **no
   existe**: el banco de casos solo ve lo dudoso, nunca lo que el scorer resolvió solo (§6 de la
   revisión del scorer lo dejó anotado como sesgo). Esto lo cierra.
3. **Probarla apenas se conecta** es correcto, pero sin romper lo que ya funciona: la tarjeta
   "Probemos" de Hoy se queda, y el onboarding solo ofrece el atajo **cuando la extensión ya
   respondió** que está conectada (§1).

---

## 1. Probarla apenas queda conectada

Hoy el cierre del onboarding no abre el portal a propósito (`primera-busqueda-guiada.md` §10): la
tarjeta "Probemos" en Hoy hace el paso a paso, y así sobrevive a que la persona cierre todo y
vuelva mañana. Eso está bien y se queda.

Lo que falta es el caso bueno: **la persona acaba de conectar la extensión y está con el impulso**.
Ahí mandarla al panel a buscar una tarjeta es perder el mejor momento que vas a tener.

### Cómo queda

En el paso de la extensión, cuando el puente confirma que quedó conectada, el botón de
«Continuar» cambia por dos:

> **✓ Listo, AutoPostula ya está conectada.**
> **[ Probémosla ahora ]**  ·  *Seguir y probar después*

- **Probémosla ahora** abre una pestaña en el portal que la persona conectó, con la búsqueda ya
  armada igual que la arma la extensión, y marca la cuenta para que esa primera visita entre en
  modo mirar.
- **Seguir y probar después** termina el onboarding como hoy, y en Hoy la espera la tarjeta
  "Probemos" sin cambios.

### Las dos condiciones

1. **Solo se ofrece si la extensión respondió.** Si no hay confirmación del puente, no aparece el
   botón: prometer "probémosla" y caer en un portal donde no pasa nada es peor que no ofrecer.
2. **Solo se ofrece si hay un portal conectado.** Si no, el botón lleva al paso del portal, no al
   portal.

---

## 2. El panel de revisión

### 2.1 Qué es

La extensión ya recorre el listado completo y puntúa cada oferta. Hoy eso termina en marcas sobre
las tarjetas y una tarjeta de cierre con el resumen. **El panel es ese resumen, abierto**: la lista
entera, agrupada por lo que el motor decidió, con una casilla por oferta.

```
┌─────────────────────────────────────────────────────────────┐
│  Revisé 20 ofertas de esta página                      [×]  │
│                                                             │
│  ✓ VOY A POSTULAR (3)                                       │
│    ☑ Vendedor de tienda — Falabella, Ñuñoa                  │
│         Es de ventas, lo que buscas                         │
│    ☑ Asesor comercial — Ripley, Providencia                 │
│    ☑ Vendedor part time — Sodimac, La Reina                 │
│                                                             │
│  ? PARA QUE DECIDAS (6)                                     │
│    ☐ Cajero de supermercado — Líder, Ñuñoa                  │
│         Es de ventas, pero no dice la jornada               │
│    ☐ Promotor de temporada — Agencia, Santiago              │
│         No pude leer en qué comuna queda                    │
│    …                                                        │
│                                                             │
│  ✗ NO CALZA (11)                            [ ver todas ]   │
│    ☐ Conductor clase A-2 — Transportes, Maipú               │
│         Pide una licencia que no está en tu CV              │
│    …                                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Vas a postular a 3 ofertas.        [ Postular a las 3 ]    │
└─────────────────────────────────────────────────────────────┘
```

- Se abre desde la tarjeta de cierre que ya existe («Ver las 20») y desde el ícono de la extensión
  mientras hay un escaneo reciente en esa pestaña.
- **Lo de "voy a postular" viene marcado; lo demás no.** Marcar o desmarcar es la corrección.
- El contador del botón cambia en vivo: *"Postular a las 5"*.
- **"No calza" viene colapsado** y se despliega con "ver todas". Son las que menos se van a
  revisar y las que más espacio ocupan; esconderlas no las oculta, las ordena.
- Cada línea muestra la razón en las mismas palabras del panel (`lib/formatear-razon.ts`). Nada de
  puntajes ni de "banda gris".

### 2.2 Qué pasa al apretar

1. Las marcadas se postulan en orden, con el mismo flujo de siempre: abre el aviso, responde, envía
   y registra. **El modo mirar se apaga solo** para esa tanda.
2. Las que la persona **desmarcó** de "voy a postular" no se envían, y eso se registra: es una
   corrección tan valiosa como el "sí".
3. Si cierra el panel sin apretar nada, no se envía nada y no se aprende nada. Cerrar no es decidir.

### 2.3 El cupo

Antes de enviar, el panel compara lo marcado con lo que queda del mes:

> *Marcaste 12 y te quedan 8 postulaciones este mes. Puedo enviar 8 ahora y dejar las otras 4 para
> cuando se renueven, o eliges cuáles sacar.*

Nunca se envía de más ni se cortan a la mitad en silencio. Es el mismo principio de revisar el
límite **antes** de enviar (`revision-2026-09-16.md` §0).

---

## 3. Qué aprende, y cómo

Esta es la parte que hace que valga la pena construirlo.

### 3.1 Las cuatro cosas que se registran

| Lo que hizo la persona | Qué significa | Cuánto vale |
|---|---|---|
| Marcó una que estaba en **"no calza"** | El motor se equivocó descartando | **Lo más valioso.** Es el dato que hoy no existe |
| Marcó una que estaba en **"para que decidas"** | Lo mismo que ya hace "Por decidir", pero en el momento | Alto |
| **Desmarcó** una de "voy a postular" | El motor se equivocó postulando | **Lo más caro de no saber**: es el error que gasta cupo |
| Dejó todo como venía | El motor acertó, o no revisó | Bajo, pero cuenta |

Cada una se guarda con **el puntaje y las razones que tenía en ese momento**, igual que
`DecisionOferta.scoreLocal`. Sin eso no se puede comparar después, y la corrección se vuelve una
anécdota.

### 3.2 Dónde entra

En el banco de casos que ya existe (`lib/banco-de-casos.ts`). Hoy mira solo la banda gris; con esto
pasa a ver los tres grupos, y recién ahí puede responder la pregunta que importa: **¿cuántas de las
que descartó solo habrían servido?**

Y alimenta la calibración de umbral (`lib/calibracion-umbral.ts`) con la señal correcta: si la
persona rescata seguido ofertas de "no calza", su umbral está alto para ella.

### 3.3 La trampa de marcar todo

Si alguien marca las 20 de una, eso **no** significa "este señor acepta cualquier cosa": significa
que apretó un botón. Dos reglas:

- Si se marcan **más del 80%** de las ofertas de una tanda, las correcciones de esa tanda entran
  con peso reducido al aprendizaje. Se postulan igual: es su decisión.
- No existe "marcar todas" como botón. Si quiere todo, que marque. La fricción acá es la que
  distingue una decisión de un impulso.

### 3.4 Lo que no se hace con esto

**No recompilar el perfil con IA en caliente** cada vez que alguien corrige. Las correcciones se
acumulan y entran en la próxima compilación, como ya hacen las decisiones de "Por decidir"
(`compilar-perfil.ts` las recibe como contexto). Principio 1: lo caro corre una vez.

---

## 4. Los casos feos

| Caso | Qué hace el panel |
|---|---|
| El escaneo no terminó | Muestra lo que lleva y dice "sigo revisando", sin botón hasta terminar |
| La página tiene 60 ofertas | Muestra las 20 primeras de cada grupo y "ver más". Un panel de 60 casillas no lo lee nadie |
| La persona se cambió de página | El panel se cierra: las ofertas que lista ya no son las que está mirando |
| Marcó una que ya postuló antes | Sale deshabilitada, con "ya postulaste a esta el 3 de octubre" |
| Se acabó el cupo y no quedan extra | El botón lleva a comprar, sin enviar nada a medias |
| Está en modo mirar porque es la primera búsqueda | Igual puede marcar y postular: eso **es** el "Empezar a postular" |

---

## 5. Orden

| # | Tarea | § | Esfuerzo |
|---|---|---|---|
| **1** | El atajo del onboarding al conectar la extensión | §1 | Chico |
| **2** | El panel: lista agrupada, casillas y contador | §2.1 | Medio |
| **3** | Postular lo marcado, con el aviso del cupo | §2.2, §2.3 | Medio |
| **4** | Registrar las correcciones con su puntaje y razones | §3.1 | Chico, y es el que da sentido a todo |
| 5 | Sumar los tres grupos al banco de casos | §3.2 | Medio |
| 6 | El peso reducido cuando se marca casi todo | §3.3 | Chico |

El 4 **no se puede dejar para después**: si el panel sale sin registrar las correcciones, se pierde
el dato de las primeras semanas, que es justo cuando más se corrige.

---

## 6. Criterios de aceptación

1. Desde el portal se puede abrir la lista completa de lo escaneado, agrupada en tres.
2. Marcar una de "no calza" y apretar postular **la postula**, y queda registrada como corrección.
3. Nunca se envía más de lo que permite el cupo del mes.
4. Ninguna línea del panel muestra puntajes, "banda" ni "scorer".
5. El banco de casos puede responder cuántas de las descartadas fueron rescatadas a mano.
6. Cerrar el panel sin apretar no envía nada ni registra nada.

---

## 7. Lo que no se hace

- **Un botón de "marcar todas"** (§3.3).
- **Recompilar el perfil en caliente** con cada corrección (§3.4).
- **Mostrar las 60 ofertas de una** (§4).
- **Postular desde el panel sin confirmación**: el botón dice a cuántas y la persona lo aprieta.

---

## 8. Lo que se hizo (2026-10-08, extensión 2.18.0)

> **Estado:** implementado en `rama-roberto`, sin desplegar. Las tareas 1 a 4 de §5, y la regla del
> 80% de la 6. Falta la 5 (§8.4).

### 8.1 Cómo quedó

**El panel** (`extension/core.js`, `AP.abrirPanel`). Se abre desde la tarjeta del final («Ver las 20 y
elegir») y desde el ícono: si la pestaña que se está mirando es un listado ya revisado, el popup
ofrece «Revisar las 20 ofertas de esta página». Va a la derecha, en el lugar de la tarjeta y del
aviso, y el listado sigue a la vista.

- Tres grupos con las palabras de las marcas de cada oferta: **Te sirven**, **Para que decidas** y
  **No calzan** (plegado, con «Ver las 15»). De a 20 por grupo, con «Ver 7 más».
- Cada fila: título, empresa · comuna (como la muestra la tarjeta) y la razón con las palabras del
  panel (`AP.razonComoEnElPanel`). Nada de puntajes ni de «banda».
- Lo de «te sirve» viene marcado; lo demás no. Sin casilla: las repetidas (ya postulaste a ese cargo)
  y las que no tienen enlace.
- El pie cuenta en vivo («Vas a postular a 3 ofertas.» / «Postular a las 3»). No hay «marcar todas».
- Cerrar sin apretar no envía ni registra nada (criterio 6).

**Lo que pasa al apretar** (§2.2). Lo marcado va a `background.js` (`POSTULAR_ELEGIDAS`):

1. Si la cuenta solo miraba, apretar **es** «Empezar a postular»: se activa con las mismas reglas que
   el panel web, y la primera se muestra antes de enviarla (como en
   `primera-busqueda-guiada.md` §11). Si la cuenta no cumple, el panel dice el motivo y no se
   registra ni se envía nada.
2. Las decisiones se guardan en el servidor (`/api/extension/revision`).
3. Lo marcado entra a **la misma cola que las aprobadas de «Por decidir»**: revisa el cupo antes de
   cada una, la abre en otra pestaña y enlaza la postulación con su decisión. El listado y el panel
   se quedan donde están, y cada fila muestra cómo va: «En cola», «Enviando…», «Enviada», «No se
   pudo»… Las que fallan por otra cosa se reintentan solas más tarde, como cualquier aprobada.

**El cupo** (§2.3). El panel pregunta antes cuántas quedan: «Marcaste 12 y te quedan 8
postulaciones este mes. Saca 4, o envío las primeras 8». Las primeras son las de arriba del panel,
y es también el orden en que se envían. Las que no alcanzan no se registran. Sin cupo, el botón lleva
a conseguir más; sin el portal conectado, a conectarlo; sin sesión en el portal, a iniciarla.

**Lo que se registra** (§3.1), cada una con el puntaje, las razones y lo que evaluó el scorer:

| Lo que hizo la persona | Dónde queda |
|---|---|
| Dejó marcada una de «te sirve» | Un «sí» con `fuente: PANEL_REVISION` y `bandaMotor: postular`. Se envía, pero no corrige nada |
| **Desmarcó** una de «te sirve» | Un «no» con `fuente: PANEL_REVISION` y `bandaMotor: postular`: el error que gasta cupo |
| Marcó una de «para que decidas» | Su fila de «Por decidir» (la dejó ahí el mismo escaneo) pasa a «sí» |
| Marcó una de «no calza» | Como «No era así»: el descarte queda corregido y hay un «sí» del panel. El banco de casos ya cuenta los descartes corregidos, así que responde el criterio 5 |
| No tocó una dudosa o descartada | Nada: sigue en «Por decidir» o en los descartes, como estaba |

**Que lo débil no contamine** (§3.3 y §3.4). `lib/panel-revision.ts`, `cuentaParaAprender`: a la
compilación del perfil entran las correcciones; no entran las de «te sirve» que quedaron marcadas
(no corrigen nada) ni nada de una tanda en que se marcó más del 80% (con 5 ofertas o más). Esas
tampoco mueven el umbral. Se postulan igual: es su decisión.

**Lo que recuerda la pestaña.** Si la página se vuelve a revisar (al recargar o al volver al listado),
la extensión no postula sola lo que la persona quitó en el panel, ni repite lo que va por la cola
(`AP.decididaEnPanel`).

**Probarla apenas se conecta** (§1). En «¡Todo listo!», si la extensión respondió en esa página,
está conectada y hay portal y búsqueda: **«Probémosla ahora»** abre el portal en otra pestaña, con
la búsqueda armada igual que la tarjeta «Probemos» (`/api/onboarding/primera-busqueda`), y el
onboarding sigue a Hoy. **«Seguir y probar después»** hace lo de siempre.

### 8.2 Lo que cambió respecto de la propuesta

1. **«Antes de que salga nada» vale cuando la cuenta mira.** Con la cuenta postulando, el escaneo
   envía las de «te sirve» apenas se abre la página: en el panel salen como enviadas, sin casilla, y
   se puede sumar lo demás. Que deje de enviar sola cuando la persona está en la pestaña es una
   decisión de producto; si se toma, conviene amarrarla a «Revisar antes de enviar» y no hacerla la
   regla, porque cambia la promesa del plan gratis («entras y postula por ti»).
2. **Se postula por la cola de aprobadas, no en la misma página.** En Laborum, postular en la página
   obliga a salir del listado (y del panel) por cada aviso; la cola ya revisa el cupo, enlaza cada
   postulación con su decisión y está probada en los tres portales.
3. **Sin «dejar las otras 4 para cuando se renueven».** Una aprobada se reintenta 14 días, así que la
   promesa podía fallar si el mes se renovaba después. Queda «saca 4, o envío las primeras 8».
4. **«Probémosla ahora» está en el cierre y no en el paso de la extensión**: el portal se conecta en
   el paso siguiente, así que ahí la condición 2 de §1 no se cumplía nunca. Tampoco hace falta
   «marcar la cuenta»: una cuenta nueva mira hasta que activa.

### 8.3 Cómo se verificó

- **En los tres portales reales**, con el código nuevo corriendo en un marco del propio portal (donde
  la extensión instalada no actúa), la cuenta en «solo mirar» y el envío contestado por la prueba
  (nada llegó a la cola de verdad, y ningún clic de envío se intentó):

| Portal | Ofertas | Lo que se probó |
|---|---|---|
| Computrabajo | 20: 1 te sirve, 4 dudosas, 15 no calzan | El panel desde la tarjeta, marcar y desmarcar, «Ver las 15», el envío (20 ofertas, cada una con banda, puntaje, razones y enlace) en el orden del panel y el avance fila por fila. Al recargar, las 3 decididas no se volvieron a revisar |
| Laborum | 20: 13 dudosas, 7 no calzan | Lo mismo, sin salir del listado; el cierre «Postulaste a 2 de 3» |
| Trabajando | 15: 6 te sirven, 9 no calzan | Una desmarcada queda como «no»; la repetida de la misma búsqueda va sin casilla; «Se acabaron las postulaciones del mes» |

- **El servidor**, contra una base local aparte con las migraciones aplicadas (`prisma migrate
  diff` vacío): cada acción deja lo de la tabla de §8.1, un reintento no duplica nada ni cambia los
  ids, la tanda de 6 de 6 queda con peso reducido y fuera de la compilación.
- **Pruebas:** `extension/verificar-panel-revision.js` (nueva, 94), el bloque 21 de
  `verificar-rafagas.js` (la cola: activar, registrar, revisar la primera, el avance, sin cupo),
  `backend/scripts/verificar-panel-revision.ts` (nueva, 28). Pasan las 13 de la extensión y los
  scripts del servidor; `tsc` limpio.
- **No se probó en el navegador** el cierre del onboarding: el otro chat tenía su servidor corriendo
  en la misma carpeta. Se revisó el código y compila.

### 8.4 Lo que queda

1. **Mergear el PR antes de subir la 2.18.0**: trae dos migraciones (un valor nuevo para la fuente de
   las decisiones y dos columnas) y dos rutas. Con el servidor viejo, el panel se ve, pero al apretar
   no puede registrar ni enviar nada.
2. **La tarea 5: el banco de casos con el tercer grupo.** Las verdades sobre «te sirve» (confirmadas
   y quitadas) ya se guardan, pero `scripts/banco-de-casos.ts` todavía no las muestra; con ellas, la
   calibración podría también **subir** el corte, que hoy solo puede bajar.
3. **Un «no» del panel vale en esa pestaña.** Si la misma oferta aparece otro día en otra búsqueda, el
   escaneo la vuelve a evaluar sin acordarse; habría que decidir si un «no» del panel la saca para
   siempre.
4. La decisión de §8.2, punto 1.
