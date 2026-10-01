# Revisión del scorer — 2026-09-30: compuertas, relevancia y preferencias

> **Estado:** ✅ implementado en `rama-roberto` el 2026-09-30, con las correcciones de una segunda
> revisión (marcadas **Corrección** en el texto) y dos problemas que faltaban (§2.4 y §2.5). Lo que
> quedó hecho, cómo se prueba y lo que falta: §11. Sale de una pregunta de Roberto: *"la lógica de
> filtrado no está funcionando muy bien, dale una vuelta"*.
> **Para:** el chat de producción.
> **Método:** se corrió el `extension/core.js` real (cargado en Node con el mismo arnés de
> `extension/verificar-scorer.js`) contra casos armados a mano. Los de §2 son reproducibles y
> quedaron como pruebas de regresión.
> **Relacionado:** `rediseno-filtrado-ofertas.md` §6 (el scorer), `amplitud-de-busqueda.md` §2 y §6
> (los arreglos de septiembre), `revision-scorer-2026-09-04.md` (la revisión anterior).

---

## 0. Lo esencial

1. **El scorer suma tres cosas que no se pueden sumar**: si el aviso *es lo que busco* (el rol), si
   *puedo tomarlo* (comuna, jornada, vetos, requisitos) y *cuánto me gusta* (las señales). Las tres
   terminan en el mismo número, y por eso una tapa a la otra.
2. **Tres fallas concretas, verificadas** (§2.1 a §2.3): dos palabras del gusto de la persona
   convierten un aviso ajeno en postulación automática; una señal tapa el "no sé dónde queda"; y una
   señal negativa fuerte se desactiva sola justo donde siempre aparece, en la descripción. **Y dos
   más** que encontró la segunda revisión (§2.4 y §2.5): las señales calzan con palabras que no son,
   y una oferta que solo dice "Región Metropolitana" queda como "no sé dónde queda".
3. **Tres reglas lo arreglan** (§4), ninguna grande, y las tres se pueden probar con los casos de
   §2 convertidos en tests.
4. **Lo que de verdad falta es medir** (§6). `DecisionOferta.scoreLocal` + `veredicto` es,
   literalmente, el scorer contra el humano para cada oferta dudosa. Con eso "no funciona muy bien"
   pasa a ser una cifra, y el umbral deja de ser una constante igual para todos.
   **Corrección:** para *volver a correr* el scorer sobre esas decisiones (§6.2) faltaban datos —
   la ubicación de la oferta, el aviso y la versión del perfil no se guardaban—. Desde ahora se
   guardan.

---

## 1. Lo que está bien y no hay que tocar

Para que no se pierda en la lista de problemas:

- **La normalización de patrones** (`backend/lib/normalizar-patron.ts`). Y el criterio de
  todo-o-nada: no partir *"retail genérico sin especialidad en moda/vestuario/calzado"* en
  fragmentos, porque dejaría vetos sobre "vestuario" y "calzado" con el sentido invertido.
- **"El título manda" en la jornada.** El caso de Sodimac publicando *"Jornada PT20 hrs"* en el
  título con la ficha diciendo "Jornada Completa" está bien resuelto.
- **Las razones estructuradas**, con el término y el campo donde calzó. Es lo que permite
  explicarle a la persona por qué, y es la base del principio 5.
- **La ubicación como descarte duro** cuando la comuna se reconoce y está fuera de lo declarado.
  Eso está bien: el problema es el otro camino, cuando no se reconoce (§2.2).

---

## 2. Lo que falla

Perfil usado en los casos:

```js
const perfil = {
  roles:  [{ canonico: 'vendedor', sinonimos: [], peso: 1.0 }],
  vetos:  [],
  senales: [{ patron: 'part time', delta: 25 }, { patron: 'comisiones', delta: 25 }],
  ubicacion: { comunas: ['nunoa'], aceptaRemoto: false },
  jornada: 'cualquiera',
};
```

### 2.1 Dos palabras del gusto convierten un aviso ajeno en postulación automática

