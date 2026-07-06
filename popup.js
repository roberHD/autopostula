// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Estado ─────────────────────────────────────────────────────
let incTags = [];
let excTags = [];
let jornadaSel = new Set(['part time','fines de semana','turno rotativo']);
let qaList = [];   // [{id, question, answer, isAI}]

// ── Defaults precargados con el perfil de Roberto ──────────────
const DEFAULTS = {
  incTags: ['vendedor','vendedora','retail','cajero','cajera','atención al cliente','reponedor','asistente de ventas'],
  excTags: ['jornada completa exclusiva','experiencia 5 años','sin estudios','senior'],
  jornada: ['part time','fines de semana','turno rotativo'],
  perfil: {
    nombre: 'Roberto Hidalgo Andrés Bizama',
    email:  'robertohidalgo2004@hotmail.com',
    tel:    '+56 9 2636 2069',
    cargo:  'Asistente de Ventas / Retail',
    renta:  '$550.000 - $650.000 CLP',
    disp:   'Part time, tardes y fines de semana, turnos rotativos',
    bio:    'Estudiante de Ingeniería Civil en Informática en la Universidad Andrés Bello, con más de 3 años de experiencia en retail y atención al cliente en SPID Cencosud. Manejo de caja, reposición, control de inventario y liderazgo de equipos. Responsable, proactivo y orientado al servicio al cliente.'
  },
  qa: [
    { id: 1, question: '¿Tienes experiencia en manejo de caja?', answer: 'Sí, tengo 3 años de experiencia manejando caja en SPID Cencosud, con cuadratura diaria y manejo de distintos medios de pago.', isAI: false },
    { id: 2, question: '¿Cuál es tu disponibilidad horaria?', answer: 'Tengo disponibilidad part time, preferentemente tardes, fines de semana y turnos rotativos.', isAI: false },
    { id: 3, question: '¿Por qué te interesa trabajar en retail?', answer: '', isAI: true },
    { id: 4, question: '¿Tienes experiencia liderando equipos?', answer: 'Sí, coordiné equipos durante mis turnos en SPID Cencosud, asignando tareas y asegurando el cumplimiento operativo.', isAI: false },
  ]
};

// ── DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const toggleMain    = $('toggle-main');
const toggleHint    = $('toggle-hint');
const pulse         = $('pulse');
const pulseLabel    = $('pulse-label');
const statTotal     = $('stat-total');
const statHoy       = $('stat-hoy');
const statOk        = $('stat-ok');
const incTagsEl     = $('inc-tags');
const excTagsEl     = $('exc-tags');
const incInput      = $('inc-input');
const excInput      = $('exc-input');
const incBtn        = $('inc-btn');
const excBtn        = $('exc-btn');
const jornadaChips  = $('jornada-chips');
const toggleProfile = $('toggle-profile');
const profileBody   = $('profile-body');
const qaListEl      = $('qa-list');
const qaAddToggle   = $('qa-add-toggle');
const qaForm        = $('qa-form');
const qaQ           = $('qa-q');
const qaA           = $('qa-a');
const qaSaveBtn     = $('qa-save-btn');
const qaCancelBtn   = $('qa-cancel-btn');
const apiKeyEl      = $('api-key');
const apiEye        = $('api-eye');
const apiTestBtn    = $('api-test-btn');
const apiDot        = $('api-dot');
const apiStatusText = $('api-status-text');
const logListEl     = $('log-list');
const clearLogBtn   = $('clear-log');
const saveBtn       = $('save-btn');
const openCtBtn     = $('open-ct-btn');
const toastEl       = $('toast');

// ── Utilidades ─────────────────────────────────────────────────
function toast(msg, duration = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function uid() { return Date.now() + Math.random().toString(36).slice(2,6); }

// ── Tags ───────────────────────────────────────────────────────
function renderTags() {
  renderTagsInto(incTagsEl, incTags, 'inc');
  renderTagsInto(excTagsEl, excTags, 'exc');
}

function renderTagsInto(container, list, type) {
  container.innerHTML = '';
  list.forEach((tag, i) => {
    const span = document.createElement('span');
    span.className = `tag ${type}`;
    span.innerHTML = `${tag} <button class="tag-x" data-i="${i}" data-type="${type}">×</button>`;
    container.appendChild(span);
  });
}

function addTag(type, val) {
  const v = val.trim().toLowerCase();
  if (!v) return;
  if (type === 'inc' && !incTags.includes(v)) { incTags.push(v); incInput.value = ''; }
  if (type === 'exc' && !excTags.includes(v)) { excTags.push(v); excInput.value = ''; }
  renderTags();
}

document.addEventListener('click', e => {
  if (!e.target.classList.contains('tag-x')) return;
  const i = +e.target.dataset.i, type = e.target.dataset.type;
  if (type === 'inc') incTags.splice(i, 1);
  else excTags.splice(i, 1);
  renderTags();
});

incBtn.addEventListener('click', () => addTag('inc', incInput.value));
excBtn.addEventListener('click', () => addTag('exc', excInput.value));
incInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag('inc', incInput.value); });
excInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag('exc', excInput.value); });

