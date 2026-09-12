# El celular decide, el computador trabaja — especificación

> **Estado:** diseño aprobado, sin implementar.
> **Para:** el chat de producción.
> **Fecha:** 2026-09-09.
> **Relacionado:** `verificacion-de-correo.md` (el enlace por correo depende de eso),
> `estado-real-de-postulaciones.md` (el reporte de resultados es una de las pantallas de pulgar).

---

## 1. El problema

La extensión **no puede funcionar en un teléfono**, y eso no va a cambiar:

| Navegador | Extensiones |
|---|---|
| Chrome Android | **No.** Confirmado a agosto 2026, sin señal de cambio |
| Kiwi Browser | **Muerto.** Sacado de Play Store; su código de extensiones se fusionó en Edge Canary |
| Firefox Android | Sí, desde AMO — pero con cuota mínima en Chile |
| Safari iOS | Solo empaquetando una app de App Store |

Pero el diagnóstico correcto **no** es "no tenemos mercado móvil". Chile 2026:

| Dispositivo | Penetración en hogares |
|---|---|
| Celular | **98,9%** |
| Computador portátil | **57,3%** |
| Computador de escritorio | ~23% |

> **Casi 6 de cada 10 hogares tiene notebook. El computador existe.** Lo que falla es que el
> 98,9% del tráfico llega por celular y el embudo se corta ahí.

**Es un problema de embudo, no de mercado.** Y hoy es peor de lo necesario: el paso "Extensión"
es el **5 de 8** del onboarding, o sea una pared **a la mitad**, sin explicación, en el
dispositivo por el que llega casi todo el mundo.

---

## 2. El reencuadre

El producto tiene dos tipos de trabajo, y solo uno necesita computador:

| Decidir — **el celular lo hace mejor** | Ejecutar — **solo computador** |
|---|---|
| Subir CV, definir objetivo | Escanear ofertas |
| Triaje de preferencias (swipe) | Rellenar formularios |
| Banda gris: qué postular (swipe) | Enviar postulaciones |
| Reportar resultados (swipe) | |
| Historial, perfil, suscripción | |

**Las tres interacciones de swipe ya construidas son de pulgar.** Están pidiendo un teléfono y
hoy solo viven en el escritorio.

> **El celular es donde decides. El computador es donde trabaja.**

No es una limitación que disculpar: es la forma real del producto. Se configura, corre solo
mientras nadie mira, y se revisan las decisiones desde el teléfono.

---

## 3. Parte A — Que el móvil nunca choque contra un muro

### 3.1 Detección

Detectar por **capacidad, no por tamaño de pantalla**: lo que importa es si el navegador puede
instalar la extensión, no si la ventana es angosta. Un notebook con la ventana chica sí puede.

```ts
// true = este navegador no puede instalar la extensión
export function sinSoporteExtension(): boolean {
  if (typeof navigator === "undefined") return false;
  // @ts-expect-error userAgentData es reciente y no está en todos los tipos
  const movil = navigator.userAgentData?.mobile;
  if (typeof movil === "boolean") return movil;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
```

**No usar `window.innerWidth`.** Reducir la ventana en un computador no debe esconder el paso.

### 3.2 El paso 5 deja de ser una pared

Hoy (`app/onboarding/page.tsx:27`):

```
0 Bienvenida · 1 Tu CV · 2 ¿Qué buscas? · 3 Preferencias
4 Conversación · 5 Extensión · 6 Portales · 7 Listo
```

En un dispositivo sin soporte, el paso 5 **no se salta ni se esconde**: cambia de contenido.

```
Para que AutoPostula postule por ti necesitas un computador —
las extensiones de navegador no funcionan en teléfonos.

Mientras tanto ya puedes:
   ✓ Ver qué ofertas calzan contigo
   ✓ Decidir cuáles te interesan
   ✓ Revisar tus postulaciones

   [ Continuar en el celular ]     [ Enviarme el enlace ]
```

Y deja de bloquear el avance: se puede llegar a "Listo" sin extensión, con el paso marcado como
pendiente. Explicar **qué se desbloquea**, no solo qué falta.

### 3.3 La reanudación no debe devolverlo ahí

`determinarInicio()` (línea ~100) hoy manda al paso 5 mientras `!extensionLista`. En un
dispositivo sin soporte eso lo deja **atrapado en bucle**: entra, ve el muro, vuelve a entrar,
mismo muro.

```ts
else if (!extensionLista && !sinSoporteExtension()) calculado = 5;
```

En móvil, con todo lo demás hecho, se avanza a Portales y a Listo. El paso de la extensión queda
como pendiente visible en el dashboard, no como un tope del onboarding.

---

## 4. Parte B — El puente al computador

Alguien que ya subió su CV y respondió el triaje **está invertido** y va a buscar un computador.
Hay que hacerle fácil ese salto.

### 4.1 Código de enlace (principal)

No depende de que el correo funcione, así que sirve desde el día uno.

```
En el celular:   "Tu código: 4F7K2 — válido por 15 minutos"
En el computador: autopostula.cl/conectar → escribe el código → sesión iniciada
```

