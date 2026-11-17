# El filtro mira el rubro y el tipo de venta — 2026-11-14

> **Estado:** implementado en `rama-roberto` (extensión 2.22.0, más los textos del panel en el
> servidor). Desde el 14-11 corre en el Chrome de Roberto, que tiene la extensión cargada desde la
> carpeta del repo. Falta subirla a la tienda.
> **Origen:** Roberto: *«si hay una oferta de Adidas y no la toma, hay un problema… necesito mejorar
> el filtro de búsqueda, que no tenga tantos errores»*. Busca venta de vestuario, part time, en la RM.
> **Relacionado:** `revision-scorer-2026-09-30.md` (compuertas y banco de casos),
> `amplitud-de-busqueda.md` (la amplitud), `computrabajo-chat-2026-11-01.md` §7 (el plural).

---

## 0. Lo esencial

1. **El filtro solo miraba el cargo.** «Vendedor» valía 100 en adidas, en Sodimac y en un call center
   de seguros. El gusto de la persona por un rubro («moda», +20) no cambiaba nada, porque el puntaje
   ya estaba en el tope.
2. **Ahora mira también dónde se vende:** el rubro del aviso (vestuario, calzado, ferretería,
   seguros…) y el tipo de venta (tienda, terreno, teléfono, empresas, internet, venta directa). Los
   saca de un catálogo nuevo, `extension/data/sectores-cl.js`, con unas 300 marcas chilenas.
3. **Reconoce los otros nombres del mismo trabajo:** «Asistente de tienda», «Promotor/a de
   Vestuario», «Asesor/a de Cliente Especialista Moda» y «Asesor(a) de venta» cuentan como vendedor.
4. **Medido con las 901 ofertas reales de su historial**, etiquetadas a mano:

   | | Antes | Ahora |
   |---|---|---|
   | Venta de vestuario, moda o calzado (77): se postula | 87 % | **100 %** |
   | Lo que no busca (431): se postula solo | 40 % (173) | **2 % (8)** |
   | Venta en otra tienda (317) | 84 % se postula | 41 % se postula, 53 % se pregunta |

5. **Ya postuló de verdad con esto:** del 14 al 17-11 su extensión envió 62 postulaciones; 39 de
   vestuario, calzado, accesorios o grandes tiendas, 20 de tiendas sin rubro reconocible y 3 de otro
   rubro. 15 quedaron a medias, por fallas al enviar que no son del filtro (§6).

---

## 1. Lo que estaba mal (con su historial real)

- **Se postulaba solo a lo que no quería:** Sodimac, telemarketing, «Ejecutivo de ventas de seguro
  Hospitalario», «Vendedor de Autos Seminuevos», venta en terreno y «Vendedores por internet».
- **Descartaba lo que sí quería** con «El cargo no se parece a lo que buscas»:
  - «Asistente de tienda Parque Arauco» y «Promotor/a de Vestuario Part Time», porque no decían
    «vendedor»;
  - «Asesor/ra de ventas» de Prüne, porque «/ra» no era una marca de género conocida.
- **Leía mal la jornada:**
  - «Vendedor(a) PartTime - Levis» se descartaba por la ficha «Jornada Completa» de trabajando.com:
    «PartTime» pegado no calzaba.
  - Tampoco calzaban «JP 25» (Ripley), «P20» (Sodimac), «27H», «18,5 hrs» ni «10 hrs».
  - «Vendedores Full Time y Part Time» se descartaba por su veto «full time».
- **Inventaba el lugar desde el título:** «Parque Arauco» quedaba en la comuna de Arauco, «Temporada
  Navidad» en Navidad, «Mall Florida Center» en Florida (Biobío) y «Universidad de los Andes» en Los
  Andes. Todas se descartaban por estar fuera de sus comunas.
- **«Asistente de post venta y despachos»** calzaba con «asistente de ventas».

## 2. Cómo decide ahora (`AP.puntuarOferta`, paso 6b)

El cargo dice QUÉ se hace; el rubro y el tipo de venta dicen DÓNDE. Lo que la persona prefiere sale
de su perfil, sin preguntarle nada nuevo:

- **prefiere** los rubros que nombran sus señales a favor («moda», «calzado») y sus cargos
  («vendedor de calzado»);
- **evita** los rubros y tipos de venta que nombran sus vetos («call center» también cubre
  «telemarketing»).

Si el servidor manda `perfil.contexto` (`{sectores: {prefiere, evita}, canales: {evita}}`), manda eso.
Solo se usa cuando el perfil busca un cargo de ventas; para «bodeguero» o en «cualquier trabajo» no
cambia nada.

