# Amplitud de búsqueda: "vendedor en general" y "cualquier trabajo"

> **Estado:** propuesta, 2026-09-27. Nace de un caso real de la cuenta de Roberto, reproducido
> contra el código.
> **Para:** el chat de producción.
> **Relacionado:** `rediseno-filtrado-ofertas.md` (el scorer), `objetivo-laboral.md` (el objetivo
> declarado), `estrategia-y-rediseno.md` §5.2 (la pantalla "Qué buscas"),
> `creditos-y-pagina-nueva.md` §3 (quién consume el cupo).

---

## 0. Lo esencial

1. **Hay un bug antes que una función que falte.** Una oferta que calzaba perfecto —*"Vendedor de
   Retail vestuario Rotativo Part Time"*, part time, en la RM— quedó en "Por decidir" en vez de
   postularse. No fue el criterio: fue que **las señales del perfil compilado nunca calzan**,
   porque guardan listas separadas por coma y el motor espera una frase. Está demostrado en §1.
2. **Los vetos tienen el mismo problema, y ahí es peor:** son descripciones, no patrones. O sea
   que "no quiero full time" hoy **no filtra nada**.
3. **Aun arreglado eso, falta lo que pidió Roberto:** poder decir "vendedor en general" en vez de
   un oficio exacto, o directamente "cualquier trabajo, part time nomás". Hoy el motor solo sabe
   puntuar por rol: si ningún rol calza, el puntaje es 0 y la oferta se descarta.
4. Son **dos cosas distintas**: un control de amplitud (§4) y un modo abierto (§5).

---

## 1. El caso que lo detonó

**El perfil compilado de la cuenta**, tal como lo muestra "Filtros de búsqueda":

| | Contenido |
|---|---|
| Roles | `asistente de ventas` (100%) — asesor de ventas, ejecutivo de ventas, promotor de ventas · `vendedor` (50%) — vendedor retail, asesor comercial, ejecutivo comercial |
| Vetos | `retail genérico sin especialidad en moda/vestuario/calzado` · `full time exclusive` |
| Señales | +25 `moda, vestuario, calzado, fashion` · +15 `part time, turnos rotativos, flexible` · +10 `con comisiones o bonos de venta` |
| Ubicación | Región Metropolitana, toda la región, sin remoto |

**La oferta** (Computrabajo, 2026-09-27): *"Vendedor de Retail vestuario Rotativo Part Time
(V, S y D)"*, Manpower Chile, Santiago – San Miguel, $480.000, jornada de 42 horas, presencial.
El cuerpo dice *"buscamos Vendedores(as) Part Time… del rubro retail moda"*.

Es exactamente lo que la persona pidió. Y no se postuló.

### 1.1 Qué pasó, término por término

Corriendo `apConstruirPatron` de `extension/core.js` sobre el título, la empresa y el cuerpo
reales:

| Término del perfil | ¿Calza? |
|---|---|
| `asistente de ventas` y sus 3 sinónimos | **no** |
| `vendedor` (peso 0,5) | **sí, en el título** |
| `vendedor retail` | **no** — el aviso dice "Vendedor **de** Retail" |
| `retail genérico sin especialidad en moda/vestuario/calzado` (veto) | **no** |
| `full time exclusive` (veto) | **no** |
| `moda, vestuario, calzado, fashion` (+25) | **no** |
| `part time, turnos rotativos, flexible` (+15) | **no** |
| `con comisiones o bonos de venta` (+10) | **no** |

La cuenta entonces:

```
puntaje = peso 0,5 × 100 × 1 (título) = 50
50 > umbralGris (45) y < umbralPostular (65)  →  banda gris  →  "Por decidir"
```

**Con las señales funcionando**, la misma oferta habría dado:

```
50 + 25 (vestuario, en el título) + 15 (part time, en el título) = 90  →  postular
```

Esos 55 avisos acumulados en "Por decidir" son, casi con seguridad, la misma historia repetida.

### 1.2 Por qué ninguna señal calza

`apConstruirPatron` parte el patrón por espacios y lo vuelve a unir con `\s+`: exige la **frase
completa, en ese orden**. Entonces `"moda, vestuario, calzado, fashion"` se convierte en un patrón
que solo calzaría con un aviso que diga literalmente esas cuatro palabras seguidas con sus comas.
No existe tal aviso.

