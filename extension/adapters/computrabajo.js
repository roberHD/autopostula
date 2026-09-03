// ═══════════════════════════════════════════════════════════════
//  AutoPostula — adaptador de Computrabajo
//  Todo lo específico del DOM/flujo de Computrabajo. El estado
//  compartido y las utilidades genéricas viven en core.js (cargado
//  antes que este archivo — ver manifest.json) bajo el objeto AP.
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const DELAY = 3000;
const { msg, sleep, n, addLog, reportarPostulacion, reportarTitulosVistos, llamarBackendIA,
        cargarCV, construirMensajesCV, cargarEstiloProfesional,
        obtenerObjetivoLaboral, clasificarOfertasIA, coincideFiltros,
        actualizarEstadoPostulacion, analizarYResponder,
        mostrarRevision, setVal, limitarTexto, esVisible, seleccionarOpcion } = window.AP;

// ── Extraer el texto completo del aviso (no todo el body con menús/ruido) ─
function extraerTextoAviso() {
  const panel = document.querySelector('.box_detail,[data-offers-grid-box-detail]');
  let texto = (panel ? panel.innerText : document.body.innerText) || '';
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  return texto.slice(0, 4000);
}

// ── ID único de tarjeta ───────────────────────────────────────
function getId(tarjeta, idx) {
  const did = tarjeta.getAttribute('data-id') || tarjeta.getAttribute('data-blind') || '';
  if (did && did.length > 8) return did;
  const a = tarjeta.querySelector('a[href*="oferta"], a[href*="trabajo"]');
  if (a) {
    const m = a.href.split('#')[0].match(/-([A-F0-9]{8,})$/i);
    if (m) return m[1];
  }
  return 'idx-' + idx;
}

// ── Ubicación de una tarjeta (comuna/ciudad) ───────────────────
// Intenta leer el elemento específico de ubicación de la tarjeta con los
// selectores que suele usar Computrabajo; si ninguno calza, cae de vuelta
// a todo el texto de la tarjeta (menos preciso, pero nunca deja de filtrar).
function extraerUbicacion(tarjeta) {
  const candidatos = [
    '.fs16.fc_base',
    '[class*="location"]',
    'p.fs16.t_ellipsis',
    '.list_icons li'
  ];
  for (const sel of candidatos) {
    const el = tarjeta.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 1) return n(el.textContent);
  }
  return n(tarjeta.innerText || '');
}

// ── Filtrar tarjeta ───────────────────────────────────────────
function pasa(tarjeta) {
  if (!AP.cfg) return false;
  return coincideFiltros(tarjeta.innerText || '', extraerUbicacion(tarjeta));
}

// ── Label de un campo ─────────────────────────────────────────
function getLabel(el) {
  if (el.id) {
    const lf = document.querySelector('label[for="' + el.id + '"]');
    if (lf) return lf.textContent.trim();
  }
  let prev = el.previousElementSibling;
  while (prev) {
    const t = prev.textContent && prev.textContent.trim();
    if (t && t.length > 3) return t;
    prev = prev.previousElementSibling;
  }
  const wrap = el.closest('div,li,section');
  if (wrap) {
    const cl = wrap.cloneNode(true);
    cl.querySelectorAll('input,textarea,select,button').forEach(e => e.remove());
    const t = cl.textContent && cl.textContent.trim();
    if (t && t.length > 3 && t.length < 300) return t;
  }
  return el.placeholder || el.name || el.id || '';
}

// ── Módulo opciones (del repo GitHub — robusto) ───────────────
const SELECTOR_OPCIONES = ['input[type=radio]','input[type=checkbox]','[role="radio"]','[role="option"]','[aria-checked]'].join(',');

function esperarOpciones(selector, opts) {
  const timeout = (opts && opts.timeout) || 2500;
  return new Promise(resolve => {
    const yaHay = document.querySelectorAll(selector);
    if (yaHay.length) return resolve([...yaHay]);
    const obs = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length) { obs.disconnect(); clearTimeout(t); resolve([...els]); }
    });
    obs.observe(document.body, { childList:true, subtree:true });
    const t = setTimeout(() => { obs.disconnect(); resolve([...document.querySelectorAll(selector)]); }, timeout);
  });
}

