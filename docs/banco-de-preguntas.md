# Las preguntas de los formularios como activo — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-07.
> **Relacionado:** `docs/rediseno-filtrado-ofertas.md` (§3 compilar vs. ejecutar, §7 corpus),
> `docs/README.md` (principios 1, 2 y 3).

---

## 1. La idea

> **Las preguntas de los formularios son una propiedad del mercado, no de la postulación.**

Es el mismo patrón que ya funcionó con los títulos de cargo. Los formularios chilenos preguntan
casi siempre lo mismo —pretensión de renta, disponibilidad, experiencia en el rubro, si vives
cerca, si tienes licencia— y hoy cada una de esas preguntas se le manda a un modelo como si fuera
la primera vez que alguien la ve.

Miles de postulaciones, unas pocas decenas de preguntas de fondo. Eso habilita **compilar una
vez, ejecutar gratis**, igual que el perfil de búsqueda.

---

## 2. Lo que ya existe (y lo que se está perdiendo)

### 2.1 🔴 La señal más valiosa se está botando

`backend/app/api/applications/route.ts:161`, comentario del propio código:

```js
// Por ahora respuestaIa y respuestaFinal son iguales — todavía no
respuestaIa:    r.respuesta || "",
respuestaFinal: r.respuesta || "",
fueEditada:     false,
```

El modo revisión (`AP.mostrarRevision`, `extension/core.js:710`) deja editar cada respuesta antes
de enviarla. `aplicarEdiciones()` (línea 894) escribe la corrección **encima** de
`entry.respuesta`, y la versión original de la IA deja de existir.

**`(pregunta, lo que escribió la IA, lo que corrigió la persona)` es un dataset de correcciones
etiquetadas.** Es lo más caro de conseguir en un sistema así, se genera gratis cada vez que
alguien usa el modo revisión, y hoy se pierde.

### 2.2 Dos campos del esquema nunca se llenaron

`ApplicationAnswer` ya tiene la forma correcta:

| Campo | Estado hoy |
|---|---|
| `pregunta` | ✅ se llena |
| `respuestaIa` | ⚠️ se llena con el valor final, no con el de la IA |
| `respuestaFinal` | ✅ se llena |
| `fueEditada` | ❌ siempre `false` |
| `tema` | ❌ nunca se llena — es justo donde va la pregunta canónica (§4) |

### 2.3 `StyleRefinement` está construida y nunca se cableó

Cero referencias en `app/` y `lib/`. Sus campos —`patronDetectado`, `preguntaGenerada`,
`opcionesJson`, `respuestaElegida`, `estado`— son exactamente el flujo de §6. Es andamiaje
esperando esta función.

---

## 3. Parte A — Capturar bien (primero, y es chico)

**Sin esto, nada de lo demás tiene datos.** Y cada postulación revisada mientras tanto es señal
perdida para siempre.

### Extensión

Al crear cada entrada de `respuestasLog` (en `rellenar` / `manejarGruposDeOpciones` de
`computrabajo.js`, y su equivalente en `laborum.js`), guardar la respuesta original en un campo
propio que **nunca** se sobrescribe:

```js
respuestasLog.push({
  pregunta,
  respuestaIa: valorGenerado,   // se escribe una vez y no se toca nunca más
  respuesta:   valorGenerado,   // esta sí la pisa aplicarEdiciones()
  …
});
```

`aplicarEdiciones()` ya solo toca `entry.respuesta`, así que no hay que cambiarla. Y al armar
`respuestasParaLog` (`computrabajo.js:564`), llevar las dos:

```js
respuestasLog.map(r => ({
  pregunta: r.pregunta,
  respuestaIa: r.respuestaIa,
  respuesta: r.respuesta,
  fueEditada: r.respuestaIa !== r.respuesta,
  vacia: r.vacia,
  fueIA: r.fueIA,
}))
```

### Backend

