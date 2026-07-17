// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Estado ─────────────────────────────────────────────────────
let incTags = [];
let excTags = [];
let jornadaSel = new Set(['part time','fines de semana','turno rotativo']);
let infoItems = [];   // [{id, texto}] — datos libres del candidato para que la IA los use como contexto

// ── Defaults precargados con el perfil de Roberto ──────────────
const DEFAULTS = {
  incTags: [],
  excTags: [],
  jornada: ['part time'],
  perfil: { nombre:'', email:'', tel:'', comuna:'', cargo:'', renta:'', disp:'', bio:'' },
  info: []
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
const infoListEl    = $('info-list');
const infoInput     = $('info-input');
const infoBtn       = $('info-btn');
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

// ── Información adicional ───────────────────────────────────────
function renderInfo() {
  if (!infoItems.length) {
    infoListEl.innerHTML = '<div class="info-empty">Sin datos adicionales — agrega hechos sobre ti para que la IA los use al responder.</div>';
    return;
  }
  infoListEl.innerHTML = '';
  infoItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'info-item';
    div.innerHTML = `
      <span class="info-item-text">${item.texto}</span>
      <button class="tag-x info-del" data-id="${item.id}" title="Eliminar">×</button>
    `;
    infoListEl.appendChild(div);
  });
}

document.addEventListener('click', e => {
  const del = e.target.closest('.info-del');
  if (!del) return;
  infoItems = infoItems.filter(it => it.id != del.dataset.id);
  renderInfo();
});

function addInfoItem() {
  const texto = infoInput.value.trim();
  if (!texto) { infoInput.focus(); return; }
  infoItems.push({ id: uid(), texto });
  infoInput.value = '';
  renderInfo();
  toast('✓ Dato agregado');
}

infoBtn.addEventListener('click', addInfoItem);
infoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addInfoItem(); });

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
           <br><span style="font-size:9px;color:#9CA3AF">→ Agrega el dato en "Información adicional"</span>
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
    info: infoItems,
    apiKey: apiKeyEl.value.trim().replace(/\s+/g, ''),
    modoRevision: document.getElementById('toggle-revision')?.checked || false,
    usarIAFiltros: document.getElementById('toggle-ia-filtros')?.checked || false,
    perfil: {
      nombre: $('p-nombre').value,
      email:  $('p-email').value,
      tel:    $('p-tel').value,
      comuna: $('p-comuna').value,
      cargo:  $('p-cargo').value,
      renta:  $('p-renta').value,
      disp:   $('p-disp').value,
      bio:    $('p-bio').value
    }
  };

  chrome.storage.local.set({ config }, () => {
    // Notificar a TODAS las pestañas de Computrabajo abiertas con la nueva config
    // (antes solo comprobaba 'computrabajo.cl', que no matcheaba con cl.computrabajo.com)
    chrome.tabs.query({ url: ['*://*.computrabajo.com/*', '*://*.computrabajo.cl/*'] }, tabs => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, { type: 'CONFIG_UPDATED', config }).catch(() => {}));
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
      info: infoItems,
      apiKey: apiKeyEl.value.trim().replace(/\s+/g, ''),
      modoRevision: document.getElementById('toggle-revision')?.checked || false,
      usarIAFiltros: document.getElementById('toggle-ia-filtros')?.checked || false,
      perfil: {
        nombre: $('p-nombre').value,
        email:  $('p-email').value,
        tel:    $('p-tel').value,
        comuna: $('p-comuna').value,
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

    if (cfg.info) {
      infoItems = cfg.info;
    } else if (cfg.qa && cfg.qa.length) {
      // Migración desde el formato antiguo de "preguntas y respuestas"
      infoItems = cfg.qa.filter(q => !q.isAI && q.answer).map(q => ({ id: uid(), texto: q.question + ': ' + q.answer }));
    } else {
      infoItems = DEFAULTS.info;
    }

    const p = cfg.perfil || {};
    $('p-nombre').value = p.nombre || '';
    $('p-email').value  = p.email  || '';
    $('p-tel').value    = p.tel    || '';
    $('p-comuna').value = p.comuna || '';
    $('p-cargo').value  = p.cargo  || '';
    $('p-renta').value  = p.renta  || '';
    $('p-disp').value   = p.disp   || '';
    $('p-bio').value    = p.bio    || '';

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
    renderInfo();
    renderLog(data.log || []);
  });
}

loadState();

// ── CV: subida, extracción automática y limpieza ───────────────
const cvDropZone  = document.getElementById('cv-drop-zone');
const cvFileInput = document.getElementById('cv-file-input');
const cvStatus    = document.getElementById('cv-status');
const cvExtractBtn = document.getElementById('cv-extract-btn');
const cvClearBtn  = document.getElementById('cv-clear');

function setCVStatus(nombre, size) {
  const kb = Math.round((size || 0) / 1024);
  if (cvStatus) cvStatus.innerHTML = '✅ <strong>' + nombre + '</strong> (' + kb + ' KB) — listo para usar con IA';
  if (cvDropZone) { cvDropZone.style.borderColor = 'var(--success)'; cvDropZone.style.background = 'var(--success-s)'; }
  if (cvExtractBtn) cvExtractBtn.style.display = 'flex';
  if (cvClearBtn) cvClearBtn.style.display = 'block';
}

