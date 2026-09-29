# Optimización de carga del panel — 2026-09-29

> **Estado:** ✅ hecho y medido. Nada cambió en cómo se ve la página: solo cuánto demora.
> **Para:** Roberto y el chat de producción.
> **Cómo se midió:** Lighthouse 13.5 en modo "celular de gama media" (4G lento y procesador 4
> veces más lento), con la limitación aplicada de verdad durante la carga, contra el build de
> producción en local. La versión anterior se armó aparte (worktree del commit `ea5dbc6`) y las
> dos se midieron igual, con la misma cuenta de prueba (25 postulaciones, 12 ofertas por decidir).
> **Relacionado:** `revision-2026-09-28.md` (§22: la revisión de sesión que §4 hace más barata).

---

## 0. Lo esencial

El panel mostraba "Cargando…" varios segundos en un celular. La causa era el orden: el
teléfono bajaba la página vacía, después bajaba y corría el JavaScript (~160 KB), y **recién
ahí** pedía los datos. Ahora el servidor manda la página con los datos puestos.

| Página | Contenido real visible, antes | Ahora | Saltos de diseño (CLS), antes → ahora | Puntaje, antes → ahora |
|---|---|---|---|---|
| Hoy | 5,25 s | **2,30 s** | 0,32 → **0** | 68 → 76–81 |
| Postulaciones | 4,21 s | **2,27 s** | 0,45 → **0** | 77 → 90–92 |
| Por decidir | 5,06 s | **2,28 s** | 0,22 → **0** | 85 → 87–93 |

"Contenido real visible" sale de los cuadros que graba Lighthouse durante la carga (uno cada
~0,4–0,6 s). El CLS mide cuánto salta la página mientras carga: Google considera malo sobre 0,25.
Antes los tres pasaban ese límite; ahora nada se mueve.

> **Ojo con el "LCP" de Lighthouse en la versión anterior:** daba ~1,96 s, pero medía la
> pantalla de carga. El texto "Cargando lo que te espera…" está en el mismo elemento que después
> muestra el saludo, y un cambio de texto en el mismo elemento no cuenta como un dibujo nuevo. Por
> eso la comparación de arriba usa los cuadros grabados, no ese número.

Las páginas públicas (inicio 96, registro 97, login 97 en producción) ya estaban bien y no se
tocaron. Las dos tipografías pesan 136 KB, casi la mitad de esas páginas, pero se usan en varios
anchos y grosores: achicarlas cambiaría cómo se ve.

---

## §1. Las páginas llegan con sus datos

**Hoy, Postulaciones y Por decidir**, y la **barra de arriba** en todas las páginas del panel.

Cada una se partió en dos archivos:

- `page.tsx` (servidor): arma los datos con las mismas funciones que usan las rutas de la API
  (`lib/panel/hoy.ts`, `estado.ts`, `listas.ts`) y se los pasa al componente.
- `Hoy.tsx`, `Postulaciones.tsx`, `PorDecidir.tsx` (navegador): el mismo código de antes, que
  ahora recibe `inicial` y no vuelve a pedir lo que ya llegó. Si el servidor no pudo armar los
  datos, los pide desde el navegador como antes.

Mientras el servidor arma los datos se ve la **misma pantalla de carga de siempre** (`<Suspense>`
con `HoyCargando`, o el componente con `soloEsqueleto`, que la dibuja sin pedir nada), y el
contenido llega en la misma respuesta. Al navegar entre páginas pasa lo mismo: los datos viajan
en la respuesta de Next, sin pedidos aparte a la API.

Las rutas de la API (`/api/dashboard/resumen`, `/api/dashboard/estado`, `/api/applications`,
`/api/applications/sin-noticias`, `/api/banda-gris`) siguen existiendo y devuelven exactamente lo
mismo: se verificó comparando sus respuestas antes y después. Las usa el navegador para
refrescar después de una acción, y la extensión las que ya usaba.

**Lo que hay que cuidar al dibujar en el servidor:**

- **Fechas en hora de Chile.** El servidor corre en UTC: `toLocaleDateString` sin `timeZone`
  daría otro día de noche. Se fijó `timeZone: "America/Santiago"` (para quien está en Chile, el
  texto es idéntico).
- **"Hace N min" con la misma hora.** El servidor manda la hora a la que armó los datos
  (`ahora`) y el primer dibujo usa esa, así el servidor y el teléfono escriben lo mismo. La barra
  de arriba pasa a la hora del teléfono apenas monta.
