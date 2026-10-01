# Revisión del scorer — 2026-09-30: compuertas, relevancia y preferencias

> **Estado:** propuesta, 2026-09-30. Sale de una pregunta de Roberto: *"la lógica de filtrado no
> está funcionando muy bien, dale una vuelta"*.
> **Para:** el chat de producción.
> **Método:** se corrió el `extension/core.js` real (cargado en Node con el mismo arnés de
> `extension/verificar-scorer.js`) contra casos armados a mano. Los tres de §2 son reproducibles y
> sirven tal cual como pruebas de regresión.
> **Relacionado:** `rediseno-filtrado-ofertas.md` §6 (el scorer), `amplitud-de-busqueda.md` §2 y §6
> (los arreglos de septiembre), `revision-scorer-2026-09-04.md` (la revisión anterior).

---

## 0. Lo esencial

1. **El scorer suma tres cosas que no se pueden sumar**: si el aviso *es lo que busco* (el rol), si
   *puedo tomarlo* (comuna, jornada, vetos, requisitos) y *cuánto me gusta* (las señales). Las tres
   terminan en el mismo número, y por eso una tapa a la otra.
2. **Tres fallas concretas, verificadas** (§2): dos palabras del gusto de la persona convierten un
   aviso ajeno en postulación automática; una señal tapa el "no sé dónde queda"; y una señal
   negativa fuerte se desactiva sola justo donde siempre aparece, en la descripción.
3. **Tres reglas lo arreglan** (§4), ninguna grande, y las tres se pueden probar con los casos de
   §2 convertidos en tests.
4. **Lo que de verdad falta es medir** (§6). Los datos ya se están guardando:
   `DecisionOferta.scoreLocal` + `veredicto` es, literalmente, el scorer contra el humano para cada
   oferta dudosa. Con eso "no funciona muy bien" pasa a ser una cifra, y el umbral deja de ser una
   constante igual para todos.

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

Perfil usado en los tres casos:

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

→ POSTULAR, score 88.  El -40 se aplicó como -12.
```

Desde `da9245e` las señales se multiplican por el campo donde calzan (título ×1, empresa ×0,35,
cuerpo ×0,3). La intención era correcta —que un calce débil pese menos—, pero **las condiciones de
renta, turnos y contrato viven siempre en la descripción, nunca en el título**. Justo lo que la
persona dijo que no quiere es lo que queda diluido a un cuarto.

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

---

## 5. El orden que queda

```
1. Vetos en título/empresa          → descartar
2. Requisitos (solo modo abierto)   → descartar
3. Ubicación: comuna fuera          → descartar
4. Jornada contraria                → descartar
   ── a partir de acá ya nada descarta de golpe ──
5. Relevancia = el mejor calce de rol (0-100)
   · modo abierto: base 60
6. Preferencias: señales (+ con multiplicador por campo, − sin él)
7. Banda por umbral
8. Topes: si hubo rol-solo-en-cuerpo, comuna desconocida, jornada sin confirmar,
   veto en el cuerpo o nivel incierto → la banda no puede ser "postular"
```

El cambio real es el paso 8: **los topes se juntan en un solo lugar**, en vez de estar repartidos
entre restas de puntos y dos casos sueltos al final de la función.

---

## 6. Medir: el banco de casos

Lo más importante de este documento. **Los datos ya se están guardando y nadie los está mirando.**

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
> scorer postuló o descartó solo no hay veredicto, así que el banco mide **la zona de duda**, que
> es justo donde se juega. No se puede concluir de ahí que lo descartado estuvo bien descartado —
> para eso está el modo solo observar y `primera-busqueda-guiada.md`.

---

## 7. Calibrar el umbral por persona

Hoy el 65 y el 45 son constantes iguales para todo el mundo, y lo que una persona considera
"relevante" no es lo que considera otra.

Con **30 decisiones resueltas** de una cuenta ya se puede mover el corte al punto que mejor separa
sus `SI` de sus `NO`, y guardarlo en su perfil compilado (`umbralPostular` / `umbralGris` ya son
campos del perfil, no constantes del código — la pieza está puesta, falta quien la mueva).

Reglas para que no se desbande:

- No se mueve con menos de 30 decisiones.
- Nunca más de 10 puntos respecto del valor por defecto.
- Se recalcula una vez por semana, no en cada decisión.
- Se puede ver y volver al valor por defecto desde Filtros de búsqueda.

---

## 8. Orden

| # | Tarea | § | Esfuerzo |
|---|---|---|---|
| **1** | Los tres casos de §2 como pruebas en `verificar-scorer.js` (fallando) | §2 | Chico |
| **2** | Regla del rol solo en el cuerpo | §4.1 | Chico |
| **3** | Compuertas con tope gris, sacando −40 y −60 | §4.2 | Medio |
| **4** | Señales negativas sin multiplicador | §4.3 | Chico |
| 5 | `banco-de-casos.ts` | §6 | Medio |
| 6 | Calibración del umbral por cuenta | §7 | Medio, y va **después** del 5 |

Del 1 al 4 es un día. El 1 va primero a propósito: **las pruebas se escriben antes del arreglo**,
porque si no, no hay forma de saber si el arreglo arregló.

---

## 9. Criterios de aceptación

Los tres casos de §2, con el perfil de ahí:

1. *"Bodeguero Part Time con comisiones"* con el rol solo en el cuerpo → **gris**, no postular.
2. *"Vendedor de tienda part time"* con ubicación ilegible → **gris**, no postular.
3. *"Vendedor de tienda"* con *"comision pura"* en el cuerpo y señal −40 → **no postular**.

Y tres que tienen que seguir pasando igual:

4. El caso real de `amplitud-de-busqueda.md` §1 (*"Vendedor de Retail vestuario Rotativo Part
   Time"*) sigue dando **postular**.
5. Una oferta con el rol en el título y todo en orden sigue dando **postular**.
6. Los 60 y tantos casos que ya tiene `verificar-scorer.js` siguen en verde.

---

## 10. Lo que no se hace

- **Volver a meter IA por oferta.** El scorer es determinista y gratis, y así se queda
  (`rediseno-filtrado-ofertas.md` §3).
- **Subir el umbral a 75 "por si acaso".** Eso esconde el problema: el puntaje seguiría midiendo
  mal, solo que con menos postulaciones.
- **Borrar el multiplicador por campo de los roles.** Funciona y está probado.
- **Calibrar umbrales sin el banco de casos** (§6 antes que §7).
