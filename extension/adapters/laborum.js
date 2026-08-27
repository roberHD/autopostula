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
const { msg, sleep, n, addLog, reportarPostulacion, coincideFiltros,
        aiResponde, analizarOferta, mostrarRevision, setVal, limitarTexto, seleccionarOpcion } = window.AP;

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

function pasa(a) {
  if (!AP.cfg) return false;
  const texto = (a.textContent || '');
  return coincideFiltros(texto, getUbicacionDeTarjeta(a));
}

// ── Detectar postulación exitosa ──────────────────────────────────
// Tras postular, Laborum reemplaza el botón por un bloque con
// "Postulado el DD/MM/AAAA" — texto estable independiente del hash de
// estilo del momento.
function yaPostulado() {
  return [...document.querySelectorAll('h1,h2,h3')].some(el => /^Postulado el /.test((el.textContent || '').trim()));
}

async function esperarConfirmacion(timeout = 8000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (yaPostulado()) return true;
    await sleep(300);
  }
  return false;
}

// ── Texto del aviso (para el análisis de la IA) ────────────────────
function extraerTextoAviso() {
  const desc = document.querySelector('#descripcion-aviso');
  const beneficios = document.querySelector('#beneficios-aviso');
  let texto = (desc ? desc.innerText : '') + '\n\n' + (beneficios ? beneficios.innerText : '');
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  return texto.slice(0, 4000) || (document.body.innerText || '').slice(0, 4000);
}

// AP.vistos vive solo en memoria y core.js lo resetea cada vez que el content
// script se vuelve a inyectar — cosa que en Laborum pasa en CADA navegación
// real (a diferencia de Computrabajo, que nunca sale de la página). Por eso
// acá la memoria de "esto ya se procesó" tiene que salir del log persistente
// (chrome.storage, sobrevive a la recarga), no del Set en memoria.
function yaProcesada(id) {
  return AP.vistos.has(id) || (AP.log || []).some(e => e.uid === id);
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
async function rellenarYEnviarPreguntas(contexto) {
  const form = getModalPreguntas();
  if (!form) return null;

  msg('Analizando aviso…', '#7C3AED');
  const analisis = await analizarOferta(contexto);

  msg('Rellenando preguntas…', '#D97706');
  const textareas = [...form.querySelectorAll('textarea[id^="id-pregunta-"]')];
  const respuestasLog = [];

  for (const ta of textareas) {
    const pregunta = getTituloPregunta(form, ta);
    let val = null, errorIA = null;
    if (AP.iaDisponible && pregunta.length > 3) {
      const r = await aiResponde(pregunta, contexto, null, analisis);
      val = r.respuesta; errorIA = r.error;
    }
    if (val) {
      val = limitarTexto(val, ta);
      ta.focus();
      setVal(ta, val);
      // Muchos formularios (react-hook-form y similares) solo marcan el campo
      // como "tocado" — y habilitan el botón de enviar — al perder el foco,
      // no con input/change solos. Sin este blur, el campo queda lleno pero
      // el botón sigue deshabilitado.
      ta.blur();
      ta.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      respuestasLog.push({ pregunta, respuesta: val, fueIA: true, tipo: 'texto', el: ta });
    } else {
      respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo: 'texto', el: ta, errorIA });
    }
    await sleep(300);
  }

  // Preguntas de radio (ej: "Tipo de documento") — si quedan sin responder,
  // Laborum nunca habilita el botón de enviar aunque el resto esté completo.
  const grupos = getGruposRadio(form);
  for (const grupo of grupos) {
    let elegida = null, errorIA = null;
    if (AP.iaDisponible && grupo.pregunta.length > 3) {
      const r = await aiResponde(grupo.pregunta, contexto, grupo.opciones.map(o => o.texto), analisis);
      errorIA = r.error;
      if (r.respuesta) {
        const rNorm = n(r.respuesta);
        elegida = grupo.opciones.find(o => rNorm.includes(n(o.texto)) || (n(o.texto).length < 4 && rNorm.startsWith(n(o.texto))));
      }
    }
    if (elegida && seleccionarOpcion(elegida.el)) {
      elegida.el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      respuestasLog.push({ pregunta: grupo.pregunta, respuesta: elegida.texto, fueIA: true, tipo: 'opcion', opciones: grupo.opciones, elegidoEl: elegida.el });
    } else {
      respuestasLog.push({ pregunta: grupo.pregunta, respuesta: '', vacia: true, tipo: 'opcion', opciones: grupo.opciones, elegidoEl: null, errorIA });
    }
    await sleep(300);
  }

  if (AP.cfg && AP.cfg.modoRevision) {
    msg('⏸ Revisión pendiente…', '#2563EB');
    const decision = await mostrarRevision(document.querySelector('h1')?.textContent || 'Oferta', respuestasLog, contexto);
    if (decision === 'skip') return { respuestasLog, saltada: true };
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
  return { respuestasLog };
}

