# Vender mejor, cobrar por créditos y rediseñar la experiencia — propuesta

> **Estado:** propuesta para discutir. Nada implementado.
> **Para:** Roberto y el chat de producción.
> **Fecha:** 2026-09-18.
> **Mockups:** lienzo **«Rediseño AutoPostula»** — https://claude.ai/artifact/TGUCCoDQ23S4d9gLKZJZYQ
> (privado; 13 pantallas, y debajo de cada una qué hay hoy, qué cambia y por qué).
> **Va después de:** los arreglos de `revision-2026-09-16.md`. Nada de esto sirve si el producto
> sigue postulando mal o diciendo cosas que no son ciertas.
> **Relacionado:** `rafagas-y-ponerse-al-dia.md` (la promesa de Premium y el plan gratis),
> `celular-y-escritorio.md`, `estado-real-de-postulaciones.md`, `banco-de-preguntas.md`.
> **Cómo se armó:** recorrido del sitio en producción el 2026-09-17 (landing y registro en computador
> y celular; el panel completo con la sesión del dueño, **solo lectura**, sin tocar ningún botón), el
> popup y el panel de revisión de la extensión leídos del código, y los sitios públicos de la
> competencia ese mismo día (Apéndice B).

---

## 0. Lo esencial

1. **Ya hay competencia directa, y más barata por volumen.** Postula Fácil cobra $3.990 al mes por
   unas 200 postulaciones; AutoPostula da 80 por el mismo precio. **Competir por volumen se pierde.**
2. **Lo que nadie más muestra es lo que AutoPostula ya tiene:** elegir a qué ofertas postular (y decir
   por qué) y postular sin que la persona apriete "enviar" en cada una. Eso es lo que hay que vender:
   *"No postula a todo. Postula a lo que te sirve."*
3. **Créditos sin suscripción, además del plan.** 1 crédito = 1 postulación **que llegó al portal**;
   si falla, vuelve sola. Y los créditos sirven de premio para conseguir justo los datos que hoy nadie
   entrega (referidos, perfil completo, resultados de postulaciones).
4. **"ATS" en Chile no es un robot leyendo tu PDF:** es el perfil dentro del portal, las preguntas de
   descarte y, en empresas grandes, su propio sistema (Buk y otros). Un **chequeo de CV gratis** es el
   gancho que funciona en el celular sin pedir la extensión.
5. **La experiencia hoy se siente como un panel de control.** La propuesta la convierte en una lista
   de tareas, con una extensión que casi no se ve y una razón visible para cada cosa que hace.

---

## 1. La competencia

Verificado en sus sitios públicos el 2026-09-17. Los precios y cifras son los que ellos publican.

| | Qué hace | Cómo cobra | Cómo convence |
|---|---|---|---|
| **Postula Fácil** | Extensión que llena formularios con IA en 20+ portales (LinkedIn, Laborum, Trabajando, Bumeran, Indeed…). La persona revisa y envía. CV "ATS", cartas, tests psicológicos, historial | $1.490 (~50), **$3.990 (~200)**, $9.990 (~700) al mes; plan agencias $350.000 al año. Devolución a 14 días | "3.000+ usuarios", 4,7/5, testimonios con cifras, bono de bienvenida |
| **CVListo** | CV optimizado para ATS por vacante, cartas, seguimiento, preparación de entrevista | **Créditos sin suscripción:** 1 gratis, 5 por $2.990, 15 por $4.990 | Honestidad: *"No inventamos experiencia"*, *"No prometemos entrevistas"* |
| **AITalnt** | CV adaptado por oferta, cartas, CV por voz, LinkedIn, preparación de entrevista | **Créditos que no vencen:** 1 por $990, 10 por $4.990, 25 por $9.990 | Antes/después de puntaje ATS, Ley 21.719 |

Y los portales se están moviendo solos: Laborum ya ofrece IA para completar el perfil al subir el CV.

**Conclusión.** Lo genérico (CV para ATS, cartas, llenar formularios) ya existe y se vende barato.
Lo propio de AutoPostula es **el criterio** (el scorer, "Por decidir", la ubicación declarada) y **la
autonomía** (postular sin estar mirando, y con las ráfagas, sin tener el computador prendido todo el
día). Todo lo que sigue apunta a hacer eso visible y confiable.

