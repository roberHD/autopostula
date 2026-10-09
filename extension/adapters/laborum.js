// ═══════════════════════════════════════════════════════════════
//  AutoPostula — adaptador de Laborum
//  A diferencia de Computrabajo, Laborum no tiene preguntas propias
//  por aviso — todo es "Postulación rápida" de un clic, usando el
//  perfil que la persona ya tiene cargado en SU cuenta de Laborum
//  (no el perfil/CV de AutoPostula). Por eso este adaptador no llama
//  a la IA para nada: solo escanea, filtra (con los mismos filtros
//  que Computrabajo, vía core.js) y hace clic.
//
//  Laborum renderiza todo con JavaScript (SPA) — el DOM tarda un
//  momento en aparecer después de navegar, así que varias funciones
//  esperan con MutationObserver en vez de asumir que ya está listo.
// ═══════════════════════════════════════════════════════════════
(function () {
'use strict';

const DELAY = 3000;
const { msg, sleep, n, addLog, reportarPostulacion, reportarTitulosVistos,
        analizarYResponder, mostrarRevision, setVal, limitarTexto, seleccionarOpcion,
        siguientePagina } = window.AP;

// true desde que esta página empieza a irse a otra (ver irA): de ahí en
// adelante no escanea ni le avisa nada a la ráfaga.
AP.navegando = false;

// El listado de Laborum pagina con ?page={n} (page 1 no lleva el parámetro) --
// verificado a mano contra el sitio real (ver backend/scripts/scrape-corpus.ts).
function urlPaginaLaborum(pagina) {
  const u = new URL(location.href);
  u.searchParams.set('page', String(pagina));
  return u.toString();
}

// ── Esperar a que aparezca al menos un elemento que matchee el selector ──
// Necesario porque Laborum pinta el listado/la oferta después de cargar la
// página (SPA) — un querySelector inmediato en document_idle suele llegar
// antes de que exista nada.
function esperar(selector, timeout = 4000) {
  return new Promise(resolve => {
    const ya = document.querySelectorAll(selector);
    if (ya.length) return resolve([...ya]);
    const obs = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length) { obs.disconnect(); clearTimeout(t); resolve([...els]); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const t = setTimeout(() => { obs.disconnect(); resolve([...document.querySelectorAll(selector)]); }, timeout);
  });
}

// Igual que esperar(), para cuando no alcanza con un selector.
function esperarQue(condicion, timeout) {
  return new Promise(resolve => {
    if (condicion()) return resolve(true);
    const obs = new MutationObserver(() => {
      if (condicion()) { obs.disconnect(); clearTimeout(t); resolve(true); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const t = setTimeout(() => { obs.disconnect(); resolve(!!condicion()); }, timeout);
  });
}

// ── La página de un aviso ─────────────────────────────────────────
function esPaginaDeAviso() {
  return /\/empleos\/.+-\d+\.html/.test(location.pathname);
}

function idDeAviso() {
  return (location.pathname.match(/-(\d+)\.html/) || [])[1] || location.pathname;
}

// Antes de que la SPA pinte el aviso ya hay un <button> vacío y oculto en la
// página: esperar "algún botón", como se hacía, seguía de largo con la página
// en blanco. El título salía "Oferta" y el botón de postular "no existía", y
// la oferta quedaba incompleta o, si venía de "Por decidir", vencida (visto en
// producción el 2026-10-01). Se espera el título y la ficha.
function avisoCargado() {
  return !!(document.querySelector('h1') && document.getElementById('ficha-detalle'));
}

function esperarAviso() {
  return esperarQue(avisoCargado, 15000);
}

function tituloDelAviso() {
  const h1 = document.querySelector('h1');
  return (h1 && h1.textContent.trim()) || 'Oferta';
}

// La empresa enlaza a su perfil ("/perfiles/empresa_..."). Un aviso
// confidencial no tiene ese enlace, y los avisos relacionados de la página
// tampoco lo usan (verificado el 2026-10-01).
function empresaDelAviso() {
  const a = document.querySelector('a[href*="/perfiles/empresa_"]');
  return (a && a.textContent.trim()) || '';
}

// Mismo ícono que en la tarjeta (getUbicacionDeTarjeta), dentro de la ficha.
function ubicacionDelAviso() {
  const ficha = document.getElementById('ficha-detalle') || document;
  const icono = ficha.querySelector('i[name="icon-light-location-pin"]');
  const contenedor = icono && icono.closest('div');
  return (contenedor && contenedor.textContent.trim()) || '';
}

// El botón que postula: "Postulación rápida" en las de un clic, "Postularme"
// en las que abren las preguntas. Vive en una barra pegajosa que la SPA pinta
// un poco después que el resto del aviso.
function botonPostular() {
  return [...document.querySelectorAll('button')].find(b => {
    const t = n(b.textContent);
    return (t.includes('postulacion rapida') || t === 'postularme' || t.includes('postular')) && AP.esVisible(b);
  }) || null;
}

// La búsqueda puede venir filtrada por jornada en la URL
// ("empleos-part-time-busqueda-vendedor.html", como la arma la ráfaga: ver
// URL_BUSQUEDA_POR_PORTAL en background.js). Entonces todas sus tarjetas son
// de esa jornada según el propio Laborum, aunque la tarjeta no lo diga: se le
// pasa al scorer como texto del aviso. Sin esto, toda la búsqueda part time
// quedaba en "no dice la jornada" (2026-10-01). Al abrir el aviso se vuelve a
// puntuar con su ficha real (extraerTextoAviso).
function jornadaDelListado() {
  const m = location.pathname.match(/empleos-(part-time|full-time)-/);
  if (!m) return '';
  return m[1] === 'part-time' ? 'Part-time' : 'Full-time';
}

// ── Tarjetas del listado ──────────────────────────────────────────
// Las clases CSS de Laborum son hashes de styled-components (cambian con
// cada build suyo) — por eso nos anclamos al href, que es semántico y
// estable, y a los ids "header-col-job-posting-{ID}" que traen el ID
// de la oferta incrustado (tampoco son hashes de estilo).
function getTarjetas() {
  return [...document.querySelectorAll('a[href^="/empleos/"]')]
    .filter(a => /-\d+\.html/.test(a.href));
}

function getIdDeTarjeta(a) {
  const m = a.href.match(/-(\d+)\.html/);
  return m ? m[1] : a.href;
}

function getTituloDeTarjeta(a) {
  const h2 = a.querySelector('h2');
  return (h2 && h2.textContent.trim()) || 'Oferta';
}

// Ubicación: nos anclamos al ícono "icon-light-location-pin" (nombre de la
// librería de íconos, estable) en vez de a una clase de estilo.
function getUbicacionDeTarjeta(a) {
  const icono = a.querySelector('i[name="icon-light-location-pin"]');
  const contenedor = icono && icono.closest('div');
  return (contenedor && contenedor.textContent.trim()) || '';
}

// Empresa de una tarjeta -- las clases son hashes de styled-components (ver
// nota de arriba), así que en vez de una clase se busca por patrón: el <h3>
// que NO es la fecha ("Actualizado hace...") dentro del bloque de cabecera de
// la tarjeta (que sí tiene un id estable, con el id de la oferta incrustado).
function getEmpresaDeTarjeta(a) {
  const id = getIdDeTarjeta(a);
  const contenedor = a.querySelector('#header-col-job-posting-' + id) || a;
  // El primer <h3> siempre es la fecha ("Publicado hace 6 horas", "Publicado
  // ayer", "Actualizado hace 8 días", "Actualizado hace más de 15 días", ...)
  // y el segundo siempre es la empresa -- verificado contra 20 tarjetas reales
  // del sitio, todas con exactamente 2 <h3>. Antes se intentaba distinguirlos
  // por contenido (regex negativo excluyendo "hace \d"), pero eso se rompía con
  // cualquier variante que no calzara exacto ese patrón -- "Publicado ayer",
  // "Actualizado ayer" y "hace más de 15 días" (con una palabra entre "hace" y
  // el número) se colaban como si fueran el nombre de la empresa. La posición
  // no depende del texto ni del hash de estilo (que sí cambia entre builds).
  const h3s = [...contenedor.querySelectorAll('h3')];
  const candidato = h3s[1];
  return (candidato && candidato.textContent.trim()) || '';
}

// ── Evaluar tarjeta (scorer local si está activo, si no el filtro viejo) ──
// docs/rediseno-filtrado-ofertas.md §6 -- ver AP.evaluarOferta en core.js.
function evaluarTarjeta(a) {
  if (!AP.cfg) return { banda: 'descartar', score: null, razones: ['extensión sin configurar'] };
  const campos = {
    titulo: getTituloDeTarjeta(a),
    empresa: getEmpresaDeTarjeta(a),
    // El cuerpo del aviso no está disponible a nivel de tarjeta: va solo la
    // jornada, cuando la búsqueda viene filtrada por ella (jornadaDelListado).
    cuerpo: jornadaDelListado(),
    ubicacion: getUbicacionDeTarjeta(a),
  };
  return AP.evaluarOferta(campos);
}

// ── Detectar postulación exitosa ──────────────────────────────────
// Tras postular, Laborum reemplaza el botón por un bloque con
// "Postulado el DD/MM/AAAA" — texto estable independiente del hash de
// estilo del momento.
function yaPostulado() {
  return [...document.querySelectorAll('h1,h2,h3')].some(el => /^Postulado el /.test((el.textContent || '').trim()));
}

// Con un observador del DOM y no con una espera en bucle: en una pestaña de
// fondo Chrome espacia los temporizadores encadenados.
function esperarConfirmacion(timeout = 8000) {
  return esperarQue(yaPostulado, timeout);
}

// ── Texto del aviso (para el scorer y para la IA) ──────────────────
// La ficha va primero ("Presencial · Ventas · Part-time, Indeterminado ·
// Junior"): en Laborum la jornada casi nunca está en la descripción, solo ahí.
// Sin ella el scorer no veía la jornada de ningún aviso y toda la búsqueda
// part time quedaba en "Por decidir" (2026-10-01); la IA tampoco sabía que el
// cargo era part time. Computrabajo y Trabajando ya leían su ficha completa.
function textoFichaAviso() {
  const ficha = document.getElementById('ficha-detalle') || document.body;
  const ul = ficha.querySelector('ul[aria-label="Información adicional del aviso"]');
  return ul ? [...ul.querySelectorAll('li')].map(li => li.textContent.trim()).filter(Boolean).join(' · ') : '';
}

function extraerTextoAviso() {
  const desc = document.querySelector('#descripcion-aviso');
  const beneficios = document.querySelector('#beneficios-aviso');
  let texto = textoFichaAviso() + '\n\n' + (desc ? desc.innerText : '') + '\n\n' + (beneficios ? beneficios.innerText : '');
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  return texto.slice(0, 4000) || (document.body.innerText || '').slice(0, 4000);
}

// ── Facetas estructuradas del aviso (docs/visibilidad-y-etapa2.md §B) ──────
// Selectores verificados a mano contra el sitio real el 2026-09-07 (varias
// ofertas, con y sin sueldo, remoto/presencial). Laborum es un SPA hecho con
// styled-components: las clases son hashes que cambian en cada build (a
// diferencia de Computrabajo, acá NO hay ningún ícono ni atributo data-*
// estable para identificar cada faceta), así que en vez de las clases se usa
// #ficha-detalle (id fijo, delimita el aviso principal y excluye la barra de
// "empleos relacionados") y, dentro de ese contenedor, el único elemento con
// aria-label="Información adicional del aviso" -- ese sí es estable porque
// es semántico (accesibilidad), no de estilo. Cada <li> de esa lista se
// clasifica por su propio texto (vocabulario cerrado que el portal ya
// etiquetó -- remoto/presencial/híbrido, "full-time, indeterminado", "$..."
// -- no es grepear la descripción libre del aviso).
function extraerFacetasAviso() {
  const ficha = document.getElementById('ficha-detalle') || document.body;
  const facetas = {};

  const ul = ficha.querySelector('ul[aria-label="Información adicional del aviso"]');
  if (ul) {
    for (const li of ul.querySelectorAll('li')) {
      const texto = li.textContent.trim();
      if (!texto) continue;
      if (/^(remoto|presencial|h[ií]brido)/i.test(texto)) {
        facetas.modalidad = texto;
      } else if (texto.includes('$')) {
        facetas.sueldo = texto;
      } else if (/full-?time|part-?time|por horas|jornada/i.test(texto)) {
        // Laborum junta jornada y contrato en un solo <li>, separados por coma
        // (ej: "Full-time, Indeterminado").
        const partes = texto.split(',').map((s) => s.trim()).filter(Boolean);
        if (partes[0]) facetas.jornada = partes[0];
        if (partes[1]) facetas.contrato = partes[1];
      }
    }
  }

  // "Publicado hace X" / "Actualizado hace X" -- sin selector propio (mismo
  // problema de clases hasheadas), se busca por el texto completo de la
  // etiqueta dentro de #ficha-detalle (no del body entero, que trae los
  // "hace" de los avisos relacionados en la barra lateral).
  const walker = document.createTreeWalker(ficha, NodeFilter.SHOW_TEXT);
  let nodo;
  while ((nodo = walker.nextNode())) {
    const t = nodo.textContent.trim();
    if (/^(Publicado|Actualizado)( el)? hace /i.test(t)) { facetas.publicadaHace = t; break; }
  }

  // Rating de empresa: no verificado -- en los avisos revisados Laborum no
  // mostraba calificación de la empresa en la página del aviso (a diferencia
  // de Computrabajo). Se deja sin implementar en vez de adivinar un selector
  // nunca visto (§B: "no inventarlos").

  const desc = ficha.querySelector('#descripcion-aviso');
  if (desc && desc.textContent.trim()) {
    facetas.extracto = desc.textContent.trim().split(/\s+/).slice(0, 300).join(' ');
  }

  return facetas;
}

// AP.vistos vive solo en memoria y core.js lo resetea cada vez que el content
// script se vuelve a inyectar — cosa que en Laborum pasa en CADA navegación
// real (a diferencia de Computrabajo, que nunca sale de la página). Por eso
// acá la memoria de "esto ya se procesó" tiene que salir del log persistente
// (chrome.storage, sobrevive a la recarga), no del Set en memoria.
function yaProcesada(id) {
  // Lo que la persona decidió en el panel de revisión no se vuelve a decidir
  // solo (docs/panel-de-revision-en-el-portal.md §2.2).
  if (AP.vistos.has(id) || AP.decididaEnPanel(id)) return true;
  // Lo que solo se miró (o se propuso con «Revisar antes de enviar») vuelve a
  // estar disponible cuando la extensión de verdad postula.
  const postula = !AP.soloObservarEfectivo() && !AP.proponeEnVezDeEnviar();
  return (AP.log || []).some(e => e.uid === id && !(postula && e.status === 'observado'));
}

// ── Modal "Responde las preguntas" ──────────────────────────────────
// Estructura simple y consistente: cada pregunta es un
// div[for="id-pregunta-N"] seguido de su textarea#id-pregunta-N — nada
// de heurísticas de búsqueda de labels como en Computrabajo, acá el
// propio "for" (aunque esté en un div, no en un <label> real) nos dice
// exactamente qué pregunta corresponde a qué campo.
function getModalPreguntas() {
  return document.querySelector('#form-preguntas');
}

// Se le pidió a la persona lo que faltaba y nadie contestó a tiempo: en esta
// pestaña no se vuelve a preguntar (ver rellenarYEnviarPreguntas).
const CLAVE_NADIE_CONTESTO = 'ap_nadie_contesto_laborum';

function getTituloPregunta(form, textarea) {
  const etiqueta = form.querySelector('[for="' + CSS.escape(textarea.id) + '"]');
  if (etiqueta) return etiqueta.textContent.replace('*', '').trim();
  return textarea.getAttribute('label') || textarea.placeholder || '';
}

// Preguntas de opción única (radio) — estructura distinta a las de texto:
// <legend for="radiobutton-{grupoId}">Pregunta</legend> + varios
// <input type="radio" name="{grupoId}"> con su propio
// <label for="{inputId}">Texto de la opción</label>. Se agrupan por el
// atributo "name" (compartido por todos los radios de una misma pregunta).
function getGruposRadio(form) {
  const radios = [...form.querySelectorAll('input[type="radio"]')];
  const porGrupo = {};
  radios.forEach(r => {
    if (!r.name) return;
    (porGrupo[r.name] = porGrupo[r.name] || []).push(r);
  });
  return Object.entries(porGrupo).map(([grupoId, inputs]) => {
    const legend = form.querySelector('legend[for="radiobutton-' + grupoId + '"]')
                 || [...form.querySelectorAll('legend')].find(l => (l.getAttribute('for') || '').includes(grupoId));
    const pregunta = legend ? legend.textContent.replace('*', '').trim() : '';
    const opciones = inputs.map(inp => {
      const lbl = form.querySelector('label[for="' + CSS.escape(inp.id) + '"]');
      const texto = (lbl && lbl.textContent.trim()) || inp.getAttribute('aria-label') || inp.value;
      return { el: inp, texto };
    });
    return { grupoId, pregunta, opciones };
  }).filter(g => g.pregunta && g.opciones.length);
}

async function esperarBotonHabilitado(btn, timeout = 4500) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (!btn.disabled) return true;
    await sleep(150);
  }
  return !btn.disabled;
}

// Llena el modal de preguntas con IA y envía. Devuelve el respuestasLog
// (para el panel de revisión, si corresponde) o null si no hay modal/falló.
//
// A diferencia de Computrabajo, este modal es una estructura fija y simple (ver
// comentario de getModalPreguntas) que no revela campos nuevos según lo que se
// responda antes — por eso acá SÍ se junta todo (análisis + todas las preguntas
// de texto y de radio) en una sola llamada a la IA, sin necesidad de partirlo en
// dos etapas como en el adaptador de Computrabajo.
async function rellenarYEnviarPreguntas(contexto) {
  const form = getModalPreguntas();
  if (!form) return null;

  msg('Preparando preguntas…', '#D97706');
  const textareas = [...form.querySelectorAll('textarea[id^="id-pregunta-"]')];
  const grupos = getGruposRadio(form);

  const preguntasIA = [];
  const infoTextareas = textareas.map((ta, i) => {
    const pregunta = getTituloPregunta(form, ta);
    const id = (AP.iaDisponible && pregunta.length > 3) ? 't' + i : null;
    if (id) preguntasIA.push({ id, pregunta, opciones: null });
    return { ta, pregunta, id };
  });
  const infoGrupos = grupos.map((grupo, i) => {
    const id = (AP.iaDisponible && grupo.pregunta.length > 3) ? 'r' + i : null;
    if (id) preguntasIA.push({ id, pregunta: grupo.pregunta, opciones: grupo.opciones.map(o => o.texto) });
    return { grupo, id };
  });

  msg(preguntasIA.length ? 'IA respondiendo ' + preguntasIA.length + ' pregunta(s)…' : 'Analizando aviso…', 'trabajando');
  const resultado = await analizarYResponder(contexto, preguntasIA);
  const analisis = resultado.analisis;

  msg('Rellenando preguntas…', '#D97706');
  const respuestasLog = [];

  for (const info of infoTextareas) {
    // §8.4 (docs/revision-2026-09-16.md): la IA puede decir que esta
    // pregunta pide un hecho verificable (licencia, renta...) que no está
    // en el perfil, en vez de inventar una respuesta -- ver la regla 1b del
    // prompt en procesar-postulacion/route.ts.
    const datoFaltante = info.id && resultado.datosFaltantes && resultado.datosFaltantes[info.id];
    const val = (!datoFaltante && info.id) ? resultado.respuestas[info.id] : null;
    if (datoFaltante) {
      respuestasLog.push({ pregunta: info.pregunta, respuesta: '', respuestaIa: '', vacia: true, datoFaltante, tipo: 'texto', el: info.ta, errorIA: null });
    } else if (val) {
      const valLimitado = limitarTexto(val, info.ta);
      info.ta.focus();
      setVal(info.ta, valLimitado);
      // Muchos formularios (react-hook-form y similares) solo marcan el campo
      // como "tocado" — y habilitan el botón de enviar — al perder el foco,
      // no con input/change solos. Sin este blur, el campo queda lleno pero
      // el botón sigue deshabilitado.
      info.ta.blur();
      info.ta.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      // respuestaIa se escribe una vez acá y nunca se vuelve a tocar --
      // aplicarEdiciones() (core.js) solo pisa `respuesta` en modo revisión
      // (docs/banco-de-preguntas.md §3: sin esto la corrección de la persona
      // pisaba también lo que generó la IA).
      respuestasLog.push({ pregunta: info.pregunta, respuesta: valLimitado, respuestaIa: valLimitado, fueIA: true, tipo: 'texto', el: info.ta });
    } else {
      respuestasLog.push({ pregunta: info.pregunta, respuesta: '', respuestaIa: '', vacia: true, tipo: 'texto', el: info.ta, errorIA: resultado.error });
    }
    await sleep(300);
  }

  // Preguntas de radio (ej: "Tipo de documento") — si quedan sin responder,
  // Laborum nunca habilita el botón de enviar aunque el resto esté completo.
  for (const info of infoGrupos) {
    const datoFaltante = info.id && resultado.datosFaltantes && resultado.datosFaltantes[info.id];
    const respIA = (!datoFaltante && info.id) ? resultado.respuestas[info.id] : null;
    let elegida = null;
    if (respIA) {
      const rNorm = n(respIA);
      elegida = info.grupo.opciones.find(o => rNorm.includes(n(o.texto)) || (n(o.texto).length < 4 && rNorm.startsWith(n(o.texto))));
    }
    if (elegida && seleccionarOpcion(elegida.el)) {
      elegida.el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      respuestasLog.push({ pregunta: info.grupo.pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, fueIA: true, tipo: 'opcion', opciones: info.grupo.opciones, elegidoEl: elegida.el });
    } else {
      respuestasLog.push({ pregunta: info.grupo.pregunta, respuesta: '', respuestaIa: '', vacia: true, datoFaltante: datoFaltante || null, tipo: 'opcion', opciones: info.grupo.opciones, elegidoEl: null, errorIA: resultado.error });
    }
    await sleep(300);
  }

  const conRevision = AP.conRevision();
  const sinResponder = respuestasLog.filter(r => r.vacia);
  const faltan = sinResponder.map(r => r.datoFaltante || '"' + (r.pregunta || '').slice(0, 50) + '"').slice(0, 3).join(', ');
  const errorIA = (sinResponder.find(r => r.errorIA) || {}).errorIA;

  if (!conRevision && errorIA) {
    // La IA no respondió (cupo del mes, red): no hay un dato puntual que
    // pedirle a la persona.
    return { respuestasLog, errorEnvio: 'La IA no pudo responder el formulario (' + errorIA + ')' };
  }

  // Con "Revisar antes de enviar" se revisa todo, como siempre. Sin él, un
  // dato que la IA no puede saber (la renta, una disponibilidad: §8.4,
  // docs/revision-2026-09-16.md, nada se inventa) dejaba la postulación
  // incompleta sin preguntarle nada a nadie: en Laborum casi todos los avisos
  // de retail piden la "pretensión de renta". Ahora se pide solo lo que falta,
  // con el mismo panel y un plazo más corto, y lo que la persona conteste lo
  // puede guardar en su perfil -- igual que en trabajando.com
  // (docs/extension-trabajando-2026-09-30.md §7). Si nadie contesta a tiempo,
  // esta pestaña no vuelve a preguntar: cada aviso es una página nueva, así
  // que eso queda en sessionStorage.
  const nadieContesto = sessionStorage.getItem(CLAVE_NADIE_CONTESTO) === '1';
  if (conRevision || (sinResponder.length && !nadieContesto)) {
    msg(conRevision ? '⏸ Revisión pendiente…' : '⏸ Falta información para postular…', '#2563EB');
    const decision = await mostrarRevision(tituloDelAviso(), respuestasLog, contexto,
      conRevision ? undefined : { titulo: 'Falta información para postular', limiteMs: 120000 });
    if (decision === 'skip') {
      if (!conRevision && AP.revisionVencida) sessionStorage.setItem(CLAVE_NADIE_CONTESTO, '1');
      return {
        respuestasLog, saltada: true,
        razon: conRevision ? 'Saltada en revisión manual'
          : AP.revisionVencida ? 'Faltaban respuestas (' + faltan + ') y nadie contestó a tiempo'
          : 'Saltada: faltaban respuestas (' + faltan + ')',
      };
    }
  } else if (sinResponder.length) {
    return { respuestasLog, errorEnvio: 'Faltan datos para responder (' + faltan + '): guárdalos en tu perfil o activa "Revisar antes de enviar"' };
  }

  // El botón "Responder" está fuera del <form> en el DOM (es un elemento
  // form-associated vía el atributo form="form-preguntas", no un
  // descendiente) — por eso se busca en todo el documento, no con
  // form.querySelector (que solo mira adentro del form y nunca lo encuentra).
  const btnEnviar = document.querySelector('button[form="form-preguntas"]') || form.querySelector('button[type="submit"]');
  if (!btnEnviar) return { respuestasLog, errorEnvio: 'No se encontró el botón Responder' };

  await esperarBotonHabilitado(btnEnviar);
  if (btnEnviar.disabled) {
    // Alguna pregunta obligatoria quedó sin responder (la IA no tenía el dato) y el
    // botón nunca se habilita — no forzamos el envío, queda para completar a mano.
    return { respuestasLog, errorEnvio: 'El formulario quedó incompleto — hay preguntas sin responder' };
  }

  btnEnviar.click();
  return { respuestasLog, matchScore: analisis && analisis.matchScore };
}

// Un 'err' de verdad (no un 'skip' esperable como "ya estaba postulada") también
// se reporta al backend como postulación incompleta, para que quede visible en
// el dashboard con la razón — antes esto se perdía en el log local nomás.
function marcarIncompleta(id, titulo, url, razon, respuestas, decisionOfertaId, empresa) {
  addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: razon, respuestas });
  reportarPostulacion({ id, titulo, empresa, plataforma: 'Laborum', url, incompleta: true, nota: razon, respuestas: respuestas || [], decisionOfertaId });
}

// ── Postular a una oferta ya abierta ──────────────────────────────
// Devuelve { ok, expirada } -- expirada=true cuando la oferta ya no se puede
// enviar nunca: no hay ningún botón de postular (§8.4/§8.6), o ya estaba
// postulada (docs/revision-2026-09-28.md §6: antes una aprobada de "Por
// decidir" que ya estaba postulada se reintentaba para siempre). El resto de
// los "no ok" son fallas puntuales del flujo, no la oferta en sí.
async function postularEnPagina(id, titulo, url, decisionOfertaId, empresa) {
  // docs/revision-2026-09-28.md §1: la empresa viaja con la postulación (se
  // guarda en la postulación misma, no se toma de la oferta compartida).
  //
  // La barra con el botón la pinta la SPA un poco después que el resto del
  // aviso: se espera a que aparezca, o a que diga que ya se postuló.
  await esperarQue(() => yaPostulado() || !!botonPostular(), 8000);
  if (yaPostulado()) {
    addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: id, reason: 'Ya estaba postulada' });
    return { ok: false, expirada: true };
  }

  // docs/modo-solo-observar.md §3.2/§4.3: único punto por el que pasan los
  // tres caminos que terminan acá -- Etapa 1 directo, Etapa 2 de una gris
  // que resolvió a postular, y una aprobación de banda gris (aunque esa ya
  // se corta antes, en el handler de DO_APPLY de core.js). Ni se toca el
  // botón ni se envía nada.
  if (AP.soloObservarEfectivo()) {
    addLog({ ts: Date.now(), status: 'observado', title: titulo, url, uid: id, reason: 'Habría postulado — modo solo observar' });
    return { ok: false, expirada: false, observado: true };
  }

  // El texto del botón cambia según el tipo de oferta (ver botonPostular).
  const btn = botonPostular();

  if (!btn) {
    marcarIncompleta(id, titulo, url, 'No se encontró el botón para postular', null, decisionOfertaId, empresa);
    return { ok: false, expirada: true };
  }

  if (!AP.activo) return { ok: false, expirada: false };

  // §2.10 (docs/revision-2026-09-16.md): "Postulación rápida" se envía con
  // este mismo clic y no pasa por ningún formulario, así que con "Revisar
  // antes de enviar" el visto bueno se pide ANTES. Las que abren el modal de
  // preguntas ("Postularme") ya tienen su propia revisión más abajo.
  if (AP.conRevision() && n(btn.textContent).includes('postulacion rapida')) {
    msg('⏸ Revisión pendiente…', '#2563EB');
    const decision = await AP.confirmarAntesDeEnviar(titulo, extraerTextoAviso(),
      'Esta oferta se postula con un clic, sin preguntas: al confirmar se envía tu CV. ¿Enviar?');
    if (decision === 'skip') {
      addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: id, reason: 'Saltada en revisión manual' });
      return { ok: false, expirada: false };
    }
  }

  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(400);
  btn.click();
  // El modal de preguntas puede tardar más que un segundo en una pestaña de
  // fondo: si se miraba antes de que apareciera, la postulación se daba por
  // directa y quedaba sin responder.
  await esperarQue(() => !!getModalPreguntas() || yaPostulado(), 8000);

  // ¿Se abrió el modal de preguntas, o fue postulación directa?
  const form = getModalPreguntas();
  if (form) {
    const contexto = extraerTextoAviso();
    const resultado = await rellenarYEnviarPreguntas(contexto);

    if (!resultado) {
      marcarIncompleta(id, titulo, url, 'El modal de preguntas desapareció antes de poder llenarlo', null, decisionOfertaId, empresa);
      return { ok: false, expirada: false };
    }
    if (resultado.saltada) {
      addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: id, reason: resultado.razon || 'Saltada en revisión manual' });
      return { ok: false, expirada: false };
    }
    // respuestaIa/fueEditada (docs/banco-de-preguntas.md §3): sin esto el
    // backend guardaba respuestaIa == respuestaFinal siempre, y la corrección
    // de la persona en modo revisión (la señal más valiosa del dataset) se
    // perdía para siempre.
    const paraLog = (r) => ({ pregunta: r.pregunta, respuestaIa: r.respuestaIa, respuesta: r.respuesta, fueEditada: r.respuestaIa !== r.respuesta, vacia: r.vacia, fueIA: r.fueIA });

    if (resultado.errorEnvio) {
      const respuestasParaLog = resultado.respuestasLog.map(paraLog);
      marcarIncompleta(id, titulo, url, resultado.errorEnvio, respuestasParaLog, decisionOfertaId, empresa);
      return { ok: false, expirada: false };
    }

    const ok = await esperarConfirmacion();
    if (ok) {
      const respuestasParaLog = resultado.respuestasLog.map(paraLog);
      addLog({ ts: Date.now(), status: 'ok', title: titulo, url, uid: id, reason: 'Postulación con preguntas enviada', respuestas: respuestasParaLog });
      // §1.3 (docs/revision-2026-09-16.md): ver el razonamiento completo en
      // computrabajo.js, es el mismo acá.
      const reportado = await reportarPostulacion({ id, titulo, empresa, plataforma: 'Laborum', url, matchScore: resultado.matchScore, respuestas: respuestasParaLog, decisionOfertaId });
      if (!reportado || !reportado.ok) {
        addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: 'Se envió en el portal, pero no se guardó en AutoPostula: ' + ((reportado && reportado.error) || 'error desconocido') });
        msg('⚠ Enviado, no se guardó: ' + titulo.slice(0, 30), '#DC2626');
      } else {
        msg('✓ ' + titulo.slice(0, 40), '#16A34A');
      }
      return { ok: true, expirada: false };
    }
    marcarIncompleta(id, titulo, url, 'Se envió el formulario pero no se detectó confirmación', resultado.respuestasLog.map(paraLog), decisionOfertaId, empresa);
    return { ok: false, expirada: false };
  }

  // Sin modal: postulación directa de un clic.
  const ok = await esperarConfirmacion();
  if (ok) {
    addLog({ ts: Date.now(), status: 'ok', title: titulo, url, uid: id, reason: 'Postulación rápida enviada' });
    const reportado = await reportarPostulacion({ id, titulo, empresa, plataforma: 'Laborum', url, decisionOfertaId });
    if (!reportado || !reportado.ok) {
      addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: 'Se envió en el portal, pero no se guardó en AutoPostula: ' + ((reportado && reportado.error) || 'error desconocido') });
      msg('⚠ Enviado, no se guardó: ' + titulo.slice(0, 30), '#DC2626');
    } else {
      msg('✓ ' + titulo.slice(0, 40), '#16A34A');
    }
    return { ok: true, expirada: false };
  }

  marcarIncompleta(id, titulo, url, 'Se hizo clic pero no se detectó confirmación — puede que haya redirigido a un portal externo', null, decisionOfertaId, empresa);
  return { ok: false, expirada: false };
}