// ── Chips jornada ──────────────────────────────────────────────
jornadaChips.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const val = chip.dataset.val;
  if (jornadaSel.has(val)) jornadaSel.delete(val);
  else jornadaSel.add(val);
  chip.classList.toggle('selected', jornadaSel.has(val));
});

// ── Toggle perfil ──────────────────────────────────────────────
toggleProfile.addEventListener('click', () => {
  const hidden = profileBody.style.display === 'none';
  profileBody.style.display = hidden ? '' : 'none';
  toggleProfile.textContent = hidden ? 'Ocultar' : 'Mostrar';
});

// ── Preguntas personalizadas ───────────────────────────────────
function renderQA() {
  if (!qaList.length) {
    qaListEl.innerHTML = '<div style="font-size:11px;color:var(--text-3);padding:4px 0;">Sin respuestas guardadas — la IA manejará todos los formularios.</div>';
    return;
  }
  qaListEl.innerHTML = '';
  qaList.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'qa-item';
    const badge = item.isAI
      ? `<span class="qa-badge ai">IA responde</span>`
      : `<span class="qa-badge manual">Manual</span>`;
    const answerText = item.isAI
      ? '<span style="color:var(--text-3);font-style:italic;">La IA generará una respuesta contextual al aviso</span>'
      : item.answer;
    div.innerHTML = `
      <div class="qa-item-head">
        <span class="qa-question">${item.question}</span>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${badge}
          <button class="tag-x qa-del" data-id="${item.id}" title="Eliminar">×</button>
        </div>
      </div>
      <div class="qa-item-body">
        <div class="qa-answer">${answerText}</div>
      </div>
    `;
    qaListEl.appendChild(div);
  });
}

document.addEventListener('click', e => {
  const del = e.target.closest('.qa-del');
  if (!del) return;
  qaList = qaList.filter(q => q.id != del.dataset.id);
  renderQA();
});

qaAddToggle.addEventListener('click', () => {
  qaForm.classList.toggle('hidden');
  if (!qaForm.classList.contains('hidden')) {
    qaQ.focus();
    qaAddToggle.textContent = '− Cancelar';
  } else {
    qaAddToggle.textContent = '+ Nueva';
  }
});

qaSaveBtn.addEventListener('click', () => {
  const q = qaQ.value.trim();
  if (!q) { qaQ.focus(); return; }
  const a = qaA.value.trim();
  qaList.push({ id: uid(), question: q, answer: a, isAI: !a });
  qaQ.value = ''; qaA.value = '';
  qaForm.classList.add('hidden');
  qaAddToggle.textContent = '+ Nueva';
  renderQA();
  toast('✓ Respuesta guardada');
});

qaCancelBtn.addEventListener('click', () => {
  qaForm.classList.add('hidden');
  qaAddToggle.textContent = '+ Nueva';
  qaQ.value = ''; qaA.value = '';
});

// ── API Key ────────────────────────────────────────────────────
let apiVisible = false;
apiEye.addEventListener('click', () => {
  apiVisible = !apiVisible;
  apiKeyEl.type = apiVisible ? 'text' : 'password';
  apiEye.textContent = apiVisible ? '🙈' : '👁';
});

apiTestBtn.addEventListener('click', async () => {
  const key = apiKeyEl.value.trim().replace(/\s+/g, '');
  if (!key) { toast('⚠ Ingresa una API key primero'); return; }
  apiTestBtn.textContent = '…';
  apiTestBtn.disabled = true;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Di solo: ok' }]
      })
    });
    if (res.ok) {
      apiDot.className = 'dot ok';
      apiStatusText.textContent = 'API key válida — IA activada ✓';
      toast('✓ Conexión exitosa con Claude');
    } else {
      const err = await res.json();
      apiDot.className = 'dot err';
      apiStatusText.textContent = `Error: ${err.error?.message || res.status}`;
      toast('✗ API key inválida');
    }
  } catch {
    apiDot.className = 'dot err';
    apiStatusText.textContent = 'No se pudo conectar';
    toast('✗ Error de conexión');
  }
  apiTestBtn.textContent = 'Probar';
  apiTestBtn.disabled = false;
});