---

## 2. Cómo venderlo

### 2.1 El mensaje

| Hoy | Propuesta |
|---|---|
| *"Postula 80 veces al mes. Escribe una sola."* | *"No postula a todo. Postula a lo que te sirve."* |
| Vende volumen, y el número invita a comparar | Vende criterio: lo que la competencia no tiene |

El hero muestra **cómo decide**: una tarjeta con *"Revisé 20 ofertas: 4 te sirven, 3 las decides tú,
13 no calzan"*, cada una con su razón (lienzo, *Landing · computador*). La sección *"La misma
pregunta. Dos respuestas."* se queda: es buena.

### 2.2 Planes con nombre de situación

"Free / Premium" no dice nada. Nombres que describen la situación de quien busca trabajo, por ejemplo
**Explorando** (gratis) y **Buscando en serio** ($3.990), más **Sin suscripción** (créditos, §3). Los
textos de cada plan siguen lo que decidió `rafagas-y-ponerse-al-dia.md` §4–§5:

- Gratis: *"Entras al portal y la extensión postula por ti"* + *"Prueba: 5 postulaciones automáticas"*.
- Premium: *"Se pone al día sola cada vez que abres tu computador"*. Nunca más "cada 2 horas".

### 2.3 Prueba social real

La landing hoy muestra un tablero con números de ejemplo (76 enviadas, 7 finalistas). Reemplazarlo
por prueba real, **y dejar el espacio vacío hasta tenerla** (Ley 19.496, ver `revision-2026-09-16.md`
§3.3):

- Un video de 60 segundos de la extensión trabajando en un portal, de principio a fin.
- Testimonios con nombre y comuna, con permiso escrito.
- La nota en la Chrome Web Store.
- Cuántas postulaciones se han enviado, contadas en la base.

### 2.4 Decir lo que da confianza

Cuatro promesas, **cada una solo cuando sea cierta**:

| Promesa | Es cierta cuando |
|---|---|
| *"Nunca te pedimos la contraseña de los portales"* | Ya lo es: la extensión usa la sesión de la persona |
| *"No inventamos experiencia"* | `revision-2026-09-16.md` §8.4 hecho (dato faltante → se pregunta) |
| *"Tú decides cuánta libertad le das"* | `revision-2026-09-16.md` §2.10 hecho (la revisión no envía sola) |
| *"Solo pagas lo que llegó"* | Créditos (§3) + `revision-2026-09-16.md` §8.1 y §8.3 (✓ solo con evidencia del portal) |

Y preguntas frecuentes con los miedos reales: *¿me pueden bloquear la cuenta?* (respuesta revisada
con el abogado, `preguntas-abogado.md` §C), *¿qué pasa si la IA responde mal?*, *¿funciona en el
celular?*, *¿tengo que dejar el computador prendido?*, *¿puedo cancelar?*

### 2.5 Vender también a instituciones

Hay organizaciones que ya pagan por ayudar a gente a buscar trabajo:

- **OMIL** (oficinas municipales de intermediación laboral).
- **Empresas de outplacement**, contratadas por quien desvincula.
- **Institutos y universidades** (Duoc, INACAP y otros) con sus bolsas de empleo.

Licencias por volumen, con un panel para quien acompaña a esas personas (con su consentimiento).
Ingreso más estable que el de personas que dejan de pagar apenas encuentran trabajo. Postula Fácil ya
tiene un plan para agencias.

### 2.6 Referidos

Quien busca trabajo conoce a otros que buscan. *"Invita a alguien: +10 créditos para cada uno cuando
postule por primera vez"* (§3.3).

---

## 3. Créditos

### 3.1 Reglas

1. **1 crédito = 1 postulación que el portal confirmó.** Si falla o queda sin enviar
   (`revision-2026-09-16.md` §8.3), el crédito **vuelve solo**. Frase de venta: *"Solo pagas las
   postulaciones que llegaron."*
2. **Buscar nunca gasta:** escanear, puntuar, "Por decidir", solo observar y el chequeo de CV son
   gratis.
