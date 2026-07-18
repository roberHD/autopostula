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
// ── Extraer el texto completo del aviso (no todo el body con menús/ruido) ─
function extraerTextoAviso() {
  const panel = document.querySelector('.box_detail,[data-offers-grid-box-detail]');
  let texto = (panel ? panel.innerText : document.body.innerText) || '';
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  return texto.slice(0, 4000);
}

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
// REGLA: Solo responde si la info está en el CV, perfil o datos adicionales. Si no sabe → null.
// Si se pasa `opciones` (array de strings), la IA debe elegir UNA opción textual exacta en vez de redactar libremente.
async function aiResponde(pregunta, contexto, opciones) {
  const key = cfg && cfg.apiKey;
  if (!key) return null;
  const p = (cfg && cfg.perfil) || {};
  const info = (cfg && cfg.info || []).map(it => '- ' + it.texto).join('\n');

  try {
    const cvData = await new Promise(resolve => {
      try { chrome.storage.local.get(['cvBase64'], d => resolve(d.cvBase64 || null)); }
      catch(e) { resolve(null); }
    });

    const bloqueOpciones = (opciones && opciones.length)
      ? '\nOpciones disponibles (debes responder EXACTAMENTE con el texto de una de estas, sin agregar nada más):\n' +
        opciones.map(o => '- "' + o + '"').join('\n') + '\n'
      : '';

    const instruccion =
      'Eres un asistente que ayuda a ' + (p.nombre||'el candidato') + ' a postular empleos.\n' +
      'REGLAS:\n' +
      '1. Usa solo información real del CV, perfil o datos adicionales entregados abajo. Nunca inventes datos concretos (años, empresas, certificaciones) que no estén ahí.\n' +
      '3. Para preguntas sobre experiencia, motivación o habilidades, usa el CV y perfil para dar una respuesta real y específica.\n' +
      '5. MUY IMPORTANTE: personaliza la respuesta según el AVISO DE TRABAJO específico de abajo (rubro, productos, marca, tareas mencionadas). Si el aviso es de venta de zapatillas, tu respuesta debe conectar con calzado/retail de zapatillas; si es de una cafetería, con café y atención en cafeterías; etc. No des una respuesta genérica que serviría igual para cualquier aviso — debe notarse que leíste este aviso en particular.\n' +
      '6. Responde en TEXTO PLANO, como si lo escribieras directo en un formulario web. NUNCA uses formato markdown (nada de #, ##, **, -, listas ni títulos). NUNCA repitas ni cites la pregunta antes de responder. NUNCA agregues introducciones tipo "Respuesta:" o comillas envolviendo el texto — ve directo a la respuesta, en oraciones normales.\n' +
      '7. Si la pregunta pide VARIOS datos a la vez (ej: "indique su comuna y teléfono", "nombre y correo"), responde TODOS los datos pedidos, no solo el primero.\n' +
      (bloqueOpciones
        ? '2. Si la pregunta es sobre algo que NO está en tu información y no puedes inferirlo razonablemente, responde: SINRESPUESTA\n' +
          '4. Debes elegir una de las opciones dadas textualmente, o SINRESPUESTA si ninguna aplica.\n'
        : '2. Si no tienes el dato exacto que pide la pregunta, NUNCA respondas SINRESPUESTA ni dejes el campo vacío: responde con honestidad, reconociendo que no tienes esa experiencia específica, pero conectándolo con la experiencia real más cercana que sí tengas (ej: "No cuento con experiencia directa en ese rubro, pero tengo experiencia en atención al cliente y ventas retail que me permite adaptarme rápido"). Solo usa SINRESPUESTA si la pregunta es completamente irrelevante para un postulante a empleo.\n') +
      '\n' +
      'Perfil: ' + (p.bio||'Sin información de perfil aún') + '\n' +
      'Nombre: ' + (p.nombre||'') + '\n' +
      'Email: ' + (p.email||'') + '\n' +
      'Teléfono: ' + (p.tel||'') + '\n' +
      'Comuna de residencia: ' + (p.comuna||'') + '\n' +
      'Cargo buscado: ' + (p.cargo||'') + '\n' +
      'Renta esperada: ' + (p.renta||'') + '\n' +
      'Disponibilidad: ' + (p.disp||'') + '\n' +
      'Datos adicionales del candidato:\n' + (info||'Ninguno') + '\n' +
      'AVISO DE TRABAJO (léelo completo y usa sus detalles específicos):\n' + (contexto||'').slice(0,2500) + '\n' +
      bloqueOpciones +
      '\nPregunta del formulario: "' + pregunta + '"\n' +
      (opciones && opciones.length
        ? 'Responde solo con el texto exacto de la opción elegida, o SINRESPUESTA.'
        : 'Responde en primera persona, máx 2 oraciones, siempre con una respuesta honesta, útil y personalizada al aviso de arriba (nunca la dejes en blanco ni la hagas genérica).');

    let messages;
    if (cvData) {
      messages = [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: cvData } },
        { type: 'text', text: instruccion }
      ]}];
    } else {
      messages = [{ role: 'user', content: instruccion }];
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
    let respuesta = data.content && data.content[0] && data.content[0].text && data.content[0].text.trim() || '';
    respuesta = limpiarRespuestaIA(respuesta);
    // Si la IA dice que no sabe, retornar null (dejar vacío)
    if (!respuesta || respuesta.includes('SINRESPUESTA') || respuesta.toLowerCase().includes('sin respuesta')) return null;
    return respuesta;
  } catch(e) { return null; }
}

