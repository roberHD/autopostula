# El panel de revisión en el portal, y probarla apenas se conecta

> **Estado:** propuesta, 2026-10-08. Sale de dos ideas de Roberto: probar la extensión apenas queda
> conectada, en el onboarding, y que el panel del escaneo liste todas las ofertas para que la
> persona corrija lo que el motor decidió.
> **Para:** el chat de producción.
> **Relacionado:** `primera-busqueda-guiada.md` §10 y §11 (ya implementados en la 2.17),
> `revision-scorer-2026-09-30.md` §6 (el banco de casos), `rediseno-filtrado-ofertas.md` §8.2.

---

## 0. Lo esencial

1. **El panel convierte la extensión de algo que decide en algo que propone.** Hoy marca cada
   oferta y cierra preguntando si empieza a postular. Lo que falta es que la persona pueda decir
   *"esta también, y esta no"* antes de que salga nada.
2. **Cada corrección es la etiqueta más cara del sistema.** Un "sí" sobre algo que el motor iba a
   descartar vale más que diez decisiones de la banda gris, porque es justo el dato que hoy **no
   existe**: el banco de casos solo ve lo dudoso, nunca lo que el scorer resolvió solo (§6 de la
   revisión del scorer lo dejó anotado como sesgo). Esto lo cierra.
3. **Probarla apenas se conecta** es correcto, pero sin romper lo que ya funciona: la tarjeta
   "Probemos" de Hoy se queda, y el onboarding solo ofrece el atajo **cuando la extensión ya
   respondió** que está conectada (§1).

---

## 1. Probarla apenas queda conectada

Hoy el cierre del onboarding no abre el portal a propósito (`primera-busqueda-guiada.md` §10): la
tarjeta "Probemos" en Hoy hace el paso a paso, y así sobrevive a que la persona cierre todo y
vuelva mañana. Eso está bien y se queda.

Lo que falta es el caso bueno: **la persona acaba de conectar la extensión y está con el impulso**.
Ahí mandarla al panel a buscar una tarjeta es perder el mejor momento que vas a tener.

### Cómo queda

En el paso de la extensión, cuando el puente confirma que quedó conectada, el botón de
«Continuar» cambia por dos:

> **✓ Listo, AutoPostula ya está conectada.**
> **[ Probémosla ahora ]**  ·  *Seguir y probar después*

- **Probémosla ahora** abre una pestaña en el portal que la persona conectó, con la búsqueda ya
  armada igual que la arma la extensión, y marca la cuenta para que esa primera visita entre en
  modo mirar.
- **Seguir y probar después** termina el onboarding como hoy, y en Hoy la espera la tarjeta
  "Probemos" sin cambios.

### Las dos condiciones

1. **Solo se ofrece si la extensión respondió.** Si no hay confirmación del puente, no aparece el
   botón: prometer "probémosla" y caer en un portal donde no pasa nada es peor que no ofrecer.
2. **Solo se ofrece si hay un portal conectado.** Si no, el botón lleva al paso del portal, no al
   portal.

---

## 2. El panel de revisión

### 2.1 Qué es

La extensión ya recorre el listado completo y puntúa cada oferta. Hoy eso termina en marcas sobre
las tarjetas y una tarjeta de cierre con el resumen. **El panel es ese resumen, abierto**: la lista
entera, agrupada por lo que el motor decidió, con una casilla por oferta.

```
┌─────────────────────────────────────────────────────────────┐
│  Revisé 20 ofertas de esta página                      [×]  │
│                                                             │
│  ✓ VOY A POSTULAR (3)                                       │
│    ☑ Vendedor de tienda — Falabella, Ñuñoa                  │
│         Es de ventas, lo que buscas                         │
│    ☑ Asesor comercial — Ripley, Providencia                 │
│    ☑ Vendedor part time — Sodimac, La Reina                 │
│                                                             │
│  ? PARA QUE DECIDAS (6)                                     │
│    ☐ Cajero de supermercado — Líder, Ñuñoa                  │
│         Es de ventas, pero no dice la jornada               │
│    ☐ Promotor de temporada — Agencia, Santiago              │
│         No pude leer en qué comuna queda                    │
│    …                                                        │
│                                                             │
│  ✗ NO CALZA (11)                            [ ver todas ]   │
│    ☐ Conductor clase A-2 — Transportes, Maipú               │
│         Pide una licencia que no está en tu CV              │
│    …                                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Vas a postular a 3 ofertas.        [ Postular a las 3 ]    │
└─────────────────────────────────────────────────────────────┘
```

- Se abre desde la tarjeta de cierre que ya existe («Ver las 20») y desde el ícono de la extensión
  mientras hay un escaneo reciente en esa pestaña.
- **Lo de "voy a postular" viene marcado; lo demás no.** Marcar o desmarcar es la corrección.
- El contador del botón cambia en vivo: *"Postular a las 5"*.
- **"No calza" viene colapsado** y se despliega con "ver todas". Son las que menos se van a
  revisar y las que más espacio ocupan; esconderlas no las oculta, las ordena.
- Cada línea muestra la razón en las mismas palabras del panel (`lib/formatear-razon.ts`). Nada de
  puntajes ni de "banda gris".

### 2.2 Qué pasa al apretar

1. Las marcadas se postulan en orden, con el mismo flujo de siempre: abre el aviso, responde, envía
   y registra. **El modo mirar se apaga solo** para esa tanda.
