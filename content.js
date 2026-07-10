// AutoPostula v4 - Base GitHub + IA con CV + Modo Revisión + Toggle Stop
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
  const did = tarjeta.getAttribute('data-id') || tarjeta.getAttribute('data-blind') || '';
  if (did && did.length > 8) return did;
  const a = tarjeta.querySelector('a[href*="oferta"], a[href*="trabajo"]');
  if (a) {
    const m = a.href.split('#')[0].match(/-([A-F0-9]{8,})$/i);
    if (m) return m[1];
  }
  return 'idx-' + idx;
}

// ── Filtrar tarjeta ───────────────────────────────────────────
function pasa(tarjeta) {
  if (!cfg) return false;
  const t = n(tarjeta.innerText || '');
  if (cfg.excTags && cfg.excTags.length) {
    if (cfg.excTags.some(tag => t.includes(n(tag)))) return false;
  }
  if (cfg.incTags && cfg.incTags.length) {
    const expandido = t.replace(/\bpt\b/g,'part time').replace(/\(a\)/g,'a').replace(/\/a\b/g,'a');
    if (!cfg.incTags.some(tag => expandido.includes(n(tag)))) return false;
  }
  return true;
}

// ── IA: responder pregunta de formulario ──────────────────────
async function aiResponde(pregunta, contexto) {
  const key = cfg && cfg.apiKey;
  if (!key) return null;
  const p = (cfg && cfg.perfil) || {};
  const qa = (cfg && cfg.qa || []).filter(q => !q.isAI).map(q => 'P:"' + q.question + '"→R:"' + q.answer + '"').join('\n');

  try {
    // Intentar cargar CV en base64
    const cvData = await new Promise(resolve => {
      try { chrome.storage.local.get(['cvBase64'], d => resolve(d.cvBase64 || null)); }
      catch(e) { resolve(null); }
    });

    let messages;
    if (cvData) {
      messages = [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: cvData } },
          { type: 'text', text:
            'Eres un asistente que ayuda a ' + (p.nombre||'Roberto') + ' a postular empleos.\n' +
            'El documento adjunto es su CV.\n' +
            'Renta esperada: ' + (p.renta||'') + '\n' +
            'Disponibilidad: ' + (p.disp||'') + '\n' +
            'Respuestas guardadas:\n' + (qa||'Ninguna') + '\n' +
            'Aviso de trabajo:\n' + (contexto||'').slice(0,600) + '\n\n' +
            'Responde SOLO esta pregunta en primera persona, máx 2 oraciones:\n"' + pregunta + '"\nRESPUESTA:'
          }
        ]
      }];
    } else {
      messages = [{
        role: 'user',
        content:
          'Ayuda a ' + (p.nombre||'Roberto') + ' a postular.\n' +
          'Perfil: ' + (p.bio||'') + '\n' +
          'Renta: ' + (p.renta||'') + '\n' +
          'Disponibilidad: ' + (p.disp||'') + '\n' +
          'Respuestas guardadas:\n' + (qa||'Ninguna') + '\n' +
          'Aviso:\n' + (contexto||'').slice(0,600) + '\n\n' +
          'Responde SOLO esta pregunta en primera persona, máx 2 oraciones:\n"' + pregunta + '"\nRESPUESTA:'
      }];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages })
    });
    const data = await res.json();
    return data.content && data.content[0] && data.content[0].text && data.content[0].text.trim() || null;
  } catch(e) { return null; }
}