3. **Precio fijo por postulación, no por cantidad de preguntas.** `README.md` calcula ~US$0,58 de IA
   por usuario Premium al mes, o sea unos pocos pesos por postulación. Cobrar según las preguntas
   complica sin ganar nada. Lo que sí puede costar más créditos son las funciones grandes (CV adaptado
   por oferta, preparar entrevista).
4. **Se gasta primero lo que vence antes:** el cupo del mes antes que lo comprado.
5. **Lo comprado dura 12 meses** (o no vence: AITalnt ya ofrece créditos sin vencimiento).
6. **Premium compra más barato** (~40% menos).
7. **La prueba de 5 automáticas** (`rafagas-y-ponerse-al-dia.md` §4.1) sigue igual: cuenta dentro del
   cupo del mes, no de los créditos comprados.

### 3.2 Precios de ejemplo

Para conversar, no decididos. El plan de hoy (`lib/plans.ts`): gratis 20 al mes, Premium 80 al mes
por $3.990 (~$50 por postulación).

| | Precio | Por postulación | Con Premium |
|---|---|---|---|
| Pack 30 créditos | $1.990 | ~$66 | $1.190 (~$40) |
| Pack 70 créditos | $3.990 | ~$57 | $2.490 (~$36) |

El pack de 70 cuesta lo mismo que Premium **a propósito**: al lado, Premium se ve mejor (más
postulaciones y se pone al día sola), pero quien no quiere suscripción igual tiene opción.

**No bajar de ~$2.000 por compra:** cada una lleva comisión de Flow y, probablemente, boleta (ya está
en `preguntas-abogado.md:136`).

### 3.3 Créditos como premio

Lo que más vale de esta idea: los créditos pagan por **datos que hoy nadie entrega**.

| Acción | Premio | Qué resuelve | Contra el abuso |
|---|---|---|---|
| Invitar a alguien | +10 para cada uno | Crecimiento | Solo cuando el invitado verifica su correo **y** postula por primera vez |
| Completar licencias, certificaciones y renta | +5, una vez | La IA deja de dejar campos vacíos o inventar (`revision-2026-09-16.md` §8.4, §8.5) | Una sola vez por cuenta |
| Contar qué pasó con una postulación | +1 | El estado real (`estado-real-de-postulaciones.md` §6) | Máximo 10 al mes; solo postulaciones de más de 5 días |

### 3.4 Lo que no se hace

- **Cobrar por escaneo o por llamada de IA.** Costos que la persona no ve generan desconfianza.
- **Créditos que vencen rápido.** Mala fe y riesgo con SERNAC.
- **Cobrar por entrevista conseguida.** No se puede verificar, y premia esconderla.
- **Plan ilimitado.** Invita a llenar de postulaciones a los reclutadores (daña la reputación de la
  persona) y sube el riesgo de bloqueo en los portales.

### 3.5 Alternativa simple que vale la pena igual

**Premium de un mes sin renovación automática.** A mucha gente sin trabajo le asusta más el cobro
automático que el precio. Flow permite pagos únicos.

### 3.6 Cómo se implementaría (sugerencia)

- Un **libro de créditos** por lotes: cada entrada (plan del mes, compra, premio, devolución) es un
  lote con `cantidad`, `restantes` y `venceEn`; una postulación confirmada descuenta del lote que vence
  antes. El saldo que ve la persona es la suma de `restantes`, y el historial sale de los movimientos.
- Reemplaza el conteo de `lib/postulacion-limits.ts` (hoy cuenta `Application` por `enviadaEn` del
  mes) y lo usa `GET /api/extension/puede-postular` (`revision-2026-09-16.md` §1.3).
- Los packs necesitan pagos únicos de Flow (`lib/flow.ts` hoy solo usa clientes y suscripciones) y
  su confirmación por webhook antes de acreditar.

### 3.7 Para el abogado

Sumar a `preguntas-abogado.md`: boleta por cada compra de créditos, vigencia de créditos prepagados y
devolución de saldo no usado (Ley 19.496), y las bases de los premios por referidos.

---

## 4. ATS: qué filtra de verdad en Chile