// ── Abrir un aviso desde el listado ──────────────────────────────
// Laborum no tiene un panel lateral como Computrabajo: cada aviso es su
// propia página, así que "abrir el aviso" es navegar ahí y volver.
// sessionStorage sobrevive esa navegación (misma pestaña) y se pierde sola si
// se cierra: ahí queda qué aviso se fue a abrir, lo que decía su tarjeta y el
// listado al que hay que volver.
//
// Se abre un aviso para postular a uno que la tarjeta dio por bueno, o para
// revisar uno que quedó en duda (Etapa 2, §B). En los dos casos se vuelve a
// puntuar con el aviso completo antes de hacer nada: la tarjeta no trae la
// descripción ni la jornada (ver extraerTextoAviso). Hasta el 2026-10-01 las
// buenas se postulaban sin mirar el aviso.
const CLAVE_AVISO_PENDIENTE = 'ap_aviso_pendiente';

function leerAvisoPendiente() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_AVISO_PENDIENTE) || 'null'); } catch (e) { return null; }
}

// Lo que se hizo en esta pestaña, sumado entre páginas: cada navegación vuelve
// a cargar la extensión con los conteos en cero, y la ráfaga recibía solo los
// de la última pasada por el listado (las postulaciones de Laborum no
// llegaban a su resumen).
const CLAVE_CONTEOS = 'ap_conteos_laborum';

