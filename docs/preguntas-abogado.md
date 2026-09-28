# Preguntas para el abogado — AutoPostula

> Preparado el 2026-09-04 y **actualizado el 2026-09-19**, contra el estado real del código.
> Acompaña a `/privacidad` y `/terminos` (versión del 13-09) y a su versión en Word/PDF en `docs/legal/`.
>
> **Contexto en una frase:** extensión de Chrome + web que postula automáticamente a ofertas de
> empleo en Computrabajo, Laborum y Trabajando.com en nombre del usuario, usando su CV y
> respondiendo los formularios con IA. **Premium pasa de suscripción mensual a pases prepagados
> de 30 y 90 días vía Flow, sin renovación automática** (ver §E y `pase-prepagado.md`). Operado
> por persona natural.

> ⚠️ **Cambio del 2026-09-24:** además de los pases, se decidió vender **créditos**: paquetes de
> pago único (20 por $1.990, 50 por $3.990) donde **1 crédito = 1 postulación que llegó a la
> empresa**, que **no vencen** y que también se regalan como premio por invitar a alguien. Las
> preguntas están en §A3 y §E6. Ver `creditos-y-pagina-nueva.md`.

> ⚠️ **Cambio del 2026-09-19:** los Términos publicados todavía describen una suscripción mensual
> con renovación automática. Se van a reescribir para pases (`pase-prepagado.md` §8). Conviene que
> el abogado revise §6 y §7 de los Términos **pensando en pases**, no en la suscripción.

Ordenadas por urgencia. Las de la sección A bloquean la publicación; las de B tienen plazo
legal encima; el resto son de riesgo, no de bloqueo.

---

## A. Lo que está literalmente sin resolver en el texto

### A1. Derecho a retracto y devolución

La página publicada ya no tiene la nota de borrador (se reemplazó el 13-09 por una remisión a la
Ley 19.496). La cláusula de devolución está **en borrador** en `docs/legal/` (Términos §7.2) y hay
que reescribirla para pases.

**Cómo es ahora el producto:** un **pago único** por un pase de 30 días ($3.990) o de 90 días
(propuesta: $9.990). **No se renueva solo**: al vencer, la cuenta vuelve al plan gratis. Comprar
con un pase vigente suma días al final. El servicio empieza a prestarse apenas se acredita el pago.

- ¿Aplica el **art. 3° bis de la Ley 19.496** a un pase digital prepagado contratado por medios
  electrónicos? ¿Cambia la respuesta respecto de una suscripción mensual?
- Si aplica: ¿se puede excluir con consentimiento expreso, dado que el servicio empieza de
  inmediato? ¿O conviene declarar una devolución voluntaria? El borrador proponía **devolver el
  100% del primer cobro dentro de 14 días**; ¿cómo debería quedar para pases (solo el primer pase,
  cualquier pase, proporcional a los días usados)?
- **Borrar la cuenta con un pase vigente:** los Términos §13 prometen devolver la parte
  proporcional **cuando AutoPostula cierra la cuenta** (salvo incumplimiento grave). ¿Qué
  corresponde cuando es **la persona** la que borra su cuenta con días pagados sin usar?
- ¿Hay obligación de **avisar antes del vencimiento**? El diseño avisa por correo 5 días antes, 1 día
  antes y al vencer.
- ¿Qué redacción exacta conviene para todo lo anterior?

### A3. Créditos prepagados

**Cómo funciona:** paquetes de pago único —20 créditos por $1.990, 50 por $3.990—. Un crédito se
descuenta solo cuando se envía una postulación y **solo después** de agotar el cupo del mes que ya
venía con el plan. Si la postulación no llegó a la empresa, no se cobra; y si se cobró y después se
supo que no llegó, se devuelve el crédito (no el dinero). **Los créditos no tienen vencimiento.**
También se entregan gratis como premio: +10 por cada persona invitada que verifica su correo y +5,
una sola vez, por dejar el perfil completo.

- ¿Aplica el **art. 3° bis de la Ley 19.496** a un paquete de créditos? Si la persona ya gastó 3 de
  20, ¿la devolución es a prorrata, total, o se entiende que ejerció el servicio?
- **No vencen.** ¿Compromete eso a algo a futuro? Si más adelante se quisiera poner vencimiento,
  ¿se puede aplicar solo a los créditos nuevos?
- **Cuenta borrada con saldo.** Si alguien borra su cuenta con 40 créditos comprados sin usar,
  ¿hay que devolver dinero, o basta con advertirlo de forma clara antes de borrar?
- **Premios por invitación.** Entregar créditos con valor de mercado sin cobrarlos: ¿es una
  promoción que necesita bases? ¿Tiene algún efecto tributario?
- ¿Cómo debe quedar redactado en los Términos que **un crédito se consume solo si la postulación
  llegó**, sin que eso se lea como una garantía de resultado (no se promete respuesta ni empleo)?

