# La primera búsqueda, guiada — y el video de 60 segundos

> **Estado:** propuesta, 2026-09-29. Nace de una pregunta de Roberto: *"¿qué tan bueno sería hacer
> una parte de la extensión como tutorial?"*. **El 2026-10-01 se hizo la parte del panel (§10)**,
> el 2026-10-02 la del portal (§11, extensión 2.17.0) y el 2026-10-04 las tres frases del popup
> (§12, extensión 2.17.1). **El 2026-10-08 Roberto pidió igual unos pasos en el portal, y se hizo
> el recorrido de la primera vez (§13, extensión 2.19.0)**: reemplaza lo que decían §2 y §9.
> **Para:** el chat de producción.
> **Relacionado:** `estrategia-y-rediseno.md` §5.2 ("En el portal · primera búsqueda", tarea 9 del
> orden) y §5.3 (el popup semáforo), `modo-solo-observar.md` (el modo ya está construido),
> `celular-y-escritorio.md` (el 98,9% del tráfico llega por teléfono).

---

## 0. Lo esencial

1. **Un tutorial no es la respuesta, pero la pregunta es la correcta.** El problema de alguien que
   recién instaló no es dónde apretar: es **no saber qué va a pasar en su nombre**. Eso no se
   arregla explicando botones.
2. **La respuesta es que la primera búsqueda sea real y no envíe nada.** La extensión etiqueta las
   ofertas del portal que la persona está mirando, dice qué haría con cada una, y espera. El modo
   que lo permite —`soloObservar`— **ya está construido y verificado** (`modo-solo-observar.md`).
3. **Hay tres cosas que sí hay que decir con palabras**, y ninguna es un tutorial: que tienes que
   tener sesión iniciada en el portal, que funciona con Chrome abierto, y que en el plan gratis
   entras tú. Van en el popup, cuando corresponden.
4. **Lo más barato que más rinde es un video de 60 segundos** en la ficha de la tienda y en la
   landing (§5). Horas de trabajo, y es lo único de todo esto que alcanza a la persona **antes** de
   que llegue a un computador.

---

## 1. Qué pasa hoy cuando alguien instala

La extensión arranca en modo prueba (`revision-2026-09-16.md` §1.2) y la persona ve, en la esquina
de la página del portal, una línea del overlay (`#ap-ov` en `extension/core.js`) con el resumen del
escaneo: *"2 postuladas · 6 por decidir · 12 descartadas"*.

Esa línea es correcta y no alcanza. La persona acaba de instalar algo que va a escribir y enviar en
su nombre, y lo primero que ve es un conteo flotante que:

- no dice **cuál** de las ofertas que está mirando es cuál;
- no dice **qué va a hacer ahora**;
- no ofrece ninguna forma de decir "espérate".

El resultado previsible es una de dos: la cierra por susto, o la deja andar sin entender y se
sorprende después. Las dos son pérdida.

---

## 2. Por qué no un tutorial

> **Cambió el 2026-10-08 (§13):** hay un recorrido de cuatro pasos, pero hecho para esquivar estas
> cuatro razones: sale encima de la búsqueda real, cada paso cuando pasa lo que explica, y se apoya
> solo en lo que pinta la extensión.

- **Se salta.** Un recorrido de pantallas con "siguiente / entendido" se cierra por reflejo, y el
  que no lo cierra lo olvida antes de necesitarlo.
- **Se rompe.** Un tour anclado a elementos de la interfaz se cae con cada rediseño, y acá hay uno
  en curso (`estrategia-y-rediseno.md` §5).
- **Explica lo que no preocupa.** Nadie duda de dónde está el botón: duda de si postular por él
  va a salir bien.
- **Es caro para lo que rinde.** Es de las piezas de UI que más trabajo dan y menos se usan.

La excepción son los **hechos que no se pueden deducir mirando** (§4). Esos sí hay que decirlos, y
son tres líneas, no un tour.

---

## 3. La primera búsqueda, momento por momento

### 3.1 Cómo llega

Al terminar el onboarding, el último paso ya no dice "listo". Dice: **"Vamos a mirar ofertas de
verdad, sin enviar nada"**, con un botón que abre Computrabajo con la búsqueda armada del perfil.

La cuenta ya está en modo prueba; acá se le agrega la condición de que **la primera búsqueda nunca
envía**, aunque la persona tenga plan de pago.

> **Cambió el 2026-10-01 (§10):** el último paso del onboarding lleva a la tarjeta «Probemos» de
> Hoy, y el botón que abre el portal está ahí, con la búsqueda armada igual que la arma la
> extensión (comuna o región y jornada). Desde el onboarding se abría sin esos filtros, y después
> no había cómo saber qué había pasado.

### 3.2 En el listado: etiquetas sobre las ofertas reales

Hoy el overlay cuenta; acá **cada tarjeta del listado lleva su propia marca**, del mismo color que
usa el panel para esa banda:

| Marca | Qué dice al costado |
|---|---|
| **Te sirve** | "Es de ventas, lo que buscas · en Ñuñoa" |
| **Para que decidas** | "Es de ventas, pero no dice la jornada" |
| **No calza** | "Pide licencia A-2" · "Es en Antofagasta" |