function textoDeOpcion(el) {
  try {
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    if (el.id) {
      const lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lf && lf.textContent.trim()) return lf.textContent.trim();
    }
    const lp = el.closest && el.closest('label');
    if (lp && lp.textContent.trim()) return lp.textContent.trim();
    if (el.tagName === 'INPUT') {
      const sigu = el.nextElementSibling;
      if (sigu && sigu.textContent && sigu.textContent.trim()) return sigu.textContent.trim();
      const prev = el.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim()) return prev.textContent.trim();
      return el.value || el.getAttribute('data-value') || '';
    }
    const propio = (el.textContent || '').trim().replace(/\s+/g,' ');
    if (propio) return propio;
    return el.getAttribute('title') || el.getAttribute('data-value') || '';
  } catch(e) { return ''; }
}

function hallarContenedorPregunta(el) {
  let nodo = el.parentElement, profundidad = 0;
  while (nodo && profundidad < 6) {
    if (nodo.querySelectorAll(SELECTOR_OPCIONES).length > 1) return nodo;
    nodo = nodo.parentElement; profundidad++;
  }
  return el.parentElement || el;
}

function textoPreguntaContenedor(contenedor) {
  try {
    const clon = contenedor.cloneNode(true);
    // No basta con quitar el <input>: hay que quitar también su <label> (el texto visible
    // de la alternativa, ej. "Si", "No", "En curso"), si no queda pegado a la pregunta.
    clon.querySelectorAll(SELECTOR_OPCIONES).forEach(e => {
      const lbl = e.closest('label');
      if (lbl) { lbl.remove(); return; }
      if (e.id) {
        const lf = clon.querySelector('label[for="' + CSS.escape(e.id) + '"]');
        if (lf) { lf.remove(); }
      }
      e.remove();
    });
    const t = (clon.textContent || '').trim().replace(/\s+/g,' ');
    if (t && t.length > 3 && t.length < 300) return t;
  } catch(e) {}
  let prev = contenedor.previousElementSibling, intentos = 0;
  while (prev && intentos < 4) {
    const t = (prev.textContent || '').trim();
    if (t && t.length > 3 && t.length < 300) return t;
    prev = prev.previousElementSibling; intentos++;
  }
  return '';
}

// Reglas universales que NO dependen de datos personales del candidato (por eso no requieren IA ni "info").
// Todo lo demás (vehículo, herramientas, discapacidad, experiencia específica, etc.) se resuelve con IA + perfil + info adicional.
function calcularRespuesta(preguntaTexto, opciones, perfil) {
  const p = n(preguntaTexto);
  const textos = opciones.map(o => ({ ...o, t: n(o.texto) }));
  const esSi = t => /^(si|sí|yes|verdadero|true|acepto)\b/.test(t);
  const esNo = t => /^(no|not|false|falso)\b/.test(t);
  const opSi = textos.find(o => esSi(o.t));
  const opNo = textos.find(o => esNo(o.t));
  if (opSi || opNo) {
    if (p.includes('mayor') && p.includes('18')) return opSi || null;
    if (p.includes('acepto') || p.includes('termin') || p.includes('politica') || p.includes('autoriz') || p.includes('privacidad')) return opSi || null;
    // Para todo lo demás, no asumir — dejar null para que la IA (con perfil + info) decida
    return null;
  }
  const camposPerfil = [perfil.disp, perfil.nivelEducacion, perfil.modalidad, perfil.jornada].filter(Boolean).map(n);
  for (const campo of camposPerfil) {
    const match = textos.find(o => o.t && (campo.includes(o.t) || o.t.includes(campo)));
    if (match) return match;
  }
  return null;
}