```prisma
model CodigoEnlace {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  // 5 caracteres de un alfabeto sin ambigüedades visuales: sin 0/O, sin 1/I/L.
  // Se dicta y se teclea a mano, así que la confusión es el enemigo.
  codigo    String   @unique @db.VarChar(5)
  expiraEn  DateTime @map("expira_en")
  usadoEn   DateTime? @map("usado_en")
  creadoEn  DateTime @default(now()) @map("creado_en")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([codigo, expiraEn])
  @@map("codigos_enlace")
}
```

**Reglas de seguridad — este código inicia sesión, hay que tratarlo como tal:**

- **Un solo uso.** Se marca `usadoEn` y no vuelve a servir.
- **15 minutos** de vigencia.
- **Máximo 3 intentos fallidos** por IP antes de frenar; el espacio de 5 caracteres es chico y
  hay que hacer inviable el barrido por fuerza bruta.
- **Un código activo por usuario**: generar uno nuevo invalida el anterior.
- Se genera **solo desde una sesión ya iniciada** en el celular. Nunca es una vía de acceso
  alternativa: es trasladar una sesión que ya existe.

### 4.2 Enviarme el enlace (secundario)

Correo con enlace directo. **Requiere que `verificacion-de-correo.md` §1 esté hecho** — hoy el
remitente cae al dominio de prueba de Resend y solo llegaría al dueño de la cuenta.

---

## 5. Parte C — Que el celular sirva para algo, no solo para configurar

Esto es lo estratégico y **ya está construido**: el scorer, el perfil compilado y el corpus ya
saben qué ofertas calzan con la persona.

Sin extensión, el teléfono igual puede mostrar:

```
Estas 5 ofertas calzan contigo
   → tocas → se abre el portal → postulas a mano
```

Es más débil que postular solo, pero **es un producto que funciona en un teléfono**. Y se
convierte solo en el escalón de planes:

| | Celular | Computador |
|---|---|---|
| **Te decimos a qué postular** | ✅ | ✅ |
| **Postulamos por ti** | — | ✅ |

Dos consecuencias que importan:

1. **Desbloquea la publicidad.** Se puede captar a cualquiera, dar valor inmediato en el
   teléfono, y el computador pasa a ser el *upgrade* en vez del requisito de entrada.
2. **Efecto de red:** los usuarios de escritorio alimentan el corpus (§7.2 del rediseño) que
   sirve a los de celular.

**De dónde salen esas ofertas:** de `JobOffer` (el corpus de avistamientos), puntuadas
server-side con el mismo `perfilCompilado` que usa la extensión. Ojo: hay que **portar el scorer
a un módulo compartido** —hoy `AP.puntuarOferta` vive en `extension/core.js`— o duplicarlo, que
es peor. Compartirlo es la decisión correcta y no es trivial; contarlo como trabajo real.

*(Alcance: esta parte es la más grande de las tres y puede ir después. Las partes A y B no
dependen de ella.)*

---

## 6. Parte D — La publicidad dice la forma, no la esconde

No como barrera antes de registrarse, sino como descripción, visible en la landing:

> **Configúralo desde el celular · Trabaja en tu computador**

Quien no tenga computador se autoselecciona y no quema el clic. Y quien sí lo tenga entiende
desde el principio qué va a pasar, en vez de descubrirlo en el paso 5.

---

## 7. Lo que NO se va a hacer

**Portar la extensión a Firefox Android.** Es la única vía estable en móvil, pero portar de
MV3 Chrome a Firefox es trabajo real y la cuota de Firefox en Chile no lo justifica. Se deja
documentado como salida para quien insista, no como estrategia.

**Postular desde el servidor.** Requeriría guardar las credenciales de los portales del usuario
— justo lo que el diseño evita a propósito y lo que la política de privacidad promete no hacer
(§2.8). Además es el camino que ya devolvió un 403 de Computrabajo. Descartado.

---

## 8. Orden

| # | Tarea | § | Nota |
|---|---|---|---|
| **1** | `sinSoporteExtension()` + el paso 5 deja de ser pared + reanudación | §3 | **Lo que hoy cuesta registros** |
| 2 | Código de enlace celular → computador | §4.1 | Con sus reglas de seguridad desde el principio |
| 3 | Landing y publicidad diciendo la forma | §6 | Gratis |
| 4 | "Enviarme el enlace" por correo | §4.2 | Depende de `verificacion-de-correo.md` §1 |
| 5 | Ofertas sugeridas en móvil (scorer server-side) | §5 | El más grande; puede ir después |

---

## 9. Criterios de aceptación

1. **Un registro completo desde un teléfono llega a "Listo"**, sin quedar trabado en el paso 5.
2. **Volver a entrar desde el teléfono no devuelve al muro** de la extensión.
3. **Reducir la ventana en un computador NO esconde el paso** — la detección es por capacidad,
   no por ancho.
4. **El código de enlace inicia sesión en el computador** y **no sirve la segunda vez**.
5. **Un código vencido o mal escrito no filtra información** sobre si existe o de quién es.
6. **Tres intentos fallidos frenan** los siguientes.
7. **En el dashboard móvil se ve claramente qué falta** y qué se desbloquea al hacerlo.
