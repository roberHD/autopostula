# Saber qué pasó de verdad con una postulación — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-09.
> **Relacionado:** `docs/README.md` (principio #5: nunca fallar en silencio).

---

## 1. El problema

El dashboard muestra **tasa de respuesta**, **finalistas** y un gráfico de
enviadas/vistas/en proceso/finalistas/rechazadas. **Ninguno de esos números es correcto.**

Caso real del propio dueño del producto: **cuatro entrevistas coordinadas por correo**, y el
dashboard dice **cero finalistas** y 16% de tasa de respuesta.

### Causa 1 — Dos de tres portales no rastrean estado

```
computrabajo   ✓ escanearMisPostulaciones + MAPA_ESTADO_COMPUTRABAJO
laborum        ✗ nada
trabajando     ✗ nada
```

Todo lo postulado por Laborum y Trabajando queda **congelado en `ENVIADO` para siempre**. Y
`tasaRespuesta = conRespuesta / total` se calcula sobre `estadoActual`
(`app/api/dashboard/resumen/route.ts:73`). Con dos tercios de las postulaciones incapaces de
cambiar de estado, el número está roto por construcción.

### Causa 2 — Lo importante no pasa en el portal

> **El portal sabe que enviaste. El correo sabe qué pasó después.**

Las cuatro entrevistas se coordinaron **por correo**. Computrabajo no sabe que existen. Ningún
scraping de portal las va a ver nunca, por bien hecho que esté. Tampoco ve la llamada del
reclutador ni el WhatsApp.

### Causa 3 — Falta el estado que más importa

El enum `EstadoPostulacion` se armó con el vocabulario de Computrabajo. **No existe
`ENTREVISTA`.** Hoy una entrevista no tiene dónde guardarse: `FINALISTA` significa otra cosa
(etapa final del proceso) y por eso el contador muestra cero.

---

## 2. Lo que NO se va a hacer: leer Gmail

Es el instinto correcto —ahí está la verdad— pero está cerrado en la práctica.

Los scopes de lectura de Gmail son **restricted** en Google. Usarlos en producción con más de
100 usuarios exige una auditoría **CASA**:

| | |
|---|---|
| Costo | Desde unos pocos miles hasta decenas de miles de USD |
| Frecuencia | **Anual**, con recertificación obligatoria |
| Plazo | 2 a 6 meses |

Con un ingreso de ~US$4 por usuario al mes harían falta miles de suscriptores solo para pagar la
auditoría. **Queda descartado**, y conviene dejarlo escrito para no volver a evaluarlo cada vez
que el tema aparezca.

*(Alternativa futura y opcional, no parte de este documento: un alias de reenvío
`u-abc123@in.autopostula.cl` donde la persona configura un filtro en Gmail que reenvíe solo
correos de los portales. Evita OAuth por completo, pero implica recibir correo de usuarios —
categoría de datos nueva, política de privacidad nueva, y fricción de configuración que
perdería a la mayoría. Como función opcional, sí; como base del sistema, no.)*

---

## 3. La decisión de fondo

> **La persona es la fuente de verdad. El portal es una ayuda.**

Todo lo demás en este documento se sigue de eso. En particular:

**Un escaneo de portal NUNCA puede pisar un estado que reportó la persona.** Si ella dijo
"tengo entrevista" y al día siguiente Computrabajo sigue diciendo "postulado", el estado se
queda en entrevista. Sin esta regla, el sistema le borraría al usuario lo que él mismo le
contó — que es la peor forma posible de perder su confianza.

---

## 4. Parte A — Honestidad primero (gratis, hoy)

**Un número equivocado es peor que ningún número.** No solo desinforma: hace desconfiar del
resto del dashboard.

Mientras la cobertura sea parcial:

- **Sacar la tasa de respuesta del lugar principal**, o etiquetarla por lo que es: *"según lo
  que reportan los portales"*, diciendo explícitamente que Laborum y Trabajando no reportan.
- Reemplazar la métrica destacada por algo **accionable**:

  ```
  ANTES:   Tasa de respuesta   16%
  DESPUÉS: 4 postulaciones con movimiento — revísalas
  ```

  La primera le pone una nota a alguien que está buscando trabajo y no puede hacer nada con
  ella. La segunda le dice qué hacer.

Los porcentajes vuelven cuando haya datos que los sostengan (Parte C).

---

## 5. Parte B — Escaneo de estado en los tres portales

El patrón ya existe y funciona: `escanearMisPostulaciones()`
(`extension/adapters/computrabajo.js:797`) lee la página "Mis postulaciones", mapea el texto de
estado y llama a `actualizarEstadoPostulacion`.

**Replicarlo en `laborum.js` y `trabajando.js`.** Cada uno necesita:

1. La URL de su página de "mis postulaciones".
2. Selector de las filas y del texto de estado.
3. Su propio `MAPA_ESTADO_*` — el vocabulario cambia por portal.
4. Una forma de sacar el `externalId` que calce con el guardado al postular (en Computrabajo es
   el hash de 32 caracteres de la URL, `extraerHashOferta`).
5. Sumar su URL al barrido automático de `background.js:419`.

> ⚠️ **Los selectores se verifican contra el sitio real, no se inventan.** Es exactamente donde
> se rompió Laborum: `getEmpresaDeTarjeta` usaba un filtro por texto que parecía razonable y
> guardó la fecha de publicación como nombre de empresa en 150 filas.

---

## 6. Parte C — Que la persona reporte (el arreglo de verdad)

Es lo único que captura lo que ningún portal ve: la entrevista por correo, la llamada del
reclutador, el WhatsApp.

### 6.1 Cuándo preguntar

**En el momento en que ya lo sabe**, no cuando entra al dashboard por casualidad:

- A los **5–7 días** de `enviadaEn`.
- Nunca dos veces por la misma postulación en menos de 7 días.
- Se deja de preguntar tras **3 intentos sin respuesta**, o si el estado ya es terminal
  (`FINALIZADO`, `RECHAZADO`).

### 6.2 Cómo preguntar

**Un toque por postulación**, agrupadas. Es el **mismo componente de swipe** del triaje y de la
banda gris — tercer uso de algo que ya está construido.

```
¿Supiste algo de Falabella?
   Nada todavía  ·  Me escribieron  ·  Tuve entrevista  ·  Me rechazaron
```

Dónde vive:

- Sección propia en el dashboard, con badge en el sidebar cuando hay pendientes.
- Opcionalmente, un resumen semanal por correo con enlace directo (**después** de que exista
  verificación de correo — ver `verificacion-de-correo.md`).

### 6.3 Estado nuevo: `ENTREVISTA`

```prisma
enum EstadoPostulacion {
  ENVIADO
  VISTO
  EN_PROCESO
  ENTREVISTA    // ← nuevo
  FINALISTA
  FINALIZADO
  RECHAZADO
  INCOMPLETA
}
```

Es el que faltaba y el que más importa. Hoy una entrevista no tiene dónde guardarse y por eso el
contador de finalistas muestra cero teniendo cuatro.

### 6.4 Esquema

```prisma
model Application {
  // … campos actuales …

  // De dónde salió estadoActual. Un escaneo de portal NUNCA pisa un estado
  // con origen USUARIO (§3): si la persona dijo "tengo entrevista", que el
  // portal siga diciendo "postulado" no lo revierte.
  origenEstado      OrigenEstado @default(PORTAL) @map("origen_estado")
  // Para no preguntar dos veces seguidas por lo mismo (§6.1).
  ultimaConsulta    DateTime?    @map("ultima_consulta")
  vecesConsultada   Int          @default(0) @map("veces_consultada")
}

enum OrigenEstado {
  PORTAL     // lo detectó escanearMisPostulaciones
  USUARIO    // lo reportó la persona
  SISTEMA    // al crear la postulación
}
```

### 6.5 La regla de precedencia

Al aplicar un cambio de estado:

```
rango: ENVIADO < VISTO < EN_PROCESO < ENTREVISTA < FINALISTA < FINALIZADO
       (RECHAZADO es terminal y puede llegar desde cualquiera)

origen PORTAL  → solo aplica si origenEstado != USUARIO
                 Y el rango nuevo es MAYOR que el actual (nunca baja)

origen USUARIO → siempre aplica, en cualquier dirección
                 (la persona puede corregirse)
```

Todo cambio sigue registrándose en `ApplicationStatusHistory`, que ya existe.

---

## 7. Parte D — Recién ahí, la métrica honesta

Con `origenEstado` se puede decir la verdad sobre lo que se sabe y lo que no:

```
De tus 47 postulaciones:
   23  sin novedad
   12  esperando que nos cuentes    ← accionable
    8  con movimiento
    4  entrevistas
```

Y la tasa de respuesta, **cuando se muestre**, se calcula solo sobre las postulaciones con
información real (portal que reporta o usuario que respondió), diciendo sobre cuántas se
calculó. Nunca sobre el total, que incluye las que nadie miró nunca.

---

## 8. Orden

| # | Tarea | § | Nota |
|---|---|---|---|
| **1** | **Sacar o etiquetar la tasa de respuesta; métrica accionable** | §4 | Gratis y hoy. Deja de mentir |
| 2 | `ENTREVISTA` en el enum + migración | §6.3 | Chico |
| 3 | `origenEstado`, `ultimaConsulta`, `vecesConsultada` + regla de precedencia | §6.4, §6.5 | **La regla va antes que el reporte**, si no el portal lo pisa |
| 4 | Reporte por parte del usuario, con el componente de swipe | §6.1, §6.2 | El arreglo de verdad |
| 5 | Escaneo de estado en Laborum | §5 | Selectores verificados en vivo |
| 6 | Escaneo de estado en Trabajando | §5 | Ídem |
| 7 | Métrica honesta con cobertura declarada | §7 | Cierra el círculo |

Los pasos 1 y 2 son independientes de todo. El 3 **tiene que ir antes** que el 4: sin la regla
de precedencia, el primer escaneo de portal borraría lo que la persona acaba de reportar.

---

## 9. Criterios de aceptación

1. **El caso que originó esto:** reportar cuatro entrevistas y que el dashboard muestre cuatro,
   no cero.
2. **El portal no pisa a la persona.** Reportar `ENTREVISTA`, correr después el escaneo de
   Computrabajo con la oferta todavía en "postulado", y verificar que sigue en `ENTREVISTA`.
3. **El portal no baja de rango.** Una postulación en `EN_PROCESO` no vuelve a `VISTO` porque el
   portal cambió el texto.
4. **La persona sí puede corregirse.** De `ENTREVISTA` a `RECHAZADO` aplica sin problema.
5. **No se pregunta de más:** nada antes de los 5 días, nada dos veces en 7 días, nada después
   de 3 intentos sin respuesta ni sobre estados terminales.
6. **Laborum y Trabajando cambian de estado**, no se quedan congelados en `ENVIADO`.
7. **Ninguna métrica del dashboard se muestra sin decir sobre cuántas postulaciones se calculó.**