function conteosAcumulados() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_CONTEOS) || '{}') || {}; } catch (e) { return {}; }
}

function sumarConteos(parcial) {
  const c = conteosAcumulados();
  for (const k of Object.keys(parcial)) if (parcial[k]) c[k] = (c[k] || 0) + parcial[k];
  sessionStorage.setItem(CLAVE_CONTEOS, JSON.stringify(c));
  return c;
}

function terminarEscaneo() {
  const c = conteosAcumulados();
  sessionStorage.removeItem(CLAVE_CONTEOS);
  AP.reportarEscaneoTerminado(c);
}

// Desde que la pestaña empieza a irse a otra página hasta que esa carga, esta
// no hace nada más (ver el comienzo de escanear()).
function irA(url) {
  AP.navegando = true;
  location.href = url;
}

// El listado lee el log al cargar para no volver a abrir lo que se resolvió
// acá: se espera a que quede guardado antes de irse. Se vuelve navegando al
// listado y no con "atrás": un "atrás" que se queda en la misma página (la SPA
// suma entradas propias al historial) dejaba el escaneo parado.
async function volverA(url) {
  AP.navegando = true;
  await new Promise(r => { try { chrome.storage.local.set({ log: AP.log }, () => r()); } catch (e) { r(); } });
  if (url) location.href = url;
  else history.back();
}