// ── Panel de revisión antes de enviar ────────────────────────
function mostrarRevision(titulo, respuestasLog) {
  return new Promise(resolve => {
    document.getElementById('ap-revision-panel')?.remove();
    const div = document.createElement('div');
    div.id = 'ap-revision-panel';
    Object.assign(div.style, {
      position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
      zIndex:'2147483648', background:'#fff', border:'1px solid #e4e7ef',
      borderRadius:'12px', padding:'20px', width:'500px', maxWidth:'92vw',
      maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)',
      fontFamily:'system-ui,sans-serif'
    });

    const filas = respuestasLog.map(r => {
      const color = r.vacia ? '#DC2626' : '#16A34A';
      const icon = r.vacia ? '⚠️' : '✅';
      return '<div style="margin-bottom:10px;padding:8px 10px;background:#f8f9fc;border-radius:8px;border:1px solid #e4e7ef">' +
        '<div style="font-size:11px;font-weight:700;color:#4b5563;margin-bottom:3px">' + (r.pregunta||'').slice(0,80) + '</div>' +
        '<div style="font-size:12px;color:' + color + '">' + icon + ' ' + (r.vacia ? '<em>Sin respuesta</em>' : (r.respuesta||'').slice(0,200)) + '</div>' +
        '</div>';
    }).join('');

    div.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">' +
        '<span style="font-size:20px">👀</span>' +
        '<div><div style="font-weight:700;font-size:14px">Revisar antes de enviar</div>' +
        '<div style="font-size:11px;color:#6b7280">' + titulo.slice(0,60) + '</div></div>' +
      '</div>' +
      '<div style="margin-bottom:16px">' + (filas || '<div style="color:#9ca3af;font-style:italic;text-align:center;padding:12px">Sin campos que mostrar</div>') + '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="ap-rev-confirm" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer">✓ Confirmar y enviar</button>' +
        '<button id="ap-rev-skip" style="background:#f3f4f6;color:#4b5563;border:1px solid #e4e7ef;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer">Saltar</button>' +
      '</div>';

    document.body.appendChild(div);
    document.getElementById('ap-rev-confirm').onclick = () => { div.remove(); resolve('confirm'); };
    document.getElementById('ap-rev-skip').onclick    = () => { div.remove(); resolve('skip'); };
    // Auto-confirmar tras 90 segundos
    setTimeout(() => { if (document.getElementById('ap-revision-panel')) { div.remove(); resolve('confirm'); } }, 90000);
  });
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

function setVal(el, val) {
  try {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, val);
  } catch(e) { el.value = val; }
  el.dispatchEvent(new Event('input', {bubbles:true}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
}

// ── Módulo opciones (del repo GitHub — robusto) ───────────────
const SELECTOR_OPCIONES = ['input[type=radio]','input[type=checkbox]','[role="radio"]','[role="option"]','[aria-checked]'].join(',');

function esVisible(el) {
  if (!el) return false;
  if (el.offsetParent !== null) return true;
  try {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  } catch(e) { return false; }
}

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
    clon.querySelectorAll(SELECTOR_OPCIONES).forEach(e => e.remove());
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

function calcularRespuesta(preguntaTexto, opciones, perfil, qa) {
  const p = n(preguntaTexto);
  const textos = opciones.map(o => ({ ...o, t: n(o.texto) }));
  if (qa && qa.length) {
    const palabras = p.split(' ').filter(w => w.length > 3);
    const encontrada = qa.find(q => !q.isAI && palabras.some(w => n(q.question).includes(w)));
    if (encontrada) {
      const resp = n(encontrada.answer || '');
      const mejor = textos.find(o => o.t && (resp.includes(o.t) || o.t.includes(resp)));
      if (mejor) return mejor;
    }
  }
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
    return opSi || null;
  }
  const camposPerfil = [perfil.disp, perfil.nivelEducacion, perfil.modalidad, perfil.jornada].filter(Boolean).map(n);
  for (const campo of camposPerfil) {
    const match = textos.find(o => o.t && (campo.includes(o.t) || o.t.includes(campo)));
    if (match) return match;
  }
  return null;
}