Las razones son las que el scorer ya emite (`AP.puntuarOferta` devuelve `razones` estructuradas) y
las traduce `backend/lib/formatear-razon.ts`. **No se escribe texto nuevo para esto**: es el mismo
vocabulario del panel, puesto donde la persona está mirando. Ver el principio 5 del índice: toda
decisión trae su razón, y la razón se muestra donde la persona está.

Detalle de implementación: los adaptadores ya recorren las tarjetas del listado (por ejemplo
`extension/adapters/computrabajo.js`), así que la marca se inserta en ese mismo recorrido. Va en un
shadow root propio, como el overlay, para que el CSS del portal no la deforme.

### 3.3 El panel: "esto es lo que haría"

Cuando termina de recorrer la página, el overlay deja de ser una línea y pasa a ser una tarjeta con
tres frases y dos botones:

> **De las 20 ofertas de esta página:**
> postularía a **3**, te dejaría **6** para que decidas, y descartaría **11**.
> *La razón más repetida para descartar: es en otra comuna.*
>
> **[ Empezar a postular ]** **[ Todavía no, quiero mirar ]**

- **Empezar a postular** apaga el modo observar y la deja andar. Es el único lugar del producto
  donde la persona *da* permiso, mirando el resultado concreto.
- **Todavía no** la deja en observar, y el popup queda diciendo "mirando, sin enviar" hasta que
  ella cambie de idea.

Nada se envía hasta ese clic. Eso es lo que el tutorial intentaba explicar, y acá se demuestra.

### 3.4 Que se pueda volver atrás

El modo observar deja de ser un interruptor escondido en el popup y pasa a ser un estado con
nombre, el mismo que ya unificó `backend/lib/estado-extension.ts`: **"observando"** vs
**"postulando"**. La primera búsqueda entra en "observando" y sale de ahí solo por el botón.

### 3.5 Los casos feos

| Caso | Qué hace |
|---|---|
| No hay sesión iniciada en el portal | Lo dice antes de escanear, con el botón para iniciar sesión. Es el primero de los tres hechos de §4 |
| La búsqueda no devuelve nada | "Tu búsqueda no trajo ofertas nuevas hoy" + enlace a "Qué buscas". No es un error |
| Todo lo de la página se descarta | Se muestra igual, con la razón más repetida: es el aviso de que el perfil quedó muy estrecho, y es lo que la amplitud (`amplitud-de-busqueda.md` §4) viene a resolver |
| La persona cierra la pestaña a medias | No pasa nada: no se envió nada, y la primera búsqueda vuelve a ofrecerse |

---

## 4. Las tres cosas que sí hay que decir

No se pueden deducir mirando, y sin ellas el producto **parece roto**:

1. **"Necesitas tener tu sesión iniciada en el portal."** Aparece cuando se detecta que no la hay,
   no antes.
2. **"Trabaja mientras Chrome está abierto, y se pone al día sola cuando lo abres."** Aparece la
   primera vez que hay una ráfaga pendiente por reanudar (`rafagas-y-ponerse-al-dia.md`).
3. **"En el plan gratis entras tú al portal; la búsqueda sola es de la prueba y del pase."**
   Aparece cuando se acaban las 5 de la prueba.

Las tres van en el popup, dentro del semáforo de `estrategia-y-rediseno.md` §5.2, en la línea de
**"qué necesita de ti"**. Cada una aparece en su momento y desaparece cuando deja de aplicar. Nunca
las tres juntas el primer día.

---

## 5. El video de 60 segundos

Va en la ficha de la Chrome Web Store (acepta un enlace de YouTube) y en la landing, arriba.
Sirve para el 98,9% que llega por teléfono y no puede instalar nada todavía.

Sin locución obligatoria —se puede leer—, pero con subtítulos siempre: la mitad lo va a ver sin
audio.

| Tiempo | Qué se ve | Qué dice el texto en pantalla |
|---|---|---|
| 0:00–0:06 | Una persona en el computador, con Computrabajo abierto y 20 avisos en pantalla | "Postular a un trabajo toma 10 minutos. Y hay que hacerlo 50 veces." |
| 0:06–0:14 | El panel de AutoPostula: subir el CV, elegir "qué buscas" | "Le dices una vez quién eres y qué buscas." |
| 0:14–0:26 | El listado del portal, con las marcas de §3.2 apareciendo sobre las tarjetas reales | "Y mira las ofertas contigo. Esta te sirve. Esta la deja para que decidas. Esta no: pide licencia A-2." |
| 0:26–0:38 | El formulario del portal llenándose, y la respuesta escrita con datos del CV | "Cuando tú lo autorizas, responde los formularios con tu experiencia real. No con un texto genérico." |
| 0:38–0:48 | El panel "Hoy": lo que hizo, lo que espera decisión | "Tú revisas lo dudoso. Lo claro lo envía sola." |
| 0:48–0:56 | La pantalla de Por decidir en un teléfono | "Desde el celular decides. El computador hace el resto." |
| 0:56–1:00 | Logo + "20 postulaciones gratis al mes" | "AutoPostula. No postula a todo: postula a lo que te sirve." |

Tres reglas para que no se caiga:

- **Todo lo que se muestra tiene que existir.** Si una pantalla del video no está construida, se
  saca del video, no se maqueta (`estrategia-y-rediseno.md` §9, criterio 1).
- **Nada de "consigue trabajo rápido".** No se promete resultado, se promete trabajo hecho.
- **Se graba con una cuenta de prueba**, nunca con datos reales de nadie.

