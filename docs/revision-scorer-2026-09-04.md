# Revisión del scorer local — 2026-09-04

Revisión de `extension/core.js` (`AP.puntuarOferta`, `apPatronPalabra`) contra §6 del documento
de diseño. **Tres hallazgos, dos críticos y vivos en producción.**

Todo lo de abajo está reproducido ejecutando el código real, no leído. Las correcciones
propuestas pasan los 15 casos de `extension/verificar-scorer.js` sin modificarlos.

---

## 🔴 1. El clamp anula todo el sistema de pesos

**Dónde:** `extension/core.js`, dentro de `AP.puntuarOferta`, bucle de roles.

```js
const multiplicadorCampo = resultado.enTitulo ? 3 : resultado.enEmpresa ? 1 : 0.5;
const puntaje = peso * 100 * multiplicadorCampo;
if (puntaje > score) { score = puntaje; ... }
...
score = Math.min(100, score);
```

Con `peso = 1`, un match en título da `1 × 100 × 3 = 300`, y en empresa da `1 × 100 × 1 = 100`.
**Los dos terminan clampeados a 100.** El ×3 no existe.

Y como `peso × 100 × 3 ≥ 100` para cualquier `peso ≥ 0.34`, **el `peso` del rol tampoco hace
nada** cuando el match es en el título.

### Reproducción

Perfil: `vendedor` peso 1.0, `cajero` peso 0.5. Umbrales 65 / 45.

| Caso | Score actual | Banda actual | Esperado |
|---|---|---|---|
| `Vendedor part time` @ Falabella | 100 | postular | ✅ correcto |
| `Bodeguero nocturno` @ **Vendedores Unidos SpA** | **100** | **postular** | ❌ debería descartar |
| `Cajero de retail` (rol peso 0.5) | **100** | postular | ❌ debería dar ~50 |

**El caso 2 es el grave:** postula a un puesto de bodeguero porque el *nombre de la empresa*
contiene "Vendedores". Es exactamente el bug de §2.1 que el scorer venía a arreglar, movido de
lugar.

### Corrección

Los multiplicadores deben ser **factores ≤ 1**, no multiplicadores > 1, para que el clamp no
los coma:

```js
// ANTES
const multiplicadorCampo = resultado.enTitulo ? 3 : resultado.enEmpresa ? 1 : 0.5;

// DESPUÉS
const multiplicadorCampo = resultado.enTitulo ? 1 : resultado.enEmpresa ? 0.35 : 0.3;
```

Resultado con la corrección:

| Caso | Score | Banda |
|---|---|---|
| `Vendedor part time` @ Falabella | 100 | postular |
| `Bodeguero nocturno` @ Vendedores Unidos SpA | 35 | descartar |
| `Cajero de retail` (peso 0.5) | 50 | gris |
| `Guardia de turno` @ Cajeros Chile (peso 0.5) | 18 | descartar |

Ahora las dos dimensiones —campo y peso del rol— se reflejan en el score.

> **Nota:** el comentario de `extension/adapters/computrabajo.js:85` dice *"funciona bien porque
> el título pesa x3 contra el x0.5 del cuerpo"*. Ese comentario describe la intención correcta;
> el código no la implementaba. Con esta corrección pasa a ser cierto.

---

## 🔴 2. El sufijador no maneja plurales en `-s` ni femeninos de palabras en `-o`

**Dónde:** `extension/core.js`, `apPatronPalabra`.

```js
if (/^[a-z]+(o|or|ista)$/.test(palabra)) {
  return escapada + '(?:a|as|es|os)?';
}
```

El sufijo se **agrega** a la palabra completa, sin quitar la vocal final. Para palabras en `-or`
funciona (`vendedor` + `es` = `vendedores` ✓). Para palabras en `-o` **no**:

- `cajero` + `(?:a|as|es|os)?` genera `cajeroa`, `cajeroes`, `cajeroos`
- **nunca genera `cajera` ni `cajeros`**

Y la alternancia no incluye `s` a secas, así que `-ista` tampoco pluraliza
(`electricistas` no matchea).

### Reproducción — 7 de 16 títulos comunes fallan

| Rol buscado | Aviso | ¿Matchea? |
|---|---|---|
| vendedor | Vendedor / Vendedora / Vendedores / Vendedoras | ✅ los 4 |
| cajero | Cajero de retail | ✅ |
| cajero | **Cajera supermercado** | ❌ |
| cajero | **Se necesitan cajeros** | ❌ |
| cajero | **Cajeras part time** | ❌ |
| operario | **Operarios de producción** | ❌ |
| bodeguero | **Bodegueros turno noche** | ❌ |
| electricista | **Electricistas industriales** | ❌ |
| recepcionista | **Recepcionistas turno** | ❌ |