// ── Toggle ON/OFF ──────────────────────────────────────────────
toggleMain.addEventListener('change', () => {
  const active = toggleMain.checked;
  setActiveUI(active);
  chrome.storage.local.set({ active });
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]?.url?.includes('computrabajo.cl')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE', active }).catch(() => {});
    }
  });
});

function setActiveUI(active) {
  if (active) {
    pulse.className = 'pulse active';
    pulseLabel.className = 'pulse-label active';
    pulseLabel.textContent = 'Activo';
    toggleHint.textContent = 'Escaneando ofertas en Computrabajo…';
  } else {
    pulse.className = 'pulse';
    pulseLabel.className = 'pulse-label';
    pulseLabel.textContent = 'Inactivo';
    toggleHint.textContent = 'Activa para comenzar a postular';
  }
}

// ── Log ────────────────────────────────────────────────────────
function renderLog(entries) {
  if (!entries?.length) {
    logListEl.innerHTML = '<div class="log-empty">Aún no hay postulaciones registradas.</div>';
    statTotal.textContent = 0; statHoy.textContent = 0; statOk.textContent = 0;
    return;
  }

  const today = new Date().toDateString();
  let total = entries.length, hoy = 0, ok = 0;

  // Íconos y etiquetas por estado
  const statusCfg = {
    ok:      { icon: '✅', label: 'Postulada',  color: '#16A34A' },
    pending: { icon: '⚠️',  label: 'Pendiente',  color: '#D97706' },
    err:     { icon: '❌', label: 'Error',       color: '#DC2626' },
    skip:    { icon: '⏭',  label: 'Omitida',    color: '#9CA3AF' },
    working: { icon: '⏳', label: 'En proceso', color: '#2563EB' },
  };

  logListEl.innerHTML = '';
  [...entries].reverse().slice(0, 30).forEach(e => {
    if (new Date(e.ts).toDateString() === today) hoy++;
    if (e.status === 'ok') ok++;

    const cfg = statusCfg[e.status] || { icon: '•', label: e.status, color: '#9CA3AF' };
    const div = document.createElement('div');
    div.className = 'log-entry';
    const time = new Date(e.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    // Si hay campos pendientes, mostrarlos
    const pendientesHtml = e.camposPendientes?.length
      ? `<div class="log-reason" style="color:#D97706">
           ⚠ Sin respuesta para: ${e.camposPendientes.map(c=>`"${c.slice(0,40)}"`).join(', ')}
           <br><span style="font-size:9px;color:#9CA3AF">→ Agrégala en "Respuestas a preguntas"</span>
         </div>`
      : '';

    div.innerHTML = `
      <span class="log-icon">${cfg.icon}</span>
      <div class="log-text">
        <div class="log-title" style="display:flex;align-items:center;gap:5px;">
          ${e.title || 'Oferta'}
          <span style="font-size:9px;font-weight:700;color:${cfg.color};background:${cfg.color}18;padding:1px 5px;border-radius:8px;">${cfg.label}</span>
        </div>
        ${e.reason ? `<div class="log-reason">${e.reason}</div>` : ''}
        ${pendientesHtml}
      </div>
      <span class="log-time">${time}</span>
    `;
    logListEl.appendChild(div);
  });

  statTotal.textContent = total;
  statHoy.textContent = hoy;
  statOk.textContent = ok;
}

clearLogBtn.addEventListener('click', () => {
  chrome.storage.local.set({ log: [] }, () => {
    renderLog([]);
    toast('🗑 Historial limpiado');
  });
});

// ── Guardar ────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  const config = {
    active: toggleMain.checked,
    incTags,
    excTags,
    jornada: [...jornadaSel],
    qa: qaList,
    apiKey: apiKeyEl.value.trim().replace(/\s+/g, ''),
    modoRevision: document.getElementById('toggle-revision')?.checked || false,
    usarIAFiltros: document.getElementById('toggle-ia-filtros')?.checked || false,
    perfil: {
      nombre: $('p-nombre').value,
      email:  $('p-email').value,
      tel:    $('p-tel').value,
      cargo:  $('p-cargo').value,
      renta:  $('p-renta').value,
      disp:   $('p-disp').value,
      bio:    $('p-bio').value
    }
  };

  chrome.storage.local.set({ config }, () => {
    // Notificar al content script con la nueva config
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.url?.includes('computrabajo.cl')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'CONFIG_UPDATED', config }).catch(() => {});
      }
    });
    toast('✓ Cambios guardados');
  });
});