// Red de seguridad: por si el modelo igual agrega formato markdown o repite la pregunta.
function limpiarRespuestaIA(txt) {
  if (!txt) return txt;
  let t = txt;
  t = t.replace(/^\s*#+\s*/gm, '');                 // encabezados markdown (#, ##, ###…)
  t = t.replace(/^\s*[-*•]\s+/gm, '');               // viñetas al inicio de línea
  t = t.replace(/\*\*(.*?)\*\*/g, '$1');             // **negrita**
  t = t.replace(/(^|\n)\s*(Respuesta|Pregunta)\s*:\s*/gi, '$1'); // prefijos tipo "Respuesta:"
  t = t.trim();
  t = t.replace(/^["“'](.+)["”']$/s, '$1');          // comillas envolviendo todo el texto
  return t.trim();
}

// ── Panel de revisión antes de enviar (editable) ─────────────
function mostrarRevision(titulo, respuestasLog, contexto) {
  return new Promise(resolve => {
    document.getElementById('ap-revision-panel')?.remove();
    const div = document.createElement('div');
    div.id = 'ap-revision-panel';
    Object.assign(div.style, {
      position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
      zIndex:'2147483648', background:'#fff', border:'1px solid #e4e7ef',
      borderRadius:'12px', padding:'0', width:'640px', maxWidth:'94vw',
      maxHeight:'86vh', display:'flex', flexDirection:'column',
      boxShadow:'0 20px 60px rgba(0,0,0,.25)', fontFamily:'system-ui,sans-serif'
    });

    const filas = respuestasLog.map((r, idx) => {
      const color = r.vacia ? '#DC2626' : '#16A34A';
      const icon = r.vacia ? 'ADVERTENCIA' : 'OK';
      const cabecera =
        '<div style="font-size:11px;font-weight:700;color:#4b5563;margin-bottom:5px">' + (r.pregunta||'').slice(0,90) + '</div>' +
        '<div style="font-size:10px;color:' + color + ';margin-bottom:5px">' + icon + (r.vacia ? ' Sin respuesta - puedes completarla' : (r.fueIA ? ' Generada por IA - puedes editarla' : '')) + '</div>';

      if (r.tipo === 'opcion') {
        const opts = (r.opciones||[]).map((o, oi) => {
          const sel = r.elegidoEl && o.el === r.elegidoEl ? ' selected' : '';
          return '<option value="' + oi + '"' + sel + '>' + (o.texto||'(opcion sin texto)').slice(0,80) + '</option>';
        }).join('');
        return '<div class="ap-rev-item" data-idx="' + idx + '" data-tipo="opcion" style="margin-bottom:12px;padding:8px 10px;background:#f8f9fc;border-radius:8px;border:1px solid #e4e7ef">' +
          cabecera +
          '<select class="ap-rev-select" data-idx="' + idx + '" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit">' +
            '<option value="-1"' + (r.elegidoEl ? '' : ' selected') + '>-- Sin seleccion --</option>' + opts +
          '</select>' +
        '</div>';
      }

      // tipo texto (o sin tipo, por compatibilidad)
      const max = (r.el && r.el.maxLength && r.el.maxLength > 0 && r.el.maxLength < 10000) ? r.el.maxLength : 500;
      const valorEsc = (r.respuesta||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<div class="ap-rev-item" data-idx="' + idx + '" data-tipo="texto" style="margin-bottom:12px;padding:8px 10px;background:#f8f9fc;border-radius:8px;border:1px solid #e4e7ef">' +
        cabecera +
        '<textarea class="ap-rev-textarea" data-idx="' + idx + '" maxlength="' + max + '" rows="3" ' +
          'style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;resize:vertical">' + valorEsc + '</textarea>' +
        '<div class="ap-rev-counter" data-idx="' + idx + '" style="font-size:10px;color:#9ca3af;text-align:right;margin-top:2px">' + (r.respuesta||'').length + ' / ' + max + '</div>' +
      '</div>';
    }).join('');

    const avisoEsc = (contexto||'Sin texto del aviso disponible.').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    div.innerHTML =
      // Cabecera arrastrable
      '<div id="ap-rev-header" style="cursor:move;user-select:none;display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #e4e7ef">' +
        '<span style="font-size:20px">*</span>' +
        '<div style="flex:1"><div style="font-weight:700;font-size:14px">Revisar antes de enviar</div>' +
        '<div style="font-size:11px;color:#6b7280">' + titulo.slice(0,60) + ' - arrastra desde aqui para mover</div></div>' +
      '</div>' +
      // Pestanas
      '<div style="display:flex;gap:4px;padding:10px 20px 0">' +
        '<button class="ap-tab-btn" data-tab="aviso" style="padding:8px 14px;border:none;border-radius:8px 8px 0 0;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Aviso completo</button>' +
        '<button class="ap-tab-btn" data-tab="respuestas" style="padding:8px 14px;border:none;border-radius:8px 8px 0 0;background:#f3f4f6;color:#4b5563;font-size:12px;font-weight:700;cursor:pointer">Preguntas y respuestas (' + respuestasLog.length + ')</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:16px 20px">' +
        '<div class="ap-tab-content" data-tab-content="aviso" style="white-space:pre-wrap;font-size:12px;line-height:1.6;color:#374151">' + avisoEsc + '</div>' +
        '<div class="ap-tab-content" data-tab-content="respuestas" style="display:none">' +
          (filas || '<div style="color:#9ca3af;font-style:italic;text-align:center;padding:12px">Sin campos que mostrar</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;padding:16px 20px;border-top:1px solid #e4e7ef">' +
        '<button id="ap-rev-confirm" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer">Confirmar y enviar</button>' +
        '<button id="ap-rev-skip" style="background:#f3f4f6;color:#4b5563;border:1px solid #e4e7ef;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer">Saltar</button>' +
      '</div>';

    document.body.appendChild(div);

    // -- Pestanas: alternar entre "Aviso completo" y "Preguntas y respuestas" --
    div.querySelectorAll('.ap-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        div.querySelectorAll('.ap-tab-btn').forEach(b => {
          b.style.background = '#f3f4f6'; b.style.color = '#4b5563';
        });
        btn.style.background = '#2563eb'; btn.style.color = '#fff';
        div.querySelectorAll('.ap-tab-content').forEach(c => {
          c.style.display = (c.dataset.tabContent === btn.dataset.tab) ? '' : 'none';
        });
      });
    });

    // -- Arrastrar el panel desde la cabecera --
    const header = div.querySelector('#ap-rev-header');
    let arrastrando = false, offX = 0, offY = 0;
    const onMouseMove = e => {
      if (!arrastrando) return;
      div.style.left = (e.clientX - offX) + 'px';
      div.style.top  = (e.clientY - offY) + 'px';
    };
    const onMouseUp = () => { arrastrando = false; };
    header.addEventListener('mousedown', e => {
      arrastrando = true;
      const rect = div.getBoundingClientRect();
      div.style.transform = 'none';
      div.style.left = rect.left + 'px';
      div.style.top  = rect.top + 'px';
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    function limpiarListeners() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    // Contador de caracteres en vivo
    div.querySelectorAll('.ap-rev-textarea').forEach(ta => {
      ta.addEventListener('input', () => {
        const counter = div.querySelector('.ap-rev-counter[data-idx="' + ta.dataset.idx + '"]');
        if (counter) counter.textContent = ta.value.length + ' / ' + ta.maxLength;
      });
    });

    function aplicarEdiciones() {
      div.querySelectorAll('.ap-rev-textarea').forEach(ta => {
        const idx = +ta.dataset.idx;
        const entry = respuestasLog[idx];
        if (!entry) return;
        const val = limitarTexto(ta.value, entry.el);
        if (entry.el) setVal(entry.el, val);
        entry.respuesta = val;
        entry.vacia = !val;
      });
      div.querySelectorAll('.ap-rev-select').forEach(sel => {
        const idx = +sel.dataset.idx;
        const entry = respuestasLog[idx];
        if (!entry) return;
        const oi = +sel.value;
        if (oi >= 0 && entry.opciones && entry.opciones[oi]) {
          const nueva = entry.opciones[oi];
          if (nueva.el !== entry.elegidoEl) seleccionarOpcion(nueva.el);
          entry.elegidoEl = nueva.el;
          entry.respuesta = nueva.texto;
          entry.vacia = false;
        } else {
          entry.vacia = true;
          entry.respuesta = '';
        }
      });
    }

    document.getElementById('ap-rev-confirm').onclick = () => { limpiarListeners(); aplicarEdiciones(); div.remove(); resolve('confirm'); };
    document.getElementById('ap-rev-skip').onclick    = () => { limpiarListeners(); div.remove(); resolve('skip'); };
    // Auto-confirmar tras 3 minutos (aplicando lo que se haya editado hasta ese momento) --
    // se amplio el tiempo porque ahora tambien hay que leer el aviso completo antes de decidir.
    setTimeout(() => { if (document.getElementById('ap-revision-panel')) { limpiarListeners(); aplicarEdiciones(); div.remove(); resolve('confirm'); } }, 180000);
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

// Computrabajo suele limitar respuestas largas a 500 caracteres. Si el campo trae su propio
// maxlength lo respetamos; si no, usamos 500 por defecto. Cortamos en el último espacio para
// no partir una palabra a la mitad.
function limitarTexto(val, el) {
  if (!val) return val;
  let max = 500;
  if (el && el.maxLength && el.maxLength > 0 && el.maxLength < 10000) max = el.maxLength;
  if (val.length <= max) return val;
  const cortado = val.slice(0, max);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  const final = (ultimoEspacio > max * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trim();
  return final;
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

async function manejarGruposDeOpciones(perfil, cfg, respuestasLog, contexto) {
  let interacciones = 0;
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
    const pregunta = textoPreguntaContenedor(hallarContenedorPregunta(radio)) || getLabel(radio);
    let elegida = calcularRespuesta(pregunta, opciones, perfil);
    // Si no hay match universal y hay IA, que la IA elija entre las opciones usando perfil + info adicional
    if (!elegida && cfg && cfg.apiKey && pregunta.length > 5) {
      const respIA = await aiResponde(pregunta, contexto, opciones.map(o => o.texto));
      if (respIA) {
        const rNorm = n(respIA);
        elegida = opciones.find(o => rNorm.includes(n(o.texto)) || n(o.texto).length < 4 && rNorm.startsWith(n(o.texto)));
      }
    }
    if (elegida && seleccionarOpcion(elegida.el)) {
      interacciones++;
      respuestasLog.push({ pregunta, respuesta: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
      await sleep(300);
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null });
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
      const pregunta = textoPreguntaContenedor(hallarContenedorPregunta(cb)) || getLabel(cb);
      let elegida = calcularRespuesta(pregunta, opciones, perfil);
      if (!elegida && cfg && cfg.apiKey && pregunta.length > 5) {
        const respIA = await aiResponde(pregunta, contexto, opciones.map(o => o.texto));
        if (respIA) {
          const rNorm = n(respIA);
          elegida = opciones.find(o => rNorm.includes(n(o.texto)));
        }
      }
      if (elegida && !elegida.el.checked && seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
        await sleep(200);
      } else if (pregunta && !elegida) {
        respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null });
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
    let elegida = calcularRespuesta(pregunta, opciones, perfil);
    if (!elegida && cfg && cfg.apiKey && pregunta.length > 5) {
      const respIA = await aiResponde(pregunta, contexto, opciones.map(o => o.texto));
      if (respIA) {
        const rNorm = n(respIA);
        elegida = opciones.find(o => rNorm.includes(n(o.texto)));
      }
    }
    if (elegida && seleccionarOpcion(elegida.el)) {
      interacciones++;
      respuestasLog.push({ pregunta, respuesta: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
      await sleep(300);
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null });
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
  n2 += await manejarGruposDeOpciones(p, cfg, respuestasLog, contexto);

  // Textareas e inputs
  for (const el of document.querySelectorAll('textarea:not([style*="display:none"]),input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=radio]):not([type=checkbox])')) {
    if (!el.offsetParent) continue;
    const labelRaw = getLabel(el);
    const lbl = n(labelRaw);
    let val = null;
    let fueIA = false;

    // clave(): coincide solo si el término aparece como inicio de palabra (con límite \b),
    // para no confundir p.ej. "posición" con "reposición" (que la contiene como substring).
    const clave = (...terms) => terms.some(t => new RegExp('\\b' + t).test(lbl));

    // Solo quedan como "predeterminados" los que se basan en el TIPO real del input (confiable,
    // no en adivinar por texto), porque cualquier atajo por palabras clave se rompe apenas la
    // pregunta pide dos cosas a la vez (ej: "indique su comuna y número de teléfono" terminaba
    // respondiendo solo el teléfono e ignorando la comuna). Todo lo demás —incluidas preguntas
    // compuestas de contacto, comuna, renta, disponibilidad, cargo, presentación, experiencia—
    // se responde con IA, que ya tiene tus datos de contacto y perfil como contexto.
    if      (el.type === 'email' && p.email) val = p.email;
    else if (el.type === 'tel' && p.tel) val = p.tel;
    else if (clave('discapacidad') || (clave('identifica') && clave('discapacidad'))) {
      // Preguntas de discapacidad — responder con IA si está disponible, sino "No"
      if (cfg && cfg.apiKey) {
        msg('IA respondiendo…', '#7C3AED');
        val = await aiResponde(labelRaw, contexto);
        fueIA = !!val;
        await sleep(200);
      } else {
        val = 'No';
      }
    }
    else if (cfg && cfg.apiKey && labelRaw.length > 5) {
      // Cualquier campo no cubierto por los datos objetivos de arriba se resuelve con IA,
      // usando el perfil, el CV, la "información adicional" y el aviso completo (no respuestas fijas).
      msg('IA respondiendo…', '#7C3AED');
      val = await aiResponde(labelRaw, contexto);
      fueIA = !!val;
      await sleep(200);
    }

    if (val) {
      val = limitarTexto(val, el);
      el.scrollIntoView({block:'nearest'});
      setVal(el, val);
      n2++;
      respuestasLog.push({ pregunta: labelRaw, respuesta: val, fueIA, tipo:'texto', el });
      await sleep(500);
    } else if (labelRaw.length > 5) {
      respuestasLog.push({ pregunta: labelRaw, respuesta: '', vacia: true, tipo:'texto', el });
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

  // IMPORTANTE: leer el aviso ANTES de hacer clic en "Postularme". Computrabajo puede
  // reemplazar este mismo panel con el formulario de preguntas adicionales al hacer clic,
  // así que si se lee después, se corre el riesgo de capturar el formulario en vez del aviso.
  const contexto = extraerTextoAviso();

  btn.scrollIntoView({behavior:'smooth', block:'center'});
  await sleep(400);
  btn.click();
  await sleep(2000);

  const hayForm = [...document.querySelectorAll('textarea,input[type=radio]')].some(el => el.offsetParent && !el.closest('.hide'));

  if (hayForm) {
    msg('Rellenando formulario…', '#D97706');
    const { n2, respuestasLog } = await rellenar(contexto);
    await sleep(1000);

    // Modo revisión: pausar y mostrar respuestas al usuario
    if (cfg && cfg.modoRevision) {
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
