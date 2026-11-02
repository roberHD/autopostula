# Optimización de fluidez y carga — 2026-11-01

> **Estado:** ✅ hecho y medido. Nada cambió en cómo se ve la página: capturas antes y después,
> pixel a pixel (ver «Cómo se verificó»).
> **Para:** Roberto y el chat de producción.
> **Cómo se midió:** build de producción en local (`next build` + `next start`, Postgres local),
> Chromium con Playwright y el procesador limitado 4 veces (como un computador o celular lento).
> Para los cuadros por segundo se hace scroll con la rueda por la portada y se cuenta cada cuadro
> que dibuja el navegador; el costo de cada parte (estilos, pintado, capas) sale de la traza de
> DevTools. Cada número es el promedio de varias pasadas, sin contar la primera (que coincide con
> las animaciones de entrada).
> **Relacionado:** `optimizacion-2026-09-29.md` (la carga del panel, que ya estaba resuelta).

---

## 0. Lo esencial

Antes de tocar nada se midió todo: portada (escritorio y celular), panel, onboarding, login. La
carga ya estaba bien (la portada es estática, su JavaScript propio pesa 7,5 KB comprimido y el
resto es React y Next). Lo que se encontró fue en la **fluidez** y en **cosas que trabajaban sin
que nadie las viera**:

| Qué | Antes | Ahora |
|---|---|---|
| Portada en escritorio, scroll (cuadros por segundo) | ~47 | **~54–56** |
| Portada en escritorio, recálculo de estilos durante el scroll | ~560 ms | **~320 ms** |
| Portada en escritorio, pintado durante el scroll | ~160 ms | **~80 ms** |
| Panel con la búsqueda activa, pintados en 5 s sin tocar nada | **602** | **0** |
| CSS que bloquea la carga del panel, login y onboarding | 3 archivos (incluido el de la portada, 19 KB) | **2** |
| Lista de comunas (14 KB) al abrir Filtros u onboarding | se baja cada vez | **se guarda un día** |
| Consultas del layout del panel, después de leer la sesión | en 2 tandas, una tras otra | **en 1 tanda** |

La portada en el celular ya iba a ~59 cuadros por segundo y sigue igual.

---

## §1. El fondo de la portada: lo mueve el navegador, no JavaScript

Fue lo más caro de toda la página. El «papeleo» del fondo (las 12 piezas desvanecidas que se
mueven más lento que la página, solo en pantallas de más de 900 px) se movía desde JavaScript:
en cada cuadro de scroll se escribía la posición de las 12 piezas, y el navegador tenía que
recalcular estilos y repintar. Apagándolo, la portada pasaba de ~47 a ~59 cuadros por segundo; el
desenfoque de la barra de arriba, en cambio, casi no pesaba (se midió y se dejó).

Ahora (`Papeleo.tsx`, `landing.css`):

- **El movimiento es una animación atada al scroll** (`animation-timeline: scroll()`): la corre
  el navegador, fuera del hilo principal. De paso las piezas ya no tiemblan: con JavaScript se
  movían un cuadro después del scroll.
- **Las piezas van en 4 capas, una por velocidad** (la pieza *i* va en la capa *i* % 4): se
  mueven 4 cosas por cuadro, no 12. Eso bajó otro ~40% el recálculo de estilos. Las piezas de una
  misma capa van separadas por 2.480 px y a la misma velocidad, así que nunca se topan y el orden
  no cambia nada.
- **El JavaScript solo decide qué pieza se ve** (la que entra a la pantalla aparece con su
  fundido de siempre), y solo toca la clase cuando cambia.
- **Bajo 901 px no calcula nada**: ahí el papeleo está oculto, y antes igual se calculaba.
- **Respaldo:** donde el navegador no sabe atar animaciones al scroll (Firefox, por ahora), el
  JavaScript las mueve como antes, pero de a capa (4 escrituras por cuadro en vez de 12).

La cuenta es la misma de antes: `translateY = scrollY × (factor − 1)`. Se comprobó la posición de
cada pieza en 5 alturas de scroll, con la animación y con el respaldo forzado: **mismo píxel** que
la versión anterior en los dos caminos.

## §2. El pulso de la barra del panel ya no repinta

El punto verde de «Buscando» late con un anillo que crece. Ese anillo era un `box-shadow`
animado, y un `box-shadow` no se puede animar sin repintar: con la búsqueda activa, la barra se
repintaba **~120 veces por segundo, todo el rato que el panel queda abierto** (602 pintados en
5 segundos sin tocar nada). Gasta batería en un notebook y le quita tiempo a todo lo demás.