// ── Abrir CT ───────────────────────────────────────────────────
openCtBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://cl.computrabajo.com/trabajo-de-vendedor-jornada-part-time' });
});

// ── Escanear ahora (inyección directa siempre) ─────────────────
document.getElementById('scan-now-btn')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;

    // Primero guardar config actualizada
    const config = {
      active: true,
      incTags,
      excTags,
      jornada: [...jornadaSel],
      qa: qaList,
      apiKey: apiKeyEl.value.trim().replace(/\s+/g, ''),
      modoRevision: document.getElementById('toggle-revision')?.checked || false,
      usarIAFiltros: document.getElementById('toggle-ia-filtros')?.checked || false,
      perfil: {
        nombre: $('p-nombre').value,
        email:  $('p-email').value,
        tel:    $('p-tel').value,
        cargo:  $('p-cargo').value,
        renta:  $('p-renta').value,
        disp:   $('p-disp').value,
        bio:    $('p-bio').value
      }
    };
    await new Promise(r => chrome.storage.local.set({ config, active: true }, r));

    // Disparar evento custom en el DOM — el content script lo escucha
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Resetear estado
          if (window._apReset) window._apReset();
          // Disparar evento que el content script escucha
          document.dispatchEvent(new CustomEvent('autopostula-scan'));
        }
      });
      toast('🔍 Escaneando...');
    } catch(e) {
      // Fallback: mensaje directo
      chrome.tabs.sendMessage(tabId, { type: 'FORCE_SCAN' }, () => {});
      toast('🔍 Escaneando...');
    }
  });
});

// ── Escuchar actualizaciones del content script ────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'LOG_UPDATED') renderLog(msg.log);
  if (msg.type === 'STATUS') {
    if (msg.status === 'working') {
      pulse.className = 'pulse working';
      pulseLabel.className = 'pulse-label working';
      pulseLabel.textContent = 'Postulando…';
    } else if (msg.status === 'active') {
      pulse.className = 'pulse active';
      pulseLabel.className = 'pulse-label active';
      pulseLabel.textContent = 'Activo';
    }
  }
});

// ── Cargar estado ──────────────────────────────────────────────
function loadState() {
  chrome.storage.local.get(['config', 'active', 'log'], data => {
    const cfg = data.config || {};

    incTags = cfg.incTags || DEFAULTS.incTags;
    excTags = cfg.excTags || DEFAULTS.excTags;

    jornadaSel = new Set(cfg.jornada || DEFAULTS.jornada);
    document.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('selected', jornadaSel.has(chip.dataset.val));
    });

    qaList = cfg.qa || DEFAULTS.qa;

    const p = cfg.perfil || DEFAULTS.perfil;
    $('p-nombre').value = p.nombre || DEFAULTS.perfil.nombre;
    $('p-email').value  = p.email  || DEFAULTS.perfil.email;
    $('p-tel').value    = p.tel    || DEFAULTS.perfil.tel;
    $('p-cargo').value  = p.cargo  || DEFAULTS.perfil.cargo;
    $('p-renta').value  = p.renta  || DEFAULTS.perfil.renta;
    $('p-disp').value   = p.disp   || DEFAULTS.perfil.disp;
    $('p-bio').value    = p.bio    || DEFAULTS.perfil.bio;

    if (cfg.apiKey) {
      apiKeyEl.value = cfg.apiKey;
      apiDot.className = 'dot ok';
      apiStatusText.textContent = 'API key configurada';
    }
    const toggleRevision = document.getElementById('toggle-revision');
    const toggleIAFiltros = document.getElementById('toggle-ia-filtros');
    if (toggleRevision) toggleRevision.checked = cfg.modoRevision || false;
    if (toggleIAFiltros) toggleIAFiltros.checked = cfg.usarIAFiltros || false;

    const active = data.active ?? cfg.active ?? false;
    toggleMain.checked = active;
    setActiveUI(active);

    renderTags();
    renderQA();
    renderLog(data.log || []);
  });
}

loadState();