Separadas, **sí** calzan: `vestuario` en el título, `part time` en el título, `moda` en el cuerpo.

El compilador (`backend/lib/compilar-perfil.ts`) le pide a la IA `senales: [{patron, delta}]` sin
decirle que `patron` es **un solo término**, y la IA hizo lo razonable en castellano: una lista.

---

## 2. Los tres arreglos

### 2.1 Una señal, un término

En `compilar-perfil.ts`, al guardar:

- Partir cada `patron` por coma, `/` y ` o ` → varias señales con el mismo `delta`.
- Descartar patrones de **más de 3 palabras**: no son términos, son explicaciones.
- Lo mismo para vetos.

Y en el prompt, decirlo explícito: *"cada patrón es UN término tal como aparece escrito en un
aviso chileno (ej: `part time`, `vestuario`, `call center`), nunca una lista ni una explicación"*.

Se arregla en los dos lados a propósito: el prompt para que salga bien, y la normalización al
guardar para que **no dependa** de que la IA obedezca.

> **A decidir al implementar:** hoy una señal suma su `delta` completo calce donde calce, mientras
> que los roles multiplican por el campo (título 1, empresa 0,35, cuerpo 0,3). Con las señales por
> fin funcionando, un `+25` que solo aparece en el cuerpo puede empujar de más. Propongo aplicarles
> el mismo multiplicador de campo que a los roles.

### 2.2 Vetos que son frases

`retail genérico sin especialidad en moda/vestuario/calzado` no es un patrón, es la razón. El
formato ya tiene un campo `razon` para eso. Al normalizar (§2.1), un veto que queda sin patrón
utilizable **no se guarda en silencio**: se guarda la intención en `razon` y el patrón se descarta,
y la pantalla "Filtros de búsqueda" lo muestra como *"esto no se está aplicando"*.

Esto importa más de lo que parece: la persona **cree** que dijo "no quiero full time" y el sistema
no está filtrando nada. Es el principio 5 al revés — hay una decisión que no se está tomando, y no
se ve por ninguna parte.

### 2.3 Sinónimos de varias palabras

`vendedor retail` no calza con *"Vendedor de Retail"* porque el patrón exige las dos palabras
pegadas. Los avisos chilenos meten preposiciones en todas partes: *"asesor de ventas"*, *"vendedor
de retail"*, *"ejecutivo en ventas"*.

Arreglo: permitir hasta **dos palabras cortas** entre los términos de un patrón de varias palabras
(`(?:\s+\w{1,4})?\s+`, algo así), no palabras arbitrarias. Con eso "vendedor retail" calza con
"vendedor de retail" pero no con "vendedor de repuestos para retail".

> **Verificado el 2026-09-28, ya implementado (`da9245e`) — y con un efecto no previsto.** El enlace
> quedó como `(?:\s+\w{1,4}){0,2}`, o sea *cualquier* palabra de hasta 4 letras. Eso incluye `o`,
> `no`, `sin` y `ni`, que **invierten el sentido** de la frase. Probado contra el `core.js` real:
> un veto de `con experiencia` **descarta** un aviso titulado *"Vendedor con o sin experiencia"*,
> porque el patrón salta por encima de "o sin". Es el mismo error que §2.1 evitó en la
> normalización, entrando por otra puerta.
>
> Arreglo propuesto: en vez de `\w{1,4}`, una lista corta de conectores —`de`, `del`, `en`, `para`,
> `la`, `el`, `los`, `las`, `y`, `a`— y nunca `o`, `no`, `sin`, `ni`.

### 2.4 Que no vuelva a pasar sin que nadie se entere

Un `scripts/verificar-patrones.ts` que recorra los perfiles compilados y falle si algún patrón
tiene coma, `/`, o más de 3 palabras. Es la clase de error que no rompe nada: simplemente el
sistema deja de decidir bien, en silencio, y eso ya pasó una vez.

---

## 3. Por qué el arreglo no alcanza

Arreglado todo lo anterior, el motor sigue sabiendo **una sola cosa**: buscar los roles declarados.
Si la persona declaró "vendedor de calzado" y aparece "vendedor audiovisual", no calza ningún rol,
el puntaje queda en 0 y se descarta.