// Recolecta y resuelve TODOS los grupos de opciones (radios, checkboxes, widgets),
// categoría por categoría, igual que antes. Lo que calcularRespuesta puede resolver
// sin IA se aplica al toque (así se preserva el orden de revelado condicional que ya
// tenía este código: cada categoría se consulta fresca del DOM, después de aplicar la
// anterior, por si elegir una opción hizo aparecer un grupo nuevo). Lo que SÍ necesita
// IA se junta en una sola lista y se resuelve con UNA llamada al final — antes era una
// llamada por pregunta, cada una remandando el CV y el aviso completos otra vez.
async function manejarGruposDeOpciones(perfil, respuestasLog, contexto) {
  let interacciones = 0;
  await esperarOpciones(SELECTOR_OPCIONES, { timeout:2500 });
  // Acotado al panel real del formulario — evita interferir con radios/checkboxes de otras
  // partes de la página (filtros, ordenar por, etc.)
  const panelForm = document.querySelector('.box_detail,[data-offers-grid-box-detail]') || document;
  const pendientesIA = []; // { pregunta, opciones }

  // Radios nativos
  const gruposRadioVistos = new Set();
  for (const radio of panelForm.querySelectorAll('input[type=radio]')) {
    if (!esVisible(radio)) continue;
    const nombre = radio.name || '';
    const clave = nombre || radio;
    if (gruposRadioVistos.has(clave)) continue;
    gruposRadioVistos.add(clave);
    const grupo = nombre
      ? [...panelForm.querySelectorAll('input[type=radio][name="' + CSS.escape(nombre) + '"]')].filter(esVisible)
      : [radio];
    if (!grupo.length) continue;
    const opciones = grupo.map(r => ({ el:r, texto:textoDeOpcion(r) }));
    const pregunta = textoPreguntaContenedor(hallarContenedorPregunta(radio)) || getLabel(radio);
    const elegida = calcularRespuesta(pregunta, opciones, perfil);
    if (elegida) {
      if (seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
      }
    } else if (AP.iaDisponible && pregunta.length > 5) {
      pendientesIA.push({ pregunta, opciones });
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null, errorIA: null });
    }
  }

  // Checkboxes
  const gruposCbVistos = new Set();
  for (const cb of panelForm.querySelectorAll('input[type=checkbox]')) {
    if (!esVisible(cb)) continue;
    const textoCb = n(textoDeOpcion(cb) || (cb.closest('label,div') && cb.closest('label,div').textContent) || '');
    if (textoCb.includes('acepto') || textoCb.includes('terminos') || textoCb.includes('politica') || textoCb.includes('autorizo')) {
      if (!cb.checked && seleccionarOpcion(cb)) interacciones++;
      continue;
    }
    const nombre = cb.name || '';
    if (nombre && !gruposCbVistos.has(nombre)) {
      gruposCbVistos.add(nombre);
      const grupo = [...panelForm.querySelectorAll('input[type=checkbox][name="' + CSS.escape(nombre) + '"]')].filter(esVisible);
      const opciones = grupo.map(c => ({ el:c, texto:textoDeOpcion(c) }));
      const pregunta = textoPreguntaContenedor(hallarContenedorPregunta(cb)) || getLabel(cb);
      const elegida = calcularRespuesta(pregunta, opciones, perfil);
      if (elegida) {
        if (!elegida.el.checked && seleccionarOpcion(elegida.el)) {
          interacciones++;
          respuestasLog.push({ pregunta, respuesta: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
        }
      } else if (AP.iaDisponible && pregunta.length > 5) {
        pendientesIA.push({ pregunta, opciones });
      } else if (pregunta) {
        respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null, errorIA: null });
      }
    }
  }

  // Widgets interactivos
  const widgets = [...panelForm.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')]
    .filter(el => el.tagName !== 'INPUT' && esVisible(el));
  const gruposWidgetVistos = new Set();
  for (const widget of widgets) {
    const contenedor = hallarContenedorPregunta(widget);
    if (gruposWidgetVistos.has(contenedor)) continue;
    gruposWidgetVistos.add(contenedor);
    const grupo = [...contenedor.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')].filter(esVisible);
    if (!grupo.length) continue;
    const opciones = grupo.map(el => ({ el, texto:textoDeOpcion(el) }));
    const pregunta = textoPreguntaContenedor(contenedor);
    const elegida = calcularRespuesta(pregunta, opciones, perfil);
    if (elegida) {
      if (seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
      }
    } else if (AP.iaDisponible && pregunta.length > 5) {
      pendientesIA.push({ pregunta, opciones });
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null, errorIA: null });
    }
  }

  // Una sola llamada a la IA para TODAS las preguntas de opciones pendientes.
  let analisis = null;
  if (pendientesIA.length) {
    const preguntasParaIA = pendientesIA.map((pd, i) => ({ id: 'o' + i, pregunta: pd.pregunta, opciones: pd.opciones.map(o => o.texto) }));
    msg('IA respondiendo ' + pendientesIA.length + ' pregunta(s)…', '#7C3AED');
    const resultado = await analizarYResponder(contexto, preguntasParaIA);
    analisis = resultado.analisis;
    for (let i = 0; i < pendientesIA.length; i++) {
      const pd = pendientesIA[i];
      const respIA = resultado.respuestas['o' + i];
      let elegida = null;
      if (respIA) {
        const rNorm = n(respIA);
        elegida = pd.opciones.find(o => rNorm.includes(n(o.texto)) || (n(o.texto).length < 4 && rNorm.startsWith(n(o.texto))));
      }
      if (elegida && seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta: pd.pregunta, respuesta: elegida.texto, tipo:'opcion', opciones: pd.opciones, elegidoEl: elegida.el });
      } else {
        respuestasLog.push({ pregunta: pd.pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones: pd.opciones, elegidoEl: null, errorIA: resultado.error });
      }
      await sleep(250);
    }
  }

  return { interacciones, analisis };
}