function abrirAviso(oferta, texto) {
  AP.vistos.add(oferta.id);
  sessionStorage.setItem(CLAVE_AVISO_PENDIENTE, JSON.stringify({
    id: oferta.id, titulo: oferta.titulo, url: oferta.url, empresa: oferta.empresa,
    ubicacion: oferta.ubicacion, desde: location.href,
  }));
  msg(texto, 'trabajando');
  irA(oferta.url);
}

// Puntúa el aviso abierto con todo lo que muestra y hace lo que corresponda:
// postular, dejarlo en "Por decidir" o descartarlo con su razón. `datos` trae
// lo de la tarjeta si se llegó desde el listado; lo que falte se lee de la
// página. Devuelve false si hay que dejar de escanear (sin cupo, o el portal
// fuera del plan).
async function resolverAviso(datos) {
  const url = datos.url || location.href;
  if (!(await esperarAviso())) {
    addLog({ ts: Date.now(), status: 'err', title: datos.titulo || 'Oferta', url, uid: datos.id, reason: 'La página del aviso no terminó de cargar' });
    return true;
  }
  const titulo = datos.titulo || tituloDelAviso();
  const empresa = datos.empresa || empresaDelAviso() || null;
  const ubicacion = datos.ubicacion || ubicacionDelAviso();
  let resultado = AP.evaluarOferta({
    titulo, empresa: empresa || '', cuerpo: extraerTextoAviso(), ubicacion,
  });

  // §2.8: tampoco se repite un cargo que ya se postuló con otro id.
  if (resultado.banda === 'postular') {
    let razonDuplicado = null;
    const unicas = await AP.quitarDuplicados('Laborum', [{ titulo, empresa }], (p, razon) => { razonDuplicado = razon; });
    if (!unicas.length) resultado = { banda: 'descartar', score: resultado.score, razones: [razonDuplicado] };
  }

  // La marca de la tarjeta, para cuando se vuelva al listado
  // (docs/primera-busqueda-guiada.md §11).
  const datosMarca = { titulo, empresa, url, ubicacion, score: resultado.score };
  if (resultado.banda === 'descartar') AP.marcar(datos.id, 'descartar', resultado.razones && resultado.razones.slice(0, 1), datosMarca);
  else AP.marcar(datos.id, resultado.banda, resultado.razones, datosMarca);

  if (resultado.banda === 'postular') {
    // §1.3: el tope del mes y el portal conectado, antes de cada clic (en
    // solo observar no hay clic).
    if (!AP.soloObservarEfectivo()) {
      const verificacion = await AP.puedePostular('Laborum');
      if (!verificacion.permitido) {
        msg(AP.motivoPuedePostular(verificacion.motivo), '#DC2626');
        return false;
      }
    }
    const r = await postularEnPagina(datos.id, titulo, url, undefined, empresa || undefined);
    AP.gastarRevisionPrimera();
    if (r.ok) sumarConteos({ postular: 1 });
    else if (r.observado) {
      sumarConteos({ observado: 1 });
      AP.reportarObservadas([{ externalId: datos.id, titulo, empresa, url, razon: AP.razonDeLaMarca('postular', resultado.razones), score: resultado.score }], 'Laborum');
    }
    await sleep(DELAY);
    return true;
  }

  if (resultado.banda === 'descartar') {
    const razon = (resultado.razones && resultado.razones[0]) || 'No calza con tus filtros';
    addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: datos.id, reason: AP.formatearRazonCorta(razon) });
    AP.reportarDescartes([{ externalId: datos.id, titulo, empresa, url, razon }], 'Laborum');
    sumarConteos({ descartar: 1 });
    msg('Descartada: ' + AP.formatearRazonCorta(razon), 'neutral');
  } else {
    addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: datos.id, reason: 'En banda gris — revisar en el dashboard' });
    AP.reportarBandaGris({
      titulo, url, plataforma: 'Laborum', empresa,
      scoreLocal: resultado.score, razones: resultado.razones, detalleAviso: extraerFacetasAviso(),
    });
    sumarConteos({ gris: 1 });
    msg('Queda por decidir: ' + titulo.slice(0, 35), 'pendiente');
  }
  return true;
}

