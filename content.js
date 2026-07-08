// AutoPostula v3 - Reescritura limpia
(function() {
'use strict';

const DELAY = 3000;
let cfg = null;
let activo = false;
let procesando = false;
let vistos = new Set();
let log = [];

// ── Overlay ──────────────────────────────────────────────────
let ov = null;
function msg(texto, color) {
  color = color || '#16A34A';
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ap-ov';
    Object.assign(ov.style, {
      position:'fixed', bottom:'16px', right:'16px', zIndex:'2147483647',
      background:'#fff', border:'1px solid #ddd', borderRadius:'10px',
      padding:'10px 14px', fontFamily:'system-ui,sans-serif', fontSize:'12px',
      boxShadow:'0 4px 12px rgba(0,0,0,.15)', minWidth:'200px'
    });
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<b style="color:' + color + '">● AutoPostula</b><br><span style="color:#666">' + texto + '</span>';
}

// ── Helpers ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function n(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }

function safeSet(data) { try { chrome.storage.local.set(data); } catch(e) {} }
function safeSend(m) { try { chrome.runtime.sendMessage(m).catch(()=>{}); } catch(e) {} }

function addLog(entry) {
  log.push(entry);
  if (log.length > 200) log = log.slice(-200);
  safeSet({ log });
  safeSend({ type:'LOG_UPDATED', log });
}

// ── ID único de tarjeta ───────────────────────────────────────
function getId(tarjeta, idx) {
  // Intentar data-id primero
  const did = tarjeta.getAttribute('data-id') || tarjeta.getAttribute('data-blind') || '';
  if (did && did.length > 8) return did;
  // Intentar hash de la URL de la oferta
  const a = tarjeta.querySelector('a[href*="oferta"], a[href*="trabajo"]');
  if (a) {
    const m = a.href.split('#')[0].match(/-([A-F0-9]{8,})$/i);
    if (m) return m[1];
  }
  // Fallback: índice
  return 'idx-' + idx;
}

// ── Filtrar tarjeta ───────────────────────────────────────────
function pasa(tarjeta) {
  if (!cfg) return false;
  const t = n(tarjeta.innerText || '');

  // Excluir
  if (cfg.excTags && cfg.excTags.length) {
    if (cfg.excTags.some(tag => t.includes(n(tag)))) return false;
  }

  // Incluir — si hay tags, al menos uno debe coincidir
  if (cfg.incTags && cfg.incTags.length) {
    const expandido = t.replace(/\bpt\b/g,'part time').replace(/\(a\)/g,'a').replace(/\/a\b/g,'a');
    if (!cfg.incTags.some(tag => expandido.includes(n(tag)))) return false;
  }

  return true;
}

// ── Rellenar formulario ───────────────────────────────────────
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

function setVal(el, val) {
  try {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, val);
  } catch(e) { el.value = val; }
  el.dispatchEvent(new Event('input', {bubbles:true}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
}

// ── Módulo: Opciones (radio / checkbox / widgets interactivos) ─
// Maneja preguntas de opción única o múltiple sin importar si están
// implementadas como <input type=radio/checkbox> nativos o como
// divs/spans que simulan botones de opción (role="radio", aria-checked, etc).

// Selectores de "elementos opción" que reconocemos. Se puede ampliar
// esta lista si Computrabajo (u otro sitio) usa otras variantes.
const SELECTOR_OPCIONES = [
  'input[type=radio]',
  'input[type=checkbox]',
  '[role="radio"]',
  '[role="option"]',
  '[aria-checked]'
].join(',');

// Visibilidad real (no basta con offsetParent en layouts con position:fixed/sticky)
function esVisible(el) {
  if (!el) return false;
  if (el.offsetParent !== null) return true;
  try {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  } catch (e) { return false; }
}

// Espera (con timeout) a que existan opciones en el DOM, por si el
// formulario las carga de forma asíncrona tras abrir el panel.
function esperarOpciones(selector, opts) {
  const timeout = (opts && opts.timeout) || 2500;
  return new Promise(resolve => {
    const yaHay = document.querySelectorAll(selector);
    if (yaHay.length) return resolve([...yaHay]);
    const obs = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length) { obs.disconnect(); clearTimeout(t); resolve([...els]); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const t = setTimeout(() => { obs.disconnect(); resolve([...document.querySelectorAll(selector)]); }, timeout);
  });
}

// Extrae el texto visible de UNA opción individual (radio/checkbox/widget)
function textoDeOpcion(el) {
  try {
    const ariaLabel = el.getAttribute && el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    if (el.id) {
      const lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lf && lf.textContent.trim()) return lf.textContent.trim();
    }
    const labelPadre = el.closest && el.closest('label');
    if (labelPadre && labelPadre.textContent.trim()) return labelPadre.textContent.trim();

    if (el.tagName === 'INPUT') {
      // Patrón común: <input><span>Texto de la opción</span>
      const sigu = el.nextElementSibling;
      if (sigu && sigu.textContent && sigu.textContent.trim()) return sigu.textContent.trim();
      const prev = el.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim()) return prev.textContent.trim();
      return el.value || el.getAttribute('data-value') || '';
    }

    // div/span interactivo: su propio texto suele ser la opción completa
    const propio = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (propio) return propio;
    return el.getAttribute('title') || el.getAttribute('data-value') || '';
  } catch (e) { return ''; }
}

// Sube por los ancestros buscando el contenedor mínimo que agrupa
// más de una opción (útil para widgets sin "name" ni role=radiogroup)
function hallarContenedorPregunta(el) {
  let nodo = el.parentElement;
  let profundidad = 0;
  while (nodo && profundidad < 6) {
    if (nodo.querySelectorAll(SELECTOR_OPCIONES).length > 1) return nodo;
    nodo = nodo.parentElement;
    profundidad++;
  }
  return el.parentElement || el;
}

// Texto de la PREGUNTA a partir de su contenedor (clona y quita las opciones
// para no mezclar el enunciado con el texto de cada alternativa)
function textoPreguntaContenedor(contenedor) {
  try {
    const clon = contenedor.cloneNode(true);
    clon.querySelectorAll(SELECTOR_OPCIONES).forEach(e => e.remove());
    const t = (clon.textContent || '').trim().replace(/\s+/g, ' ');
    if (t && t.length > 3 && t.length < 300) return t;
  } catch (e) {}
  let prev = contenedor.previousElementSibling, intentos = 0;
  while (prev && intentos < 4) {
    const t = (prev.textContent || '').trim();
    if (t && t.length > 3 && t.length < 300) return t;
    prev = prev.previousElementSibling; intentos++;
  }
  return '';
}

// Analiza el texto de la pregunta + las opciones disponibles y decide
// cuál opción responde mejor. Devuelve el objeto {el, texto} elegido o null
// si no hay suficiente confianza (mejor no responder que responder mal).
function calcularRespuesta(preguntaTexto, opciones, perfil, qa) {
  const p = n(preguntaTexto);
  const textos = opciones.map(o => ({ ...o, t: n(o.texto) }));

  // 1) Preguntas y respuestas guardadas por el usuario (mayor prioridad)
  if (qa && qa.length) {
    const palabras = p.split(' ').filter(w => w.length > 3);
    const encontrada = qa.find(q => !q.isAI && palabras.some(w => n(q.question).includes(w)));
    if (encontrada) {
      const resp = n(encontrada.answer || '');
      const mejor = textos.find(o => o.t && (resp.includes(o.t) || o.t.includes(resp)));
      if (mejor) return mejor;
    }
  }

  // 2) Preguntas binarias (sí/no, verdadero/falso, acepto/no acepto)
  const esSi = t => /^(si|sí|yes|verdadero|true|acepto)\b/.test(t);
  const esNo = t => /^(no|not|false|falso)\b/.test(t);
  const opSi = textos.find(o => esSi(o.t));
  const opNo = textos.find(o => esNo(o.t));

  if (opSi || opNo) {
    if (p.includes('disponib') || p.includes('part time') || p.includes('horario')) return opSi || null;
    if (p.includes('experiencia') && (p.includes('retail') || p.includes('venta') || p.includes('caja') || p.includes('atencion'))) return opSi || null;
    if (p.includes('mayor') && p.includes('18')) return opSi || null;
    if (p.includes('vehiculo') || p.includes('auto ') || p.includes('licencia de conducir')) return opNo || null;
    if (p.includes('acepto') || p.includes('termin') || p.includes('politica') || p.includes('autoriz')) return opSi || null;
    return opSi || null; // default afirmativo cuando existe esa opción
  }

  // 3) Coincidencia directa con datos del perfil (jornada, modalidad, nivel, etc.)
  const camposPerfil = [perfil.disp, perfil.nivelEducacion, perfil.modalidad, perfil.jornada]
    .filter(Boolean).map(n);
  for (const campo of camposPerfil) {
    const match = textos.find(o => o.t && (campo.includes(o.t) || o.t.includes(campo)));
    if (match) return match;
  }

  // 4) Sin coincidencia clara: no se responde (evita marcar algo incorrecto)
  return null;
}

// Simula una interacción real y segura: usa .click() cuando es posible y,
// además, dispara los eventos nativos que muchos frameworks (React, Vue,
// listeners custom) esperan para detectar el cambio.
function seleccionarOpcion(el) {
  try {
    if (!el || !esVisible(el)) return false;
    el.scrollIntoView({ block: 'nearest' });

    if (el.tagName === 'INPUT') {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.click();
    } else {
      // Widget custom (div/span): simular la secuencia de puntero + click real
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(tipo => {
        try { el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true })); } catch (e) {}
      });
      el.click();
      if (el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', 'true');
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  } catch (e) {
    console.warn('[AP] No se pudo seleccionar la opción:', e);
    return false;
  }
}