function aplicarValorTexto(el, val, labelRaw, fueIA, respuestasLog) {
  val = limitarTexto(val, el);
  el.scrollIntoView({ block:'nearest' });
  setVal(el, val);
  respuestasLog.push({ pregunta: labelRaw, respuesta: val, fueIA, tipo:'texto', el });
}

// ── Rellenar formulario ───────────────────────────────────────
async function rellenar(contexto) {
  await sleep(1000);
  if (!AP.activo) return { n2:0, respuestasLog:[], analisis:null };
  const p = (AP.cfg && AP.cfg.perfil) || {};
  let n2 = 0;
  const respuestasLog = [];

  // Opciones primero: pueden revelar campos de texto nuevos, y el paso de abajo
  // consulta el DOM fresco después de esto a propósito (ver comentario ahí).
  const { interacciones, analisis: analisisDeOpciones } = await manejarGruposDeOpciones(p, respuestasLog, contexto);
  n2 += interacciones;

  // Textareas e inputs — acotado al panel real del formulario, para no tocar el buscador de arriba
  // ni ningún otro campo de texto que esté fuera de las preguntas de postulación. Se consulta DESPUÉS
  // de aplicar las opciones (no antes): algunos formularios revelan campos nuevos según la opción
  // elegida arriba, y este querySelectorAll fresco los agarra.
  const panelForm = document.querySelector('.box_detail,[data-offers-grid-box-detail]') || document;
  const pendientesTexto = []; // { el, labelRaw }
  for (const el of panelForm.querySelectorAll('textarea:not([style*="display:none"]),input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=radio]):not([type=checkbox])')) {
    if (!el.offsetParent) continue;
    const labelRaw = getLabel(el);
    const lbl = n(labelRaw);

    // clave(): coincide solo si el término aparece como inicio de palabra (con límite \b),
    // para no confundir p.ej. "posición" con "reposición" (que la contiene como substring).
    const clave = (...terms) => terms.some(t => new RegExp('\\b' + t).test(lbl));

    // Solo quedan como "predeterminados" los que se basan en el TIPO real del input (confiable,
    // no en adivinar por texto), porque cualquier atajo por palabras clave se rompe apenas la
    // pregunta pide dos cosas a la vez (ej: "indique su comuna y número de teléfono" terminaba
    // respondiendo solo el teléfono e ignorando la comuna). Todo lo demás —incluidas preguntas
    // compuestas de contacto, comuna, renta, disponibilidad, cargo, presentación, experiencia—
    // se responde con IA, que ya tiene tus datos de contacto y perfil como contexto.
    if (el.type === 'email' && p.email) {
      aplicarValorTexto(el, p.email, labelRaw, false, respuestasLog);
      n2++;
    } else if (el.type === 'tel' && p.tel) {
      aplicarValorTexto(el, p.tel, labelRaw, false, respuestasLog);
      n2++;
    } else if (clave('discapacidad') || (clave('identifica') && clave('discapacidad'))) {
      // Preguntas de discapacidad — responder con IA si está disponible, sino "No". Si la
      // IA no contesta (puede pasar: es una pregunta de autoidentificación voluntaria, no
      // siempre encaja con el patrón "experiencia" del resto de las preguntas), el fallback
      // más abajo aplica el mismo default honesto "No" en vez de dejarla vacía.
      if (AP.iaDisponible) {
        pendientesTexto.push({ el, labelRaw, fallback: 'No' });
      } else {
        aplicarValorTexto(el, 'No', labelRaw, false, respuestasLog);
        n2++;
      }
    } else if (AP.iaDisponible && labelRaw.length > 5) {
      pendientesTexto.push({ el, labelRaw });
    } else if (labelRaw.length > 5) {
      respuestasLog.push({ pregunta: labelRaw, respuesta: '', vacia: true, tipo:'texto', el, errorIA: null });
    }
  }

  // Una sola llamada a la IA para TODOS los campos de texto pendientes.
  let analisis = analisisDeOpciones;
  if (pendientesTexto.length) {
    const preguntasParaIA = pendientesTexto.map((pd, i) => ({ id: 't' + i, pregunta: pd.labelRaw, opciones: null }));
    msg('IA respondiendo ' + pendientesTexto.length + ' pregunta(s)…', '#7C3AED');
    const resultado = await analizarYResponder(contexto, preguntasParaIA);
    if (resultado.analisis) analisis = resultado.analisis;
    for (let i = 0; i < pendientesTexto.length; i++) {
      const pd = pendientesTexto[i];
      const valIA = resultado.respuestas['t' + i];
      if (valIA) {
        n2++;
        aplicarValorTexto(pd.el, valIA, pd.labelRaw, true, respuestasLog);
      } else if (pd.fallback) {
        n2++;
        aplicarValorTexto(pd.el, pd.fallback, pd.labelRaw, false, respuestasLog);
      } else {
        respuestasLog.push({ pregunta: pd.labelRaw, respuesta: '', vacia: true, tipo:'texto', el: pd.el, errorIA: resultado.error });
      }
      await sleep(250);
    }
  } else if (!analisis) {
    // No hubo ninguna pregunta que necesitara IA, pero igual se quiere el matchScore
    // para el log de la postulación (mismo comportamiento que antes: siempre se analizaba).
    const resultado = await analizarYResponder(contexto, []);
    analisis = resultado.analisis;
  }

  return { n2, respuestasLog, analisis };
}

