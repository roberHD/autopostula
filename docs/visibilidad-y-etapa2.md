# Ver por qué se filtra, y decidir con información — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-07.
> **Relacionado:** `docs/rediseno-filtrado-ofertas.md` (§4 capas, §6 scorer, §8 banda gris).

---

## 0. Los tres cambios son uno solo

Salieron de tres síntomas distintos, pero se resuelven con la misma pieza:

| Síntoma | Causa |
|---|---|
| El overlay dice "0 de 20 coinciden" y no se sabe por qué | Cuenta solo la banda `postular`; gris y descartadas caen en el mismo silencio |
| Todas las tarjetas de "Por decidir" dicen lo mismo | El scorer arma las razones como **texto ya formateado, sin los valores** |
| La tarjeta de "Por decidir" tiene muy poca información | Nadie leyó nunca el aviso: la tarjeta del portal solo trae título, empresa y comuna |

> **La Etapa 2 (abrir el aviso de las ofertas grises) alimenta las dos cosas: resuelve
> ambigüedad para el scorer **y** llena la tarjeta de decisión. Un solo click, dos pagos.**

---

## A. Desglose en el overlay

**Problema.** `extension/adapters/computrabajo.js:621`:

```js
msg(pendientes.length + ' de ' + tarjetas.length + ' coinciden');
```

`pendientes` son solo las de banda `postular`. "0 de 20" puede ser 20 descartadas, 20 en gris, o
cualquier mezcla — y la razón real **sí se calcula** (va a `addLog` por oferta), simplemente no
se muestra donde la persona está mirando.

**Cambio.** Contar las tres bandas y mostrar el desglose más la razón más frecuente:

```
2 postuladas · 6 por decidir · 12 descartadas
La mayoría: no calza con "desarrollador de software"
```

Colores: verde si hubo postulaciones, azul si hay grises pendientes, gris si todo se descartó.

Aplica igual en `laborum.js`. Conviene que el armado del mensaje viva en `core.js` (algo como
`AP.mensajeEscaneo(conteos, razonTop)`) para no duplicarlo en cada adaptador.

**Por qué va primero:** sin esto no se puede diagnosticar nada más. Es el cambio más chico y el
que desbloquea el resto.

---

## B. Etapa 2 — abrir el aviso, solo de las grises

**Hoy** todo se decide con lo que trae la tarjeta del portal: título, empresa, ubicación.
`cuerpo: ''` en ambos adaptadores.

**Cambio: escalonar.**

```
Etapa 1 · tarjeta (título + empresa + ubicación)        gratis, las 20
   ├─ score alto   → postular
   ├─ score bajo   → descartar
   └─ banda gris   → Etapa 2

Etapa 2 · abrir el aviso (facetas + cuerpo)             solo las grises
   ├─ resuelve     → postular / descartar
   └─ sigue dudosa → banda gris, ahora con datos → decide la persona
```

### Lo importante: las facetas estructuradas, no el texto corrido

El panel de detalle de Computrabajo muestra campos **etiquetados**:

```
🗂  contrato a plazo fijo
🕐  Jornada part time
🏢  Presencial
```

Eso es exactamente lo que el sistema viene **adivinando** desde el día uno olfateando palabras
sueltas en el texto — el problema que `rediseno-filtrado-ofertas.md` §2.1c describe y que el
propio comentario de `AP_KEYWORDS_JORNADA` admite que no funciona.

> **Leer "Jornada part time" de un campo etiquetado es confiable. Buscar "part time" dentro de
> la descripción no lo es.** Misma lección que §7.3: parsear, no grepear.

`extraerTextoAviso()` (`computrabajo.js:27`) ya lee `.box_detail`, pero devuelve el `innerText`
entero. Hace falta un `extraerFacetasAviso()` que devuelva estructura:

```js
{
  jornada: 'part_time',        // de la faceta, no del texto
  modalidad: 'presencial',
  contrato: 'plazo fijo',
  sueldo: null,                 // si el aviso lo declara
  publicadaHace: '20 horas',
  ratingEmpresa: 4.4,
  evaluaciones: 234,
  extracto: '…primeras ~300 palabras de la descripción…'
}
```