// Punto de entrada: recorre TODO tipo de grupo de opciones del formulario
// visible en pantalla y contesta la que mejor calce con el perfil/QA.
async function manejarGruposDeOpciones(perfil, cfg) {
  let interacciones = 0;
  const qa = (cfg && cfg.qa) || [];

  // Da tiempo a que carguen opciones inyectadas de forma asíncrona
  await esperarOpciones(SELECTOR_OPCIONES, { timeout: 2500 });

  // ── Radios nativos, agrupados por atributo "name" ──
  const gruposRadioVistos = new Set();
  for (const radio of document.querySelectorAll('input[type=radio]')) {
    if (!esVisible(radio)) continue;
    const nombre = radio.name || '';
    const clave = nombre || radio;
    if (gruposRadioVistos.has(clave)) continue;
    gruposRadioVistos.add(clave);

    const grupo = nombre
      ? [...document.querySelectorAll('input[type=radio][name="' + CSS.escape(nombre) + '"]')].filter(esVisible)
      : [radio];
    if (!grupo.length) continue;

    const opciones = grupo.map(r => ({ el: r, texto: textoDeOpcion(r) }));
    const pregunta = getLabel(radio) || textoPreguntaContenedor(hallarContenedorPregunta(radio));
    const elegida = calcularRespuesta(pregunta, opciones, perfil, qa);
    if (elegida && seleccionarOpcion(elegida.el)) { interacciones++; await sleep(300); }
  }

  // ── Checkboxes nativos ──
  const gruposCbVistos = new Set();
  for (const cb of document.querySelectorAll('input[type=checkbox]')) {
    if (!esVisible(cb)) continue;
    const textoCb = n(textoDeOpcion(cb) || (cb.closest('label,div') && cb.closest('label,div').textContent) || '');

    // Checkbox individual de aceptación (términos, políticas, autorización)
    if (textoCb.includes('acepto') || textoCb.includes('terminos') || textoCb.includes('politica') || textoCb.includes('autorizo')) {
      if (!cb.checked && seleccionarOpcion(cb)) { interacciones++; await sleep(200); }
      continue;
    }

    // Grupo de checkboxes de selección múltiple (mismo "name")
    const nombre = cb.name || '';
    if (nombre && !gruposCbVistos.has(nombre)) {
      gruposCbVistos.add(nombre);
      const grupo = [...document.querySelectorAll('input[type=checkbox][name="' + CSS.escape(nombre) + '"]')].filter(esVisible);
      const opciones = grupo.map(c => ({ el: c, texto: textoDeOpcion(c) }));
      const pregunta = getLabel(cb) || textoPreguntaContenedor(hallarContenedorPregunta(cb));
      const elegida = calcularRespuesta(pregunta, opciones, perfil, qa);
      if (elegida && !elegida.el.checked && seleccionarOpcion(elegida.el)) { interacciones++; await sleep(200); }
    }
  }

  // ── Widgets interactivos (div/span con role="radio"/"option"/aria-checked) ──
  const widgets = [...document.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')]
    .filter(el => el.tagName !== 'INPUT' && esVisible(el));
  const gruposWidgetVistos = new Set();
  for (const widget of widgets) {
    const contenedor = hallarContenedorPregunta(widget);
    if (gruposWidgetVistos.has(contenedor)) continue;
    gruposWidgetVistos.add(contenedor);

    const grupo = [...contenedor.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')].filter(esVisible);
    if (!grupo.length) continue;
    const opciones = grupo.map(el => ({ el, texto: textoDeOpcion(el) }));
    const pregunta = textoPreguntaContenedor(contenedor);
    const elegida = calcularRespuesta(pregunta, opciones, perfil, qa);
    if (elegida && seleccionarOpcion(elegida.el)) { interacciones++; await sleep(300); }
  }

  return interacciones;
}

async function rellenar(contexto) {
  await sleep(1000);
  const p = (cfg && cfg.perfil) || {};
  let n2 = 0;

  // Radios, checkboxes y widgets interactivos (div/span que simulan opciones)
  n2 += await manejarGruposDeOpciones(p, cfg);

  // Textareas e inputs
  for (const el of document.querySelectorAll('textarea:not([style*="display:none"]),input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=radio]):not([type=checkbox])')) {
    if (!el.offsetParent) continue;
    const labelRaw = getLabel(el);
    const lbl = n(labelRaw);
    let val = null;
    if (lbl.includes('renta')||lbl.includes('sueldo')||lbl.includes('pretension')||lbl.includes('expectativa')) val = p.renta;
    else if (lbl.includes('contacto')||lbl.includes('numero')) val = (p.tel||'') + ' / ' + (p.email||'');
    else if (lbl.includes('disponib')||lbl.includes('horario')||lbl.includes('modalidad')) val = p.disp;
    else if (lbl.includes('presentac')||lbl.includes('carta')||lbl.includes('sobre ti')) val = p.bio;
    else if (lbl.includes('email')||lbl.includes('correo')) val = p.email;
    else if (lbl.includes('telefono')||lbl.includes('celular')) val = p.tel;
    else if (lbl.includes('nombre')&&!lbl.includes('empresa')) val = p.nombre;
    else {
      // Buscar en QA guardadas
      const qa = (cfg && cfg.qa) || [];
      const found = qa.find(q => !q.isAI && n(q.question).split(' ').filter(w=>w.length>3).some(w=>lbl.includes(w)));
      if (found) val = found.answer;
    }
    if (val) { el.scrollIntoView({block:'nearest'}); setVal(el, val); n2++; await sleep(500); }
  }
  return n2;
}

// ── Postular ──────────────────────────────────────────────────
async function postular(url, id, titulo) {
  if (vistos.has(id)) return false;
  vistos.add(id);

  msg('Postulando: ' + titulo.slice(0,35) + '…', '#D97706');

  // Verificar si ya postulamos
  const panelDetalle = document.querySelector('.box_detail,[data-offers-grid-box-detail]');
  if (panelDetalle && (
    panelDetalle.querySelector('.offer-detail-applied:not(.hide), span.b_primary.postulated:not(.hide)') ||
    n(panelDetalle.innerText||'').includes('ya aplicaste')
  )) {
    addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Ya postulado'});
    return false;
  }

  // Buscar botón Postularme
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

  btn.scrollIntoView({behavior:'smooth', block:'center'});
  await sleep(400);
  btn.click();
  await sleep(2000);

  // Detectar formulario
  const hayForm = [...document.querySelectorAll('textarea,input[type=radio]')].some(el => el.offsetParent && !el.closest('.hide'));

  if (hayForm) {
    msg('Rellenando formulario…', '#D97706');
    const n2 = await rellenar(document.body.innerText.slice(0,1500));
    await sleep(1000);

    // Buscar botón enviar
    const btnEnviar = [...document.querySelectorAll('a.b_primary.big.ml10, a[data-apply-ac-kq], button,a')]
      .find(el => {
        const t = n(el.textContent||el.value||'');
        return (t.includes('enviar mi cv')||t.includes('enviar cv')||t==='enviar') && !el.disabled && el.offsetParent;
      });

    if (btnEnviar) {
      btnEnviar.scrollIntoView({block:'center'});
      await sleep(300);
      btnEnviar.click();
      await sleep(2000);
      addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id, reason:'Enviado (' + n2 + ' campos)'});
      msg('✓ ' + titulo.slice(0,40), '#16A34A');
      return true;
    } else {
      addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Sin botón Enviar mi CV'});
      return false;
    }
  } else {
    addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id, reason:'Postulación directa'});
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
  if (!activo || procesando || !cfg) return;
  const tarjetas = [...document.querySelectorAll('article.box_offer')];
  if (!tarjetas.length) { msg('Sin tarjetas — busca ofertas en CT', '#9CA3AF'); return; }

  const pendientes = [];
  tarjetas.forEach((t, idx) => {
    const id = getId(t, idx);
    if (vistos.has(id)) return;
    // Badge visible = tiene .postulated SIN clase .hide
    const badge = t.querySelector('.postulated:not(.hide), .applied-offer-tag:not(.hide)');
    if (badge && badge.offsetParent !== null) { vistos.add(id); return; }
    if (pasa(t)) pendientes.push({t, id, idx});
  });

  msg(pendientes.length + ' de ' + tarjetas.length + ' coinciden', '#16A34A');
  if (!pendientes.length) return;

  procesando = true;
  for (const {t, id, idx} of pendientes) {
    if (!activo) break;
    const a = t.querySelector('h2 a, a[href*="oferta"], a[href*="trabajo"]') || t.querySelector('a');
    const url = a && a.href.split('#')[0] || '';
    const titulo = (t.querySelector('h2') && t.querySelector('h2').textContent.trim()) || 'Oferta';
    msg('Abriendo: ' + titulo.slice(0,35) + '…', '#D97706');
    const btn = await activar(t);
    if (btn) await postular(url, id, titulo);
    else {
      vistos.add(id);
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Panel no cargó'});
    }
    await sleep(DELAY);
  }
  procesando = false;
  msg('Escaneo completo', '#16A34A');
}