---

## 6. Cómo se sabe si sirvió

Con lo que hay hoy no se puede saber, y por eso esto va después —o junto— con la medición de
`creditos-y-pagina-nueva.md` §5. Los números que contestan la pregunta:

1. Cuántos instalan la extensión sobre los que ven la ficha.
2. Cuántos llegan a la primera búsqueda.
3. **Cuántos aprietan "Empezar a postular"** — la métrica de esta propuesta.
4. Cuántos siguen activos a los 7 días.

Si el 3 es alto y el 4 es bajo, el problema no era entender: era el producto. Si el 3 es bajo, la
primera búsqueda no convenció y hay que mirar qué mostró.

---

## 7. Orden y esfuerzo

| # | Tarea | § | Esfuerzo |
|---|---|---|---|
| **1** | El video de 60 segundos | §5 | Horas. Lo puede hacer Roberto con una grabación de pantalla |
| **2** | Las tres frases en el popup | §4 | Chico; el semáforo ya existe |
| 3 | Etiquetas por tarjeta en el listado | §3.2 | Medio. Es lo que más cambia la sensación del producto |
| 4 | La tarjeta de cierre con los dos botones | §3.3 | Medio |
| 5 | Último paso del onboarding que lleva a la primera búsqueda | §3.1 | Chico |
| 6 | Los casos feos | §3.5 | Chico, pero es lo que evita que parezca roto |

El 1 y el 2 se pueden hacer esta semana y son independientes de todo lo demás.

---

## 8. Criterios de aceptación

1. Una cuenta nueva puede ver **ofertas reales etiquetadas** sin haber enviado ni una postulación.
2. No se envía nada hasta que la persona aprieta un botón que dice qué va a pasar.
3. Cada etiqueta trae su razón, con las mismas palabras que usa el panel.
4. Ninguna pantalla dice "modo observar", "scorer" ni "banda gris".
5. El popup nunca muestra los tres avisos de §4 al mismo tiempo.
6. Todo lo que aparece en el video existe en el producto.

---

## 9. Lo que no se hace

- ~~**Un recorrido de pantallas** con globitos y flechas (§2).~~ Se hizo uno el 2026-10-08, a pedido
  de Roberto, que no es eso: va encima de la búsqueda real y no explica botones (§13).
- **Un video de 3 minutos.** Si no se entiende en 60 segundos, el problema es el producto.
- **Prometer resultados** ("consigue trabajo en 2 semanas").
- **Mostrar en el video pantallas que todavía no existen.**

---

## 10. El panel: la tarjeta «Probemos» (hecho el 2026-10-01)

> **Estado:** desplegado el 2026-10-01 (PR #31). Es la mitad del panel; la del portal (§3.2 y §3.3:
> la marca en cada oferta y la tarjeta de cierre) se hizo el 2026-10-02, en §11.

### 10.1 Qué veía una cuenta nueva

Un amigo de Roberto terminó el onboarding, entró al panel y se quedó pegado. Revisado contra el
código, una cuenta nueva veía:

- **Un tablero en cero**: 0 enviadas, 0 min ahorrados, dos gráficos vacíos y "Todavía no hay actividad".
- **Cuatro mensajes que no calzaban entre sí**, y ninguno era un botón claro:

| Dónde | Decía | El problema |
|---|---|---|
| El saludo | "Por ahora solo mira: activa la postulación cuando confíes en lo que elige." | No decía cómo "mirar" |
| El aviso del layout | "…Revisa qué habría postulado y actívala cuando confíes en el resultado." | No había ninguna pantalla donde verlo: el servidor solo guarda cuántas (`Rafaga.observadas`), no cuáles |
| La tarea de la prueba | "Prueba automática: 0 de 5 · Postula sola hasta completar las 5, sin que entres a ningún portal." | Falso mientras no se active: no envía nada |
| La barra de arriba | "Sin ponerse al día · Abre Chrome en tu computador y se pone al día sola." | Sonaba a falla, y se lo decía a alguien con Chrome abierto en su computador |

- **Y conectar la extensión no hacía nada visible**: solo guarda el token. La primera ráfaga parte
  con la alarma (cada 60 min, `background.js`), en pestañas de fondo que la persona no ve.
- El único botón que llevaba a un portal estaba en el último paso del onboarding, salía solo si
  todo había quedado listo, y abría la búsqueda **sin comuna ni jornada** (todo Chile).

### 10.2 Lo que se hizo

**La tarjeta «Probemos» reemplaza al tablero** mientras la cuenta no active la postulación
(`app/dashboard/PrimeraBusqueda.tsx`, lógica pura en `lib/primera-busqueda.ts`). Cada paso es la
acción de verdad y se marca solo; uno solo está "ahora" a la vez:

| # | En el computador | Se marca cuando |
|---|---|---|
| 1 | Instala la extensión en Chrome | `bridge.js` la anuncia en esta pestaña, o la cuenta ya está conectada |
| 2 | Conéctala con tu cuenta (un clic) | `User.extensionConectada` |
| 3 | Mira qué haría en {portal}: abre el portal con su búsqueda | Hay rastro de que miró (ver abajo) |
| 4 | Tú decides si empieza a postular: lo que encontró, qué pasa al activarla y el botón | Al activar, la tarjeta desaparece |

