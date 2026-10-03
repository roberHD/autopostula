# La primera búsqueda, guiada — y el video de 60 segundos

> **Estado:** propuesta, 2026-09-29. Nace de una pregunta de Roberto: *"¿qué tan bueno sería hacer
> una parte de la extensión como tutorial?"*. **El 2026-10-01 se hizo la parte del panel (§10)**;
> la del portal (§3.2, §3.3) espera la extensión 2.17.
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

- **Un recorrido de pantallas** con globitos y flechas (§2).
- **Un video de 3 minutos.** Si no se entiende en 60 segundos, el problema es el producto.
- **Prometer resultados** ("consigue trabajo en 2 semanas").
- **Mostrar en el video pantallas que todavía no existen.**

---

## 10. El panel: la tarjeta «Probemos» (hecho el 2026-10-01)

> **Estado:** implementado en `rama-roberto`, sin desplegar. Es la mitad del panel; la mitad del
> portal (§3.2 y §3.3: la marca en cada oferta y la tarjeta de cierre) sigue pendiente y necesita
> la extensión 2.17.

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