// Un aviso que se abrió desde el listado: se resuelve y se vuelve a ese
// listado, que sigue con el resto.
async function revisarAvisoAbierto(pendiente) {
  sessionStorage.removeItem(CLAVE_AVISO_PENDIENTE);
  AP.vistos.add(pendiente.id);
  AP.latido();
  AP.procesando = true;
  let seguir = true;
  try {
    seguir = await resolverAviso(pendiente);
  } catch (e) {
    // Un error acá no puede dejar la pestaña parada en el aviso hasta que
    // venza el seguro de la ráfaga: se anota y se sigue con el resto.
    console.warn('[AP-Laborum] no se pudo resolver el aviso:', e);
    addLog({ ts: Date.now(), status: 'err', title: pendiente.titulo, url: pendiente.url, uid: pendiente.id, reason: 'Error al revisar el aviso: ' + ((e && e.message) || e) });
  } finally {
    AP.procesando = false;
  }
  if (!seguir) { terminarEscaneo(); return; }
  await volverA(pendiente.desde);
}

// ── Escanear el listado ────────────────────────────────────────────
async function escanear() {
  // Mientras la pestaña se va a otra página (un aviso, el listado, la página
  // siguiente) o está postulando, no se escanea ni se avisa nada: el flujo
  // sigue por su cuenta. Antes, un escaneo que llegaba justo entonces (el
  // observador de cambios del DOM, o la orden de la ráfaga) veía "procesando"
  // y le avisaba a la ráfaga que el portal había terminado: la ráfaga cerraba
  // la pestaña con el aviso recién abierto, sin postular (2026-10-01).
  if (AP.navegando || AP.procesando) return;
  if (!AP.activo || !AP.cfg) { terminarEscaneo(); return; }

  if (esPaginaDeAviso()) {
    const pendiente = leerAvisoPendiente();
    if (pendiente && pendiente.id === idDeAviso()) return revisarAvisoAbierto(pendiente);
    if (pendiente) {
      // Se fue a abrir un aviso y Laborum mostró otro (el pedido ya no está):
      // se anota, para no reintentarlo, y se vuelve al listado.
      sessionStorage.removeItem(CLAVE_AVISO_PENDIENTE);
      addLog({ ts: Date.now(), status: 'err', title: pendiente.titulo, url: pendiente.url, uid: pendiente.id, reason: 'El aviso ya no está disponible' });
      return volverA(pendiente.desde);
    }
    // Abierta directo en un aviso, sin venir del listado: una aprobada de "Por
    // decidir" (la postula DO_APPLY, que trae su decisión) o la persona que
    // abrió el aviso por su cuenta. Los enlaces de la ficha a avisos
    // relacionados no son un listado: antes se escaneaban como si lo fueran, y
    // la pestaña de una aprobada podía irse a otro aviso antes de que llegara
    // la orden de postular (2026-10-01).
    if (history.length > 1 || AP.escaneoPedido) return escanearPaginaDeOferta();
    return;
  }

  // Un aviso que se fue a abrir y no cargó (Laborum mandó a otra página): se
  // anota, para no volver a intentarlo en cada pasada.
  const sinAbrir = leerAvisoPendiente();
  if (sinAbrir) {
    sessionStorage.removeItem(CLAVE_AVISO_PENDIENTE);
    addLog({ ts: Date.now(), status: 'err', title: sinAbrir.titulo, url: sinAbrir.url, uid: sinAbrir.id, reason: 'El aviso no se pudo abrir' });
  }

  // La SPA pinta el listado después de cargar, y en una pestaña de fondo puede
  // tardar: con 4 s no alcanzaba, "Sin tarjetas" le decía a la ráfaga que
  // Laborum había terminado y la pestaña se cerraba a la mitad.
  await esperarQue(() => getTarjetas().length > 0, 15000);
  if (AP.navegando || AP.procesando) return;
  const candidatas = getTarjetas();
  if (!candidatas.length) { msg('Sin tarjetas — busca ofertas en Laborum', '#9CA3AF'); terminarEscaneo(); return; }
  AP.latido();

  let pendientes = [];
  const titulosVistos = [];
  const avistamientos = [];
  // Desglose de esta pasada (§A). El resumen suma además lo que se resolvió
  // abriendo avisos (sumarConteos).
  const conteos = { descartar: 0, observado: 0 };
  const razonesDescartadas = [];
  // Cada descarte con su razón va al panel (docs/estrategia-y-rediseno.md
  // §5.2): "Lo último que hizo" dice cuál y por qué, y se puede corregir.
  const descartes = [];
  // Las que la tarjeta deja en duda se abren después de las buenas (Etapa 2,
  // §B): recién con el aviso completo se sabe si van.
  const candidatosGris = [];

  candidatas.forEach(a => {
    const id = getIdDeTarjeta(a);
    if (yaProcesada(id)) return;
    const titulo = getTituloDeTarjeta(a);
    // Se guarda el título se haya matcheado o no con los filtros (ver
    // docs/rediseno-filtrado-ofertas.md, §7.2).
    titulosVistos.push(titulo);

    const empresa = getEmpresaDeTarjeta(a) || null;
    // Avistamiento (§9.3): toda tarjeta vista alimenta el corpus global de
    // JobOffer, se postule, quede en gris o se descarte.
    avistamientos.push({ externalId: id, titulo, empresa, url: a.href });

    const resultado = evaluarTarjeta(a);
    const oferta = { id, titulo, empresa, url: a.href, ubicacion: getUbicacionDeTarjeta(a), razones: resultado.razones, score: resultado.score };
    // Cada decisión queda marcada en su tarjeta, con su razón
    // (docs/primera-busqueda-guiada.md §11).
    if (resultado.banda !== 'descartar') AP.marcar(id, resultado.banda, resultado.razones, oferta);
    if (resultado.banda === 'postular') {
      pendientes.push(oferta);
    } else if (resultado.banda === 'gris') {
      candidatosGris.push(oferta);
    } else {
      // §C: la razón del scorer es un objeto estructurado -- se guarda tal
      // cual para el desglose del overlay (agrupa por tipo) y se formatea
      // recién para el log.
      conteos.descartar++;
      const razon = (resultado.razones && resultado.razones[0]) || 'No calza con tus filtros';
      razonesDescartadas.push(razon);
      descartes.push({ externalId: id, titulo, empresa, url: a.href, razon });
      AP.marcar(id, 'descartar', [razon], oferta);
      AP.vistos.add(id);
      addLog({ ts: Date.now(), status: 'skip', title: titulo, url: a.href, uid: id, reason: AP.formatearRazonCorta(razon) });
    }
  });
  reportarTitulosVistos(titulosVistos, 'Laborum');
  AP.reportarAvistamientos(avistamientos, 'Laborum');

  // §2.8 (docs/revision-2026-09-16.md): lo que ya se postuló con otro id, o
  // está repetido en esta misma página, no se vuelve a postular. Acá importa
  // más que en los otros: Laborum postuló 3 veces el mismo día a un mismo aviso.
  pendientes = await AP.quitarDuplicados('Laborum', pendientes, (p, razon) => {
    conteos.descartar++;
    razonesDescartadas.push(razon);
    descartes.push({ externalId: p.id, titulo: p.titulo, empresa: p.empresa, url: p.url, razon });
    AP.marcar(p.id, 'descartar', [razon]);
    AP.vistos.add(p.id);
    addLog({ ts: Date.now(), status: 'skip', title: p.titulo, url: p.url, uid: p.id, reason: AP.formatearRazonCorta(razon) });
  });

  // docs/modo-solo-observar.md §3.2: estas son ofertas que SE HABRÍAN
  // postulado. A diferencia de Computrabajo, acá "abrir el aviso para
  // postular" es navegar a la página completa: en vez de eso no se navega, se
  // deja constancia de cada una con su propio status y se sigue con las
  // grises (más abajo), que sí se abren igual (§4.1).
  const soloObservar = AP.soloObservarEfectivo();
  if (soloObservar) {
    pendientes.forEach(p => {
      AP.vistos.add(p.id);
      addLog({ ts: Date.now(), status: 'observado', title: p.titulo, url: p.url, uid: p.id, reason: 'Habría postulado — modo solo observar' });
    });
    AP.reportarObservadas(pendientes.map(p => ({
      externalId: p.id, titulo: p.titulo, empresa: p.empresa, url: p.url,
      razon: AP.razonDeLaMarca('postular', p.razones), score: p.score,
    })), 'Laborum');
    conteos.observado = pendientes.length;
    pendientes = [];
  }
  // docs/panel-de-revision-en-el-portal.md §9.1: con «Revisar antes de enviar»
  // y la persona mirando, no se navega a cada aviso: quedan propuestas, y la
  // tarjeta del final lleva al panel para elegir.
  const propone = AP.proponeEnVezDeEnviar();
  if (propone && pendientes.length) {
    pendientes.forEach(p => {
      AP.vistos.add(p.id);
      AP.anotarPropuesta(p.id);
      addLog({ ts: Date.now(), status: 'observado', title: p.titulo, url: p.url, uid: p.id, reason: AP.RAZON_PROPUESTA });
    });
    conteos.propuestas = pendientes.length;
    pendientes = [];
  }
  // docs/primera-busqueda-guiada.md §11: con la persona mirando (no en una
  // ráfaga) y en "solo mirar", las dudosas no se abren una por una -- la
  // pestaña saltaba sola de aviso en aviso justo mientras la persona miraba qué
  // hacía la extensión. Van a "Por decidir" con lo que dice la tarjeta, como en
  // Computrabajo. En las ráfagas, que nadie mira, se siguen abriendo (§B).
  if ((soloObservar || propone) && candidatosGris.length && !AP.esPestanaDeRafaga()) {
    for (const cand of candidatosGris) {
      AP.vistos.add(cand.id);
      addLog({ ts: Date.now(), status: 'skip', title: cand.titulo, url: cand.url, uid: cand.id, reason: 'En banda gris — revisar en el dashboard' });
      AP.reportarBandaGris({
        titulo: cand.titulo, url: cand.url, plataforma: 'Laborum', empresa: cand.empresa,
        scoreLocal: cand.score, razones: cand.razones, detalleAviso: null,
      });
    }
    conteos.gris = (conteos.gris || 0) + candidatosGris.length;
    candidatosGris.splice(0);
  }
  AP.reportarDescartes(descartes, 'Laborum');
  {
    const resumen = AP.mensajeEscaneo(sumarConteos(conteos), razonesDescartadas, soloObservar, propone);
    msg(resumen.texto, resumen.estado, resumen.accion);
  }

  if (pendientes.length) {
    // §1.3 (docs/revision-2026-09-16.md): ver el razonamiento completo en
    // computrabajo.js, es el mismo acá.
    const verificacion = await AP.puedePostular('Laborum');
    if (!verificacion.permitido) {
      msg(AP.motivoPuedePostular(verificacion.motivo), '#DC2626');
      terminarEscaneo();
      return;
    }
    // Una por pasada, en la misma pestaña: al volver al listado, la pasada
    // siguiente sigue con la próxima.
    const primera = pendientes[0];
    abrirAviso(primera, 'Abriendo: ' + primera.titulo.slice(0, 35) + '…');
    return;
  }

  // Nada que postular en esta pasada: si quedó alguna gris sin revisar, se
  // abre antes de dar el escaneo por terminado (§B: "las de postular se abren
  // igual para postular, así que ahí es gratis; el costo neto son solo las
  // grises").
  if (candidatosGris.length) {
    const cand = candidatosGris[0];
    abrirAviso(cand, 'Revisando oferta ambigua: ' + cand.titulo.slice(0, 30) + '…');
    return;
  }

  // Nada más que hacer en esta página -- si es una búsqueda automática
  // (pestaña oculta), sigue a la próxima página del listado en vez de
  // quedarse pegada acá para siempre (los listados no son infinitos).
  if (siguientePagina(candidatas.length, urlPaginaLaborum)) AP.navegando = true;
  else {
    terminarEscaneo();
    AP.cierreDePagina();
  }
}