```
titulo: "Bodeguero Part Time con comisiones"
cuerpo: "El bodeguero coordina con el vendedor de turno"
ubicacion: "Ñuñoa, R.Metropolitana"

→ POSTULAR, score 80   (razones: rol, senal, senal)
```

El rol `vendedor` calza **solo en el cuerpo**, y de pasada: el aviso es de bodeguero. Eso vale
`1.0 × 100 × 0.3 = 30`. Las dos señales del título suman 50. Sin esas dos palabras, el mismo aviso
se descarta con 30.

Es el **bug de polaridad** que este scorer vino a arreglar (`revision-scorer-2026-09-04.md`),
entrando otra vez, ahora por las señales.

### 2.2 Una señal tapa el "no sé dónde queda"

```
"Vendedor de tienda",            ubicacion: "Gran Santiago"  → GRIS,     score 60
"Vendedor de tienda part time",  ubicacion: "Gran Santiago"  → POSTULAR, score 85
```

No poder leer la comuna resta 40. Una señal en el título devuelve 25. El resultado es que **la duda
sobre dónde queda el trabajo se compensa con una palabra que no tiene nada que ver**.

### 2.3 Las señales negativas se desactivan solas

```
senales: [{ patron: 'comision pura', delta: -40 }]
titulo: "Vendedor de tienda"
cuerpo: "Renta: comision pura sin sueldo base"
ubicacion: "Ñuñoa, R.Metropolitana"

→ POSTULAR, score 88.  El -40 se aplicó como -12.
```

> **Corrección:** la primera versión de este caso no traía la ubicación, y así da **GRIS 48**, no
> "POSTULAR 88" (la comuna ilegible resta 40). Copiado tal cual como prueba, pasaba sin arreglar
> nada. Con la ubicación sí reproduce.

Desde `da9245e` las señales se multiplican por el campo donde calzan (título ×1, empresa ×0,35,
cuerpo ×0,3). La intención era correcta —que un calce débil pese menos—, pero **las condiciones de
renta, turnos y contrato viven siempre en la descripción, nunca en el título**. Justo lo que la
persona dijo que no quiere es lo que queda diluido a un cuarto.

### 2.4 Las señales calzan con palabras que no son *(segunda revisión)*

```
roles:   [{ canonico: 'vendedor', peso: 0.6 }]
senales: [{ patron: 'moda', delta: 20 }]
titulo:  "Vendedor"
cuerpo:  "Atiende de modo cordial"

→ POSTULAR, score 66.  "modo" contó como "moda".
```

Las señales se buscaban con la misma flexión que los roles: masculino, femenino y plural, para que
"vendedor" encuentre "vendedora". En un cargo eso está bien; en una señal cambia la palabra:
**"moda" calzaba con "modo" y "calzado" con "calzada"** (la de la dirección). Era el perfil real de
Roberto: una oferta en 60, en Por decidir, subía a 66 y se postulaba sola por una frase de cortesía.
Es el mismo tipo de error que §2.1: una palabra suelta empuja una oferta al otro lado del umbral.

### 2.5 "Región Metropolitana" es "no sé dónde queda" *(segunda revisión)*

Muchos avisos no dicen la comuna: dicen *"Región Metropolitana"*, *"R.Metropolitana"*, *"Gran
Santiago"* o *"Región V"*. El scorer solo reconocía comunas, así que todos esos restaban 40 como
ubicación ilegible. Quien declaró **toda la RM** (es el caso de Roberto) los veía en Por decidir o
descartados, aunque calzan; y quien declaró solo Ñuñoa veía como "no sé" un aviso de Valparaíso.
Con la regla §4.2, además, quedarían **para siempre** en Por decidir.

---

## 3. El diagnóstico

Tres preguntas distintas terminan en el mismo número:

| Pregunta | Quién la responde hoy | Qué forma debería tener |
|---|---|---|
| ¿Es lo que busco? | roles | Un puntaje de 0 a 100 |
| ¿Puedo tomarlo? | ubicación, jornada, vetos, requisitos | Una **compuerta**: pasa / no sé / no pasa |
| ¿Cuánto me gusta? | señales | Mueve **dentro** de una banda, nunca entre bandas |