`applications/route.ts` deja de duplicar el valor y guarda lo que llega. Si `respuestaIa` no
viene (extensión vieja), cae al valor final como hoy — no se rompe nada.

---

## 4. Parte B — El banco de preguntas canónicas

Mismo pipeline de dos etapas que los títulos, con una diferencia importante.

### 4.1 Etapa 1: normalización determinista, sin IA

Las preguntas traen ruido propio del formulario:

```
"¿Cuál es tu pretensión de renta líquida? (obligatorio)"
"Indica tu renta líquida esperada"
"¿Cuánto esperas ganar en este cargo? *"
```

Quitar: numeración (`1.`, `Pregunta 3:`), marcas de obligatoriedad (`*`, `(obligatorio)`),
nombre de la empresa cuando aparece, signos sobrantes, espacios. Minúsculas y sin tildes, con el
**mismo criterio que `AP.n`** — ver la trampa de normalización de
`rediseno-filtrado-ofertas.md` §13.

### 4.2 Etapa 2: clasificar contra un set semilla, no agrupar libre

⚠️ **Acá no hay catálogo oficial como el CIUO.** Agrupar en abierto es justo lo que
`rediseno-filtrado-ofertas.md` §7.0 descartó por frágil y no verificable.

**En vez de eso: semilla a mano + crecimiento medido.**

1. Escribir a mano las ~20 preguntas canónicas obvias. Es una tarde, como la lista de comunas:

   ```
   pretension_renta · disponibilidad · experiencia_rubro · años_experiencia
   vive_cerca · movilizacion_propia · licencia_conducir · nivel_estudios
   situacion_laboral_actual · referencias · turnos_fines_de_semana
   manejo_excel · ingles · por_que_te_interesa · fortalezas · pretension_horaria
   ```

2. El clasificador mapea cada pregunta normalizada a una canónica **o a `ninguna`**, con el
   mismo patrón de §7.4: batch, Batch API, y prefiltrado local antes de llamar al modelo.

3. **Revisar periódicamente las `ninguna` ordenadas por frecuencia.** Ahí está la lista exacta de
   qué canónicas faltan. Se agregan a mano y se reclasifica solo lo pendiente.

La canónica resultante se guarda en `ApplicationAnswer.tema`, que hoy está vacío.

---

## 5. Parte C — Pre-respuestas del usuario

El pago de todo lo anterior.

Con el banco armado, se le muestran a la persona **las 15 preguntas que más le van a hacer en su
rubro**, y las responde **una vez, con sus propias palabras**.

Después, cuando un formulario pregunte algo que mapea a una canónica con respuesta guardada:

```
pregunta → normalizar → canónica → ¿hay respuesta guardada?
                                      SÍ  → usarla. Sin IA.
                                      NO  → generar con IA, y ofrecer guardarla
```

Por qué importa más de lo que parece:

- **Más barato:** las preguntas comunes dejan de pasar por el modelo.
- **Mejor:** son sus palabras, no las de un modelo que las inventa a partir del CV.
- **Más rápido:** no hay latencia de API en las preguntas frecuentes.
- **Más consistente:** ver §7.

Dónde vive: una sección nueva del dashboard, y también ofrecible al final del onboarding.
Reusa el mismo componente de swipe si conviene, pero acá la respuesta es texto, no sí/no.

---

## 6. Parte D — Aprender de las correcciones

Con `fueEditada` bien poblado (§3), se puede detectar **patrones** en cómo la persona corrige a
la IA. Ejemplos reales que van a aparecer:

- Siempre acorta las respuestas.
- Siempre saca los signos de exclamación.
- Cambia "apasionado" o "proactivo" por algo más sobrio.
- Siempre menciona una experiencia concreta que la IA omite.

Cuando un patrón se repite en **N correcciones** (sugerido: 3), se escribe un `StyleRefinement`
con `patronDetectado` y una `preguntaGenerada` con opciones:

```
Notamos que sueles acortar las respuestas que escribimos.
¿Quieres que escribamos más corto siempre?
   [ Sí, más corto ]   [ Déjalo como está ]   [ Aún más corto ]
```

La respuesta ajusta `StyleProfile` (`longitudRespuesta`, `manualEscritura`, `instrucciones`).

**Esto cierra un hueco real del diseño actual:** hoy el perfil de estilo depende solo de la
conversación inicial. Con esto aprende de lo que la persona hace de verdad, que es mejor señal
que lo que dijo que hacía.

Es el principio #3 aplicado a otra cosa: la corrección humana es la etiqueta, y no hay que
pagarla.

---

## 7. Parte E — Coherencia entre postulaciones

**Esto no es una optimización, es un riesgo del producto.**

Si la IA responde *"3 años de experiencia"* en una postulación y *"más de 5 años"* en otra, y las
dos llegan a **la misma empresa** —que publica varias ofertas a la vez, cosa que pasa
constantemente— quien las lea va a ver a alguien que se contradice. Ante el reclutador el
responsable es el usuario, no AutoPostula (así lo dicen los Términos §5), y el daño es suyo.

Reusar la respuesta guardada para la misma pregunta canónica **elimina esa clase de
inconsistencia por construcción**.

Para lo que igual se genere con IA, un chequeo barato: si dos respuestas a la misma canónica
difieren en un dato duro (un número, un sí/no), avisar en el dashboard.

> **El caché de respuestas no es una optimización de costo. Es una función de integridad.**

---

## 8. Parte F — Lo que NO se hace

`Application.estadoActual` guarda `ENVIADO`, `VISTO`, `EN_PROCESO`, `FINALISTA`. Es tentador
cruzar respuestas con resultados y decirle a la persona *"responde así y te llaman más"*.

**No se hace.** Razones concretas, no cautela genérica:

1. **El tamaño de muestra no da.** Con decenas o cientos de postulaciones por usuario, cualquier
   correlación va a ser ruido.
2. **Los factores de confusión dominan.** Si te llaman depende del aviso, la empresa, tu CV y el
   momento — no de cómo quedó redactada una respuesta.
3. **El daño es concreto.** Alguien baja su pretensión de renta porque el producto le dijo que
   eso funciona, y era casualidad. Eso es plata real de una persona buscando trabajo.

