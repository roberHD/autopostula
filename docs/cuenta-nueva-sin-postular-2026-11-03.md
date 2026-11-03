# Una cuenta nueva que no postulaba a nada (2026-11-03)

> **Estado:** arreglado en `rama-roberto` y `main` (sitio) y en la **extensión 2.21.0**, que falta
> subir a la tienda.

## 1. Qué pasó

Una usuaria nueva se registró el 03-11 en la madrugada, conectó la extensión y la dejó buscando en
Trabajando.com. Al rato tenía **0 postulaciones, 13 en «Por decidir» y 53 descartadas**. Buscaba
«Diseñadora de Ambientes» y también ventas.

Mirando la base (solo lectura) salieron dos causas que se suman, y en el camino aparecieron dos
fallas más:

1. **El segundo objetivo quedó en 0,5 sin que ella lo eligiera.** En el onboarding, «También me
   interesa…» agregaba el objetivo con peso 0,5 y no mostraba el peso. Con 0,5 el puntaje de rol es
   50 y el umbral para postular es 65: **ninguna oferta de ventas podía postularse sola**, todas
   iban a gris. En Filtros el peso era un número suelto («0,5») que nadie sabía leer.
2. **La extensión siguió usando el perfil viejo.** Ella corrigió los objetivos a las 03:06 (todos en
   1) y el perfil se recompiló, pero la extensión solo vuelve a pedirlo cada 5 minutos: las
   decisiones de las 03:07 todavía salieron con 50.
3. **No se podía escribir en el panel «Revisar antes de enviar» en Trabajando.** El modal de
   Bootstrap del portal se queda con el foco: lo que escribías caía en el campo del portal, no en
   el panel.
4. **Los patrones en femenino no calzaban con títulos en masculino.** «vendedora» no calzaba con
   «Vendedor(a)», «jefa» no calzaba con «Jefe de…». En su caso el rol se había compilado como
   «vendedor», así que no le pegó, pero le iba a pegar a la próxima.

## 2. Lo que se arregló

| # | Arreglo | Dónde |
|---|---|---|
| 1 | El peso deja de ser un número: es **«Lo busco»** (1, se postula solo cuando calza) o **«Lo aceptaría»** (0,5, se pregunta antes en «Por decidir»), con una línea que lo explica. Los objetivos nuevos parten en «Lo busco», en el onboarding y en Filtros. Los roles compilados dicen «lo buscas / lo aceptarías» en vez de «50%». | `lib/peso-objetivo.ts`, `components/SelectorPeso.tsx`, `dashboard/filtros`, `onboarding` |
| 2 | Cuando guardas algo que cambia el perfil (objetivos, perfil, amplitud, umbral, ubicación), la página le avisa a la extensión y esta **pide el perfil al tiro**, sin esperar los 5 minutos, y se lo pasa a las pestañas abiertas de los tres portales. | `lib/puente-extension.ts` (`avisarPerfilActualizado`), `bridge.js`, `background.js` (`SINCRONIZAR_PERFIL` con `forzar`) |
| 3 | Los paneles de la extensión se marcan y los eventos de foco que van hacia ellos no llegan a las escuchas del portal (Bootstrap 4 y 5). El foco del portal sigue igual fuera del panel. | `core.js` (`apProtegerFoco`) |
| 4 | «vendedora», «asesora», «conductora», «operadora» y «jefa» calzan con su masculino, sin abrirse a palabras parecidas («mejora» no calza con «Mejor», «jefa» no calza con «Jefatura»). | `core.js` (`apPatronPalabra`) |

`lib/peso-objetivo.ts` revisa al cargar que «Lo busco» quede sobre el umbral y «Lo aceptaría» bajo él
en todo el rango que puede mover la calibración por cuenta (55–75). Si alguien cambia el umbral y
deja de cumplirse, el módulo tira un error apenas se carga, en vez de volver a dejar objetivos que
nunca postulan sin que nadie lo note.

## 3. Cómo se verificó

- **Foco:** `extension/verificar-foco.js`, en navegador, con Bootstrap 5.3.3 y 4.6.2 de verdad y el
  `core.js` real: **2 fallas antes del arreglo, 0 después**, y los controles (sin panel) siguen
  igual.
- **Femeninos:** bloque 13c de `verificar-scorer.js` (10 casos que fallaban, ahora 0, más los
  negativos).
- **Perfil al tiro:** 3 casos nuevos en `verificar-perfil-cache.js` (con `forzar` se salta la espera
  y avisa a las pestañas; sin `forzar`, no).
- **Selector:** en local con una base en memoria, una cuenta con el caso real (objetivo principal +
  ventas en 0,5): Filtros muestra «Lo busco / Lo aceptaría», al cambiar y guardar queda con peso 1 y
  la página dispara el aviso a la extensión una vez.
- Todas las demás pruebas de la extensión siguen en verde; `tsc` y `next build` limpios.

## 4. Lo que falta

1. **Subir la 2.21.0 a la Chrome Web Store.** Sin eso, los arreglos 2, 3 y 4 no llegan a nadie (el 1
   ya está en el sitio).
2. **La usuaria:** que recargue Trabajando y revise sus 13 de «Por decidir»; ya tiene los objetivos
   en 1, así que lo nuevo debería postularse solo.
3. **Las cuentas que ya tienen un objetivo en 0,5** siguen así: ahora lo ven como «Lo aceptaría» en
   Filtros y lo pueden cambiar. No se cambió nada en la base.