Y hay harta gente que no busca un oficio: busca **un trabajo**. Part time, cerca, que pague. Para
esa persona el producto hoy no tiene forma de existir.

---

## 4. El control de amplitud

La persona elige **qué tan lejos de su objetivo** acepta que el motor busque. No necesita IA: el
catálogo (`scripts/data/catalogo-ocupaciones-cl.json`) tiene 3.484 oficios con su código CIUO de 4
dígitos y 444 grupos, y la jerarquía sale del código mismo por prefijo.

Con el objetivo real de la cuenta, que cae en el grupo **5223 – "Vendedores y asistentes de venta
de tiendas, almacenes y puestos de mercado"**:

| Opción | Qué entra | Cuántos oficios |
|---|---|---|
| **Solo esto** | Lo declarado y sus sinónimos | lo de hoy |
| **Esto y lo parecido** *(por defecto)* | Mismo grupo `5223` | **17** — vendedor de farmacia, de local comercial, de concesionaria, ayudante de ventas, asesor de vinos… |
| **Cualquier cosa de mi rubro** | Mismo prefijo `52` | **87** — quioscos, promotores de tienda, venta por internet, cajeros de comercio, venta puerta a puerta |

Reglas:

1. **Lo que entra por amplitud entra con peso bajo** (0,5 el nivel "parecido", 0,35 el nivel
   "rubro"). Con el umbral en 65, eso los deja en la banda gris: aparecen en **Por decidir**, no se
   postulan solos. Abrirse no es postular a ciegas; es ver más y decidir. Y cada sí o no es una
   etiqueta de entrenamiento (principio 3).
2. **Se expande al compilar, no al puntuar.** El scorer no cambia: `compilar-perfil.ts` agrega los
   oficios hermanos a `roles[]` con su peso. Principio 1: lo caro corre una vez.
3. **Tope de términos.** 87 oficios × sinónimos es mucho patrón por oferta. Limitar a los N más
   frecuentes del grupo (los que más aparecen en `TituloVisto`) y dejar el resto fuera.
4. **Necesita que el objetivo tenga código.** `ObjetivoLaboral.ciuo` es nulable y hoy se puede
   escribir libre — de hecho "Asistente de Ventas" no existe como oficio en el catálogo, existe
   como nombre del grupo 5223. Si el objetivo no tiene código, primero se resuelve contra el
   catálogo (buscando también en los **nombres de grupo**, no solo en los oficios) y, si no hay
   forma, el control de amplitud se muestra desactivado con su explicación.

---

## 5. El modo "cualquier trabajo"

Es la cuarta opción, y **no es un nivel más ancho: cambia el eje**. Deja de filtrar por rol y pasa
a filtrar por condiciones.

`perfil.modo = "abierto"` y una rama corta en `AP.puntuarOferta`:

- **Parte en 60**, no en 0. Sin rol no hay de dónde sumar, así que la base la da el hecho de ser
  una oferta que pasó las condiciones.
- **Restan** las condiciones que no se cumplen: comuna fuera de lo declarado (descarta, como hoy),
  jornada distinta a la que puede hacer (§6), sueldo bajo el mínimo que declaró, y los vetos.
- **Descarta** lo que pide un requisito excluyente que la persona no tiene: título profesional,
  licencia A-2 o D, inglés avanzado, experiencia mínima muy por encima de la suya. Este es el
  filtro que **reemplaza** al rol como protección: sin él, el modo abierto le quema el cupo del mes
  en avisos donde nunca la iban a llamar.
- **Suma** lo que el CV respalda, para ordenar: si la persona fue bodeguero, un aviso de bodega
  sube. Ordena, no filtra.

### 5.1 La tensión con la estrategia, dicha en voz alta

`estrategia-y-rediseno.md` §0 dice que competir por volumen se pierde. El modo abierto no rompe
eso mientras:

- **lo elija la persona** — nunca viene puesto por defecto;
- **siga habiendo criterio** — condiciones, vetos y requisitos excluyentes;
- **se diga qué hace** — "voy a postular a todo lo que cumpla tus condiciones, no a todo lo que
  exista".

### 5.2 El vínculo con los créditos