Los selectores hay que verificarlos contra el sitio real, como se hizo con
`[offer-grid-article-company-url]` (`computrabajo.js:80`). **No inventarlos.**

### Costo

Abrir una tarjeta son ~2–4 s. Con ~6 grises de 20, son ~20 s por página. Y las de `postular` se
abren igual para postular, así que ahí es gratis: el costo neto son solo las grises que terminan
rechazadas — justo donde la información vale más.

### Gana en las dos direcciones

- **Rescata** ofertas buenas que el título no dejaba ver.
- **Caza** ofertas malas que solo se delatan en el cuerpo ("se requiere licencia A-5", "renta
  100% variable") — que hoy pasarían el filtro por título y recién se descartarían con el veto
  de cuerpo, ya con la oferta abierta.

---

## C. Razones estructuradas

**Problema, textual.** `extension/core.js:391`:

```js
razones.push('fuera de las comunas que buscas');
```

El scorer **sabe** en qué comuna está la oferta (`campos.ubicacion`) y **sabe** cuáles busca la
persona (`perfil.ubicacion.comunas`), y no pone ninguna de las dos en el texto. Por eso todas
las tarjetas de "Por decidir" dicen exactamente lo mismo.

**Y el problema de fondo es de arquitectura:** el scorer arma un string ya formateado, y ese
mismo string tiene que servir para el log de la extensión (donde conviene corto) y para la
tarjeta del dashboard (donde conviene rico). No sirve bien para ninguno.

**Cambio: emitir estructura, formatear en cada superficie.**

```js
// En vez de strings, objetos con los valores adentro:
{ tipo: 'rol',       rol: 'vendedor', termino: 'asesor comercial', campo: 'titulo' }
{ tipo: 'ubicacion', ofertaEn: 'maipu', buscadas: ['providencia', 'santiago centro'] }
{ tipo: 'senal',     patron: 'part time', delta: 15 }
{ tipo: 'veto',      patron: 'comision pura', razon: '…', donde: 'cuerpo' }
{ tipo: 'sin_rol' }
```

Después cada superficie renderiza lo suyo:

| Superficie | Cómo lo muestra |
|---|---|
| Log de la extensión | Una línea corta: `Maipú no está en tus comunas` |
| Tarjeta "Por decidir" | El intercambio completo (ver §D) |
| Overlay | Solo agrupa por `tipo` para sacar la razón más frecuente |

**Compatibilidad:** `DecisionOferta.razones` es `Json?`, así que acepta la forma nueva sin
migración. Las filas viejas traen strings — el render tiene que aceptar ambas y no reventar con
las que ya están guardadas.

---

## D. La tarjeta de «Por decidir»

**Hoy** (`app/dashboard/por-decidir/page.tsx:118-145`) muestra: empresa, link "Ver oferta", días
restantes y las razones crudas. Nada más.

**Criterio para agregar campos:** solo entra lo que **cambia la decisión**. La tarjeta se lee de
un vistazo mientras se hace swipe; no es una ficha completa, para eso está el link.

### Lo que entra

| Campo | Por qué | De dónde |
|---|---|---|
| **Comuna** | Es la queja concreta: la razón habla de comunas y no dice cuál | Tarjeta (ya se tiene) |
| **Chips de facetas** — `Part time` `Presencial` `Plazo fijo` | Deciden solos en la mayoría de los casos | Etapa 2 |
| **Sueldo** | Cuando el aviso lo declara, decide solo | Etapa 2 |
| **Publicada hace** | "hace 20 horas" vs "hace 15 días" cambia si vale la pena | Etapa 2 |
| **Rating de la empresa** (4,4 ★ · 234 evaluaciones) | Señal real que Computrabajo ya calcula | Etapa 2 |
| **Extracto** 2–3 líneas | Evita abrir el link en la mayoría de los casos | Etapa 2 |

### Lo que NO entra

- **El score numérico.** No significa nada para la persona y compite con la razón.
- Plataforma, id interno, versión del perfil.

### Las razones, reformuladas

Deja de ser una lista de bullets del cálculo y pasa a ser **el intercambio que se está pidiendo
decidir**:

```
✓  Calza contigo      "asesor comercial" es sinónimo de vendedor
✗  Pero               está en Maipú; tú buscas Providencia y Santiago Centro
```

Misma información, con los valores adentro. Las **señales** (`+15 por "part time"`) no van como
razón: ya aparecen como chips, y ahí se leen mejor.

### Degradar bien

Una oferta gris a la que **no** se le corrió la Etapa 2 —porque el escaneo se cortó, porque el
portal cambió, porque es una fila vieja— muestra lo que tenga. Nunca un espacio en blanco ni un
"—". El link "Ver oferta" está siempre.

---

## E. Esquema

`DecisionOferta` necesita guardar lo que saca la Etapa 2. Un solo campo `Json?` en vez de seis
columnas: son datos de presentación, varían por portal y no se consultan por separado.

```prisma
model DecisionOferta {
  // … campos actuales …

  // Datos del aviso capturados en la Etapa 2 (docs/visibilidad-y-etapa2.md §B).
  // Json y no columnas porque cada portal expone facetas distintas y esto solo
  // se lee para pintar la tarjeta, nunca para filtrar ni agrupar.
  // { jornada, modalidad, contrato, sueldo, publicadaHace, ratingEmpresa,
  //   evaluaciones, extracto } -- todos opcionales, la tarjeta degrada sola.
  detalleAviso Json? @map("detalle_aviso")
}
```

`razones` ya es `Json?` y no necesita migración (ver §C).

---

## F. Orden

| # | Tarea | Depende de |
|---|---|---|
| **1** | **Desglose en el overlay** (§A) | — |
| 2 | Razones estructuradas en el scorer + render en las dos superficies (§C) | — |
| 3 | `extraerFacetasAviso()` con selectores verificados contra el sitio (§B) | — |
| 4 | Etapa 2 en el bucle de escaneo, solo para banda gris (§B) | 3 |
| 5 | `detalleAviso` en el esquema y en el reporte de banda gris (§E) | 3 |
| 6 | Tarjeta de "Por decidir" enriquecida (§D) | 2, 5 |

Los pasos **1, 2 y 3 son independientes** entre sí y se pueden hacer en paralelo. El 1 primero
porque sin él no se puede verificar nada de lo demás.

---

## G. Limpieza pendiente: el filtro de IA viejo

`computrabajo.js:606` todavía tiene el bucle de `clasificarOfertasIA`. Corre **después** del
scorer y puede vetar ofertas que el scorer aprobó, usando la lógica vieja del objetivo como blob
de texto libre — justo lo que este rediseño reemplazó.

Está detrás de `AP.cfg.usarIAFiltros`, que viene apagado, así que hoy no cuesta nada. Pero si
alguien lo prende hay dos filtros peleando y uno de ellos cobra por llamada.

**Sacarlo**, o dejarlo corriendo **solo cuando el scorer local está desactivado**
(`!usarScorerLocal`), que es el único caso en que tiene sentido.

---

## H. Criterios de aceptación

1. **El overlay explica.** Con un perfil de "desarrollador" escaneando ofertas de ventas, el
   overlay dice cuántas se descartaron y por qué, no "0 de 20 coinciden".
2. **Dos ofertas grises distintas muestran razones distintas.** Es la queja original: hoy todas
   dicen lo mismo. La razón de ubicación debe nombrar la comuna de la oferta y las buscadas.
3. **Una oferta gris con Etapa 2 corrida** muestra al menos jornada, modalidad y extracto.
4. **Una oferta gris sin Etapa 2** (fila vieja) se sigue viendo bien, sin huecos ni "undefined".
5. **La Etapa 2 no corre en las ofertas que ya se decidieron** en la Etapa 1. Verificable
   contando aperturas contra ofertas en banda gris.
6. **Las razones viejas (strings) siguen renderizando** en las filas ya guardadas.