### A2. Cláusula de limitación de responsabilidad

Términos §11 limita la responsabilidad al monto pagado en los últimos 3 meses.

- ¿Es **exigible en Chile frente a un consumidor**, o cae en cláusula abusiva del art. 16 de la
  Ley 19.496?
- Si no es exigible, ¿qué redacción sí lo sería, o conviene sacarla?

Es probable que esta cláusula, tal como está, no aguante. Preferible saberlo antes que después.

---

## B. Datos personales — tiene plazo encima

La **Ley 21.719** entra en vigencia a fines de 2026. Es bastante más exigente que la 19.628.

### B1. Qué se recolecta hoy

| Dato | Detalle |
|---|---|
| Identificación | Nombre, correo, teléfono, comuna, **RUT** |
| CV | Texto completo extraído del PDF (el PDF no se guarda) |
| Perfil laboral | Cargo objetivo, expectativa de renta, disponibilidad, experiencia |
| Conversación con IA | Objetivo laboral, motivaciones, fortalezas |
| Postulaciones | Ofertas, respuestas enviadas, estados |
| Ofertas revisadas | Título, empresa, enlace de ofertas **que el usuario no postuló** |
| Preferencias | Sí/no del usuario sobre qué ofertas le interesan |
| Respuestas | La que propuso la IA, la que se envió y si el usuario la editó |
| Soporte | Mensaje, adjuntos, nombre y correo; llegan por correo y **no** quedan en la base de datos |
| Dictado por voz | AutoPostula no recibe el audio, pero **Chrome lo manda a Google** para transcribirlo |
| Pago | Número de orden de Flow, monto, fecha y estado (**no** datos de tarjeta; con pases ya no hay ID de cliente en Flow) |

### B2. Preguntas

1. **Base de licitud.** ¿Consentimiento, ejecución de contrato, o mezcla? ¿Hace falta un checkbox
   separado al registrarse, o basta con aceptar los términos?

2. **El CV como dato sensible.** Un CV puede contener sin querer datos de salud, afiliación
   sindical, nacionalidad o situación de discapacidad. ¿Eso convierte el tratamiento en
   tratamiento de datos sensibles bajo la 21.719, con las exigencias reforzadas que eso implica?

3. **RUT.** ¿Requiere algún tratamiento especial, o basta con declararlo?

4. **Transferencia internacional.** El CV y el perfil se envían a la **API de Anthropic (Estados
   Unidos)** para generar las respuestas. ¿Qué exige la 21.719 para esa transferencia — cláusulas
   contractuales tipo, consentimiento expreso, algo más? ¿Basta con declararlo en la política?

5. **Ofertas revisadas.** Se guardan las ofertas que la extensión vio (título, empresa, enlace y
   portal) **aunque el usuario no postulara**. Las que no postuló ni decidió **no quedan asociadas
   a su cuenta** (la tabla no guarda el usuario), y se purgan a los 90 días con un proceso diario.
   ¿Es proporcional? ¿90 días es defendible?

