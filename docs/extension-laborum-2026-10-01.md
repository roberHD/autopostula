# La extensión en Laborum — 2026-10-01

> **Estado:** ✅ corregido y verificado contra el sitio real con la sesión de Roberto, sin enviar
> ninguna postulación (detalle al final). Falta recargar la extensión y probar con postulaciones
> reales.
> **Para:** Roberto y el chat de producción.
> **Origen:** "en la ráfaga abría la oferta y cerraba, abría otra y cerraba, todo el rato así: no
> postulaba".
> **Relacionado:** `extension-trabajando-2026-09-30.md` (mismo tipo de revisión en trabajando.com,
> §7 el panel "Falta información"), `rafagas-y-ponerse-al-dia.md`, `visibilidad-y-etapa2.md` §B.

---

## 0. Lo esencial

Lo que se veía en el panel de Roberto el 01-10: 31 ofertas de Laborum en "Por decidir", 22 de ellas
con "no dice la jornada, y buscas part time"; una incompleta llamada "Oferta" con "No se encontró
el botón para postular"; y la última ráfaga con "1 búsqueda no terminó".

| Problema | Qué pasaba | § |
|---|---|---|
| La jornada | Laborum dice "Part-time" o "Full-time" en la ficha del aviso, una lista aparte de la descripción, y la extensión solo leía la descripción. Ninguna oferta decía su jornada: con "part time" declarado, todas quedaban en duda. La extensión abría cada una, no encontraba la jornada, volvía y la dejaba en "Por decidir" | §1 |
| La búsqueda ya era part time | La ráfaga busca en `empleos-part-time-busqueda-…`: Laborum ya filtró por jornada, pero la tarjeta no la muestra y el puntaje no lo sabía | §1 |
| Página en blanco | Antes de que Laborum pinte el aviso ya hay un botón vacío y oculto: la extensión lo tomaba como "la página cargó". El título salía "Oferta" y el botón de postular "no existía" | §2 |
| La ráfaga cerraba la pestaña | Al pasar del listado a un aviso, un escaneo que llegaba en ese momento le avisaba a la ráfaga que Laborum había terminado, y la ráfaga cerraba la pestaña con el aviso recién abierto. Lo mismo si el listado tardaba más de 4 s en aparecer al volver ("Sin tarjetas") | §3 |
| Aprobadas de "Por decidir" | La pestaña que abre una aprobada apunta directo al aviso, y esa página tiene enlaces a 5 avisos relacionados. La extensión los escaneaba como si fueran un listado y podía irse a postular a otro antes de la orden | §4 |
| Lo que la IA no sabe | Casi todos los avisos de retail preguntan la "pretensión de renta". Sin "Revisar antes de enviar", la postulación quedaba incompleta sin preguntarle nada a nadie | §5 |
| El resumen de la ráfaga | Cada aviso es una página nueva y los conteos partían de cero en cada una: las postulaciones de Laborum no llegaban al resumen | §6 |
| Computrabajo, lo mismo | La ráfaga busca con su filtro `-jornada-part-time`, la tarjeta no muestra la jornada y en Computrabajo los dudosos no se abren: lo que no dijera "part time" en el título iba a "Por decidir" (16 de las 65 de Computrabajo que había en el panel) | §7 |
| Las horas del título | "Vendedor/a 30 hrs", "Vendedor 20 horas" quedaban en duda; "Vendedor/a Dermocosmética 42 hrs", dentro del filtro part time, pasaba por part time | §8 |

---

## §1. La jornada: la ficha del aviso y el filtro de la búsqueda

La ficha de cada aviso es una lista `ul[aria-label="Información adicional del aviso"]` dentro de
`#ficha-detalle`: "Presencial · Ventas · Part-time, Indeterminado · Junior · 1 vacante
disponible". La descripción (`#descripcion-aviso`) casi nunca repite la jornada. Ejemplo real:
"Vendedor/a 30 hrs RayBan Mall Parque Arauco" dice "Part-time" en la ficha y quedó en "Por
decidir" por "no dice la jornada".