- **Nada del navegador en el render.** `window`, `localStorage` y compañía solo dentro de
  efectos o eventos (ya era así en estas páginas).
- **React 19.2 revela el contenido en el siguiente cuadro que dibuja el navegador.** Una pestaña
  oculta no dibuja, así que en una prueba automática con la ventana escondida la página puede
  parecer "pegada" en la pantalla de carga. En un teléfono que la está mostrando no pasa.

## §2. El gráfico de Hoy se baja aparte

`recharts` era lo más pesado del panel: con él, Hoy pasaba 1,7 s corriendo JavaScript en un
celular de gama media. Ahora vive en `GraficoActividad.tsx` y se carga con `next/dynamic` después
de lo demás. El contenedor guarda sus 240 px de alto, así que nada se mueve cuando aparece.

El `import("./GraficoActividad.js")` lleva `.js` y un tipo explícito por `"moduleResolution":
"NodeNext"` del tsconfig (TypeScript pide la extensión y lo tipa como CommonJS; para el bundler
es un módulo normal).

## §3. El menú pide solo el número de "Por decidir"

Antes el menú lateral bajaba `/api/banda-gris` entero (19,5 KB con el extracto de cada aviso, y
escribiendo en la base) en cada cambio de página, solo para mostrar cuántas había. Ahora el layout
lo cuenta en el servidor al cargar y, al cambiar de página, el menú pide
`/api/banda-gris/conteo` (17 bytes). De paso se fueron los pedidos repetidos: Hoy pedía dos veces
`/api/dashboard/estado` y Por decidir bajaba dos veces la lista.

## §4. La sesión no consulta la base en cada uso

Desde la revisión del 28-09 (§22), cada uso de la sesión leía la cuenta para ver si seguía
valiendo, y una carga del panel la usa varias veces (proxy, layout, página y cada ruta de la API).
Ahora la respuesta se recuerda **30 segundos por instancia del servidor** (`cuentaDeLaSesion` en
`auth.ts`); `getUsuarioSesion` usa la misma. Restablecer la contraseña, que Google recupere una
cuenta y borrar una cuenta la olvidan al tiro en esa instancia; en las demás, cortar las sesiones
puede tardar esos 30 segundos.

## §5. El aviso del celular llega dibujado

"Desde el celular decides; en el computador se postula" se decidía en el navegador y aparecía
cuando terminaba el JavaScript, empujando la página hacia abajo: era la mayor parte de los saltos
de diseño. Ahora el servidor lo adivina con las mismas señales (`Sec-CH-UA-Mobile`, que es lo
mismo que `navigator.userAgentData.mobile`, o el user agent) en
`sinSoporteExtensionSegunCabeceras` (`lib/dispositivo.ts`), y al montar se confirma con el
navegador como antes. Verificado: Android, iPhone y Chrome de celular lo reciben dibujado; un
computador no.

---

## Cómo se verificó que nada cambió

- **Las mismas respuestas de la API**, antes y después (6 rutas, comparación exacta del JSON).
- **El mismo HTML final**, elemento por elemento (etiqueta, clases, estilos, atributos y texto),
  contra una copia guardada antes de los cambios: Hoy 423 elementos, Postulaciones 580, Por
  decidir 193, **0 diferencias** (sin contar el SVG interno del gráfico, que depende de en qué
  momento de su animación se mire).
- Sin errores en la consola, navegación entre páginas, el botón Pausar/Reanudar de la barra y
  decidir una tarjeta en Por decidir.
- `npm run typecheck`, `next build` y las suites del backend (`verificar-*`), todo bien.

## Lo que queda (ideas, no urgente)

- **Las otras páginas del panel** (Portales, Premium, Ajustes, Filtros, Entrenar IA) todavía
  piden sus datos desde el navegador. Se pueden pasar al mismo patrón de §1 cuando se toquen.
- **El onboarding**, que es lo primero que ve alguien nuevo (y casi siempre desde el celular),
  hace 6 pedidos antes de mostrar el paso. El servidor podría mandar esos datos; la parte que
  depende del navegador (`localStorage` y si es celular) se resuelve igual al montar.
- **Las tipografías** (136 KB): solo se podrían achicar cambiando los anchos y grosores que usa el
  diseño, y eso sí cambiaría cómo se ve.