### 4.1 Cómo se filtra

- **Computrabajo** tiene **preguntas de descarte** (*killer questions*: una respuesta equivocada te
  saca) y un **grado de adecuación** hecho con IA que compara el CV de la persona **en el portal** con
  el aviso (habilidades, experiencia, formación, palabras clave) y ordena a los postulantes.
- **Las empresas grandes** usan su propio sistema de selección. **Buk** es de los más usados en Chile
  y lee el texto del PDF o Word. Muchas de las ofertas que hoy terminan en *"redirige al portal de la
  empresa"* van a uno de esos.

### 4.2 Funciones

1. **Chequeo de CV al subirlo** (lienzo, *Chequeo de CV*). Hoy
   `backend/app/api/cv/upload/route.ts:34` guarda el texto extraído sin revisarlo: **si sale vacío, el
   CV es una foto o un escaneo que ningún sistema va a leer**, y eso ya se puede avisar sin IA. Se suman
   secciones, datos de contacto, fechas, una sola columna y largo. Puntaje y arreglos concretos. Gratis,
   desde el celular: es el gancho para publicidad.
2. **Palabras más pedidas del rubro, con datos propios:** *"En las ofertas de operario de bodega de
   este mes lo más pedido es grúa horquilla, picking y licencia D; tu CV menciona 2 de 10"*. Nadie más
   tiene ofertas de 3 portales. Requiere **guardar el texto del aviso**: hoy `JobOffer`
   (`backend/schema.prisma:451`) guarda título y empresa, y el detalle solo se guarda para las de "Por decidir".
   El texto lo escribe la empresa, no la persona (mismo criterio que `banco-de-preguntas.md` §9).
3. **Perfil del portal optimizado:** como Computrabajo ordena con el CV del portal, generar el texto de
   cada campo (título, resumen, cada experiencia) para copiar; más adelante, que la extensión lo llene
   con confirmación.
4. **Preguntas de descarte antes de postular:** si el aviso exige algo que la persona no tiene
   (licencia B), no se postula y se dice por qué. Con créditos se vende solo: *"no gastas postulaciones
   en ofertas donde te descartan de entrada"*.
5. **CV adaptado por oferta**, para las que usan sistema propio. Es lo que CVListo y AITalnt cobran por
   crédito; acá costaría varios créditos.

### 4.3 Reglas para el prompt de respuestas

En `backend/app/api/ai/procesar-postulacion/route.ts`. **Ojo:** el otro chat lo está cambiando (regla
1b, hechos verificables); coordinar antes de tocarlo.