// ── Postular a una oferta ya abierta ──────────────────────────────
async function postularEnPagina(id, titulo, url) {
  if (yaPostulado()) {
    addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: id, reason: 'Ya estaba postulada' });
    return false;
  }

  // El texto del botón cambia según el tipo de oferta: "Postulación rápida"
  // para las de un clic, "Postularme" para las que abren el modal de preguntas.
  const btn = [...document.querySelectorAll('button')]
    .find(b => {
      const t = n(b.textContent);
      return (t.includes('postulacion rapida') || t === 'postularme' || t.includes('postular')) && b.offsetParent;
    });

  if (!btn) {
    addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: 'No se encontró el botón para postular' });
    return false;
  }

  if (!AP.activo) return false;

  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(400);
  btn.click();
  await sleep(1200);

  // ¿Se abrió el modal de preguntas, o fue postulación directa?
  const form = getModalPreguntas();
  if (form) {
    const contexto = extraerTextoAviso();
    const resultado = await rellenarYEnviarPreguntas(contexto);

    if (!resultado) {
      addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: 'El modal de preguntas desapareció antes de poder llenarlo' });
      return false;
    }
    if (resultado.saltada) {
      addLog({ ts: Date.now(), status: 'skip', title: titulo, url, uid: id, reason: 'Saltada en revisión manual' });
      return false;
    }
    if (resultado.errorEnvio) {
      addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: resultado.errorEnvio, respuestas: resultado.respuestasLog.map(r => ({ pregunta: r.pregunta, respuesta: r.respuesta, vacia: r.vacia })) });
      return false;
    }

    const ok = await esperarConfirmacion();
    if (ok) {
      const respuestasParaLog = resultado.respuestasLog.map(r => ({ pregunta: r.pregunta, respuesta: r.respuesta, vacia: r.vacia, fueIA: r.fueIA }));
      addLog({ ts: Date.now(), status: 'ok', title: titulo, url, uid: id, reason: 'Postulación con preguntas enviada', respuestas: respuestasParaLog });
      reportarPostulacion({ id, titulo, plataforma: 'Laborum', respuestas: respuestasParaLog });
      msg('✓ ' + titulo.slice(0, 40), '#16A34A');
      return true;
    }
    addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: 'Se envió el formulario pero no se detectó confirmación' });
    return false;
  }

  // Sin modal: postulación directa de un clic.
  const ok = await esperarConfirmacion();
  if (ok) {
    addLog({ ts: Date.now(), status: 'ok', title: titulo, url, uid: id, reason: 'Postulación rápida enviada' });
    reportarPostulacion({ id, titulo, plataforma: 'Laborum' });
    msg('✓ ' + titulo.slice(0, 40), '#16A34A');
    return true;
  }

  addLog({ ts: Date.now(), status: 'err', title: titulo, url, uid: id, reason: 'Se hizo clic pero no se detectó confirmación' });
  return false;
}

// ── Escanear el listado ────────────────────────────────────────────
async function escanear() {
  if (!AP.activo || AP.procesando || !AP.cfg) return;

  // En una página de detalle (no listado), postular directo si corresponde.
  if (/\/empleos\/.+-\d+\.html/.test(location.pathname)) {
    return escanearPaginaDeOferta();
  }

  const candidatas = (await esperar('a[href^="/empleos/"]')).filter(a => /-\d+\.html/.test(a.href));
  if (!candidatas.length) { msg('Sin tarjetas — busca ofertas en Laborum', '#9CA3AF'); return; }

  const pendientes = [];
  candidatas.forEach(a => {
    const id = getIdDeTarjeta(a);
    if (yaProcesada(id)) return;
    if (pasa(a)) pendientes.push({ a, id, titulo: getTituloDeTarjeta(a), url: a.href });
  });

  msg(pendientes.length + ' de ' + candidatas.length + ' coinciden', '#16A34A');
  if (!pendientes.length) return;

  AP.procesando = true;
  const primera = pendientes[0];
  AP.vistos.add(primera.id);
  msg('Abriendo: ' + primera.titulo.slice(0, 35) + '…', '#D97706');
  // Se abre en la misma pestaña — más simple y confiable que coordinar
  // pestañas nuevas entre content scripts independientes. El resto de
  // pendientes se procesa en las siguientes pasadas de escanear(), que
  // el propio flujo re-dispara al volver al listado (ver más abajo).
  location.href = primera.url;
}

// Cuando escanear() navega a una oferta puntual, este es el flujo que sigue
// una vez que la página de detalle carga.
async function escanearPaginaDeOferta() {
  const id = (location.pathname.match(/-(\d+)\.html/) || [])[1] || location.pathname;
  AP.vistos.add(id);

  // Red de seguridad extra: si por lo que sea llegamos acá con una oferta que
  // el log ya tiene registrada, no la reprocesamos — solo volvemos al listado.
  if (yaProcesada(id) && (AP.log || []).some(e => e.uid === id)) {
    if (history.length > 1) {
      history.back();
      setTimeout(() => { if (AP.activo) escanear(); }, 1800);
    }
    return;
  }

  await esperar('button');
  const tituloEl = document.querySelector('h1');
  const titulo = (tituloEl && tituloEl.textContent.trim()) || 'Oferta';

  AP.procesando = true;
  await postularEnPagina(id, titulo, location.href);
  await sleep(DELAY);
  AP.procesando = false;

  // Volver al listado para seguir con las siguientes ofertas pendientes.
  if (history.length > 1) {
    history.back();
    setTimeout(() => { if (AP.activo) escanear(); }, 1800);
  }
}

// ── Registro en el núcleo compartido ────────────────────────────
AP.escanear = escanear;
AP.onInit = function () {
  console.log('[AP-Laborum] listo — activo:', AP.activo, 'incTags:', AP.cfg && AP.cfg.incTags && AP.cfg.incTags.length);
  if (AP.activo) {
    msg('Activado — escaneando…', '#16A34A');
    setTimeout(escanear, 1800);
  }
};

window._apInjected = true;
})();