6. **El diccionario de cargos.** Se guardan títulos de avisos públicos (ej. "Vendedor part time
   Ñuñoa") **sin ninguna asociación a usuarios**, y no se borran al eliminar la cuenta.
   ¿Confirmas que eso no es dato personal y puede conservarse?

7. **Encargado de prevención / registro.** ¿Un servicio de este tamaño necesita designar
   encargado de protección de datos o inscribirse en algún registro bajo la 21.719?

8. **Borrado.** Hoy el borrado de cuenta es inmediato y en cascada. ¿Es suficiente, o hay que
   conservar algo por obligación legal?

---

## C. Automatización sobre portales de terceros

Este es el riesgo estructural del producto y conviene entenderlo bien.

1. **Responsabilidad frente al usuario.** Si Computrabajo suspende la cuenta de un usuario por
   usar la herramienta, ¿el descargo de Términos §4 es suficiente, o AutoPostula responde igual?

2. **Responsabilidad frente al portal.** ¿Hay riesgo de que Computrabajo o Laborum accionen
   contra AutoPostula —competencia desleal, inducción al incumplimiento de sus términos, uso no
   autorizado— considerando que la herramienta **opera dentro de la sesión del propio usuario**
   y no accede a los portales desde servidores propios?

   > Dato para el abogado: se intentó una vez un acceso automatizado desde servidor y
   > Computrabajo respondió con bloqueo (HTTP 403). Se descartó de inmediato y **no se volvió a
   > intentar ni se eludió el bloqueo**. Hoy todo el acceso ocurre en el navegador del usuario,
   > con su sesión y a velocidad humana.

3. **Uso de marcas.** Los términos dicen que no hay afiliación y que las marcas son de sus
   titulares. ¿Se pueden seguir nombrando "Computrabajo", "Laborum" y "Trabajando.com" en la ficha
   de la Chrome Web Store y en la web, o hay que cambiar cómo se mencionan?

---

## D. Responsabilidad por el contenido que genera la IA

1. Si la IA redacta algo inexacto en una postulación y la persona es contratada o desvinculada
   por eso, ¿quién responde?

2. ¿Es suficiente el diseño actual para radicar la responsabilidad en el usuario?
   - **Modo revisión:** el usuario puede leer y editar cada respuesta antes del envío.
   - **Banda gris:** las ofertas dudosas **no se postulan solas** — quedan esperando que el
     usuario las apruebe una por una.
   - Los términos ya dicen que las respuestas se envían en su nombre y bajo su responsabilidad.

3. ¿Conviene hacer el modo revisión **obligatorio las primeras N postulaciones**, como protección
   adicional?

---

## E. Estructura y tributación

> **Lo que cambió el 2026-09-19 y por qué.**
> - El **Cargo Automático de Flow** (cobro recurrente a tarjeta, la base de cualquier suscripción)
>   es **solo para empresas**. Exige cuenta corriente a nombre de una empresa con RUT en el SII, un
>   giro que ampare el servicio, y datos de facturación del mismo RUT. Para personas naturales,
>   Flow dice que no está disponible.
> - Por eso se decidió cobrar como **persona natural con pases prepagados** (pago único, sin
>   renovación), y dejar la suscripción para cuando exista una empresa.
> - Según Flow, **desde abril de 2025 toda plataforma de pago debe exigir el inicio de actividades**
>   y el cumplimiento tributario. Así que el inicio de actividades es obligatorio de todos modos,
>   con cualquier pasarela.

1. **Inicio de actividades como persona natural.** ¿En qué categoría y con qué giro, para vender
   por internet un servicio digital por suscripción o por pase? ¿Qué régimen tributario conviene?
   ¿Qué obligaciones mensuales y anuales trae (declaraciones, libros)?

2. **Boleta.** Con inicio de actividades, ¿hay que emitir una boleta electrónica por **cada pase
   o paquete de créditos** vendido a persona natural? ¿Sirve el sistema gratuito del SII venta por venta, o conviene un
   proveedor que se integre por API? ¿Flow emite algún documento que lo reemplace?

3. **IVA.** Los precios ($3.990 y $9.990) se publican "impuestos incluidos". ¿Corresponde IVA a
   este servicio y está bien declararlo así?

4. **¿Cuándo pasar a SpA?** Se mantiene la idea de constituir una SpA cuando haya tracción, lo que
   además permitiría volver a la renovación automática con Flow.
   - ¿Hay un umbral (ventas, número de usuarios) a partir del cual conviene?
   - ¿Conviene **antes**, por responsabilidad, considerando que la herramienta envía postulaciones
     **en nombre de terceros** y que el patrimonio personal queda expuesto?
   - Al pasar a SpA: el responsable del tratamiento de datos y la parte de los Términos cambian de
     la persona natural a la empresa. ¿Qué hay que hacer con los usuarios que ya aceptaron los
     documentos con el responsable anterior?

5. **Renovación automática futura.** Cuando exista la SpA y se vuelva a cobrar con renovación
   automática, ¿qué exige la Ley 19.496 (consentimiento, avisos previos al cobro, cancelación)?

6. **Créditos: cuándo nace el hecho gravado.** Un paquete de créditos se paga hoy y se consume de a
   poco, quizás meses después, y puede no consumirse nunca. ¿El ingreso se reconoce al momento del
   pago o a medida que se usan? ¿Cambia algo que **no tengan vencimiento**? ¿Y los créditos que se
   regalan como premio (§A3), que tienen precio de lista pero no generan pago?

---

## F. Un par de cosas menores

1. **Mayores de 18.** Los términos exigen 18+. En Chile se puede trabajar desde los 15 con
   restricciones. ¿Excluir menores genera algún problema, o es lo correcto?

2. **SERNAC.** ¿Hay que registrar algo, o basta con mencionar la vía en los términos?

3. **Aviso de cambios.** Hoy se promete avisar los cambios de términos con 15 días y los de
   precio con 30. ¿Son plazos suficientes?

---

## Qué llevar impreso

- `autopostula.cl/privacidad`
- `autopostula.cl/terminos`
- `docs/legal/`: los dos documentos en Word y PDF (versión del 13-09), con el resumen de cambios
  al inicio y el borrador de devolución (Términos §7.2)
- `docs/pase-prepagado.md` §1 y §8: por qué se cambió a pases y qué textos cambian
- Esta lista

Los dos textos están escritos contra lo que el código hace de verdad, no son plantillas. Si el
abogado cambia algo de fondo, hay que actualizar también la **ficha de la Chrome Web Store**,
que describe el mismo comportamiento.