En el celular los pasos 1 a 3 son "Sigue en tu computador" (con "Copiar el enlace"), "Mira qué
haría" y "Tú decides".

- **La búsqueda es la misma que la de la extensión.** `lib/busqueda-en-portal.ts` copia
  `URL_BUSQUEDA_POR_PORTAL` y `ubicacionDeBusqueda` de `background.js` (comuna o región, jornada,
  modalidad), y `scripts/verificar-busqueda-en-portal.ts` corre las dos versiones con los mismos
  casos: si dejan de armar la misma dirección, falla. Sin portal conectado ofrece los tres, y el
  que elija queda conectado.
- **"Ya miró"** = hay un descarte, una oferta que alguna vez quedó para decidir, una ráfaga
  terminada o una postulación (`primeraVez` en `lib/panel/hoy.ts`). Al volver a la pestaña del
  panel se vuelve a pedir el día; si todavía no llega nada, lo dice y ofrece activarla igual (si
  todas las de la página calzaban, la extensión no deja rastro en el servidor: ver §10.4).
- **Al volver de la tienda de Chrome la página se recarga sola**, en la tarjeta y en el paso de la
  extensión del onboarding: las extensiones no se meten en pestañas que ya estaban abiertas, y
  antes había que apretar "Ya la instalé, verificar".
- **Mientras está la tarjeta no hay tareas, cifras ni gráficos.** Quedan "Lo último que hizo" (con
  lo que miró, cada cosa con su razón), "Lo que buscas" y "Tus portales".
- **"Ya sé cómo funciona, ocultar"** la esconde con una cookie (`ap_mision_oculta`), que lee el
  servidor para que la página llegue sin ella. Con la tarjeta oculta y la postulación sin activar,
  Hoy muestra la tarea "Todavía no activas la postulación" con "Activar postulación" y "Probarla
  primero", que la trae de vuelta.
- **Los cuatro mensajes:** el saludo dice "Antes de que postule por ti, mira qué haría con ofertas
  reales"; el aviso del layout ya no aparece en Hoy y en las otras páginas dice "La extensión mira
  tus ofertas y te dice qué haría con cada una, pero no envía ninguna hasta que la actives"; la
  tarea de la prueba sale recién con la postulación activada; y la barra, antes de la primera
  ráfaga, dice "Por empezar" con "Falta conectar la extensión", "Primera búsqueda · sola, dentro de
  la próxima hora, con Chrome abierto" (conectada y en este navegador) o lo de siempre.
- **El servidor anota que la extensión quedó conectada** cuando esta pide su perfil
  (`/api/extension/perfil`), y Portales también lo avisa al conectar. Antes solo lo anotaba el
  onboarding: quien la conectaba desde Portales seguía viendo "Falta conectar la extensión".
- **El onboarding termina en la tarjeta**: "¡Todo listo!" + "Probarla con ofertas reales", en vez
  de abrir el portal desde ahí.
- La barra de arriba vive en el layout: cuando la tarjeta conecta un portal o la extensión, o se
  activa la postulación, se le avisa para que vuelva a pedir su estado.

### 10.3 Cómo se verificó

En local, con una base aparte (`autopostula_mision`) y una cuenta de prueba nueva, en el navegador
integrado (que no tiene la extensión; `bridge.js` se simuló con sus mismos eventos):

- Sin extensión: paso 1 con "Instalar en Chrome". Al volver de la "tienda", la página se recargó
  una sola vez. Con la extensión "presente", el paso 1 se marcó solo; "Conectar" generó el token,
  la extensión "contestó" y el servidor quedó con `extension_conectada`.
- Paso 3 sin portal: los tres botones, con `trabajo-de-vendedora-en-nunoa-jornada-part-time`,
  `en-region-metropolitana/nunoa/empleos-part-time-busqueda-vendedora.html` y
  `vendedora?ubicacion=nunoa`. Elegir Computrabajo lo conectó.
- Al volver sin datos: "Revisando lo que miró…" y luego el aviso con "Activar postulación" y "Ya
  terminó, revisar de nuevo". Con 3 descartes y 2 para decidir en la base: "Ya revisó ofertas para
  ti: te dejó 2 ofertas para que decidas y descartó 3 que no calzaban, cada una con su razón. Al
  activarla envía sola tus primeras 5 postulaciones de prueba, sin que entres a ningún portal."
- "Activar postulación": la tarjeta desapareció, volvió el Hoy de siempre y salió el aviso
  "Postulación activada".
- Ocultar → tarea de activar; recargando, la página llegó sin la tarjeta; "Probarla primero" la
  trajo de vuelta. En el celular (375 px): la versión de tres pasos, sin desborde y sin el aviso
  repetido del layout. El onboarding: el paso de la extensión se recarga solo y vuelve al mismo
  paso; el último lleva a la tarjeta.
- `tsc` limpio; `verificar-busqueda-en-portal.ts`, `verificar-primera-busqueda.ts` y
  `verificar-texto-rafaga.ts` (con los textos nuevos de la barra) pasan, igual que los demás
  scripts sin base de datos.

### 10.4 Lo que queda

1. **La extensión 2.17** (§3.2 y §3.3): la marca en cada oferta del listado y la tarjeta de cierre
   con "Empezar a postular" / "Todavía no".