// ── Postular ──────────────────────────────────────────────────
async function postular(url, id, titulo) {
  if (AP.vistos.has(id)) return false;
  AP.vistos.add(id);

  msg('Postulando: ' + titulo.slice(0,35) + '…', '#D97706');

  const panelDetalle = document.querySelector('.box_detail,[data-offers-grid-box-detail]');
  if (panelDetalle && (
    panelDetalle.querySelector('.offer-detail-applied:not(.hide), span.b_primary.postulated:not(.hide)') ||
    n(panelDetalle.innerText||'').includes('ya aplicaste')
  )) {
    addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Ya postulado'});
    return false;
  }

  const btnSpan = document.querySelector('span[offer-detail-button]');
  let btn = btnSpan && btnSpan.closest('span.b_primary,a,button');
  if (!btn && btnSpan) btn = btnSpan;
  if (!btn) {
    btn = [...document.querySelectorAll('span,button,a')]
      .find(el => n(el.textContent).replace(/\s+/g,'') === 'postularme' && !el.closest('.hide') && el.offsetParent);
  }
  if (!btn) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'No se encontró botón Postularme'});
    return false;
  }

  if (!AP.activo) return false;

  // IMPORTANTE: leer el aviso ANTES de hacer clic en "Postularme". Computrabajo puede
  // reemplazar este mismo panel con el formulario de preguntas adicionales al hacer clic,
  // así que si se lee después, se corre el riesgo de capturar el formulario en vez del aviso.
  const contexto = extraerTextoAviso();

  btn.scrollIntoView({behavior:'smooth', block:'center'});
  await sleep(400);
  btn.click();
  await sleep(2000);

  const panelPostForm = document.querySelector('.box_detail,[data-offers-grid-box-detail]') || document;
  const hayForm = [...panelPostForm.querySelectorAll('textarea,input[type=radio]')].some(el => el.offsetParent && !el.closest('.hide'));

  if (hayForm) {
    msg('Rellenando formulario…', '#D97706');
    const { n2, respuestasLog, analisis } = await rellenar(contexto);
    await sleep(1000);

    // Modo revisión: pausar y mostrar respuestas al usuario
    if (AP.cfg && AP.cfg.modoRevision) {
      msg('⏸ Revisión pendiente…', '#2563EB');
      const decision = await mostrarRevision(titulo, respuestasLog, contexto);
      if (decision === 'skip') {
        addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Saltada en revisión manual'});
        return false;
      }
    }

    const btnEnviar = [...document.querySelectorAll('a.b_primary.big.ml10, a[data-apply-ac-kq], button, a')]
      .find(el => {
        const t = n(el.textContent||el.value||'');
        return (t.includes('enviar mi cv')||t.includes('enviar cv')||t==='enviar') && !el.disabled && el.offsetParent;
      });

    if (btnEnviar) {
      btnEnviar.scrollIntoView({block:'center'});
      await sleep(300);
      btnEnviar.click();
      await sleep(2000);
      // Log con resumen de respuestas
      // Quitar referencias al DOM (el, elegidoEl, opciones) antes de guardar — no son serializables
      const respuestasParaLog = respuestasLog.map(r => ({ pregunta:r.pregunta, respuesta:r.respuesta, vacia:r.vacia, fueIA:r.fueIA }));
      const resumen = respuestasParaLog.filter(r => r.respuesta).map(r => r.pregunta.slice(0,30) + ': ' + r.respuesta.slice(0,40)).join(' | ');
      addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id,
        reason:'Enviado (' + n2 + ' campos)',
        respuestas: respuestasParaLog
      });
      reportarPostulacion({ id, titulo, url, matchScore: analisis && analisis.matchScore, respuestas: respuestasParaLog });
      msg('✓ ' + titulo.slice(0,40), '#16A34A');
      return true;
    } else {
      addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Sin botón Enviar mi CV'});
      return false;
    }
  } else {
    addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id, reason:'Postulación directa'});
    reportarPostulacion({ id, titulo });
    msg('✓ ' + titulo.slice(0,40), '#2563EB');
    return true;
  }
}