La ubicación es el ejemplo más claro de la mezcla: es **mitad compuerta** (comuna reconocida y
fuera de lo declarado → descarta) y **mitad puntaje** (comuna no reconocida → −40). Esa mitad
puntaje es la que cualquier otra cosa puede devolver.

---

## 4. Las tres reglas

### 4.1 Un rol que solo calza en el cuerpo no puede postular solo

Si el mejor calce de rol fue en el **cuerpo**, la banda máxima es **gris**, pase lo que pase con el
puntaje.

Un cargo mencionado de pasada en la descripción es una pista, no una afirmación. Con esto el caso
§2.1 pasa a "Por decidir", que es exactamente donde corresponde: la persona mira el aviso y en dos
segundos ve que es de bodega.

No se baja el multiplicador de 0,3 a cero: una mención en el cuerpo **sí** sirve para no descartar.
Lo que no sirve es para enviar.

*Implementado:* también cuando el mejor calce fue en el **nombre de la empresa** (una empresa que se
llama "Vendedores Unidos" no dice nada del cargo). No aplica en el modo abierto, donde el rol no es
el eje. La razón nueva, `rol_fuera_del_titulo`, va primera en la tarjeta: *"El título es de otro
cargo: vendedor solo aparece en la descripción"*.

### 4.2 Las compuertas no se compensan

Las condiciones dejan de sumar y restar puntos:

| Condición | Resultado |
|---|---|
| Comuna reconocida y fuera de lo declarado | **descartar** (como hoy) |
| Comuna no reconocida | **tope gris** (en vez de −40) |
| Jornada contraria en el aviso | **descartar** (como hoy) |
| Jornada declarada sin confirmar | **tope gris** (como hoy) |
| Veto en título o empresa | **descartar** (como hoy) |
| Veto solo en el cuerpo | **tope gris** (en vez de −60) |
| Requisito excluyente sin acreditar (modo abierto) | **descartar** (como hoy) |

"Tope gris" significa: la oferta puede bajar a descartar por otra razón, pero **no puede subir a
postular**. Es la misma mecánica que ya usan `nivelIncierto` y `jornadaIncierta` al final de
`AP.puntuarOferta` — se generaliza, no se inventa.

Esto hace desaparecer dos números mágicos (−40 y −60) que hoy cualquiera puede compensar.

> **Corrección: el veto en el cuerpo se afloja, y conviene decirlo.** Con −60, un veto que solo
> aparece en la descripción dejaba la oferta en 40: **descartada**. Con el tope, pasa a **Por
> decidir** con 100. No es solo "sacar un número mágico": son más tarjetas para la persona. Se
> implementó igual, por la asimetría de §4.3 (una mención en la descripción puede ser negada o
> tangencial: *"no es call center"*), y queda medido: el banco de casos (§6) cuenta aparte los "sí" y
> "no" de lo que dejó en duda un "veto en la descripción". Si la persona dice casi siempre que no, se
> vuelve a descartar.

### 4.3 Las señales negativas no se diluyen por campo

El multiplicador por campo se aplica **solo a las señales positivas**. Una señal de delta negativo
pesa igual calce donde calce.

La asimetría es deliberada y vale la pena escribirla: **equivocarse hacia "no postular" es barato
—la oferta queda en Por decidir y la persona la rescata en un toque— y equivocarse hacia "postular"
no se puede deshacer.** Es el mismo criterio del principio 3.

### 4.4 Lo que no cambia

- Los pesos de los roles y el multiplicador por campo **para los roles**.
- Los umbrales 65 / 45 como punto de partida (§7 propone calibrarlos, no moverlos a mano).
- El modo abierto, su base de 60 y los requisitos excluyentes.
- La amplitud y los pesos con que entran los oficios vecinos.

### 4.5 Las dos de la segunda revisión

- **Señales sin cambio de género** (§2.4): una señal acepta su plural ("moda" → "modas", "comisión"
  → "comisiones") y nada más. Los roles siguen con la flexión completa.