**Arreglo** (`adapters/laborum.js`):

- `extraerTextoAviso()` pone la ficha antes de la descripción, como ya hacían Computrabajo y
  Trabajando (que leen el panel entero). Lo usan el puntaje y la IA: la IA ahora sabe que el cargo
  es part time.
- `jornadaDelListado()`: si la URL del listado trae `empleos-part-time-` o `empleos-full-time-`, la
  tarjeta va al puntaje con esa jornada. Así la arma la ráfaga (`URL_BUSQUEDA_POR_PORTAL`).
- Al abrir un aviso se vuelve a puntuar con la ficha real: si dice "Full-time", se descarta con esa
  razón aunque el listado fuera part time.

**Lo que no se cambió:** la regla de jornada del puntaje sigue igual. Si el título no dice la
jornada y en cualquier parte aparece la contraria, se descarta, aunque también aparezca la
buscada. En Laborum le pasa a un aviso de venta por catálogo publicado dos veces ("cómodos
horarios part-time full-time, ganancias diarias"). Si alguna vez se quiere que la ficha mande como
el título, hay que pasarla al puntaje como un campo aparte, no como texto.

## §2. Esperar a que el aviso esté pintado

Laborum es una SPA: el HTML llega sin el aviso. Lo que aparece primero es un `<button>` vacío y
oculto, y `esperar('button')` daba la página por cargada.

**Arreglo:** `esperarAviso()` espera el título (`h1`) y la ficha (`#ficha-detalle`), hasta 15 s.
Además, el botón de postular está en una barra pegajosa (`#sticky-postular-bar`) que aparece un
poco después: `postularEnPagina()` lo espera (o "Postulado el …") hasta 8 s. Después del clic se
espera el modal de preguntas o la confirmación, también hasta 8 s, en vez de mirar al segundo. Las
esperas son con un observador del DOM y no con pausas encadenadas, que Chrome estira en las
pestañas de fondo.

## §3. La ráfaga cerraba la pestaña a la mitad

Al abrir un aviso, la extensión marcaba "procesando" y navegaba. Si en ese momento llegaba otro
escaneo (el observador de cambios del DOM dispara uno cada vez que la página se queda quieta 2,5 s,
o la orden `AUTO_SCAN` de la ráfaga), ese escaneo veía "procesando" y mandaba `ESCANEO_TERMINADO`.
La ráfaga daba por terminado el paso de Laborum y cerraba la pestaña. En una pestaña de fondo,
donde la carga del aviso tarda, pasaba seguido.

**Arreglo:**

- `AP.navegando` se pone al empezar a irse a otra página (`irA`, `volverA`, la página siguiente).
  Mientras está puesto, o mientras se postula, el escaneo no hace nada ni avisa nada.
- El listado se espera hasta 15 s (antes 4 s) antes de decir "Sin tarjetas".
- Se vuelve al listado navegando a su dirección (guardada al abrir el aviso), no con "atrás".
- Si el navegador restaura el listado desde su caché (atrás/adelante), la extensión recarga el log
  y sigue (`pageshow`).
- Cada aviso manda un latido (`AP.latido`): el seguro de 8 minutos por paso cuenta desde el último.

## §4. Aprobadas de "Por decidir" y avisos abiertos a mano

La pestaña de una aprobada se abre directo en el aviso (`history.length` 1) y espera la orden
`DO_APPLY`. El escaneo ya no postulaba ahí, pero seguía de largo y escaneaba los avisos
relacionados como si fueran un listado. La prueba con la versión anterior lo muestra: se fue a
`/empleos/vendedor-part-time-21.html`.

**Arreglo:** en una página de aviso, el escaneo solo resuelve el aviso que se fue a abrir desde el
listado (`ap_aviso_pendiente` en sessionStorage). Si la pestaña se abrió directo, espera la orden.
Si la persona llegó al aviso por su cuenta, o apretó "Escanear", lo resuelve y la pestaña se queda
ahí (antes volvía "atrás" sola, a donde fuera). Si Laborum muestra otro aviso que el pedido, se
anota y se vuelve al listado.

Antes de postular, todo aviso abierto desde el listado se vuelve a puntuar con la ficha y la
descripción: postular, "Por decidir" o descarte, con el duplicado y el cupo revisados ahí mismo.
Antes, los que la tarjeta daba por buenos se postulaban sin mirar el aviso.

## §5. Lo que la IA no sabe: se pide en vez de abortar

Al apretar "Postularme", Laborum abre "Responde las preguntas" (`#form-preguntas`). En el aviso de
RayBan son cuatro preguntas obligatorias, una de ellas "Indícanos tus pretensiones de renta
líquida". La IA no inventa ese dato (§8.4 de la revisión del 16-09), y sin "Revisar antes de
enviar" la postulación quedaba incompleta: "Falta pretensión de renta en tu perfil".

**Arreglo:** igual que en trabajando.com (§7 de su documento), se abre el panel "Falta información
para postular" con 2 minutos de plazo y "Guardar esto en mi perfil". Si nadie contesta a tiempo,
esa pestaña no vuelve a preguntar (queda en sessionStorage, porque cada aviso es una página
nueva). Si la IA misma falló, se dice y se sigue. Las incompletas ahora guardan la empresa.

**Lo más rápido para Roberto:** contestar una vez la pretensión de renta en ese panel, con
"Guardar esto en mi perfil", o agregarla en Entrenar IA. De las 14 incompletas de Laborum, la
mayoría son por eso (renta, disponibilidad en horario de mall, vehículo propio).

## §6. El resumen de la ráfaga

`sumarConteos()` guarda en sessionStorage lo que se hizo en la pestaña (postuladas de verdad, por
decidir, descartadas, observadas) y `terminarEscaneo()` lo manda todo junto a la ráfaga al
terminar. Antes llegaba solo lo de la última pasada por el listado. "Postuladas" cuenta solo las
que Laborum confirmó, no las que se intentaron.

## §7. Computrabajo: el mismo problema con la jornada

Lo que entró el 01-10 a "Por decidir" desde Computrabajo decía, todo, "no dice la jornada":
"Vendedora volante 30hrs pm", "Vendedor Tienda deportiva / Cerrillos Plaza", "Promo/Vendedor(as)
Mall Plaza Oeste"… La ráfaga busca en `trabajo-de-vendedor-en-rmetropolitana-jornada-part-time`, y
los avisos de ese listado dicen "Jornada part time" en su ficha (se abrieron 6 en el sitio real: los
6 lo decían), pero la tarjeta no lo muestra, y en Computrabajo los dudosos van directo a "Por
decidir" sin abrirse (se sacó la Etapa 2 el 2026-09-22).

**Arreglo** (`adapters/computrabajo.js`): `jornadaDelListado()`, igual que en Laborum. Con las 20
tarjetas reales de esa búsqueda y un perfil como el de Roberto: antes 3 para postular, 3 en "Por
decidir" y 14 descartadas; ahora 5 para postular, ninguna en "Por decidir" y 15 descartadas (la de
42 horas, §8). Trabajando no lo necesita: su búsqueda no trae filtro de jornada en la URL, y sus
dudosos sí se abren y se leen con la ficha.