2. **Mandar al servidor las que habría postulado** al mirar un portal a mano. Hoy solo se saben
   cuántas de una ráfaga (`Rafaga.observadas`); por eso el paso 4 cuenta las que dejó para decidir
   y las descartadas, y si todas las de la página calzaban no queda rastro (la tarjeta ofrece
   activarla igual).
3. **En el celular, mandarse el enlace por correo** en vez de copiarlo (`celular-y-escritorio.md`).

---

## 11. El portal: la marca en cada oferta y la tarjeta del final (hecho el 2026-10-02, extensión 2.17.0)

> **Estado:** implementado en `rama-roberto`, sin desplegar. Es la mitad del portal que faltaba en
> §10.4: con esto la primera búsqueda queda como la describen §3.2 y §3.3.

### 11.1 Lo que se hizo

**La marca en cada oferta del listado (§3.2).** Cada tarjeta lleva *Te sirve*, *Para que decidas* o
*No calza*, con su razón y con las mismas palabras del panel: `AP.razonComoEnElPanel` (`core.js`)
es una copia de `formatearRazon` (`backend/lib/formatear-razon.ts`), y
`backend/scripts/verificar-razones-marca.ts` corre las dos con una razón de cada tipo. Qué razón
dice: en una que sirve, la primera a favor; en una que queda en duda, la primera en contra (lo que
la dejó ahí, igual que "Lo último que hizo"); en un descarte, la que lo descartó.

- Las decisiones se guardan en la pestaña (`sessionStorage`, `ap_marcas`), no en memoria: Laborum va
  y vuelve entre el listado y los avisos, y cada vuelta recarga la extensión.
- Cada adaptador dice dónde pintarlas (`AP.tarjetasDeLaPagina`). En Trabajando va dentro de la
  columna del texto: como tercera columna angostaba el título (visto en el sitio real).
- Va en un shadow root, con el texto puesto como texto (la razón puede traer palabras del aviso);
  un clic en la marca no abre la oferta, y lo que pinta la extensión ya no dispara otro escaneo.

**La tarjeta del final de la página (§3.3).** En "solo mirar", cuando termina de revisar la página
que la persona está mirando, sale arriba del aviso de siempre:

> *De las 20 ofertas de esta página: postularía a 5 y descartaría 15.*
> *La razón más repetida para descartar: el cargo no se parece a lo que buscas.*
> **[ Empezar a postular ]** [ Todavía no, quiero mirar ]

- No sale en las pestañas de las ráfagas (se marcan al llegar la orden `AUTO_SCAN`, y la marca
  sobrevive a las navegaciones de esa pestaña), ni otra vez en la pestaña después de contestar.
- **Empezar a postular** activa la postulación en la cuenta desde el portal
  (`/api/extension/estado` con `{ empezarAPostular: true }`), con las mismas reglas que el panel:
  `lib/habilitar-postulacion.ts` las comparte con `/api/account/habilitar-postulacion`. Si la
  persona había pedido "solo observar", lo apaga. Después sigue con esa misma página: las que
  sirven se postulan ahí, y **la primera se muestra antes de enviarla** aunque no tenga "Revisar
  antes de enviar" (`AP.conRevision`; se gasta al terminar esa postulación, no al cerrar la primera
  revisión, porque en Computrabajo una misma postulación pide el visto bueno antes del clic y
  después muestra las respuestas). Si la cuenta no cumple, la tarjeta dice el motivo del servidor.
- **Todavía no, quiero mirar** cierra la tarjeta; nada cambia.
- Sin sesión iniciada en el portal (§3.5), lo dice ahí mismo y el botón lleva al ingreso del propio
  portal (aunque esté en otro subdominio; un enlace de otro sitio no se sigue).

**Las que habría postulado llegan al panel** (§10.4, punto 2). Tabla nueva `OfertaObservada`
(migración `20261002120000_ofertas_observadas`, solo agrega), `/api/extension/observadas`, y se
borran a los 90 días como los descartes. El panel las usa en tres lugares: el paso 4 de la tarjeta
"Probemos" ("habría postulado a 5"), "Lo último que hizo" ("Postularía a…", solo mientras la cuenta
no postula) y el rastro de "ya miró" (antes, si todas las de la página calzaban, no quedaba ninguno).

**Lo demás:**

- **Laborum, con la persona mirando:** en "solo mirar" las dudosas ya no se abren una por una (la
  pestaña saltaba sola de aviso en aviso justo mientras la persona miraba): van a "Por decidir" con
  lo que dice la tarjeta, como en Computrabajo. En las ráfagas, que nadie mira, se siguen abriendo.
- **El resumen del aviso** ya no se pisa con "Sin ofertas nuevas" cuando cualquier cambio de la
  página dispara otra pasada sin novedades.
- **El paso 3 de la tarjeta "Probemos"** dice "la extensión marca cada oferta con lo que haría y por
  qué, y al terminar te pregunta si empieza a postular" cuando la extensión es 2.17 o más nueva
  (`bridge.js` deja la versión en la página); con una anterior, lo de antes.

### 11.2 Cómo se verificó

**En los tres portales reales**, en el Chrome de Roberto, con el código nuevo corriendo dentro de un
marco del propio portal (donde la extensión instalada no actúa), la cuenta en "solo mirar", el
servidor falso diciendo "no se puede postular" y los clics de envío cortados:

| Portal | Búsqueda | Resultado |
|---|---|---|
| Computrabajo | vendedora en Ñuñoa, part time | 20 ofertas: 5 *Te sirve* y 15 *No calza*, cada una marcada; la tarjeta con las cifras y la razón más repetida |
| Laborum | vendedora en Ñuñoa, part time | 9 ofertas: 5 y 4; ninguna navegación a los avisos |
| Trabajando.com | vendedora en Ñuñoa | 7 ofertas: 2 y 5 (las dudosas se abrieron en el panel lateral y se resolvieron); la marca ya dentro de la columna del texto |

"Empezar a postular" con un error del servidor mostró el motivo y dejó el botón listo; con éxito
dejó puestas la "primera con revisión" y la marca de "ya contestó", y volvió a revisar la página sin
enviar nada. Ningún clic de envío llegó a intentarse, y no hubo errores.

**En local**, con una base aparte y una cuenta nueva: `/api/extension/observadas` guardó 2, no
duplicó al repetir y rechazó sin token; "Empezar a postular" sin objetivo confirmado respondió 400
con el motivo y no activó nada, y con todo listo activó (`recienActivada` solo la primera vez). El
panel mostró "Ya revisó ofertas para ti: habría postulado a 2" y las dos "Postularía a…", y al
activarse la tarjeta desapareció.

**Pruebas:** `extension/verificar-primera-busqueda.js` (nueva, 67 comprobaciones), casos nuevos en
`verificar-computrabajo.js`, `verificar-laborum.js` y `verificar-rafagas.js`;
`backend/scripts/verificar-razones-marca.ts` (68). Pasan las 11 pruebas de la extensión y los
scripts sin base de datos; `tsc` limpio, y la migración calza exacto con el esquema
(`prisma migrate diff` vacío).

### 11.3 Lo que queda

1. **Subir la 2.17.0 a la tienda** y **desplegar el panel** (trae la migración).
2. Las tres frases del popup (§4; hechas el 2026-10-04, en §12), el video (§5) y, en el celular,
   mandarse el enlace por correo.
3. **Para el abogado:** las ofertas a las que la extensión habría postulado se guardan 90 días, como
   los descartes. Revisar que la política de privacidad lo cubra.

---

## 12. Las tres frases del popup (hecho el 2026-10-04, extensión 2.17.1)

> **Estado:** implementado en `rama-roberto`, sin desplegar. Es la tarea 2 de §7.

### 12.1 Lo que se hizo

Las tres van dentro del semáforo del popup, debajo de "en qué está", en una sola línea de **qué
necesita de ti**: de a una, cada una cuando aplica y mientras aplique (`avisoParaTi` en
`extension/popup.js`).

| # | Lo que dice | Cuándo sale | Cuándo se va |
|---|---|---|---|
| 1 | *"Necesitas tener tu sesión iniciada en Laborum. Sin ella, la extensión no puede postular ahí."* y el enlace **Iniciar sesión en Laborum ↗** | Un portal conectado avisó que no hay sesión | Cuando ese portal avisa que sí la hay |
| 2 | *"La extensión trabaja mientras Chrome está abierto, y se pone al día sola cuando lo abres."* | La primera vez que una puesta al día queda cortada (se cerró Chrome o se suspendió el computador a la mitad), y solo si de verdad se pone al día sola: Premium o la prueba, sin pausa y con cupo | Cuando la siguiente puesta al día corre o termina. Con otra cortada después, ya no vuelve |
| 3 | Lo del plan gratis | Ya estaba: al acabarse las 5 de la prueba, la fila de la prueba dice *"Con el plan gratis, entra a Computrabajo, Laborum o Trabajando y la extensión postula por ti"*, con las mismas palabras del panel y del correo (`rafagas-y-ponerse-al-dia.md` §4.1). No se repite en la línea | Al pasar a Premium |

- **Nunca las tres juntas** (criterio 5 de §8): la 1 va antes que la 2, porque sin sesión no postula
  ahí, y la 2 no aplica con la prueba terminada, que es cuando sale la 3. Lo más que se ve son dos:
  la 1 y la 3.
- La sesión que falta va en ámbar, con un enlace a la página para entrar de cada portal que la
  necesite; lo de Chrome es un dato y va en gris.
- Para saber si "se pone al día sola" es verdad, el popup usa lo que dice el servidor
  (`busquedaAutomatica`, que ya descuenta plan, prueba, pausa y cupo): `background.js` lo pasa como
  `automatica`, junto con el estado del botón "Ponerme al día ahora".
- "La primera vez" se anota en el navegador (`avisoChromeVisto`, con la puesta al día con que se
  dijo) recién cuando se muestra: si la persona no abrió el popup mientras estaba cortada, no cuenta.

**Lo que hubo que arreglar antes: la extensión casi nunca sabía si había sesión.** Buscaba un enlace
para cerrar sesión (con sesión) o uno a `/login` (sin sesión). Mirado en los tres sitios el
2026-10-03, con y sin sesión: ninguno tiene en el listado un enlace para cerrarla, y Computrabajo y
Trabajando no entran por `/login`.

| Portal | Sin sesión: antes → ahora | Con sesión: antes → ahora |
|---|---|---|
| Computrabajo | no sabía → **sin sesión** | no sabía → **con sesión** |
| Laborum | sin sesión → sin sesión | no sabía → **con sesión** |
| Trabajando | no sabía → **sin sesión** | no sabía → **con sesión** |