// ── Activar tarjeta ───────────────────────────────────────────
async function activar(tarjeta) {
  const btnAntes = document.querySelector('span[offer-detail-button]');
  const a = tarjeta.querySelector('h2 a, a[href*="oferta"], a[href*="trabajo"]') || tarjeta.querySelector('a');
  if (!a) return null;
  a.click();
  for (let i = 0; i < 25; i++) {
    await sleep(350);
    const btnDespues = document.querySelector('span[offer-detail-button]');
    if (btnDespues && btnDespues !== btnAntes) {
      const padre = btnDespues.closest('span.b_primary,a,button') || btnDespues;
      if (!padre.closest('.hide') && padre.offsetParent) return padre;
    }
    if (i > 15 && btnDespues) {
      const padre = btnDespues.closest('span.b_primary,a,button') || btnDespues;
      if (!padre.closest('.hide') && padre.offsetParent) return padre;
    }
  }
  return null;
}

// ── Escanear ──────────────────────────────────────────────────
async function escanear() {
  if (!AP.activo || AP.procesando || !AP.cfg) return;
  const tarjetas = [...document.querySelectorAll('article.box_offer')];
  if (!tarjetas.length) { msg('Sin tarjetas — busca ofertas en CT', '#9CA3AF'); return; }

  let pendientes = [];
  const titulosVistos = [];
  tarjetas.forEach((t, idx) => {
    const id = getId(t, idx);
    if (AP.vistos.has(id)) return;
    const badge = t.querySelector('.postulated:not(.hide), .applied-offer-tag:not(.hide)');
    if (badge && badge.offsetParent !== null) { AP.vistos.add(id); return; }
    const titulo = (t.querySelector('h2') && t.querySelector('h2').textContent.trim()) || 'Oferta';
    // Se guarda el título se haya matcheado o no con los filtros -- antes esto se
    // tiraba a la basura si no pasaba (ver docs/rediseno-filtrado-ofertas.md, §7.2).
    titulosVistos.push(titulo);
    if (pasa(t)) {
      pendientes.push({t, id, idx, titulo});
    }
  });
  reportarTitulosVistos(titulosVistos, 'Computrabajo');

  // Filtro inteligente con IA: descarta ofertas que no calzan con el cargo que busca el
  // candidato aunque el titulo no comparta ninguna palabra clave literal con los tags.
  if (AP.cfg.usarIAFiltros && AP.iaDisponible && pendientes.length) {
    const objetivo = await obtenerObjetivoLaboral();
    if (objetivo) {
      msg('IA filtrando ' + pendientes.length + ' ofertas…', '#7C3AED');
      const relevantes = await clasificarOfertasIA(pendientes.map(p => p.titulo), objetivo);
      if (relevantes) {
        const descartadas = pendientes.filter((p, i) => !relevantes.has(i + 1));
        descartadas.forEach(p => { AP.vistos.add(p.id); addLog({ts:Date.now(), status:'skip', title:p.titulo, url:'', uid:p.id, reason:'Descartada por filtro IA (no calza con tu objetivo laboral)'}); });
        pendientes = pendientes.filter((p, i) => relevantes.has(i + 1));
      }
    }
  }

  msg(pendientes.length + ' de ' + tarjetas.length + ' coinciden', '#16A34A');
  if (!pendientes.length) return;

  AP.procesando = true;
  for (const {t, id, titulo} of pendientes) {
    if (!AP.activo) break;
    const a = t.querySelector('h2 a, a[href*="oferta"], a[href*="trabajo"]') || t.querySelector('a');
    const url = a && a.href.split('#')[0] || '';
    msg('Abriendo: ' + titulo.slice(0,35) + '…', '#D97706');
    const btn = await activar(t);
    if (btn) await postular(url, id, titulo);
    else {
      AP.vistos.add(id);
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Panel no cargó'});
    }
    await sleep(DELAY);
  }
  AP.procesando = false;
  msg('Escaneo completo', '#16A34A');
}