function seleccionarOpcion(el) {
  try {
    if (!el || !esVisible(el)) return false;
    el.scrollIntoView({ block:'nearest' });
    if (el.tagName === 'INPUT') {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
      el.click();
    } else {
      ['pointerdown','mousedown','pointerup','mouseup'].forEach(tipo => {
        try { el.dispatchEvent(new MouseEvent(tipo, { bubbles:true, cancelable:true })); } catch(e) {}
      });
      el.click();
      if (el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', 'true');
      el.dispatchEvent(new Event('change', { bubbles:true }));
      el.dispatchEvent(new Event('input', { bubbles:true }));
    }
    return true;
  } catch(e) { return false; }
}

async function manejarGruposDeOpciones(perfil, cfg, respuestasLog) {
  let interacciones = 0;
  const qa = (cfg && cfg.qa) || [];
  await esperarOpciones(SELECTOR_OPCIONES, { timeout:2500 });

  // Radios nativos
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
    const opciones = grupo.map(r => ({ el:r, texto:textoDeOpcion(r) }));
    const pregunta = getLabel(radio) || textoPreguntaContenedor(hallarContenedorPregunta(radio));
    const elegida = calcularRespuesta(pregunta, opciones, perfil, qa);
    if (elegida && seleccionarOpcion(elegida.el)) {
      interacciones++;
      respuestasLog.push({ pregunta, respuesta: elegida.texto });
      await sleep(300);
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', vacia: true });
    }
  }

  // Checkboxes
  const gruposCbVistos = new Set();
  for (const cb of document.querySelectorAll('input[type=checkbox]')) {
    if (!esVisible(cb)) continue;
    const textoCb = n(textoDeOpcion(cb) || (cb.closest('label,div') && cb.closest('label,div').textContent) || '');
    if (textoCb.includes('acepto') || textoCb.includes('terminos') || textoCb.includes('politica') || textoCb.includes('autorizo')) {
      if (!cb.checked && seleccionarOpcion(cb)) { interacciones++; await sleep(200); }
      continue;
    }
    const nombre = cb.name || '';
    if (nombre && !gruposCbVistos.has(nombre)) {
      gruposCbVistos.add(nombre);
      const grupo = [...document.querySelectorAll('input[type=checkbox][name="' + CSS.escape(nombre) + '"]')].filter(esVisible);
      const opciones = grupo.map(c => ({ el:c, texto:textoDeOpcion(c) }));
      const pregunta = getLabel(cb) || textoPreguntaContenedor(hallarContenedorPregunta(cb));
      const elegida = calcularRespuesta(pregunta, opciones, perfil, qa);
      if (elegida && !elegida.el.checked && seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto });
        await sleep(200);
      }
    }
  }

  // Widgets interactivos
  const widgets = [...document.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')]
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
    const elegida = calcularRespuesta(pregunta, opciones, perfil, qa);
    if (elegida && seleccionarOpcion(elegida.el)) {
      interacciones++;
      respuestasLog.push({ pregunta, respuesta: elegida.texto });
      await sleep(300);
    }
  }

  return interacciones;
}

// ── Rellenar formulario ───────────────────────────────────────
async function rellenar(contexto) {
  await sleep(1000);
  if (!activo) return { n2:0, respuestasLog:[] };
  const p = (cfg && cfg.perfil) || {};
  let n2 = 0;
  const respuestasLog = [];

  // Opciones (radios, checkboxes, widgets)
  n2 += await manejarGruposDeOpciones(p, cfg, respuestasLog);

  // Textareas e inputs
  for (const el of document.querySelectorAll('textarea:not([style*="display:none"]),input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=radio]):not([type=checkbox])')) {
    if (!el.offsetParent) continue;
    const labelRaw = getLabel(el);
    const lbl = n(labelRaw);
    let val = null;
    let fueIA = false;

    if      (lbl.includes('renta')||lbl.includes('sueldo')||lbl.includes('pretension')||lbl.includes('expectativa')) val = p.renta;
    else if (lbl.includes('contacto')||lbl.includes('numero')) val = (p.tel||'') + ' / ' + (p.email||'');
    else if (lbl.includes('disponib')||lbl.includes('horario')||lbl.includes('modalidad')) val = p.disp;
    else if (lbl.includes('presentac')||lbl.includes('carta')||lbl.includes('sobre ti')) val = p.bio;
    else if (lbl.includes('email')||lbl.includes('correo')) val = p.email;
    else if (lbl.includes('telefono')||lbl.includes('celular')) val = p.tel;
    else if (lbl.includes('nombre')&&!lbl.includes('empresa')) val = p.nombre;
    else {
      const qa = (cfg && cfg.qa) || [];
      const found = qa.find(q => !q.isAI && n(q.question).split(' ').filter(w=>w.length>3).some(w=>lbl.includes(w)));
      if (found) val = found.answer;
      // Si no hay respuesta guardada y hay API key, usar IA
      if (!val && cfg && cfg.apiKey && el.tagName === 'TEXTAREA' && labelRaw.length > 5) {
        msg('IA respondiendo…', '#7C3AED');
        val = await aiResponde(labelRaw, contexto);
        fueIA = !!val;
        await sleep(200);
      }
    }

    if (val) {
      el.scrollIntoView({block:'nearest'});
      setVal(el, val);
      n2++;
      respuestasLog.push({ pregunta: labelRaw, respuesta: val, fueIA });
      await sleep(500);
    } else if (labelRaw.length > 5) {
      respuestasLog.push({ pregunta: labelRaw, respuesta: '', vacia: true });
    }
  }

  return { n2, respuestasLog };
}