Si algún día hay decenas de miles de postulaciones, se puede mirar — pero **descriptivo**
(*"los avisos de este rubro suelen pedir X"*), nunca **causal** (*"responde X para conseguir más
entrevistas"*). Y aun ahí, con el intervalo de confianza a la vista.

---

## 9. Privacidad: dónde está la línea

Es lo más importante de este documento y hay que respetarlo desde la primera línea de código.

| Dato | ¿Se agrupa entre usuarios? | Por qué |
|---|---|---|
| **La pregunta** (texto del formulario) | ✅ Sí | La escribió la empresa. Es texto del aviso, igual que el título del cargo |
| **La respuesta** | ❌ **Nunca** | Es información personal de quien la escribió |
| **La canónica** (`tema`) | ✅ Sí | Es una etiqueta, no contenido |
| **El patrón de corrección** | ❌ Nunca sale de la cuenta | Aunque sea "acorta las respuestas", describe a esa persona |

El banco de preguntas es análogo al diccionario de cargos: sin datos personales, y la política de
privacidad ya lo cubre en el mismo espíritu (§2.5, *"nunca información de usuarios"*).

**Si las respuestas se mezclan entre usuarios, hay un problema serio de datos personales y una
política de privacidad que quedó mintiendo.** No hay una versión "solo para mejorar el modelo"
que sea aceptable acá sin volver a redactar la política y pedir consentimiento aparte.

---

## 10. Esquema

```prisma
// Catálogo de preguntas canónicas. GLOBAL y chico -- la semilla a mano (§4.2)
// más lo que se vaya agregando al revisar las "ninguna" por frecuencia.
model PreguntaCanonica {
  id          String   @id @default(uuid())
  clave       String   @unique              // "pretension_renta"
  etiqueta    String                        // "Pretensión de renta"
  descripcion String?                       // ayuda que se le muestra a la persona
  rubros      Json?                         // códigos CIUO donde más aparece, para priorizar
  frecuencia  Int      @default(0)          // cuántas veces se ha visto, para ordenar
  creadoEn    DateTime @default(now()) @map("creado_en")

  respuestas RespuestaGuardada[]

  @@index([frecuencia])
  @@map("preguntas_canonicas")
}

// La respuesta de UNA persona a UNA pregunta canónica. Nunca se agrupa ni se
// comparte entre usuarios (§9).
model RespuestaGuardada {
  id                  String   @id @default(uuid())
  userId              String   @map("user_id")
  preguntaCanonicaId  String   @map("pregunta_canonica_id")
  respuesta           String   @db.Text
  // ESCRITA = la persona la escribió; HEREDADA = salió de una corrección suya
  // en el modo revisión y se le ofreció guardarla.
  origen              OrigenRespuesta @default(ESCRITA)
  actualizadoEn       DateTime @updatedAt @map("actualizado_en")

  user     User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  pregunta PreguntaCanonica @relation(fields: [preguntaCanonicaId], references: [id])

  @@unique([userId, preguntaCanonicaId])
  @@map("respuestas_guardadas")
}

enum OrigenRespuesta {
  ESCRITA
  HEREDADA
}
```

`ApplicationAnswer` no cambia de forma: solo empieza a llenar `respuestaIa`, `fueEditada` y
`tema` de verdad (§3, §4.2).

---

## 11. Orden

| # | Tarea | Depende de | Nota |
|---|---|---|---|
| **1** | **Capturar `respuestaIa` / `fueEditada` de verdad** (§3) | — | Chico y urgente: sin esto no hay datos |
| 2 | Normalización determinista de preguntas (§4.1) | — | Sin IA |
| 3 | Semilla de ~20 preguntas canónicas escrita a mano (§4.2) | — | Lo escribe Roberto |
| 4 | Clasificador de preguntas contra la semilla, con `ninguna` (§4.2) | 2, 3 | Batch, offline |
| 5 | `PreguntaCanonica` + `RespuestaGuardada` en el esquema (§10) | 3 | |
| 6 | Pantalla de pre-respuestas + reuso en el flujo de postulación (§5) | 4, 5 | **El pago de todo** |
| 7 | Detección de patrones → `StyleRefinement` (§6) | 1 | |
| 8 | Chequeo de coherencia (§7) | 5 | |

**El paso 1 va primero y va ya.** Es de pocas líneas, y cada postulación que revisas antes de
que esté es una corrección que se pierde para siempre.

Los pasos 2 y 3 son independientes entre sí y del 1.

---

## 12. Criterios de aceptación

1. **La corrección se guarda.** Editar una respuesta en el modo revisión y verificar en la base
   que `respuestaIa` ≠ `respuestaFinal` y `fueEditada = true`.
2. **No editar no marca nada.** Una postulación sin modo revisión guarda las dos iguales y
   `fueEditada = false`.
3. **Las variantes colapsan.** *"¿Cuál es tu pretensión de renta?"*, *"Indica tu renta líquida
   esperada"* y *"¿Cuánto esperas ganar?"* mapean todas a `pretension_renta`.
4. **La pre-respuesta evita la llamada.** Con una respuesta guardada para una canónica, procesar
   un formulario que la contenga **no genera esa respuesta con IA**. Verificable contando
   llamadas en `AiUsageLog`.
5. **Las `ninguna` son revisables.** Existe una forma de listarlas ordenadas por frecuencia.
6. **Ninguna respuesta cruza de usuario.** Revisar a mano cada query que toque
   `RespuestaGuardada`: todas deben filtrar por `userId`. Sin excepción.