- Usar **las palabras exactas del aviso** cuando sean ciertas ("manejo de caja", no "operación de punto
  de venta").
- El dato más fuerte, **en la primera frase**.
- Números y hechos antes que adjetivos.
- Pregunta de descarte: **sí o no primero**, después el contexto.
- **Renta líquida o bruta:** si el formulario pide bruto y la persona declaró líquido, convertir
  (AFP, salud, cesantía) o preguntar, y decirlo en la revisión. **Nunca bajar la pretensión por cuenta
  propia.**

---

## 5. La experiencia, pantalla por pantalla

### 5.1 Principios

1. **Lista de tareas, no tablero.** Quien busca trabajo necesita saber qué hacer hoy.
2. **La extensión casi no se ve.** El popup es un semáforo; la configuración vive en la web.
3. **Todo lo que hace tiene su razón a la vista,** y todo "sí" dice cuándo se envía.
4. **El celular decide, el computador trabaja** (`celular-y-escritorio.md` §2).
5. **Una sola fuente para cada cosa.** Un solo estado de "¿está postulando?", un solo lugar para lo
   que buscas, un solo lugar para los datos de la persona.
6. **Hablarle a quien busca trabajo, no al sistema** (§5.4).

### 5.2 Las pantallas

"Hoy" es lo que se vio en producción el 2026-09-17; parte ya lo está arreglando el otro chat.

| Pantalla | Hoy | Propuesta | En el lienzo |
|---|---|---|---|
| **Landing** | Vende volumen; tablero de ejemplo; sin prueba social ni preguntas frecuentes | Criterio, hero que muestra cómo decide, confianza, prueba real, créditos en precios, "Revisar mi CV gratis" | Landing · computador / celular |
| **Chequeo de CV** | No existe | Puntaje, arreglos, palabras del rubro, texto para el perfil del portal | Chequeo de CV (nuevo) |
| **Onboarding** | 8 pasos; la extensión es el paso 5 y en el celular es una pared | 5 pasos: CV · Qué buscas · **Tus ofertas** · Tu voz · Conectar. Ofertas reales antes de pedir la extensión; en el celular, enlace por correo o código de 5 letras | Onboarding · tus ofertas primero |
| **Inicio → Hoy** | 4 métricas, embudo, rosca por portal, números en cero o no ciertos; "En pausa" arriba y "activo" abajo | Tres tareas (por decidir, lo que no se envió, ¿supiste algo?), la última puesta al día, qué hizo, lo que buscas, sesión por portal | Hoy · el nuevo Inicio |
| **Por decidir** | Tarjeta centrada, razones con formato de sistema, botones chicos | Pensada para el pulgar: tiempo de viaje, chips, a favor / en contra, botones grandes, cuándo se envía | Por decidir · celular |
| **Postulaciones** | Estados del portal, INCOMPLETA en mayúsculas, sin enlace a la oferta | Estados en palabras, "No se envió" con motivo y arreglo, "¿supiste algo?" en la lista, panel con historia y respuestas | Postulaciones |
| **Plan y créditos** | Tabla de 7 filas, 4 de entrenar la IA o exportar CSV | Saldo y de dónde sale, reglas, plan, packs, premios, movimientos | Plan y créditos |
| **Popup** | 3 interruptores, estadísticas, filtros, perfil, información adicional, token, 3 botones | Semáforo: al día o no, qué hizo, qué necesita de ti, sesión por portal, "Ponerme al día ahora" | Extensión · popup |
| **En el portal** | Un aviso chico con conteos | Primera búsqueda: cada oferta etiquetada en el portal (te sirve / por decidir / no calza y por qué) y un panel que explica qué va a hacer | Extensión · primera búsqueda |
| **Revisión** | Editar a mano; a los 3 minutos envía sola (`core.js:1098`) | De dónde salió cada respuesta, corregir con un toque, dato faltante se pregunta y se guarda, nada se envía sin confirmar | Extensión · revisar antes de enviar |
| **Perfil y tu voz** | Tres entradas (Perfil, Conversación IA, Entrenar IA) y los datos para la IA en el popup | Una sección con pestañas; **"Información adicional" pasa del navegador al servidor** (Apéndice A.4) | Sin mockup |
| **Qué buscas** | "Filtros de búsqueda": objetivo con peso numérico, "Recompilar perfil", roles y señales con puntajes | Objetivo, ubicación (ya declarada, `372cce9`) y lo que la persona prioriza, en palabras. El perfil compilado se ve como resumen, sin puntajes | Sin mockup |
| **Portales y extensión** | "Conectado" es un flag; el token a mano | Sesión real por portal y "Conectar esta extensión" (`revision-2026-09-16.md` §4.4) | Sin mockup |

### 5.3 Menú nuevo

```
Hoy
Por decidir            (8)
Postulaciones
— Tu búsqueda —
Qué buscas
Portales y extensión
— Tú —
Perfil y tu voz
Preparar entrevistas
·
Plan y créditos        52
Ajustes
```

De 10 entradas en 3 grupos poco claros a 9 agrupadas por lo que la persona quiere hacer.

### 5.4 Palabras que salen de la interfaz

| Hoy | Cambia a |
|---|---|
| "el scorer" | AutoPostula |
| "banda gris" | Por decidir |
| "Recompilar perfil" | Actualizar |
| "INCOMPLETA" | No se envió |
| "Match promedio IA" | (se quita) |
| "Free / Premium" | Explorando / Buscando en serio |
| "calza con "vendedor" (vendedor)" | Es de ventas, lo que buscas |

---

## 6. Funciones nuevas

| Función | Qué es | Nota |
|---|---|---|
| **Preparar entrevista** | Cuando la persona cuenta que tiene entrevista: preguntas probables para el cargo, práctica por voz con comentarios, rango de sueldo del rubro, qué llevar | Ya existe el dictado (`lib/usar-dictado.ts`). Depende de `ENTREVISTA` (`estado-real-de-postulaciones.md` §6.3). Premium o créditos |
| **Avisos** | Resumen del día, ofertas por decidir con Sí / No en el mismo mensaje, resumen semanal | Correo primero (`rafagas-y-ponerse-al-dia.md` §3.8 ya propone uno); WhatsApp después: cobra por mensaje |
| **Sueldos del rubro** | *"Operario de bodega en la RM: entre $X y $Y líquidos"*, de las ofertas que publican sueldo | Siempre descriptivo, nunca causal (`banco-de-preguntas.md` §8). Sirve para contenido en Google |
| **Empresas bloqueadas** | *"Nunca postular a mi empresa actual"* | Clave para quien busca teniendo trabajo. Un veto más en el scorer |
| **Tiempo de viaje** | *"~20 min de tu casa"* en cada oferta, estimado por comuna | Sin API de mapas al principio: distancia entre comunas |
| **Tiempo ahorrado** | *"Te ahorramos unas 4 horas de formularios"* | Estimación rotulada como tal (preguntas respondidas × minutos por pregunta) |

---

## 7. Lo que NO se hace

- **Sumar portales.** Cada uno es mantención de selectores, y los tres de hoy recién se están
  arreglando.
- **Competir por volumen** ni ofrecer un plan ilimitado (§3.4).
- **Cobrar por éxito** (§3.4).
- **App nativa o extensión para Firefox** (ya descartado en `celular-y-escritorio.md` §7).
- **Leer Gmail** (ya descartado en `estado-real-de-postulaciones.md` §2).
- **Prometer en la landing algo que todavía no pasa** (§2.3, §2.4).

---

## 8. Orden

| # | Tarea | § | Depende de |
|---|---|---|---|
| **1** | Textos de landing, planes y preguntas frecuentes, solo con lo que ya es cierto | 2 | `revision-2026-09-16.md` §3.3; mismo deploy que los textos de `rafagas-y-ponerse-al-dia.md` §5 |
| **2** | Chequeo de CV: "se puede leer" + lista de revisión | 4.2 | — |
| **3** | Sacar las palabras de sistema de la interfaz | 5.4 | — |
| 4 | Inicio como lista de tareas + menú nuevo | 5.2, 5.3 | `estado-real-de-postulaciones.md` §6; `rafagas-y-ponerse-al-dia.md` §3.5 |
| 5 | Popup semáforo | 5.2 | `rafagas-y-ponerse-al-dia.md` §3.5–§3.6 |
| 6 | Revisión con un toque; dato faltante se guarda | 5.2 | `revision-2026-09-16.md` §2.10, §8.4; `banco-de-preguntas.md` §3 |
| 7 | Créditos | 3 | `revision-2026-09-16.md` §8.1 y §8.3 (confirmación del portal); abogado (§3.7) |
| 8 | Premios con créditos | 3.3 | 7; `estado-real-de-postulaciones.md` §6 |
| 9 | Primera búsqueda guiada en el portal | 5.2 | `revision-2026-09-16.md` §1.2 |
| 10 | Onboarding de 5 pasos con ofertas primero | 5.2 | `celular-y-escritorio.md` §4 y §5 |
| 11 | Palabras del rubro y sueldos | 4.2, 6 | Guardar texto y sueldo del aviso |
| 12 | Preparar entrevista | 6 | `estado-real-de-postulaciones.md` §6.3 |
| 13 | Avisos: correo, después WhatsApp | 6 | `rafagas-y-ponerse-al-dia.md` §3.8 |

Del 1 al 3 son baratos e independientes. El 7 **no puede salir antes** de que el ✓ de una postulación
dependa de la evidencia del portal: sin eso, "solo pagas lo que llegó" sería falso.

---

## 9. Criterios de aceptación

1. **Ninguna promesa de la landing sin respaldo:** cada frase de §2.4 se puede señalar en el código
   o en la base.
2. **Una persona en el celular obtiene algo útil sin instalar nada:** registro → chequeo de CV →
   ofertas que calzan, sin toparse con la extensión como requisito.
3. **Una postulación que no llegó devuelve su crédito,** y el movimiento aparece en *Plan y créditos*.
4. **Escanear, "Por decidir" y el chequeo de CV no descuentan créditos.**
5. **El popup no tiene interruptores de configuración.**
6. **Ninguna pantalla muestra "scorer", "banda gris", "recompilar" ni "INCOMPLETA".**
7. **Todo "sí" en "Por decidir" dice cuándo se envía.**

---

## Apéndice A — Hallazgos técnicos del 2026-09-17 (para el chat de producción)

Salieron del mismo recorrido. No son parte de esta propuesta, pero conviene que no se pierdan. Si ya
están resueltos, ignorar.

1. **La versión de la tienda seguía siendo ≤2.9.x.** Mientras no se publique la nueva, quien instala
   desde la tienda no tiene el modo prueba, y una cuenta sin perfil compilado cae al filtro viejo, que
   acepta todo. Parche solo de servidor: la versión vieja trae `palabrasIncluir` de
   `/api/extension/perfil` cada vez que se abre el popup; devolver una palabra imposible cuando no hay
   perfil compilado hace que el filtro viejo rechace todo. La versión nueva ya no usa `coincideFiltros`.
   Verificar contra la versión exacta de la tienda.
2. **Interruptor remoto.** Que la extensión mande su versión en cada llamada, y una ruta con versión
   mínima y "no postular" por portal. Si un portal se rompe, se apaga desde el servidor.
3. **Cinco interruptores para "¿está postulando?"** (popup: "Postulación automática" y "Solo
   observar"; panel: modo prueba, pausa y plan). El de "Postulación automática" del popup corta
   `escanear()` (`extension/adapters/computrabajo.js:669`) aunque el panel diga que está activo. Las
   ráfagas mejoran lo que se muestra, pero ese interruptor sigue decidiendo sin que el panel lo sepa.
4. **"Información adicional para la IA" vive solo en el navegador** (`extension/popup.js:299`, se lee
   en `extension/core.js:856`). Ahí va "tengo licencia clase B", justo lo que faltó en
   `revision-2026-09-16.md` §8.4. Se pierde al reinstalar o cambiar de computador y la web no lo ve.
   Pasarlo al servidor lo deja listo para `banco-de-preguntas.md` §5.
5. **"Conectado" en Portales no comprueba sesión.** La extensión ya detecta la pantalla de login en
   Trabajando (`extension/adapters/trabajando.js:655`); podría informar la sesión en los tres portales.
6. **Sin telemetría de fallos.** El log de la extensión queda en el navegador. Informar cómo terminó
   cada intento (confirmado por el portal / sin confirmación / pide iniciar sesión / selector no
   encontrado) con la versión, y una página de administración con el porcentaje de éxito por portal y
   por día, más un aviso si cae. Con el "✓ solo con evidencia" (`revision-2026-09-16.md` §8.1), habría
   mostrado desde el primer día que Trabajando tenía 0 postulaciones confirmadas.
7. **Sin embudo de activación.** Registro → CV → objetivo → extensión → primera postulación → Premium:
   casi todas esas fechas ya están en la base.

## Apéndice B — Fuentes (consultadas el 2026-09-17)

- Postula Fácil: https://www.postulafacil.cc/
- CVListo: https://cvlisto.cl
- AITalnt: https://aitalnt.cl
- Computrabajo para empresas, preguntas de descarte:
  https://blog-empresas.computrabajo.com/killer-questions-o-preguntas-de-filtrado/
- Computrabajo para empresas, filtros y grado de adecuación:
  https://blog-empresas.computrabajo.com/usa-filtros-de-computrabajo-para-encontrar-el-mejor-candidato/
- Buk, reclutamiento: https://www.buk.cl/productos/desarrollo-organizacional/reclutamiento-y-seleccion
- Laborum, perfil profesional con IA:
  https://www.laborum.cl/blog/buscar-trabajo/como-crear-un-perfil-profesional-con-ia-para-tu-cv-en-chile/