// ── Postular ──────────────────────────────────────────────────
async function postular(url, id, titulo) {
  if (vistos.has(id)) return false;
  vistos.add(id);

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

  if (!activo) return false;
  btn.scrollIntoView({behavior:'smooth', block:'center'});
  await sleep(400);
  btn.click();
  await sleep(2000);

  const hayForm = [...document.querySelectorAll('textarea,input[type=radio]')].some(el => el.offsetParent && !el.closest('.hide'));

  if (hayForm) {
    msg('Rellenando formulario…', '#D97706');
    const contexto = document.body.innerText.slice(0,1500);
    const { n2, respuestasLog } = await rellenar(contexto);
    await sleep(1000);

    // Modo revisión: pausar y mostrar respuestas al usuario
    if (cfg && cfg.modoRevision) {
      msg('⏸ Revisión pendiente…', '#2563EB');
      const decision = await mostrarRevision(titulo, respuestasLog);
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
      const resumen = respuestasLog.filter(r => r.respuesta).map(r => r.pregunta.slice(0,30) + ': ' + r.respuesta.slice(0,40)).join(' | ');
      addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id,
        reason:'Enviado (' + n2 + ' campos)',
        respuestas: respuestasLog
      });
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
    const badge = t.querySelector('.postulated:not(.hide), .applied-offer-tag:not(.hide)');
    if (badge && badge.offsetParent !== null) { vistos.add(id); return; }
    if (pasa(t)) pendientes.push({t, id, idx});
  });

  msg(pendientes.length + ' de ' + tarjetas.length + ' coinciden', '#16A34A');
  if (!pendientes.length) return;

  procesando = true;
  for (const {t, id} of pendientes) {
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
  if (m.type === 'TOGGLE') {
    activo = m.active;
    if (activo) { msg('Activado…','#16A34A'); setTimeout(escanear,800); }
    else { procesando = false; if (ov) { ov.remove(); ov=null; } }
  }
  if (m.type === 'CONFIG_UPDATED') { cfg = m.config; activo = cfg.active; }
  if (m.type === 'FORCE_SCAN') { procesando = false; escanear(); res({ok:true}); }
});

// ── Init ──────────────────────────────────────────────────────
try {
  chrome.storage.local.get(['config','active','log'], function(data) {
    cfg = data.config || null;
    activo = !!(data.active || (cfg && cfg.active));
    log = data.log || [];
    vistos = new Set();
    console.log('[AP v4] config:', !!cfg, 'activo:', activo, 'incTags:', cfg && cfg.incTags && cfg.incTags.length, 'modoRevision:', cfg && cfg.modoRevision, 'apiKey:', !!(cfg && cfg.apiKey));
    if (activo) { msg('Activado — escaneando…','#16A34A'); setTimeout(escanear, 1800); }
  });
} catch(e) { console.error('[AP v4] init error:', e); }

document.addEventListener('autopostula-scan', function() {
  try {
    chrome.storage.local.get(['config','active'], function(data) {
      if (data.config) cfg = data.config;
      activo = true; procesando = false;
      msg('Escaneando…','#16A34A'); escanear();
    });
  } catch(e) {}
});

new MutationObserver(function() {
  if (activo && !procesando) { clearTimeout(window._apT); window._apT = setTimeout(escanear, 2500); }
}).observe(document.body, {childList:true, subtree:true});

window._apInjected = true;
})();