// ── Seguimiento de estados en "Mis postulaciones" ───────────────
const MAPA_ESTADO_COMPUTRABAJO = {
  'postulado': 'ENVIADO',
  'cv visto': 'VISTO',
  'en proceso': 'EN_PROCESO',
  'finalista': 'FINALISTA',
  'proceso finalizado': 'FINALIZADO'
};

function extraerHashOferta(url) {
  if (!url) return null;
  const m = url.match(/([A-Fa-f0-9]{32})(?:$|[?#])/);
  return m ? m[1].toUpperCase() : null;
}

async function escanearMisPostulaciones() {
  const boxes = document.querySelectorAll('[match-div-offers] .box[data-match]');
  if (!boxes.length) return;

  msg('Revisando estados de postulaciones…', '#7C3AED');
  let actualizadas = 0;

  for (const box of boxes) {
    const linkAviso = box.querySelector('[data-shortcut-see-offer]');
    const url = linkAviso ? linkAviso.getAttribute('data-shortcut-see-offer') : null;
    const externalId = extraerHashOferta(url);
    if (!externalId) continue;

    const estadoTexto = (box.querySelector('.fc_link')?.textContent || '').trim().toLowerCase();
    const estado = MAPA_ESTADO_COMPUTRABAJO[estadoTexto];
    if (!estado) continue;

    const resultado = await actualizarEstadoPostulacion({
      platformNombre: 'Computrabajo',
      externalId: externalId,
      estado: estado
    });
    if (resultado && !resultado.error && !resultado.sinCambios) actualizadas++;
  }

  msg(actualizadas ? '✓ ' + actualizadas + ' estado(s) actualizado(s)' : 'Estados al día', '#16A34A');
}

// ── Registro en el núcleo compartido (core.js) ──────────────────
// core.js ya se encarga de: mensajería (TOGGLE/CONFIG_UPDATED/FORCE_SCAN/
// AUTO_SCAN), el MutationObserver que dispara reescaneos, y cargar
// AP.cfg/active/log/token al iniciar. Acá solo conectamos la función de
// escaneo de Computrabajo y qué hacer una vez que el estado ya cargó.
AP.escanear = escanear;
AP.onInit = function() {
  console.log('[AP-CT] listo — AP.activo:', AP.activo, 'incTags:', AP.cfg && AP.cfg.incTags && AP.cfg.incTags.length, 'modoRevision:', AP.cfg && AP.cfg.modoRevision, 'IA (token):', AP.iaDisponible);
  if (location.pathname.indexOf('/candidate/match') !== -1) {
    setTimeout(escanearMisPostulaciones, 1500);
  } else if (AP.activo) {
    msg('Activado — escaneando…', '#16A34A');
    setTimeout(escanear, 1800);
  }
};

window._apInjected = true;
})();