// La persona llegó a un aviso por su cuenta (o pidió "Escanear" estando en
// uno): se resuelve igual que uno abierto desde el listado, pero la pestaña se
// queda donde está. Antes volvía "atrás" sola, a donde fuera.
async function escanearPaginaDeOferta() {
  const id = idDeAviso();
  if (AP.vistos.has(id)) return;
  AP.vistos.add(id);
  if ((AP.log || []).some(e => e.uid === id)) {
    msg('Este aviso ya lo revisamos', 'neutral');
    terminarEscaneo();
    return;
  }
  AP.procesando = true;
  try {
    await resolverAviso({ id, url: location.href });
  } catch (e) {
    console.warn('[AP-Laborum] no se pudo resolver el aviso:', e);
  } finally {
    AP.procesando = false;
  }
  terminarEscaneo();
}

// ── Postular directo a UNA oferta ya aprobada en banda gris (§8.6) ──────
// La pestaña la abrió background.js apuntando directo a la URL de la oferta
// (no a un listado), y la cierra él mismo con el resultado: acá no se navega
// a ninguna parte. No se vuelve a puntuar: la persona ya dijo que sí.
async function aplicarDirecto(decisionOfertaId) {
  const id = idDeAviso();
  // Que el escaneo de esta misma pestaña no la tome además como visita.
  AP.vistos.add(id);
  AP.procesando = true;
  try {
    // Sin el aviso pintado no se decide nada: queda para el próximo ciclo (a
    // los tres intentos background.js la da por vencida).
    if (!(await esperarAviso())) return { ok: false, expirada: false };
    return await postularEnPagina(id, tituloDelAviso(), location.href, decisionOfertaId, empresaDelAviso() || undefined);
  } finally {
    AP.procesando = false;
  }
}