**Por qué importa más de lo que parece:** es un **falso negativo silencioso**. La oferta no
matchea ningún rol → score 0 → banda `descartar` → el log dice *"no se encontró ninguno de los
roles buscados"*. El usuario nunca ve la oferta y nunca sabe que existió. Y el femenino y el
plural son formas extremadamente comunes en los avisos chilenos.

### Corrección

```js
function apPatronPalabra(palabra) {
  // Palabras muy cortas no se flexionan: 'la', 'de', 'pt' no son cargos y
  // recortarles la vocal final genera patrones que matchean cualquier cosa.
  if (palabra.length < 4) return apEscaparRegex(palabra);
  // -or: vendedor -> vendedor/a/es/as   (el sufijo se AGREGA)
  if (/^[a-z]+or$/.test(palabra)) return apEscaparRegex(palabra) + '(?:a|es|as)?';
  // -ista / -e: electricista -> +s ; jefe -> jefes
  if (/^[a-z]+(ista|e)$/.test(palabra)) return apEscaparRegex(palabra) + 's?';
  // -o: cajero -> cajer + o/a/os/as   (hay que QUITAR la vocal final)
  if (/^[a-z]+o$/.test(palabra)) return apEscaparRegex(palabra.slice(0, -1)) + '(?:o|a|os|as)';
  // -a: cajera -> cajer + o/a/os/as
  if (/^[a-z]+a$/.test(palabra)) return apEscaparRegex(palabra.slice(0, -1)) + '(?:o|a|os|as)';
  // consonante (chofer, auxiliar): +es
  if (/^[a-z]*[bcdfglmnprstvz]$/.test(palabra)) return apEscaparRegex(palabra) + '(?:es)?';
  return apEscaparRegex(palabra);
}
```

**Verificado:** 16 de 16 casos pasan, y los 15 casos de `verificar-scorer.js` siguen en verde.

---

## 🟡 3. Los vetos escanean también empresa y cuerpo

**Dónde:** `AP.puntuarOferta`, bucle de vetos → `buscar()` devuelve `enTitulo || enEmpresa ||
enCuerpo` sin distinguir campo, y el veto corta duro.

Esto **reintroduce el problema de polaridad de §2.1**: un veto de `"comisión"` mata un aviso
que dice *"sueldo fijo, **sin** comisión"*, y un veto de `"call center"` mata un aviso de
analista de datos publicado por *"Konecta Call Center SpA"*.

**Estado:** parcialmente latente. Hoy los adaptadores pasan `cuerpo: ''`
(`computrabajo.js:86`, `laborum.js:87`), así que el caso del cuerpo no se puede dar todavía —
pero **el de empresa sí está vivo**, y el del cuerpo se activa solo el día que se pase el texto
del aviso.

### Corrección sugerida

Separar la severidad por campo:

- Veto que matchea en **título o empresa** → corte duro, como ahora.
- Veto que matchea **solo en el cuerpo** → penalización fuerte (ej. `-60`) en vez de corte.

Así la intención se respeta sin que una mención de pasada en el boilerplate mate una oferta
buena. Y como el score baja mucho, lo más probable es que caiga en banda gris — que es
justamente donde debe ir una oferta dudosa (§8).

---

## 🟡 4. La suite de verificación no cubre las dimensiones donde estaban los bugs

`extension/verificar-scorer.js` tiene 15 casos, todos en verde — pero **ninguno prueba**:

- que un match en título puntúe más que uno en empresa
- que `peso: 0.5` puntúe menos que `peso: 1.0`
- plurales o femeninos fuera de `vendedor` (la única raíz probada, y es `-or`, el único caso
  que funcionaba)

Por eso los dos bugs críticos pasaron. **Agregar estos casos antes de dar el scorer por
validado:**

```
- rol en título vs. mismo rol solo en empresa  -> el de título debe puntuar más
- peso 0.5 en título                            -> ~la mitad que peso 1.0
- cajero/cajera/cajeros/cajeras                 -> los 4 matchean
- operario/operarios, recepcionista/recepcionistas
- veto en el nombre de la empresa               -> decidir si corta o penaliza
```

---

## Estado general

Fuera de estos puntos, la implementación sigue el diseño de cerca y está bien hecha:

- La convivencia con `coincideFiltros` detrás de `AP.cfg.scorer.usarScorerLocal` es exactamente
  lo que pedía §13 — se puede desactivar el scorer sin desplegar.
- `apConstruirPatron` **no** usa flag `g`, así que no hay bug de `lastIndex` con los tres
  `rx.test()` seguidos. Bien visto.
- Los límites de palabra están correctos: `aseo` no matchea dentro de `paseo`.
- Las `razones[]` se llenan siempre y el veto reporta su razón real, no una genérica.
- `AP.evaluarOferta` deja a los adaptadores agnósticos de qué ruta está activa.

**Recomendación:** no activar `usarScorerLocal` para usuarios reales hasta corregir los
hallazgos 1 y 2. El hallazgo 2 en particular hace desaparecer ofertas en silencio, que es el
peor modo de falla posible para este producto.