Quien usa el modo abierto se come las 20 o las 80 del mes en días. Es el comprador natural de
créditos (`creditos-y-pagina-nueva.md` §3). La pantalla tiene que avisarle cuando le queden pocas,
una vez, sin insistir.

---

## 6. La jornada, que hoy no se usa

`SearchPreferences.jornada` existe, `compilar-perfil.ts` la guarda en el perfil compilado… y
`AP.puntuarOferta` **nunca la lee**. Quedó en `AP.coincideFiltros`, el filtro viejo, que ya no
decide nada (`revision-2026-09-16.md` §1.1).

O sea: alguien que solo puede part time recibe postulaciones a jornada completa, y su "prefiero
part time" no pesa. Se arregla solo, sin esperar nada de lo demás:

- `jornada: "part_time"` + aviso que dice full time / jornada completa → **descartar**.
- `jornada: "part_time"` + aviso que no dice nada → **gris** ("no sé" no es "no calza").
- `jornada: "cualquiera"` → como hoy.

Los términos ya están escritos en `AP_KEYWORDS_JORNADA` (`core.js:456`); hay que moverlos al
scorer nuevo.

---

## 7. La pantalla

En **Qué buscas**, debajo de los objetivos, una sola pregunta:

> **¿Qué tan abierto estás?**
> - Solo lo que puse arriba
> - Eso y trabajos parecidos ← *por defecto*
> - Cualquier cosa de mi rubro
> - Cualquier trabajo que pueda hacer

Debajo de la opción elegida, una línea que diga qué significa con números reales: *"Vas a ver
también vendedor de farmacia, ayudante de tienda, promotor y 14 oficios más"*. Nada de "CIUO",
"grupo 5223" ni "amplitud".

Para quien llega sin saber, una quinta salida: *"Todavía no lo tengo claro — muéstrame de todo y
yo voy diciendo"*. Es el mejor usuario posible: entrena el sistema con decisiones reales.

Y en **Filtros de búsqueda**, donde hoy se ven roles, vetos y señales: marcar los que **no se
están aplicando** (§2.2). Que se vea la diferencia entre lo que la persona pidió y lo que el motor
de verdad está usando.

---

## 8. Orden

| # | Tarea | § | Por qué en este orden |
|---|---|---|---|
| **1** | Señales y vetos: un término por patrón, al compilar y en el prompt | §2.1, §2.2 | Es un bug, afecta a todas las cuentas de hoy, y es chico |
| **2** | Recompilar los perfiles existentes | §2 | Si no, las cuentas actuales siguen con patrones muertos |
| **3** | Sinónimos con palabras intermedias | §2.3 | Chico, y arregla "Vendedor de Retail" |
| **4** | Jornada en el scorer nuevo | §6 | Independiente de todo lo demás |
| **5** | `verificar-patrones.ts` | §2.4 | Cierra la puerta |
| 6 | Control de amplitud por CIUO | §4 | Necesita 1 y 2 hechos |
| 7 | Resolver objetivos sin código contra el catálogo | §4.5 | Lo necesita el 6 |
| 8 | Modo "cualquier trabajo" | §5 | Después de los créditos |

Del 1 al 5 es un día de trabajo y probablemente **vacía la mitad de "Por decidir"** solo.

---

## 9. Criterios de aceptación

1. La oferta de §1 —*"Vendedor de Retail vestuario Rotativo Part Time"*, con ese perfil— da
   **postular**, no gris. Va como caso de prueba con nombre y apellido.
2. Ningún patrón guardado tiene comas ni más de 3 palabras.
3. Un veto que no se pueda aplicar **se ve** en Filtros de búsqueda.
4. Con "part time" declarado, un aviso que dice "jornada completa" se descarta y lo dice.
5. Subir la amplitud un nivel no aumenta las postulaciones automáticas: aumenta "Por decidir".
6. Ninguna pantalla dice CIUO, grupo, peso ni umbral.

---

## 10. Lo que no se hace

- **Adivinar la amplitud** a partir del CV. Se declara, como la ubicación
  (`revision-2026-09-16.md` §2.1).
- **Que el modo abierto venga por defecto.**
- **Postular con amplitud alta sin pasar por "Por decidir".**
- **Sumar portales** para tener más volumen (`estrategia-y-rediseno.md` §7).