// ── Seguimiento de estados en "Mis postulaciones" ───────────────
// docs/estado-real-de-postulaciones.md §5, paso 5. Verificado contra el sitio
// real el 2026-09-29, con una postulación de verdad:
//
// En la lista de laborum.cl/postulantes/postulaciones la fila NO trae el id de
// la oferta (solo el de la postulación, 11455652467); el id que guardamos al
// postular (-1118460193.html) aparece únicamente en el panel de detalle de la
// fila seleccionada. Leer el DOM obligaría a hacer clic fila por fila. La
// propia página arma la lista con /api/candidates/postulaciones, que devuelve
// todas con `avisoId` (el mismo número) y `estado`, así que se lee de ahí, con
// los mismos encabezados que usa ella (sessionJwt en localStorage + site id).
//
// Los valores de `estado` salen del código de la página, no de suponerlos:
// "recibido", "leido", "contactado", "finalizada" (CV enviado → CV leído →
// Contactado → Finalizada). "Contactado" es que la empresa se comunicó, no
// necesariamente una entrevista: queda EN_PROCESO y la entrevista la cuenta
// la persona (§6).
const URL_MIS_POSTULACIONES_LABORUM = '/postulantes/postulaciones';
const MAPA_ESTADO_LABORUM = {
  'recibido': 'ENVIADO',
  'leido': 'VISTO',
  'contactado': 'EN_PROCESO',
  'finalizada': 'FINALIZADO'
};
const POSTULACIONES_POR_PAGINA_LABORUM = 50;
const MAX_PAGINAS_LABORUM = 10;

