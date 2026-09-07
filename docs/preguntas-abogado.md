# Preguntas para el abogado — AutoPostula

> Preparado el 2026-09-04, contra el estado real del código.
> Acompaña a `/privacidad` y `/terminos`, que están actualizados a esa fecha.
>
> **Contexto en una frase:** extensión de Chrome + web que postula automáticamente a ofertas de
> empleo en Computrabajo y Laborum en nombre del usuario, usando su CV y respondiendo los
> formularios con IA. Suscripción mensual de $3.990 CLP vía Flow. Operado por persona natural.

Ordenadas por urgencia. Las de la sección A bloquean la publicación; las de B tienen plazo
legal encima; el resto son de riesgo, no de bloqueo.

---

## A. Lo que está literalmente sin resolver en el texto

### A1. Derecho a retracto

Es el único `[REVISAR CON ABOGADO]` que queda, en Términos §7.

- ¿Aplica el **art. 3° bis de la Ley 19.496** a una suscripción mensual digital contratada por
  medios electrónicos?
- Si aplica: ¿los 10 días corren desde la contratación o desde el primer cobro? ¿Se puede
  excluir si el servicio empieza a prestarse de inmediato con consentimiento expreso del
  usuario?
- ¿Qué política de reembolso conviene declarar, y con qué redacción exacta?

**Dato relevante:** hoy la cancelación opera al final del período ya pagado (el usuario
conserva el acceso hasta esa fecha y no hay cobros posteriores). No se devuelve dinero de
meses ya cobrados.

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
| Pago | ID de cliente en Flow, montos, fechas (**no** datos de tarjeta) |

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

5. **Ofertas revisadas.** Se guardan ofertas que el usuario **vio pero no postuló**, asociadas a
   su cuenta, y se purgan a los 90 días. ¿Es proporcional? ¿90 días es defendible?

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
   titulares. ¿Se pueden seguir nombrando "Computrabajo" y "Laborum" en la ficha de la Chrome
   Web Store y en la web, o hay que cambiar cómo se mencionan?

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

1. **Persona natural vs. SpA.** Hoy opera con RUT personal y cobra suscripciones. ¿Conviene
   constituir una SpA **antes** de tener usuarios pagando, por responsabilidad y por orden
   tributario?

2. **Boleta o factura.** ¿Qué hay que emitir por una suscripción mensual de $3.990 a persona
   natural, y con qué periodicidad? ¿Flow lo resuelve o es responsabilidad propia?

3. **IVA.** El precio se declara "impuestos incluidos". ¿Es correcto para este servicio?

4. **Inicio de actividades.** ¿Hace falta antes del primer cobro?

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
- Esta lista

Los dos textos están escritos contra lo que el código hace de verdad, no son plantillas. Si el
abogado cambia algo de fondo, hay que actualizar también la **ficha de la Chrome Web Store**,
que describe el mismo comportamiento.