Por eso el popup decía "Sin revisar" en casi todo, y la tarjeta del final (§11) nunca podía decir
"Para postular necesitas tu sesión iniciada en Computrabajo": su prueba usaba un enlace de ingreso
inventado. Ahora `SESION_POR_PORTAL` (`core.js`) tiene lo que distingue los dos casos en cada uno:

- **Computrabajo:** con sesión, el menú de la persona (`data-info-user`) y su "Cerrar sesión", que es
  un `<span id="logout">` y no un enlace; sin sesión, el botón "Login". Sus enlaces a `/acceso/` están
  en los dos casos.
- **Laborum:** con sesión, el acceso a los mensajes; sin sesión, "Ingresar".
- **Trabajando:** con sesión, "Mis postulaciones" y "Actualizar mi CV"; sin sesión, "Ingresa".

Y la página para entrar a cada uno, adonde llevan el popup y la tarjeta del final:
`candidato.cl.computrabajo.com/acceso/`, `www.laborum.cl/login` y
`www.trabajando.cl/ingresa-a-tu-cuenta`. La tarjeta ya no sigue un enlace de la página. Además, la
sesión se vuelve a mirar cuando el portal termina de cambiar la página (Laborum y Trabajando dibujan
el encabezado después de cargar, y se puede entrar sin recargar), y solo se avisa cuando cambia.

### 12.2 Cómo se verificó

- **En los sitios reales, con el código nuevo tal cual:** sin sesión, en el navegador integrado (que
  no tiene la extensión); con sesión, en el Chrome de Roberto, dentro de un marco sobre `robots.txt`
  donde la extensión instalada no actúa. Solo lectura, sin un clic. El listado y la portada de cada
  portal dieron lo de la tabla de arriba, y las tres páginas para entrar son las del ingreso.
- **El popup real**, con un chrome y un servidor falsos, en tres casos: falta la sesión en Laborum
  (ámbar, con el enlace); la última puesta al día quedó cortada (gris); y una cuenta gratis con la
  prueba terminada, sin sesión en Laborum y con una cortada vieja (se ven la 1 y la 3, no la 2).
- **Pruebas:** `verificar-primera-busqueda.js` (113 comprobaciones: la tarjeta con lo de cada
  portal, el aviso de la sesión al popup y la línea del popup), casos nuevos en
  `verificar-estado-extension.js` (lo de cada portal, y que `popup.js` tenga las mismas páginas para
  entrar que `core.js`) y en `verificar-rafagas.js` (`automatica`). Pasan las 11. Además se rompió a
  propósito cada regla nueva en una copia (la pausa, "la primera vez", el orden, mirar primero lo de
  sin sesión, las páginas para entrar, volver a mirar la sesión…) y las pruebas lo detectaron todo.

### 12.3 Lo que queda

1. **Subir la 2.17.1 a la tienda en vez de la 2.17.0** (la trae entera), después de mergear el PR
   (§11.3, punto 1). No necesita nada nuevo del servidor.
2. El video de 60 segundos (§5) y, en el celular, mandarse el enlace por correo.
3. **No se tocó:** en una cuenta gratis con la prueba terminada, el semáforo sigue diciendo
   "Postulando por ti · Revisa las ofertas nuevas de tus portales y envía las que calzan"
   (`TEXTO_MODO`, igual que el panel), aunque ya no lo hace sola. La fila de la prueba lo aclara justo
   debajo, pero ese texto podría decir "cuando entras a un portal". Habría que cambiarlo en los dos
   lados (`backend/lib/estado-extension.ts`).

---

## 13. El recorrido de la primera vez (hecho el 2026-10-08, extensión 2.19.0)

> **Estado:** implementado en `rama-roberto`, sin desplegar. Lo pidió Roberto el 2026-10-08: que
> quien termina el onboarding vaya al portal que eligió, con la extensión, y que ahí le muestren
> unos pasos, *"bastante dinámico"*. La 2.19.1 (2026-10-09) solo acorta el botón «Iniciar sesión»
> del paso 3, que en Trabajando quedaba en dos líneas (§13.3). Es la que hay que subir.

### 13.1 Por qué ahora sí, si §2 decía que no

§2 descartó un recorrido de pantallas por cuatro razones. Este las esquiva así:

| §2 decía | Este recorrido |
|---|---|
| Se salta | Son cuatro pasos y cada uno sale cuando pasa lo que explica, encima de las ofertas reales: no es un muro de «siguiente» antes de empezar. Si se salta, las marcas, la tarjeta del final y el panel se siguen explicando solos |
| Se rompe con cada rediseño | Se apoya solo en lo que pinta la extensión (el aviso, la marca de cada oferta, la tarjeta del final y el panel), nunca en botones del portal |
| Explica lo que no preocupa | No explica botones: dice qué va a pasar en tu nombre y qué no, que era lo que §0 decía que preocupa («no envío nada sin que me digas») |
| Es caro | Usa el aviso que ya existía: es una sección de `core.js` y su prueba |

### 13.2 Cómo quedó

