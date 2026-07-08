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

async function rellenar(contexto) {
  await sleep(1000);
  const p = (cfg && cfg.perfil) || {};
  let n2 = 0;

  // ── REESCRITURA: Radio Buttons e Interfaces de Opción Múltiple Flexibles ──
  // Buscamos todos los contenedores de preguntas posibles en portales de empleo
  const bloquesPreguntas = document.querySelectorAll('fieldset, .pregunta-container, .question-block, div[class*="question"], div[class*="pregunta"], div[class*="form-group"]');
  
  for (const bloque of bloquesPreguntas) {
    if (!bloque.offsetParent) continue; // Ignorar si está oculto

    // Buscamos opciones interactivas dentro del bloque (nativos, cajas personalizadas, labels clicables o divs dinámicos)
    const opciones = [...bloque.querySelectorAll('input[type="radio"], [role="radio"], label, div[class*="option"], div[class*="button-choice"], div[class*="selection-box"]')];
    if (!opciones.length) continue;

    // Verificar si el bloque ya cuenta con una opción marcada o seleccionada por el usuario
    const yaRespondido = opciones.some(opt => {
      if (opt.tagName === 'INPUT') return opt.checked;
      return opt.classList.contains('selected') || opt.getAttribute('aria-checked') === 'true' || opt.className.includes('active') || opt.className.includes('checked');
    });

    if (!yaRespondido) {
      let elegir = opciones[0]; // Por defecto apuntamos a la primera opción si no hay match claro
      const labelPregunta = n(bloque.innerText || '');

      // Clasificamos las opciones disponibles basándonos en su contenido textual
      const opSi = opciones.find(opt => { 
        const txt = n(opt.innerText || opt.value || ''); 
        return txt === 'si' || txt === 'sí' || txt === 'yes' || txt.includes('acepto') || txt.includes('disponible'); 
      });
      const opNo = opciones.find(opt => { 
        const txt = n(opt.innerText || opt.value || ''); 
        return txt === 'no' || txt.includes('no cuento') || txt.includes('no tengo'); 
      });

      // Lógica de descarte inteligente según el enunciado de la pregunta
      if (labelPregunta.includes('disponib') || labelPregunta.includes('part time') || labelPregunta.includes('horario') || labelPregunta.includes('modalidad')) {
        elegir = opSi || opciones[0];
      } else if (labelPregunta.includes('experiencia') && (labelPregunta.includes('retail') || labelPregunta.includes('venta') || labelPregunta.includes('caja'))) {
        elegir = opSi || opciones[0];
      } else if (labelPregunta.includes('mayor') && labelPregunta.includes('18')) {
        elegir = opSi || opciones[0];
      } else if (labelPregunta.includes('vehiculo') || labelPregunta.includes('auto ') || labelPregunta.includes('licencia de conducir')) {
        elegir = opNo || opciones[1] || opciones[0];
      } else {
        // Fallback robusto: Priorizar opción afirmativa ("SÍ"), si no existe, toma la primera disponible de la lista
        elegir = opSi || opciones[0];
      }

      if (elegir) {
        if (elegir.tagName === 'INPUT') {
          elegir.checked = true;
          elegir.dispatchEvent(new Event('change', { bubbles: true }));
        }
        elegir.click();
        n2++;
        await sleep(300);
      }
    }
  }

  // Checkboxes
  for (const cb of document.querySelectorAll('input[type=checkbox]')) {
    if (!cb.offsetParent) continue;
    const lbl = n(cb.closest('label,div') && cb.closest('label,div').textContent || '');
    if (lbl.includes('acepto')||lbl.includes('terminos')||lbl.includes('politica')||lbl.includes('autorizo')) {
      if (!cb.checked) { cb.click(); n2++; }
    }
  }

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

  // Detectar formulario (Inyección de selectores flexibles para encontrar el formulario activo)
  const hayForm = [...document.querySelectorAll('textarea, input[type=radio], [role="radio"], div[class*="option"], label')].some(el => el.offsetParent && !el.closest('.hide'));

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