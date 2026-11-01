# El chat de preguntas de Computrabajo — 2026-11-01

> **Estado:** implementado en `rama-roberto` (extensión 2.20.0), sin subir a la tienda.
> **Origen:** un video de Roberto del 2026-11-01 en Computrabajo: la extensión no postuló a la
> oferta que más le servía, contestaba mal y siempre lo mismo, y nunca le mostró la lista para elegir.
> **Relacionado:** `panel-de-revision-en-el-portal.md` §9.1, `creditos-y-pagina-nueva.md` §3.6
> (solo cobrar lo que llegó), `analisis-usuarios-2026-10-28.md`.

---

## 0. Lo esencial

1. **Computrabajo cambió la forma de postular el 2026-10-22.** En una oferta con preguntas,
   «Postularme» ya no muestra un formulario: abre «Preguntas de selección», un chat que pregunta de a
   una (`kq-conversational.bundle`). La extensión seguía esperando el formulario de antes.
2. **Por eso fallaba en tres cosas a la vez:** daba por enviada una postulación que no salió, leía
   como pregunta el texto gris de la casilla («Escribe tu respuesta aquí», el mismo para todas, de
   ahí las respuestas repetidas) y nunca apretaba la flecha para mandar la respuesta.
3. **La 2.20.0 contesta el chat como una persona**, y nada cuenta como enviado sin el
   «¡Te postulaste correctamente!» de Computrabajo.
4. **La lista para elegir pasa a ser lo normal** cuando la persona está mirando el portal.

---

## 1. Lo que mostró el video

| Momento | Qué pasó |
|---|---|
| 1:12 | Marcas en cada oferta y el aviso «3 postuladas · 17 descartadas», antes de enviar nada |
| 1:22 | Calzado deportivo: se abre el chat, la extensión dice «✓» y sigue. No se envió, pero quedó como enviada en el historial |
| 1:30 | Otra oferta sin preguntas: «¡Te postulaste correctamente!» (esas sí funcionaban) |
| 2:30 | «Indique comuna de residencia»: la ventana «Falta información» muestra como pregunta «Escribe tu respuesta aquí» |
| 2:56 | «¿Cuántos años de experiencia tienes en ventas?…»: escribe un párrafo genérico cortado en «…porque», no lo manda y pasa a la siguiente |

En ningún momento apareció la lista con casillas: la cuenta estaba en modo postular, sin «Revisar
antes de enviar», y en ese modo la extensión enviaba sola.

---

## 2. Cómo es el chat por dentro

Leído en el sitio real el 2026-11-01, en un marco sobre `robots.txt` del Chrome de Roberto (la
extensión instalada no corre en marcos), apretando «Postularme» en la oferta de calzado sin escribir
ni enviar nada.

```
div[data-offers-grid-apply-container]
  div.box_answer.boxIA[box-answer]
    form[form-apply-kq][data-num-kq=5]            ← sigue siendo un formulario
      div[data-step=1][data-div-kq-id=…][data-kq-text]    (field_textarea; los demás con .hide)
        label[data-kq-question-text="…"]          ← la pregunta completa, desde el principio
        input[type=hidden][name=<id>][data-kq-answer-hidden]   ← ahí queda la respuesta
      div[data-step=2][data-kq-radio]             (field_radio_box)
        div.group.hide[data-kq-question-radio]  >  label.radio > input[type=radio] + span.label_box
  div#kq-ia-suggestions.hide                     ← respuestas que sugiere la IA de Computrabajo
  div.box_send[show-question]
    textarea#inputText[answer-kq]                 ← «Escribe tu respuesta aquí»
    span.icon.i_arrow_up[icon-arrow]              ← la flecha
  div.box_send.hide[show-btn-apply]
    a[data-apply-ac-kq]                           ← «Enviar mi CV», recién al final
```

Cómo avanza (del código de `kq-conversational.bundle.min.js`):

- La pregunta se «escribe» con una animación; mientras tanto el envío está bloqueado.
- La flecha solo envía con la clase `send`, que Computrabajo pone cuando la casilla tiene texto y la
  pregunta terminó de escribirse (evento `input`). Enter sin Shift hace lo mismo.
- Al enviar guarda el texto en el campo oculto del paso, le pone `data-kq-response` y muestra el
  paso siguiente quitándole `hide`.
- Las de opciones se contestan con un clic en la opción: guarda y avanza sola.
- Contestada la última, aparece «Enviar mi CV».

---

## 3. Lo que se arregló (extensión 2.20.0)

Todo en `extension/adapters/computrabajo.js`, sección «El chat de preguntas».

- **Nada es «enviado» sin la confirmación.** Después de «Postularme» se espera a ver qué pasa (la
  confirmación, el chat o el formulario de antes, hasta 15 s) en vez de mirar una sola vez a los 2 s.
  Sin confirmación, la postulación queda «por terminar» en el panel, con el enlace y el motivo, y no
  cuenta en el mes. Lo mismo después de «Enviar mi CV» en el formulario de antes.