**Cuándo sale.** Una sola vez, en la primera búsqueda que la persona mira en «solo mirar», en la
pestaña que está mirando (nunca en una ráfaga ni en una pestaña de fondo). Queda pendiente al
instalar la extensión (una actualización no lo trae: quien ya la usaba no lo necesita) y cuando la
persona aprieta **«Probémosla ahora»** al cerrar el onboarding o **«Buscar en…»** en la tarjeta
«Probemos» de Hoy (`bridge.js`, evento `autopostula:recorrido`, sin ningún dato). Si ya lo hizo o lo
saltó, no se repite, y una cuenta que ya postula no lo ve nunca.

**Los pasos** (`AP.textoRecorrido`, en `extension/core.js`):

| Paso | Dónde apunta | Qué dice |
|---|---|---|
| 1 | El aviso de abajo a la derecha | «Hola, soy AutoPostula. Revisé las 20 ofertas de esta página y marqué cada una con lo que haría. Te muestro cómo leer las marcas: no envío nada sin que me digas.» |
| 2 | Una oferta de cada marca que haya en la página, de a una (la página baja sola hasta ella) | «Esta te sirve» (a las que sirven, postularía), «Esta, mejor que la decidas tú» (quedan en «Por decidir») y «Esta no calza» (si se equivoca, en la lista se puede rescatar) |
| 3 | La tarjeta del final, que recién aparece acá | «Antes de que salga nada, tú eliges», y lleva a la lista. Sin sesión en el portal: «Para postular, inicia sesión», y se retoma desde ahí al volver |
| 4 | El panel: primero la lista y después el botón | «Marca a cuáles postular» y «Nada sale sin este botón: (…) la primera te la muestro antes de enviarla» |
| Final | Según cómo terminó | Apretó «Postular» o «Empezar a postular»: «¡Partimos!», y que desde ahora revisa así cada vez que abre el portal. «Todavía no»: sigue mirando, y cómo empezar después. Cerró la lista: no envió nada, y cómo volver |

**Lo dinámico.** La página queda en penumbra y un marco con brillo enmarca lo que se explica. De un
paso al otro, el marco y el globo viajan en vez de saltar, y el globo se pone al lado donde quepa
(a la derecha de una oferta, a la izquierda de la tarjeta y del panel, arriba del aviso). Si la página
se mueve, la siguen. Con «reducir movimiento» no hay animaciones.

**Lo demás.**
- Se puede saltar en cualquier paso («Saltar el recorrido» o Escape). Si se salta antes del paso 3,
  la tarjeta del final aparece en ese momento.
- Si se corta (se cerró la pestaña, fue a iniciar sesión), se retoma donde iba durante dos horas;
  después empieza de nuevo.
- En el onboarding, «¡Todo listo!» dice antes qué va a pasar, en tres líneas numeradas, arriba de
  «Probémosla ahora». Con la 2.19, la tarjeta «Probemos» de Hoy también lo menciona.
- Ningún paso dice «banda», «puntaje» ni «modo observar» (criterio 4 de §8).

### 13.3 Cómo se verificó

- **En el listado real de Computrabajo**, en el navegador integrado, que no tiene la extensión: un
  servidor local trae la página del portal, le quita sus scripts y le pone la extensión nueva con un
  chrome falso, así que nada se envía. El recorrido entero, del paso 1 al final, con «Postular a las
  5» (en esa búsqueda había 5 que servían, 3 dudosas y 12 que no calzaban); el marco y el globo en
  cada paso, y viajando de uno al otro.
- **En Laborum y en Trabajando, en el Chrome de Roberto** (el 2026-10-09, a pedido suyo), con el
  código nuevo corriendo en un marco del propio portal sobre `robots.txt`, donde la extensión
  instalada no actúa, y un chrome falso: el recorrido entero en los dos, del paso 1 al final («Postular
  a las 6»; 6 que servían y 14 o 9 que no calzaban). En Laborum el globo del paso 2 va abajo de la
  oferta (las tarjetas son anchas); en Trabajando, al lado de la columna del listado, que baja sola
  dentro de su propio scroll. En Trabajando no había sesión: el paso 3 dijo «Para postular, inicia
  sesión», y «Saltar el recorrido» lo cerró dejando la tarjeta a la vista. Ningún clic de envío se
  intentó y el marco nunca salió del listado. (El simulador del navegador integrado no sirve para
  estos dos: arman el listado con JavaScript y la copia sin scripts queda vacía.)
- **El cierre del onboarding y la tarjeta de Hoy**, con el servidor local contra una base aparte y
  una cuenta de prueba: «Probémosla ahora» pide el recorrido una vez, abre Computrabajo con la
  búsqueda armada y sigue a Hoy; «Buscar en Computrabajo» también lo pide.
- **Pruebas:** `extension/verificar-recorrido.js` (nueva, 84 comprobaciones: los textos, dónde va el
  globo, el recorrido entero, saltarlo, retomarlo, cuándo no sale, los finales y «Revisar antes de
  enviar») y el bloque 22 de `verificar-rafagas.js` (cuándo queda pendiente). Rompiendo a propósito,
  en una copia, que la tarjeta espere al paso 3, las pruebas lo detectan.

### 13.4 Lo que queda

1. Medirlo (§6): cuántos lo terminan, cuántos lo saltan y en qué paso, contra cuántos aprietan
   «Empezar a postular». Hoy cómo terminó queda solo en el navegador (`recorrido.como`); habría que
   mandarlo al servidor.
