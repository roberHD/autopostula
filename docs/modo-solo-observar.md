# Modo «solo observar» — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-07.
> **Tamaño:** chico. Un flag de config y un corte en dos bucles.

---

## 1. Por qué

### 1.1 El motivo inmediato: no se puede juntar el corpus

`extension/adapters/computrabajo.js`:

```js
async function escanear() {
  if (!AP.activo || AP.procesando || !AP.cfg) return;
```

**Con la extensión apagada no se cosecha nada. Con la extensión prendida, postula.** No hay
punto intermedio.

Consecuencia medida hoy contra la base de producción:

```
Total JobOffer:                          5   (postulaciones reales del 2-3 sep)
Avistamientos puros (postulada = false): 0
Títulos cosechados (origen = COSECHADO): 0
```

**La cosecha pasiva (§7.2 del rediseño) está construida y nunca ha producido una sola fila.** Y
no se puede arrancar sin quemar el cupo mensual de postulaciones en ofertas que no se quieren,
solo para recolectar datos. `modoRevision` no sirve como sustituto: obliga a un clic por oferta,
y una recolección seria son cientos.

### 1.2 El motivo permanente: nadie deja actuar a algo que no ha visto actuar

Un usuario nuevo instala una extensión que **postula a trabajos en su nombre**. Pedirle que la
active a ciegas es pedirle mucho. Poder decir *"míralo trabajar sin que envíe nada"* es la
diferencia entre probarlo y no instalarlo.

Es la misma idea que el modo revisión, un paso antes.

---

## 2. Qué hace

Con el modo activo, la extensión hace **todo** lo que hace normalmente —escanear, puntuar,
Etapa 2, reportar avistamientos y títulos, mandar a banda gris— **excepto abrir el aviso para
postular y enviar el formulario**.

| Acción | Normal | Solo observar |
|---|---|---|
| Escanear tarjetas y puntuar | ✅ | ✅ |
| Reportar avistamientos y títulos vistos | ✅ | ✅ |
| Etapa 2 (abrir el aviso de las grises, leer facetas) | ✅ | ✅ |
| Reportar banda gris al dashboard | ✅ | ✅ |
| Avanzar de página | ✅ | ✅ |
| **Abrir el aviso para postular** | ✅ | ❌ |
| **Rellenar y enviar el formulario** | ✅ | ❌ |
| **Llamadas a la IA de postulación** | ✅ | ❌ **ninguna** |
| **Consumir cupo del plan** | ✅ | ❌ |
| **Postular desde una aprobación de banda gris** | ✅ | ❌ (ver §4.3) |

### Dos propiedades que se siguen de esto

1. **El modo observar no cuesta nada.** Todas las llamadas a la IA de postulación
   (`analizarOferta`, `procesar-postulacion`) viven dentro de `postular()`. Si no se entra ahí,
   no hay gasto. Vale decirlo en la interfaz: *"observar es gratis"*.
2. **No consume cupo.** No se crea ninguna `Application`, así que
   `obtenerEstadoPostulaciones` no se toca.

---

## 3. Cambios

### 3.1 Config

Un flag más en `AP.cfg`, junto a `modoRevision`:

```js
soloObservar: document.getElementById('toggle-observar')?.checked || false,
```

Se guarda y se lee igual que `modoRevision` (`extension/popup.js:348` y `:438`).

### 3.2 El corte en el bucle de escaneo

`computrabajo.js`, dentro de `for (const {t, id, titulo} of pendientes)`:

```js
if (AP.cfg.soloObservar) {
  AP.vistos.add(id);
  addLog({ ts: Date.now(), status: 'observado', title: titulo, url, uid: id,
           reason: 'Habría postulado — modo solo observar' });
  continue;                       // sin activar() y sin postular()
}
```

Va **antes** de `activar(t)`: en modo observar no hay que abrir el aviso de las que se
postularían. (Las grises sí se abren, pero eso ocurre antes en la Etapa 2 y no cambia.)

Mismo corte en el bucle equivalente de `laborum.js`.

### 3.3 El estado nuevo del log

`status: 'observado'` es un valor nuevo. Hay que:

- Darle color y etiqueta propios en `extension/historial.html` / `historial.js` — que **no se
  vea como una postulación real**, porque no lo es.
- Revisar cualquier conteo que agrupe por `status` y no asuma que solo existen `ok`, `skip` y
  `err`.