- **La pregunta de verdad.** Se leen todos los pasos de una vez (`label[data-kq-question-text]`) y la
  IA recibe las 5 preguntas reales en una sola llamada, con las opciones de las que las tienen.
- **Contesta el chat:** escribe en la casilla, espera a que la flecha acepte y la aprieta; en las de
  opciones hace clic en la elegida; sigue el orden en que el chat las muestra (si una respuesta hace
  saltar preguntas, no las espera) y al final aprieta «Enviar mi CV». `AP.latido()` en cada paso,
  para que el tope de 90 s de una pestaña de la cola no la cierre a la mitad.
- **Lo que la IA no sabe se le pregunta a la persona** con la ventana «Falta información para
  postular», ahora con las preguntas de verdad. En el chat también lo que quedó vacío: una respuesta
  en blanco no se puede mandar.
- **Respuestas más cortas:** regla 8 del prompt (`procesar-postulacion`): un dato puntual (correo,
  teléfono, comuna, días) se contesta solo con el dato. Y `AP.limitarTexto` corta en la última
  oración completa, no a la mitad de una frase.
- **El aviso ya no dice «3 postuladas» antes de postular:** dice «3 por postular».

## 4. La lista para elegir, por defecto

Lo decidió Roberto el 2026-11-01. Con la pestaña a la vista, la extensión marca, propone en la
tarjeta del final y envía solo lo que la persona marque en la lista (`AP.proponeEnVezDeEnviar`, que
antes exigía «Revisar antes de enviar»). En las ráfagas y en las pestañas de fondo, que nadie mira,
sigue enviando sola. «Revisar antes de enviar» sigue mostrando cada postulación antes de enviarla.

Quedó para después el atajo «Postular sin preguntarme» que se conversó: necesita un ajuste nuevo
guardado en el servidor, y hoy nadie lo pidió.

---

## 5. Cómo se verificó

- **El chat real, leído sin tocarlo** (§2), en el Chrome de Roberto.
- **`extension/verificar-chat-computrabajo.js`** (nuevo, en navegador): una copia del chat con el
  mismo HTML y el mismo comportamiento, con `core.js` y el adaptador reales. 7 escenas: chat de 5
  preguntas, opciones primero, chat que tarda 1,8 s (el caso del calzado), postulación directa,
  portal que no responde, dato que falta y chat que no acepta. Las 7 pasan, y rompiendo a propósito
  la detección del chat fallan las que tienen preguntas.
- **Las 14 verificaciones de Node** siguen pasando (1.077), con la de Laborum ajustada: lo que abre
  avisos para postularlos ahora se prueba en una pestaña de fondo, y se agregó que con la persona
  mirando propone y no abre nada.

- **Los tres portales, en el Chrome de Roberto** (el mismo día, a pedido suyo): el código de la
  2.20.0 corriendo en un marco de cada portal sobre `robots.txt`, con un `chrome` falso que nunca
  deja postular (el cupo siempre en cero) y la pestaña «a la vista».

  | Portal | Listado y marcas | Lista para elegir | Paso de preguntas |
  |---|---|---|---|
  | Computrabajo | 18 marcadas; 1 te sirve | «Hay una oferta que te sirve. No la envío hasta que me digas»; la lista con la de calzado marcada | Cambió al chat (§2): lo arregla la 2.20.0 |
  | Laborum | 20 marcadas; no abre ningún aviso | «Hay 18 ofertas que te sirven…» | Sin cambios: su código sigue armando el modal `form#form-preguntas` con el botón `form: 'form-preguntas'` |
  | Trabajando | 15 marcadas | «Hay 15 ofertas que te sirven…»; la lista con 15 casillas | Sin cambios: «Comenzar», «Confirma tu postulación al cargo» y «¡Has postulado al empleo!», los mismos textos que busca el adaptador |

  Ninguno pidió postular; la única consulta de cupo fue la de la lista al abrirse. Laborum y
  Trabajando se revisaron en su código actual, sin apretar «Postular»: en esos dos, una oferta sin
  preguntas se envía con ese mismo clic.

**Lo que no se probó:** enviar una postulación de verdad por el chat real. Contestar ahí ya es
mandar datos al portal, así que espera el permiso de Roberto.

---

## 6. Pendiente

1. **Una postulación real por el chat**, con permiso, para confirmar la flecha y la confirmación
   contra el sitio y no contra la copia.
2. **Subir la 2.20.0** y **mergear** (la regla 8 del prompt es del servidor).
3. **El historial de Roberto** tiene como enviada la oferta de calzado que no salió (del 2026-11-01).
4. **Idea:** Computrabajo ya trae sus propias respuestas sugeridas (`#kq-ia-suggestions`). Podrían
   servir de respaldo cuando la IA nuestra no sabe un dato simple, como el correo.
5. **Para que no vuelva a pasar sin que nadie se entere:** un portal cambió su formulario y la
   extensión siguió diciendo «✓» por diez días. Con la 2.20.0 eso queda como «por terminar» con el
   motivo; contar esas en la pantalla de admin (`pendientes-de-lanzamiento-2026-10-07.md` §3) avisaría
   el próximo cambio el mismo día.