async function traerPaginaPostulacionesLaborum(pagina) {
  const headers = { 'x-site-id': 'BMCL' };
  const jwt = localStorage.getItem('sessionJwt');
  if (jwt) headers['x-session-jwt'] = jwt;
  if (localStorage.token) headers['Authorization'] = 'Bearer ' + localStorage.token;
  const url = '/api/candidates/postulaciones?pageSize=' + POSTULACIONES_POR_PAGINA_LABORUM +
    '&page=' + pagina + '&sort=fechaPostulacion%20desc&query=';
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function escanearMisPostulaciones() {
  msg('Revisando estados de postulaciones…', 'trabajando');
  let actualizadas = 0;
  const desconocidos = new Set();
  try {
    for (let pagina = 0; pagina < MAX_PAGINAS_LABORUM; pagina++) {
      const datos = await traerPaginaPostulacionesLaborum(pagina);
      const filas = (datos && datos.content) || [];
      for (const fila of filas) {
        if (!fila || fila.avisoId == null) continue;
        const texto = String(fila.estado || '').trim().toLowerCase();
        const estado = MAPA_ESTADO_LABORUM[texto];
        if (!estado) { if (texto) desconocidos.add(texto); continue; }
        const resultado = await AP.actualizarEstadoPostulacion({
          platformNombre: 'Laborum',
          externalId: String(fila.avisoId),
          estado: estado
        });
        if (resultado && !resultado.error && !resultado.sinCambios) actualizadas++;
      }
      const total = Number(datos && datos.total) || 0;
      if (filas.length < POSTULACIONES_POR_PAGINA_LABORUM || (pagina + 1) * POSTULACIONES_POR_PAGINA_LABORUM >= total) break;
    }
  } catch (e) {
    console.warn('[AP-Laborum] no se pudo leer "Mis postulaciones":', e && e.message);
    msg('No se pudieron revisar los estados', '#DC2626');
    AP.reportarEscaneoTerminado();
    return;
  }
  // Un valor nuevo de Laborum no se adivina: se deja a la vista para sumarlo al mapa.
  if (desconocidos.size) console.warn('[AP-Laborum] estados sin mapear:', [...desconocidos]);
  msg(actualizadas ? '✓ ' + actualizadas + ' estado(s) actualizado(s)' : 'Estados al día', '#16A34A');
  AP.reportarEscaneoTerminado();
}

function enMisPostulaciones() {
  return location.pathname.replace(/\/+$/, '') === URL_MIS_POSTULACIONES_LABORUM;
}

// ── Registro en el núcleo compartido ────────────────────────────
// En "Mis postulaciones" no hay tarjetas de ofertas: el escaneo de listados
// diría "Sin tarjetas" y avisaría que terminó antes que el de estados (mismo
// caso que Computrabajo).
AP.escanear = AP.sinReentrada(function () {
  if (enMisPostulaciones()) return;
  return escanear();
});
AP.aplicarDirecto = aplicarDirecto;
// Las tarjetas del listado, para pintar la marca de cada una (core.js).
AP.tarjetasDeLaPagina = function () {
  if (esPaginaDeAviso()) return [];
  const vistas = new Set();
  return getTarjetas().map(a => ({ el: a, id: getIdDeTarjeta(a) })).filter(t => !vistas.has(t.id) && vistas.add(t.id));
};
// Si el navegador restaura el listado desde su caché de páginas (atrás o
// adelante), la extensión vuelve con el estado de cuando se fue: navegando y
// con un log viejo. Se pone al día y sigue.
if (typeof window.addEventListener === 'function') {
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    AP.navegando = false;
    AP.procesando = false;
    chrome.storage.local.get(['log'], (d) => {
      AP.log = (d && d.log) || [];
      if (AP.activo) setTimeout(() => AP.escanear(), 1500);
    });
  });
}
AP.onInit = function () {
  console.log('[AP-Laborum] listo — activo:', AP.activo, 'incTags:', AP.cfg && AP.cfg.incTags && AP.cfg.incTags.length);
  if (enMisPostulaciones()) {
    setTimeout(escanearMisPostulaciones, 1500);
  } else if (AP.activo) {
    msg('Activado — escaneando…', '#16A34A');
    setTimeout(() => AP.escanear(), 1800);
  }
};

window._apInjected = true;
})();