### 3.4 El overlay tiene que decirlo

Esto es requisito de seguridad, no cosmético: **la persona nunca puede quedar en duda sobre si
la extensión está postulando o no.**

`AP.mensajeEscaneo` (el desglose de `visibilidad-y-etapa2.md` §A) suma el modo al mensaje:

```
👁  Solo observar · 2 habría postulado · 6 por decidir · 12 descartadas
```

Y el popup lo muestra de forma persistente mientras esté activo, no solo al escanear.

---

## 4. Decisiones tomadas

Están resueltas; no hay que relitigarlas.

### 4.1 La Etapa 2 **sí** corre

Abre el aviso de las grises para leer las facetas. Se mantiene: es exactamente el dato que la
recolección de corpus quiere, y hace que lo que la persona ve en modo observar sea lo mismo que
va a pasar cuando active de verdad.

### 4.2 La banda gris **sí** se reporta

Es la representación honesta de *"esto es lo que pasaría"*. La cola tiene TTL, así que si se
llena durante una recolección grande, se vacía sola.

### 4.3 Las aprobaciones de banda gris **también** se bloquean

`AP.aplicarDirecto` (el camino de §8.6: aprobaste una oferta en el dashboard y la extensión va y
postula) **debe negarse** en modo observar, y decir por qué.

Podría argumentarse que aprobar es un acto deliberado y debería pasar por encima del modo. Se
decidió que no: **"solo observar" tiene que significar lo que dice.** Un modo que a veces postula
por otra puerta es peor que no tenerlo. El dashboard debe explicar que hay que salir del modo
observar para que se envíen las aprobadas.

### 4.4 Gana sobre `modoRevision`

Si los dos están activos, observar gana — no hay nada que revisar si no se envía nada. La
interfaz debería atenuar el toggle de revisión mientras observar esté puesto.

### 4.5 La búsqueda automática lo respeta

Si la búsqueda automática corre con el modo puesto, cosecha y no postula. Es coherente y además
es la forma cómoda de juntar corpus sin estar encima.

---

## 5. Criterios de aceptación

1. **No postula.** Con el modo activo, escanear una página de resultados no crea ninguna
   `Application` ni dispara ninguna llamada a `/api/ai/procesar-postulacion`. Verificable
   contando filas y revisando `AiUsageLog`.
2. **Sí cosecha.** El mismo escaneo crea filas en `JobOffer` con `postulada = false` y en
   `TituloCanonico` con `origen = COSECHADO`.
3. **El cupo no se mueve.** El contador de postulaciones del mes queda igual antes y después.
4. **La banda gris funciona igual**, con `detalleAviso` poblado por la Etapa 2.
5. **No se puede postular por la puerta de atrás.** Aprobar una oferta en "Por decidir" con el
   modo activo no postula, y el dashboard explica por qué.
6. **Es imposible confundirse.** Con el modo activo, tanto el popup como el overlay lo dicen
   explícitamente.
7. **El historial distingue.** Las entradas `observado` no se ven ni se cuentan como
   postulaciones reales.

---

## Apéndice — El protocolo de recolección de corpus

Para qué se necesita esto ahora mismo: medir el solapamiento de empresas entre portales y
decidir si vale la pena sumar un tercero (`scripts/solapamiento-portales.ts`).

**La validez depende de buscar lo mismo en los dos portales.** Si se buscan cosas distintas, el
resultado no mide los portales, mide las búsquedas.

1. Activar **solo observar**. Desactivar la búsqueda automática, para que no meta búsquedas del
   objetivo declarado y contamine la muestra.
2. Buscar **los mismos tres términos en los dos portales**, misma región, mismo día:
   - `vendedor` — operativo/retail
   - `asistente administrativo` — administrativo
   - `desarrollador` — técnico
3. **5 páginas de cada término en cada portal.** Igual profundidad en los dos.
4. Correr `npx tsx scripts/solapamiento-portales.ts`.

> **No medir con un solo término.** `vendedor` es retail, y retail está dominado por cadenas
> grandes que publican en todos los portales. Medir solo eso **sobreestima el solapamiento** y
> llevaría a descartar un tercer portal por la razón equivocada. Con tres términos se ve además
> si el solapamiento depende del rubro — que es un resultado más útil que un sí o un no.

Meta: **150 o más empresas identificadas por portal.** El script avisa si la muestra quedó floja.