Con la amplitud que eligió la persona:

| El aviso es… | solo lo mío | parecidos (por defecto) | todo mi rubro |
|---|---|---|---|
| del rubro que prefiere | pasa | pasa | pasa |
| de un rubro afín (accesorios, lentes, grandes tiendas) | se pregunta | pasa | pasa |
| de otra tienda (ferretería, mascotas, tecnología) | se descarta | **se pregunta** | pasa |
| de otra clase (seguros, autos, inmobiliario) | se descarta | se descarta | pasa |
| otro tipo de venta (terreno, teléfono, empresas, internet) | se descarta | se descarta | pasa |
| sin rubro reconocible | pasa | pasa | pasa |

Lo que no se reconoce pasa como antes: el catálogo no conoce todas las marcas, y «no sé» no es «no
calza».

Además:
- **«Ejecutivo de ventas» o «Asistente comercial»** sin nada que diga tienda se preguntan: pueden ser
  una oficina o un call center.
- **El rubro que prefiere con otro cargo, en una tienda** («Reponedor en Tienda adidas Costanera
  Center») se pregunta en vez de descartarse.
- **«Promotor» a secas** cuenta solo si el aviso dice tienda, mall o un rubro de tienda: «Promotor
  PartTime para Unicef» es de la calle.

## 3. Lo demás que se arregló

- **La jornada** se lee con una sola expresión por jornada: «PartTime», «Fulltime», «partime»,
  «Parti-time», «Peak Time», «JP», «P20», horas con decimales o pegadas («Parque Arauco42hrs»).
- **La jornada contraria solo en la descripción**, con la buscada también ahí, queda como duda: «Habla
  de part time y de jornada completa».
- **Un veto de jornada** («full time») se trata como la jornada: vale por el título, no se aplica si
  el título ofrece las dos, y se explica como «Es de jornada completa y buscas part time», no con la
  frase que escribió la IA.
- **El lugar en el título** ignora los nombres de comuna que casi nunca son lugar (Arauco, Navidad,
  Primavera, Florida, Los Andes…). Si el título nombra una comuna de otra región que la ubicación del
  aviso, queda la duda.
- **Género «/ra», «/or», «/es»** en los cargos; «post» y «pre» no son palabras de enlace.

## 4. Lo que ve la persona

Razones nuevas, iguales en la marca de la oferta, en el historial y en el panel
(`backend/lib/formatear-razon.ts`, que comprueba `verificar-razones-marca.ts`):

- «Es de vestuario y moda, lo que prefieres (dice "adidas")»
- «Es de ferretería y construcción, y tú prefieres vestuario y moda o calzado»
- «Es venta en terreno, y tú buscas venta en tienda»
- «No dice si es en una tienda, que es lo que buscas»

Las que dejan una oferta en «Por decidir» llevan `tope: true`, y la calibración del corte no las usa
(`esTopeDelScorer`).

## 5. Cómo se verificó

- **El historial de Roberto (901 ofertas distintas)**, etiquetadas a mano en cuatro grupos: lo que
  busca, otra tienda, otra cosa y genérico. La tabla de §0 sale de ahí, con el scorer «solo
  relevancia» (sin lugar ni jornada).
- **En vivo, en su Chrome, sin postular:** el código nuevo corriendo en un marco sobre `robots.txt`
  de cada portal, con un `chrome` falso que nunca deja postular. Fueron 161 ofertas de Computrabajo,
  96 de Laborum y 68 de Trabajando, revisadas una por una.
- **`verificar-scorer.js`: 262 comprobaciones**, 84 nuevas con títulos reales. Las 15 baterías de Node
  de la extensión pasan.
- **Servidor:** `verificar-razones-marca.ts` y `verificar-banco-de-casos.ts` pasan, y `tsc` también.
- **Postulaciones reales** del 14 al 17-11 (§0, punto 5).

## 6. Pendiente

1. **Subir la 2.22.0 a la tienda** y **mergear a `main`**. Sin el servidor nuevo, el panel muestra
   «Sin razón registrada» en las razones de rubro.
2. **Fallas al enviar, vistas en las postulaciones reales** (no son del filtro):
   - Laborum: «se hizo clic pero no se detectó confirmación», 7 veces y repetida en las mismas
     ofertas;
   - el chat de Computrabajo: «no dejó enviar la respuesta», 3 veces.
3. **Datos que la IA no tiene:** fecha de nacimiento, disponibilidad 5x2, turno nocturno. Van en
   «Información adicional» del perfil.
4. **Idea:** que la persona elija sus rubros en Filtros (hoy salen de sus señales y vetos). El campo
   `perfil.contexto` ya existe para eso.