2. Las que la persona **desmarcó** de "voy a postular" no se envían, y eso se registra: es una
   corrección tan valiosa como el "sí".
3. Si cierra el panel sin apretar nada, no se envía nada y no se aprende nada. Cerrar no es decidir.

### 2.3 El cupo

Antes de enviar, el panel compara lo marcado con lo que queda del mes:

> *Marcaste 12 y te quedan 8 postulaciones este mes. Puedo enviar 8 ahora y dejar las otras 4 para
> cuando se renueven, o eliges cuáles sacar.*

Nunca se envía de más ni se cortan a la mitad en silencio. Es el mismo principio de revisar el
límite **antes** de enviar (`revision-2026-09-16.md` §0).

---

## 3. Qué aprende, y cómo

Esta es la parte que hace que valga la pena construirlo.

### 3.1 Las cuatro cosas que se registran

| Lo que hizo la persona | Qué significa | Cuánto vale |
|---|---|---|
| Marcó una que estaba en **"no calza"** | El motor se equivocó descartando | **Lo más valioso.** Es el dato que hoy no existe |
| Marcó una que estaba en **"para que decidas"** | Lo mismo que ya hace "Por decidir", pero en el momento | Alto |
| **Desmarcó** una de "voy a postular" | El motor se equivocó postulando | **Lo más caro de no saber**: es el error que gasta cupo |
| Dejó todo como venía | El motor acertó, o no revisó | Bajo, pero cuenta |

Cada una se guarda con **el puntaje y las razones que tenía en ese momento**, igual que
`DecisionOferta.scoreLocal`. Sin eso no se puede comparar después, y la corrección se vuelve una
anécdota.

### 3.2 Dónde entra

En el banco de casos que ya existe (`lib/banco-de-casos.ts`). Hoy mira solo la banda gris; con esto
pasa a ver los tres grupos, y recién ahí puede responder la pregunta que importa: **¿cuántas de las
que descartó solo habrían servido?**

Y alimenta la calibración de umbral (`lib/calibracion-umbral.ts`) con la señal correcta: si la
persona rescata seguido ofertas de "no calza", su umbral está alto para ella.

### 3.3 La trampa de marcar todo

Si alguien marca las 20 de una, eso **no** significa "este señor acepta cualquier cosa": significa
que apretó un botón. Dos reglas:

- Si se marcan **más del 80%** de las ofertas de una tanda, las correcciones de esa tanda entran
  con peso reducido al aprendizaje. Se postulan igual: es su decisión.
- No existe "marcar todas" como botón. Si quiere todo, que marque. La fricción acá es la que
  distingue una decisión de un impulso.

### 3.4 Lo que no se hace con esto

**No recompilar el perfil con IA en caliente** cada vez que alguien corrige. Las correcciones se
acumulan y entran en la próxima compilación, como ya hacen las decisiones de "Por decidir"
(`compilar-perfil.ts` las recibe como contexto). Principio 1: lo caro corre una vez.

---

## 4. Los casos feos

| Caso | Qué hace el panel |
|---|---|
| El escaneo no terminó | Muestra lo que lleva y dice "sigo revisando", sin botón hasta terminar |
| La página tiene 60 ofertas | Muestra las 20 primeras de cada grupo y "ver más". Un panel de 60 casillas no lo lee nadie |
| La persona se cambió de página | El panel se cierra: las ofertas que lista ya no son las que está mirando |
| Marcó una que ya postuló antes | Sale deshabilitada, con "ya postulaste a esta el 3 de octubre" |
| Se acabó el cupo y no quedan extra | El botón lleva a comprar, sin enviar nada a medias |
| Está en modo mirar porque es la primera búsqueda | Igual puede marcar y postular: eso **es** el "Empezar a postular" |

---

## 5. Orden

| # | Tarea | § | Esfuerzo |
|---|---|---|---|
| **1** | El atajo del onboarding al conectar la extensión | §1 | Chico |
| **2** | El panel: lista agrupada, casillas y contador | §2.1 | Medio |
| **3** | Postular lo marcado, con el aviso del cupo | §2.2, §2.3 | Medio |
| **4** | Registrar las correcciones con su puntaje y razones | §3.1 | Chico, y es el que da sentido a todo |
| 5 | Sumar los tres grupos al banco de casos | §3.2 | Medio |
| 6 | El peso reducido cuando se marca casi todo | §3.3 | Chico |

El 4 **no se puede dejar para después**: si el panel sale sin registrar las correcciones, se pierde
el dato de las primeras semanas, que es justo cuando más se corrige.

---

## 6. Criterios de aceptación

1. Desde el portal se puede abrir la lista completa de lo escaneado, agrupada en tres.
2. Marcar una de "no calza" y apretar postular **la postula**, y queda registrada como corrección.
3. Nunca se envía más de lo que permite el cupo del mes.
4. Ninguna línea del panel muestra puntajes, "banda" ni "scorer".
5. El banco de casos puede responder cuántas de las descartadas fueron rescatadas a mano.
6. Cerrar el panel sin apretar no envía nada ni registra nada.

---

## 7. Lo que no se hace

- **Un botón de "marcar todas"** (§3.3).
- **Recompilar el perfil en caliente** con cada corrección (§3.4).
- **Mostrar las 60 ofertas de una** (§4).
- **Postular desde el panel sin confirmación**: el botón dice a cuántas y la persona lo aprieta.