## §8. Las horas del título

En Chile la jornada parcial es de hasta 30 horas semanales (Código del Trabajo, art. 40 bis) y la
completa, de 40 a 45. Muchos títulos lo dicen así, sin "part time": "Vendedor/a 30 hrs RayBan",
"Vendedor 20 horas - La Dehesa", "Asistente de ventas 30 HR", "Ejecutivo de ventas 3HRS DIARIAS".
Quedaban en duda. Y "Vendedor/a Dermocosmética 42 hrs", publicado dentro del filtro part time de
Computrabajo, con §7 se habría postulado como part time.

**Arreglo** (`core.js`, `AP_JORNADA_HORAS_TITULO`): en el título, 15 a 30 horas (sin 24) o hasta 6
diarias es part time; 40 a 45, u 8 a 10 diarias, es jornada completa. Solo en el título: en la
descripción "de 9 a 18 hrs" es un horario. Tampoco cuentan "24 horas" (una farmacia), "12 horas"
(un turno) ni lo que viene después de " a ", " hasta " o un guion ("de 10 a 18 hrs"). La "a" tiene
que ir suelta: "Vendedor/a 30 hrs" sí es una jornada. 15 comprobaciones nuevas en
`verificar-scorer.js`.

---

## Cómo se verificó

- **Los datos:** en el panel de Roberto (`/api/banda-gris`, `/api/applications`, solo lectura):
  22 de las 31 de Laborum en "Por decidir" con la razón "no dice la jornada" y, en `detalleAviso`, la
  jornada "Part-time" o "Full-time" (16 de 65 en Computrabajo, 2 de 30 en Trabajando); la incompleta "Oferta / No se encontró el botón para postular".