- **La región también es una ubicación** (§2.5). Se reconocen las 16 regiones por nombre, por número
  romano ("Región V", "X Región") y los nombres de la RM ("Metropolitana", "R.Metropolitana", "Gran
  Santiago", "RM"). Como reconocer una región puede descartar, los nombres que también son calles o
  lugares (Tarapacá, O'Higgins, Ñuble, Biobío, Los Ríos, Los Lagos, Magallanes) solo cuentan con
  "región" delante: *"Av. Libertador Bernardo O'Higgins 1234"* no es la Región de O'Higgins, y queda
  como duda. Con la región reconocida:
  - si la persona declaró **la región entera** (el 90 % o más de sus comunas), la oferta **pasa**;
  - si no declaró **ninguna** comuna de esa región, se **descarta** y la razón nombra la región
    (*"Es en la región de Valparaíso, y no buscas ahí"*). La razón lleva el código de la región
    (`region: 'VA'`): el aviso de la extensión que ofrece *"Agregar \<comuna\> a mi perfil"* (de
    `main`, glukagonn) no la ofrece para una región, porque "Los Lagos" sumaría la comuna de Los Ríos;
  - si declaró algunas, es **tope gris**: puede ser en una de las suyas o no.

---

## 5. El orden que queda

```
1. Vetos en título/empresa          → descartar        (veto en el cuerpo → tope)
2. Requisitos (solo modo abierto)   → descartar
3. Nivel: jefatura y buscas otro    → descartar        (sin confirmar → tope)
4. Ubicación: comuna fuera, o región
   sin ninguna comuna tuya          → descartar        (ilegible o región a medias → tope)
5. Jornada contraria                → descartar        (sin confirmar → tope)
   ── a partir de acá ya nada descarta de golpe ──
6. Relevancia = el mejor calce de rol (0-100)
   · modo abierto: base 60
   · si el mejor calce no fue en el título → tope
7. Preferencias: señales (+ con multiplicador por campo, − sin él)
8. Banda por umbral (el de la cuenta, §7)
9. Topes: si hubo rol fuera del título, comuna desconocida, jornada sin confirmar,
   veto en el cuerpo o nivel incierto → la banda no puede ser "postular"
```

> **Corrección:** la primera versión se saltaba el paso 3, un descarte que ya existía (las
> jefaturas cuando la persona busca otro nivel).

El cambio real es el paso 9: **los topes se juntan en un solo lugar**, en vez de estar repartidos
entre restas de puntos y dos casos sueltos al final de la función. Van primeros en las razones, que
es lo que la persona tiene que mirar. Si el puntaje ya descartó la oferta, las dudas no cambian nada.

---

## 6. Medir: el banco de casos

Lo más importante de este documento.

`DecisionOferta` guarda, por cada oferta que cayó en la banda gris:

- `scoreLocal` — el puntaje con que el scorer la dejó ahí,
- `razones` — por qué,
- `veredicto` — lo que decidió la persona (`SI` / `NO`).

O sea: **el scorer contra el humano, caso por caso, en producción**. Con eso:

1. **Un número de acuerdo.** De las que la persona aprobó, ¿qué puntaje tenían? De las que rechazó,
   ¿qué puntaje? Si las dos nubes se pisan, el problema no es el umbral: es que el puntaje no está
   midiendo lo que importa.
2. **Una regresión de verdad.** Cualquier cambio futuro al scorer se vuelve a correr sobre las
   decisiones ya tomadas y se compara. Hoy un cambio se discute; con esto se mide.
3. **Las que más enseñan son las que más duelen**: un `NO` con puntaje alto (iba a postular solo) y
   un `SI` con puntaje bajo (casi se descarta en silencio). Esas dos listas, cortas, puestas frente
   a los ojos, dicen qué arreglar.

Entra como `backend/scripts/banco-de-casos.ts`: lee las decisiones resueltas, las agrupa por tramo
de puntaje y escupe la tabla. Solo lectura, sin IA.

> **Ojo con el sesgo:** la banda gris es lo único que se le pregunta a la persona. De lo que el
> scorer postuló solo no hay veredicto, así que el banco mide **la zona de duda**, que es justo donde
> se juega.
>
> **Corrección:** de lo que **descartó** sí hay un veredicto parcial: el botón **"No era así"** en
> "Lo último que hizo" (`Descarte.corregidoEn`). Son falsos negativos que la persona se dio el
> trabajo de marcar, y son la lista que más enseña. El banco los cuenta por razón de descarte. El
> "pulgar abajo" de Postulaciones existe en la base (`FuenteDecision.HISTORIAL`), pero hoy nada lo
> guarda: sería el veredicto que falta sobre lo que se postuló solo.

> **Corrección: para §6.2 faltaban los datos.** Volver a correr el scorer necesita lo que el scorer
> vio, y la base no lo tenía: ni la ubicación de la oferta, ni el aviso (solo un extracto, en
> `detalleAviso`), ni la versión del perfil; y de los descartes, ni el puntaje. Ahora la extensión
> manda, con cada oferta que va a Por decidir y con cada descarte, `{ titulo, empresa, ubicacion,
> cuerpo, versionPerfil }` (columna `entrada_scorer`) y el puntaje (`descartes.score_local`). Las
> decisiones de antes de este cambio no lo tienen: la regresión de §6.2 parte vacía y se llena sola.

*Implementado* (§11): el informe trae, por cuenta o para todas, los tramos de 5 puntos con su % de
"sí" (aparte, lo que dejó en duda un tope, porque ahí el puntaje no decidió), el promedio de los sí y
de los no, la **separación** (la probabilidad de que un "sí" tenga más puntaje que un "no": 0,5 es
que el puntaje no separa nada), las dos listas de §6.3, los descartes por razón con cuántos se
corrigieron, y —con un correo— **el scorer de hoy** (el `core.js` que haya en el disco, con el perfil
de hoy) sobre todo lo ya decidido: cuántos "sí" se postularían o se perderían, cuántos "no" se
postularían solos, y la lista de los que empeoran.

---

## 7. Calibrar el umbral por persona

Hoy el 65 y el 45 son constantes iguales para todo el mundo, y lo que una persona considera
"relevante" no es lo que considera otra.

Con **30 decisiones resueltas** de una cuenta ya se puede mover el corte al punto que mejor separa
sus `SI` de sus `NO`.

Reglas para que no se desbande:

- No se mueve con menos de 30 decisiones.
- Nunca más de 10 puntos respecto del valor por defecto.
- Se recalcula una vez por semana, no en cada decisión.
- Se puede ver y volver al valor por defecto desde Filtros de búsqueda.

> **Corrección: no puede vivir en el perfil compilado.** `compilar-perfil.ts` vuelve a escribir
> `umbralPostular: 65, umbralGris: 45` en cada recompilación, y el perfil se recompila seguido: el
> corte calibrado se perdería. Vive aparte, en `SearchPreferences` (`umbral_postular_calibrado`,
> `umbral_calibrado_con`, `umbral_calibrado_en`, `calibrar_umbral`), y se aplica al servir el perfil a
> la extensión (`/api/extension/perfil`).
>
> **Corrección: con estos datos solo se puede bajar.** La persona solo decide lo que cae entre 46 y
> 64. De lo que tiene 65 o más no hay veredicto (se postuló solo), así que no hay con qué saber si
> habría que subir el corte. Lo que sí se ve es lo que importa: si de las dudosas más parecidas a lo
> que busca aprueba casi todas, preguntarle es trabajo de más.

*Implementado así* (`backend/lib/calibracion-umbral.ts`):

- **Qué decisiones cuentan:** sí/no de los **últimos 90 días**, evaluadas por el scorer nuevo (las
  que traen `entrada_scorer`: las de antes tienen puntajes con las reglas viejas), con puntaje
  **dentro de la banda** y **sin topes** (si la dejó en duda la jornada o la comuna, el "no" puede
  ser por eso y no por el puntaje). Tampoco las del modo abierto.
- **El corte:** el más bajo, entre 55 y 64, desde el cual la persona aprobó **al menos 9 de cada
  10**, con **al menos 10 decisiones** en ese tramo y 30 en total. Solo se prueban puntajes que de
  verdad tuvo alguna decisión: si nadie decidió nada entre 55 y 57, bajar a 55 sería adivinar.
- **Cuándo:** al pedir la extensión su perfil, si pasó una semana. No en "cualquier trabajo": ahí
  todo lo que cumple las condiciones entra con 60, y bajar de 60 lo postularía todo solo.
- **El 45 no se toca.** Subirlo descartaría en silencio lo que hoy se pregunta; con la asimetría de
  §4.3, ante la duda se pregunta.
- **Filtros de búsqueda → "Cuándo postula sola"** muestra el corte de la cuenta y un interruptor
  "Ajustarlo con mis decisiones en Por decidir". Apagarlo vuelve a 65; prenderlo lo recalcula en la
  próxima revisión de la extensión.
- **Se revisa solo cada tres meses.** Con el corte en 58, lo que tiene entre 58 y 64 ya no se
  pregunta, así que no hay decisiones nuevas en ese tramo. Cuando las que lo justificaron pasan los 90
  días, el corte vuelve a 65 y esas ofertas se preguntan otra vez, hasta juntar 10 de nuevo. Es a
  propósito: el perfil y lo que la persona busca cambian.

---

## 8. Orden

| # | Tarea | § | Esfuerzo | Estado |
|---|---|---|---|---|
| **1** | Los casos de §2 como pruebas en `verificar-scorer.js` (fallando) | §2 | Chico | ✅ |
| **2** | Regla del rol solo en el cuerpo | §4.1 | Chico | ✅ |
| **3** | Compuertas con tope gris, sacando −40 y −60 | §4.2 | Medio | ✅ |
| **4** | Señales negativas sin multiplicador | §4.3 | Chico | ✅ |
| 4b | Señales sin cambio de género, y la región como ubicación | §4.5 | Chico | ✅ |
| 5 | `banco-de-casos.ts` (y guardar lo que el scorer evaluó) | §6 | Medio | ✅ |
| 6 | Calibración del umbral por cuenta | §7 | Medio, y va **después** del 5 | ✅ |

Del 1 al 4 es un día. El 1 va primero a propósito: **las pruebas se escriben antes del arreglo**,
porque si no, no hay forma de saber si el arreglo arregló.

---

## 9. Criterios de aceptación

Los casos de §2, con el perfil de ahí (resultado con el scorer de antes → con el de ahora):

1. *"Bodeguero Part Time con comisiones"* con el rol solo en el cuerpo → **gris**, no postular.
   *Antes postular 80 → ahora gris 80, con "el título es de otro cargo" primero.* ✅
2. *"Vendedor de tienda part time"* con ubicación ilegible → **gris**, no postular.
   *Antes postular 85 → ahora gris; el puntaje ya no se toca (100), la duda es un tope.* ✅
3. *"Vendedor de tienda"* con *"comision pura"* en el cuerpo y señal −40 (y la comuna, §2.3) →
   **no postular**. *Antes postular 88 → ahora gris 60.* ✅
4. *(§2.4)* *"Atiende de modo cordial"* con la señal "moda" → no suma. *Antes postular 66 → ahora
   gris 60.* ✅
5. *(§2.5)* Con toda la RM declarada, *"Región Metropolitana"*, *"R.Metropolitana"*, *"Metropolitana
   de Santiago"* y *"Gran Santiago"* → **postular**; *"Región V"* → **descartar** y la razón dice
   "Valparaíso"; con solo dos comunas de la RM → **gris**. ✅

Y los que tienen que seguir pasando igual:

6. El caso real de `amplitud-de-busqueda.md` §1 (*"Vendedor de Retail vestuario Rotativo Part
   Time"*) sigue dando **postular**. ✅
7. Una oferta con el rol en el título y todo en orden sigue dando **postular**. ✅
8. Los casos que ya tenía `verificar-scorer.js` siguen en verde. ✅ (144 en total, con los de `main`.)

---

## 10. Lo que no se hace

- **Volver a meter IA por oferta.** El scorer es determinista y gratis, y así se queda
  (`rediseno-filtrado-ofertas.md` §3).
- **Subir el umbral a 75 "por si acaso".** Eso esconde el problema: el puntaje seguiría midiendo
  mal, solo que con menos postulaciones.
- **Borrar el multiplicador por campo de los roles.** Funciona y está probado.
- **Calibrar umbrales sin el banco de casos** (§6 antes que §7).

---

## 11. Lo que se implementó (2026-09-30)

**Extensión** (`extension/core.js`, `AP.puntuarOferta` reescrita en el orden de §5):

- §4.1, §4.2, §4.3 y §4.5 tal como están arriba. Sin −40 ni −60: los cinco topes se juntan al final.
- La entrada del scorer viaja con cada reporte: `AP.evaluarOferta` la devuelve y
  `AP.reportarBandaGris` / `AP.reportarDescartes` la adjuntan solos (la evaluación más reciente de
  cada título+empresa, así la del aviso completo pisa a la de la tarjeta), **sin tocar los
  adaptadores**. Un descarte por duplicado viaja sin ella: no lo decidió el scorer.
- `AP.formatearRazonCorta` conoce `rol_fuera_del_titulo`.

**Base** (migración `20260930120000_banco_de_casos_y_umbral`, solo columnas nuevas, opcionales o con
valor por defecto): `decisiones_oferta.entrada_scorer`, `descartes.score_local` y
`descartes.entrada_scorer`, y en `search_preferences` las cuatro del umbral.

**Backend:**

- `/api/extension/banda-gris` y `/api/extension/descartes` guardan la entrada (recortada y validada en
  `lib/entrada.ts`, `limpiarEntradaScorer`) y el puntaje.
- `lib/formatear-razon.ts`: `rol_fuera_del_titulo` y `ubicacion_desconocida` van en contra con texto
  propio, y `sin_perfil` tiene texto. **Antes `ubicacion_desconocida` salía como "Sin razón
  registrada"** en la tarjeta, y en Hoy la oferta aparecía sin motivo. El rol que calzó fuera del
  título ya no dice "Es de vendedor": dice "La descripción habla de vendedor".
- `lib/calibracion-umbral.ts` (§7), aplicado en `/api/extension/perfil`; `/api/preferencias-busqueda`
  acepta `calibrarUmbral`; Filtros de búsqueda tiene la sección "Cuándo postula sola".
- `lib/perfil-scorer.ts`: el perfil tal como lo recibe la extensión, armado en un solo lugar para la
  ruta y para el banco (así el banco corre el scorer con exactamente lo mismo).
- `lib/banco-de-casos.ts`, `lib/scorer-extension.ts` (carga `core.js` en Node) y
  `scripts/banco-de-casos.ts`.

**Cómo se prueba:**

```
cd extension && node verificar-scorer.js                      # 144 casos
cd backend && npx tsx scripts/verificar-banco-de-casos.ts      # calibración, banco, entrada, textos
cd backend && npx tsx scripts/banco-de-casos.ts correo@x.cl    # contra una base de verdad (solo lee)
```

Se probó además de punta a punta en una base local aparte (migraciones desde cero, rutas de la
extensión con su token, el umbral bajando a 58 con 32 decisiones y volviendo a 65 al apagarlo desde
Filtros, las tarjetas de Por decidir y Hoy, y el script del banco).

**Lo que falta:**

- **Desplegar.** La migración corre sola en el build de Vercel. Hasta que la extensión de cada
  persona se actualice, sus reportes llegan sin entrada: la calibración y la regresión de §6.2 parten
  cuando haya decisiones nuevas.
- **El "pulgar abajo" en Postulaciones** (`FuenteDecision.HISTORIAL`): el único veredicto posible
  sobre lo que se postuló solo. Con eso el banco mediría también arriba del umbral, y la calibración
  podría subirlo.
- **Correr el banco contra producción** cuando haya unas semanas de decisiones con entrada, y mirar
  primero la separación y la fila "veto en la descripción" (§4.2).