Ahora el anillo es un círculo detrás del punto que crece y se apaga (`transform` y `opacity`,
`theme.css`), que la tarjeta gráfica anima sola: **0 pintados**. Se ve igual: se congelaron las
dos versiones en 5 instantes del latido y se compararon (diferencias solo de antialiasing en el
borde). Con «reducir movimiento» activado en el sistema, ahora no late (antes latía igual).

## §3. El CSS de la portada ya no se baja en todo el sitio

`app/not-found.tsx` importaba `landing.css`. Como Next monta la página 404 en la raíz, ese
import hacía que el CSS de la portada (19 KB) **bloqueara la primera pintura del panel, el login
y el onboarding**, que no usan nada de él. El 404 tampoco usaba nada de ese archivo. Se sacó el
import y la 404 se ve idéntica. Se revisó que ninguna otra página dependiera de ese CSS cargado
de rebote: solo la portada usa clases `lp-`, y la portada lo sigue importando.

## §4. La lista de comunas se guarda en el navegador

`/api/regiones-comunas` devuelve las 346 comunas (~14 KB), que salen del código y solo cambian con
un deploy, y se pedía cada vez que se abría Filtros o el onboarding. Ahora va con
`Cache-Control: private, max-age=86400`: el navegador la reusa por un día. `private` porque la
ruta pide sesión, así que ningún caché compartido la guarda. Una respuesta de error (sin sesión) no
lleva la cabecera, así que no se guarda.

## §5. El panel hace una vuelta menos a la base

El layout del panel esperaba la cuenta y los términos aceptados, y **recién después** pedía el fin
del pase Premium y el número de «Por decidir». Esas dos no dependen de las primeras, así que ahora
salen juntas: una vuelta menos a la base (en producción, a Neon) en cada carga completa del panel.
Si toca redirigir (falta aceptar los términos o el onboarding), lo que ya se pidió se descarta.

---

## Cómo se verificó que nada cambió

- **Capturas antes y después, pixel a pixel:** portada en escritorio (1366×768) y celular
  (390×844) en 5 alturas de scroll cada una, 404, Hoy, Postulaciones, Portales, Ajustes y Filtros.
  Celular, 404 y las páginas del panel: idénticas. Portada en escritorio: diferencias de antialiasing en el
  borde de las piezas giradas del fondo, que ahora se dibujan en su propia capa (casi todas de
  5–7 sobre 255; como mucho 8 píxeles pasan de 16). Hoy: solo el reloj («hace 4 min» contra «hace 15 min»).
- **Posición de cada pieza del fondo**, con la animación y con el respaldo de JavaScript forzado:
  igual al píxel que la versión anterior.
- `npm run typecheck` y `next build`, sin errores.

> Ojo al medir: esta comparación pixel a pixel atrapó un error propio a mitad de camino (al mover
> un bloque de `landing.css` se habían ido los estilos internos de las piezas). Para cambios de
> «solo rendimiento», comparar capturas antes y después es lo que garantiza que de verdad no cambió
> nada.

## Lo que queda (ideas, no urgente)

Medido pero no tocado, de más a menos impacto:

- **El onboarding**, lo primero que ve alguien nuevo (y casi siempre desde el celular), sigue
  pidiendo 6 cosas a la API después de bajar el JavaScript (en paralelo, eso sí). Llevarlo al patrón
  de `optimizacion-2026-09-29.md` §1 le ahorraría una vuelta completa al primer paso. Es la mejora
  pendiente más grande, pero el archivo tiene ~1.600 líneas y conviene hacerlo con calma.
- **Las otras páginas del panel** también piden sus datos desde el navegador: Portales (2),
  Premium (3), Ajustes (3), Filtros (4), Tu perfil (4) y Entrenar IA (2).
- **Los esqueletos de carga** (`.ap-skel`) animan `background-position`, que también repinta en
  cada cuadro mientras se ven. Duran poco, pero se podrían hacer con `transform` como el pulso (§2).
- **El micrófono del dictado** late con un `box-shadow` animado, igual que el pulso antes. Solo
  mientras se graba; se arregla igual que §2.
- **Las tipografías** (136 KB), sin cambios desde la nota anterior.
- **La portada en escritorio** todavía no llega a 60 cuadros por segundo con el procesador 4 veces
  más lento: lo que queda es el recálculo de estilos que el navegador hace por las 4 capas y los
  fundidos de las piezas. En un computador normal ya no debería notarse.