function clearCV() {
  chrome.storage.local.remove(['cvBase64','cvNombre','cvSize'], () => {
    if (cvStatus) cvStatus.innerHTML = '📄 Sube tu CV en PDF — la IA leerá tu información';
    if (cvDropZone) { cvDropZone.style.borderColor = ''; cvDropZone.style.background = ''; }
    if (cvExtractBtn) cvExtractBtn.style.display = 'none';
    if (cvClearBtn) cvClearBtn.style.display = 'none';
    toast('🗑 CV eliminado');
  });
}

async function procesarCV(file) {
  if (!file || file.type !== 'application/pdf') { toast('⚠ Solo se aceptan archivos PDF'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('⚠ El PDF es muy grande (máx 5MB)'); return; }

  if (cvStatus) cvStatus.textContent = '⏳ Subiendo CV…';

  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Error al leer el archivo'));
    r.readAsDataURL(file);
  });

  chrome.storage.local.set({ cvBase64: base64, cvNombre: file.name, cvSize: file.size }, () => {
    setCVStatus(file.name, file.size);
    toast('✅ CV subido correctamente');
    // Ofrecer extracción automática si hay API key
    const key = apiKeyEl?.value?.trim();
    if (key) {
      setTimeout(() => {
        if (confirm('¿Quieres que la IA extraiga automáticamente tus datos del CV para completar el perfil?')) {
          extraerDatosCV(base64, key);
        }
      }, 500);
    }
  });
}

async function extraerDatosCV(base64, key) {
  if (cvStatus) cvStatus.innerHTML = '⏳ Extrayendo datos del CV con IA…';

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
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text:
              'Extrae la información de este CV y responde SOLO con un JSON válido con estos campos exactos:\n' +
              '{"nombre":"","email":"","tel":"","comuna":"","cargo":"","bio":""}\n' +
              '- nombre: nombre completo de la persona\n' +
              '- email: email de contacto\n' +
              '- tel: teléfono de contacto\n' +
              '- comuna: comuna o ciudad de residencia si aparece\n' +
              '- cargo: último cargo o cargo objetivo que busca\n' +
              '- bio: resumen profesional de 2-3 oraciones en primera persona\n' +
              'Si no encuentras algún dato, deja el campo vacío. Responde SOLO el JSON, sin texto adicional.'
            }
          ]
        }]
      })
    });

    const data = await res.json();
    const texto = data.content && data.content[0] && data.content[0].text || '';
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Sin JSON en respuesta');

    const perfil = JSON.parse(jsonMatch[0]);

    // Rellenar campos solo si están vacíos o si el usuario confirma
    if (perfil.nombre && !$('p-nombre').value) $('p-nombre').value = perfil.nombre;
    if (perfil.email  && !$('p-email').value)  $('p-email').value  = perfil.email;
    if (perfil.tel    && !$('p-tel').value)    $('p-tel').value    = perfil.tel;
    if (perfil.comuna && !$('p-comuna').value) $('p-comuna').value = perfil.comuna;
    if (perfil.cargo  && !$('p-cargo').value)  $('p-cargo').value  = perfil.cargo;
    if (perfil.bio    && !$('p-bio').value)    $('p-bio').value    = perfil.bio;

    chrome.storage.local.get(['cvNombre','cvSize'], d => {
      setCVStatus(d.cvNombre || 'CV.pdf', d.cvSize || 0);
    });
    toast('✨ Datos extraídos del CV — revisa y guarda');

  } catch(e) {
    chrome.storage.local.get(['cvNombre','cvSize'], d => {
      setCVStatus(d.cvNombre || 'CV.pdf', d.cvSize || 0);
    });
    toast('⚠ No se pudieron extraer los datos automáticamente');
  }
}

// Eventos de subida
if (cvDropZone) {
  cvDropZone.addEventListener('click', () => cvFileInput && cvFileInput.click());
  cvDropZone.addEventListener('dragover', e => { e.preventDefault(); cvDropZone.style.borderColor = 'var(--accent)'; });
  cvDropZone.addEventListener('dragleave', () => { cvDropZone.style.borderColor = ''; });
  cvDropZone.addEventListener('drop', e => {
    e.preventDefault();
    cvDropZone.style.borderColor = '';
    const file = e.dataTransfer?.files?.[0];
    if (file) procesarCV(file);
  });
}
if (cvFileInput) cvFileInput.addEventListener('change', e => { if (e.target.files[0]) procesarCV(e.target.files[0]); });
if (cvClearBtn)  cvClearBtn.addEventListener('click',  e => { e.stopPropagation(); clearCV(); });
if (cvExtractBtn) cvExtractBtn.addEventListener('click', e => {
  e.stopPropagation();
  const key = apiKeyEl?.value?.trim();
  if (!key) { toast('⚠ Necesitas una API key para extraer datos'); return; }
  chrome.storage.local.get(['cvBase64'], d => {
    if (d.cvBase64) extraerDatosCV(d.cvBase64, key);
    else toast('⚠ Sube un CV primero');
  });
});

// Cargar CV guardado al abrir popup
chrome.storage.local.get(['cvBase64','cvNombre','cvSize'], data => {
  if (data.cvBase64) setCVStatus(data.cvNombre || 'CV.pdf', data.cvSize || 0);
});