- **El sitio sin sesión** (navegador integrado, sin la extensión): tarjetas del listado, ficha,
  `#descripcion-aviso`, enlaces a avisos relacionados en la página de un aviso, el botón vacío y
  oculto antes de pintar, y la barra `#sticky-postular-bar` con el formulario "Sueldo pretendido".
- **El sitio con la sesión de Roberto:** en su Chrome, sobre `laborum.cl/robots.txt`, un `<iframe>`
  del mismo sitio (la extensión instalada no corre en marcos) con `core.js` y `laborum.js` nuevos y
  un `chrome` falso (perfil equivalente al suyo: vendedor, Región Metropolitana, part time). Se
  bloqueaban las llamadas que mandan datos, salvo la búsqueda del listado (`POST
  /api/avisos/searchV2`), y los clics en "Responder" y "Postulación rápida". Resultados:
  - **Búsqueda part time de la ráfaga** (20 avisos): cada uno se resolvió una sola vez. 13 se
    descartaron por la tarjeta, 1 ya estaba postulado ("vendedor de tienda"), 2 se descartaron al
    leer la ficha y 4 se habrían postulado (2 con preguntas, 2 de un clic: los cuatro clics finales
    quedaron bloqueados). La IA recibió la ficha ("Presencial · Comercial · Part-time,
    Indeterminado…"). Al final avisó a la ráfaga una vez, con los conteos de todas las páginas.
  - **Búsqueda sin filtro de jornada** (vendedor, Las Condes): las dudosas se abrieron y las
    "Full-time" se descartaron con esa razón (antes: "Por decidir"); "Vendedores Part time PUMA"
    se reconoció como ya postulada.
  - **Aprobada abierta directo en el aviso:** no se movió ni escaneó los relacionados; con la
    orden, apretó "Postularme", respondió las 4 preguntas y el clic en "Responder" quedó bloqueado.
  - **Falta un dato:** con la IA diciendo que no sabe la renta, apareció "Falta información para
    postular" con las 4 preguntas y la de renta marcada; "Saltar esta oferta" no envió nada y el
    historial quedó con "Saltada: faltaban respuestas (pretensión de renta)".
- **Suites** (`node extension/verificar-*.js`): 10 suites, 704 comprobaciones, 0 fallos. Nuevas:
  `verificar-laborum.js` (26), que con la versión anterior falla en 8: el aviso de "terminado"
  mientras postula, la búsqueda part time en duda y la aprobada que se iba a un aviso relacionado;
  `verificar-computrabajo.js` (6) y las horas del título en `verificar-scorer.js` (15). El banco de
  casos del servidor (`scripts/verificar-banco-de-casos.ts`) sigue pasando.

## Lo que queda

- **Probar con la extensión real:** recargar la extensión en `chrome://extensions` y hacer una
  postulación de verdad en cada portal.
- **Pestañas de fondo lentas:** igual que en trabajando.com, Chrome estira los temporizadores de
  las pestañas que no se ven. Las esperas nuevas de Laborum usan el DOM, no pausas; las pausas que
  quedan (entre preguntas, antes de volver al listado) son de todos los portales.