// ── Mensajes ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((m, _, res) => {
  if (m.type === 'TOGGLE') { activo = m.active; if (activo) { msg('Activado…','#16A34A'); setTimeout(escanear,800); } else if (ov) { ov.remove(); ov=null; } }
  if (m.type === 'CONFIG_UPDATED') { cfg = m.config; activo = cfg.active; }
  if (m.type === 'FORCE_SCAN') { procesando = false; escanear(); res({ok:true}); }
});

// ── Init ──────────────────────────────────────────────────────
try {
  chrome.storage.local.get(['config','active','log'], function(data) {
    cfg = data.config || null;
    activo = !!(data.active || (cfg && cfg.active));
    log = data.log || [];
    vistos = new Set(); // Solo sesion actual
    console.log('[AP v3] config:', !!cfg, 'activo:', activo, 'incTags:', cfg && cfg.incTags && cfg.incTags.length);
    if (activo) { msg('Activado — escaneando…','#16A34A'); setTimeout(escanear, 1800); }
  });
} catch(e) { console.error('[AP v3] init error:', e); }

document.addEventListener('autopostula-scan', function() {
  try { chrome.storage.local.get(['config','active'], function(data) { if (data.config) cfg=data.config; activo=true; procesando=false; msg('Escaneando…','#16A34A'); escanear(); }); } catch(e) {}
});

new MutationObserver(function() {
  if (activo && !procesando) { clearTimeout(window._apT); window._apT = setTimeout(escanear, 2500); }
}).observe(document.body, {childList:true, subtree:true});

window._apInjected = true;
})();