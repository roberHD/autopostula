// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Estado ─────────────────────────────────────────────────────
let incTags = [];
let excTags = [];
let locTags = [];
let jornadaSel = new Set(['part time','fines de semana','turno rotativo']);
let infoItems = [];   // [{id, texto}] — datos libres del candidato para que la IA los use como contexto

// ── Defaults precargados con el perfil de Roberto ──────────────
const DEFAULTS = {
  incTags: [],
  excTags: [],
  locTags: [],
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
const locTagsEl     = $('loc-tags');
const incInput      = $('inc-input');
const excInput      = $('exc-input');
const locInput      = $('loc-input');
const incBtn        = $('inc-btn');
const excBtn        = $('exc-btn');
const locBtn        = $('loc-btn');
const locUsarComunaBtn = $('loc-usar-comuna-btn');
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
  renderTagsInto(locTagsEl, locTags, 'loc');
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
  if (type === 'loc' && !locTags.includes(v)) { locTags.push(v); locInput.value = ''; }
  renderTags();
}

document.addEventListener('click', e => {
  if (!e.target.classList.contains('tag-x')) return;
  const i = +e.target.dataset.i, type = e.target.dataset.type;
  if (type === 'inc') incTags.splice(i, 1);
  else if (type === 'loc') locTags.splice(i, 1);
  else excTags.splice(i, 1);
  renderTags();
});

incBtn.addEventListener('click', () => addTag('inc', incInput.value));
excBtn.addEventListener('click', () => addTag('exc', excInput.value));
locBtn.addEventListener('click', () => addTag('loc', locInput.value));
incInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag('inc', incInput.value); });
excInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag('exc', excInput.value); });
locInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag('loc', locInput.value); });
locUsarComunaBtn?.addEventListener('click', () => {
  const comuna = $('p-comuna').value.trim();
  if (!comuna) { toast('Primero completa tu comuna en el perfil'); return; }
  addTag('loc', comuna);
});

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

    const tieneRespuestas = e.status === 'ok' && Array.isArray(e.respuestas) && e.respuestas.length > 0;

    div.innerHTML = `
      <span class="log-icon">${cfg.icon}</span>
      <div class="log-text">
        <div class="log-title" style="display:flex;align-items:center;gap:5px;">
          ${e.title || 'Oferta'}
          <span style="font-size:9px;font-weight:700;color:${cfg.color};background:${cfg.color}18;padding:1px 5px;border-radius:8px;">${cfg.label}</span>
          ${tieneRespuestas ? `<span class="log-expand-hint">Ver respuestas (${e.respuestas.length}) ↗</span>` : ''}
        </div>
        ${e.reason ? `<div class="log-reason">${e.reason}</div>` : ''}
        ${pendientesHtml}
      </div>
      <span class="log-time">${time}</span>
    `;

    if (tieneRespuestas) {
      div.classList.add('expandible');
      div.addEventListener('click', () => {
        const url = chrome.runtime.getURL('historial.html') + '?uid=' + encodeURIComponent(e.uid || '');
        chrome.tabs.create({ url });
      });
    }

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
    locTags,
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
      locTags,
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
    locTags = cfg.locTags || DEFAULTS.locTags;

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

function setCVStatus(nombre, size, tieneTexto) {
  const kb = Math.round((size || 0) / 1024);
  if (cvStatus) {
    cvStatus.innerHTML = tieneTexto
      ? '✅ <strong>' + nombre + '</strong> (' + kb + ' KB) — en texto plano, listo (ahorra tokens)'
      : '✅ <strong>' + nombre + '</strong> (' + kb + ' KB) — listo para usar con IA (aún en PDF, extrae los datos para ahorrar tokens)';
  }
  if (cvDropZone) { cvDropZone.style.borderColor = 'var(--success)'; cvDropZone.style.background = 'var(--success-s)'; }
  if (cvExtractBtn) cvExtractBtn.style.display = 'flex';
  if (cvClearBtn) cvClearBtn.style.display = 'block';
}

function clearCV() {
  chrome.storage.local.remove(['cvBase64','cvNombre','cvSize','cvTexto'], () => {
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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text:
              'Extrae la información de este CV y responde SOLO con un JSON válido con estos campos exactos:\n' +
              '{"nombre":"","email":"","tel":"","comuna":"","cargo":"","bio":"","cvTexto":""}\n' +
              '- nombre: nombre completo de la persona\n' +
              '- email: email de contacto\n' +
              '- tel: teléfono de contacto\n' +
              '- comuna: comuna o ciudad de residencia si aparece\n' +
              '- cargo: último cargo o cargo objetivo que busca\n' +
              '- bio: resumen profesional de 2-3 oraciones en primera persona\n' +
              '- cvTexto: transcribe en texto plano TODO el contenido relevante del CV para usarlo después en vez del PDF — experiencia laboral (empresa, cargo, período, funciones principales), educación, habilidades, certificaciones e idiomas. Usa \\n para separar líneas dentro del string. Sé completo pero no copies literalmente el diseño del PDF, solo el contenido en texto corrido.\n' +
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

    // Guardar el CV en texto plano — desde ahora la IA usa esto en vez de re-adjuntar el PDF
    // completo en cada pregunta del formulario (mucho más barato en tokens).
    if (perfil.cvTexto) {
      chrome.storage.local.set({ cvTexto: perfil.cvTexto });
    }

    chrome.storage.local.get(['cvNombre','cvSize'], d => {
      setCVStatus(d.cvNombre || 'CV.pdf', d.cvSize || 0, !!perfil.cvTexto);
    });
    toast(perfil.cvTexto ? '✨ Datos extraídos y CV guardado en texto (ahorra tokens)' : '✨ Datos extraídos del CV — revisa y guarda');

  } catch(e) {
    chrome.storage.local.get(['cvNombre','cvSize','cvTexto'], d => {
      setCVStatus(d.cvNombre || 'CV.pdf', d.cvSize || 0, !!d.cvTexto);
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
chrome.storage.local.get(['cvBase64','cvNombre','cvSize','cvTexto'], data => {
  if (data.cvBase64) setCVStatus(data.cvNombre || 'CV.pdf', data.cvSize || 0, !!data.cvTexto);
});

// ═══════════════════════════════════════════════════════════════
//  TU ESTILO PROFESIONAL — conversación + perfil profesional
// ═══════════════════════════════════════════════════════════════
const MAX_PREGUNTAS_ESTILO = 8;

const elInvitacion   = $('estilo-invitacion');
const elResumenBox   = $('estilo-resumen');
const elResumenTexto = $('estilo-resumen-texto');
const elChat         = $('estilo-chat');
const elMensajes     = $('estilo-mensajes');
const elProgreso     = $('estilo-progreso');
const elInputChat    = $('estilo-input');
const elTarjeta      = $('estilo-tarjeta');
const elEstrellas    = $('estilo-estrellas');
const elModificarBox = $('estilo-modificar-box');

let conversacionEstilo = [];   // [{role:'ia'|'user', texto}]
let perfilEstiloActual = null; // JSON generado, pendiente de confirmar
let estrellasElegidas = 0;

function estiloApiKey() {
  return apiKeyEl?.value?.trim() || '';
}

async function llamarClaudeTexto(prompt, maxTokens) {
  const key = estiloApiKey();
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
      max_tokens: maxTokens || 400,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  const texto = data.content && data.content[0] && data.content[0].text || '';
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Sin JSON en respuesta');
  return JSON.parse(jsonMatch[0]);
}

function transcriptEstilo() {
  return conversacionEstilo.map(m => (m.role === 'ia' ? 'IA: ' : 'Candidato: ') + m.texto).join('\n');
}

function agregarMensajeChat(role, texto) {
  conversacionEstilo.push({ role, texto });
  const div = document.createElement('div');
  div.className = 'estilo-msg ' + (role === 'ia' ? 'ia' : 'user');
  div.textContent = texto;
  elMensajes.appendChild(div);
  elMensajes.scrollTop = elMensajes.scrollHeight;
}

function mostrarEstado(nombre) {
  [elInvitacion, elResumenBox, elChat, elTarjeta].forEach(el => el && el.classList.add('hidden'));
  const map = { invitacion: elInvitacion, resumen: elResumenBox, chat: elChat, tarjeta: elTarjeta };
  if (map[nombre]) map[nombre].classList.remove('hidden');
}

async function iniciarConversacionEstilo() {
  if (!estiloApiKey()) { toast('⚠ Necesitas una API key para esta conversación'); return; }
  conversacionEstilo = [];
  elMensajes.innerHTML = '';
  mostrarEstado('chat');
  await pedirSiguientePregunta();
}

async function pedirSiguientePregunta() {
  const numPreguntas = conversacionEstilo.filter(m => m.role === 'ia').length;
  elProgreso.textContent = 'Pregunta ' + Math.min(numPreguntas + 1, MAX_PREGUNTAS_ESTILO) + ' de ~' + MAX_PREGUNTAS_ESTILO;

  if (numPreguntas >= MAX_PREGUNTAS_ESTILO) {
    await generarPerfilProfesional();
    return;
  }

  elInputChat.disabled = true;
  const prompt =
    'Estas en una conversacion breve con un candidato para armar su "perfil profesional", que se usara despues para escribir respuestas de postulaciones de trabajo que suenen como si el mismo las hubiera escrito.\n\n' +
    'Objetivo de la conversacion (guiate por esto, nunca se lo digas explicitamente al candidato):\n' +
    '1. Informacion profesional: que ha hecho, que sabe hacer, que busca.\n' +
    '2. Identidad profesional: que valora, como trabaja, que lo motiva.\n' +
    '3. Estilo de comunicacion -- esto NO se pregunta directamente, se OBSERVA en como escribe sus respuestas: si es breve o extenso, si da contexto antes de responder, si usa ejemplos concretos, si es formal o cercano, si usa lenguaje tecnico, si escribe con seguridad.\n\n' +
    'Reglas:\n' +
    '- Nunca hagas una pregunta que no vaya a cambiar como se redactaria una respuesta de postulacion (nada de test de personalidad, nada de "color favorito").\n' +
    '- Adapta la pregunta segun lo que ya sabes: si parece estudiante, pregunta distinto que si tiene anios de experiencia.\n' +
    '- Una pregunta a la vez, natural y conversacional -- no debe sentirse como llenar un formulario.\n' +
    '- Maximo ' + MAX_PREGUNTAS_ESTILO + ' preguntas en total. Si ya tienes suficiente informacion de las 3 dimensiones antes de llegar al maximo, marca terminado:true.\n\n' +
    (numPreguntas === 0
      ? 'Esta es la primera pregunta. Se calida y directa, algo como "que tipo de trabajo estas buscando ahora mismo".\n\n'
      : 'Historial de la conversacion hasta ahora:\n' + transcriptEstilo() + '\n\n') +
    'Responde SOLO JSON valido, sin texto adicional, sin markdown: {"pregunta":"","terminado":false}';

  try {
    const r = await llamarClaudeTexto(prompt, 300);
    if (r.terminado) {
      await generarPerfilProfesional();
    } else {
      agregarMensajeChat('ia', r.pregunta || '¿Puedes contarme un poco más sobre tu experiencia?');
      elInputChat.disabled = false;
      elInputChat.focus();
    }
  } catch (e) {
    agregarMensajeChat('ia', '⚠ Tuve un problema para seguir la conversación. Intenta de nuevo.');
    elInputChat.disabled = false;
  }
}

async function enviarRespuestaUsuario() {
  const texto = elInputChat.value.trim();
  if (!texto) return;
  agregarMensajeChat('user', texto);
  elInputChat.value = '';
  elInputChat.disabled = true;
  await pedirSiguientePregunta();
}

async function generarPerfilProfesional() {
  elProgreso.textContent = 'Armando tu perfil…';
  elInputChat.disabled = true;
  const prompt =
    'Con base en esta conversacion completa, arma el "Perfil Profesional" del candidato para usarlo despues al redactar respuestas de postulaciones laborales.\n\n' +
    'MUY IMPORTANTE: nunca digas "el candidato ES tal cosa". Describe siempre como vamos a REFLEJAR o TRANSMITIR estas caracteristicas en las respuestas -- es una lectura para efectos laborales, no una definicion de quien es la persona.\n\n' +
    'Conversacion completa:\n' + transcriptEstilo() + '\n\n' +
    'Responde SOLO con JSON valido, sin texto adicional, sin markdown, con esta forma exacta:\n' +
    '{"resumen":"","fortalezas":["",""],"objetivos":"","motivaciones":"","estilo":{"formalidad":"","longitud":"","cercania":"","nivelTecnico":"","seguridad":""},"confianza":80}\n' +
    '- resumen: 1-2 oraciones sobre su perfil profesional (experiencia principal, area)\n' +
    '- fortalezas: 3 a 5 fortalezas concretas que destacaremos en las postulaciones\n' +
    '- objetivos: su objetivo laboral en una frase\n' +
    '- motivaciones: que lo motiva profesionalmente, en una frase\n' +
    '- estilo.formalidad/cercania/seguridad: "Alta", "Media" o "Baja"\n' +
    '- estilo.longitud: "Corta", "Media" o "Larga"\n' +
    '- estilo.nivelTecnico: "Alto", "Medio" o "Bajo"\n' +
    '- confianza: numero de 0 a 100, que tan segura esta la lectura segun cuanta informacion real dio el candidato en la conversacion';

  try {
    const perfil = await llamarClaudeTexto(prompt, 500);
    perfilEstiloActual = perfil;
    mostrarTarjetaPerfil(perfil);
  } catch (e) {
    toast('⚠ No se pudo generar tu perfil. Intenta de nuevo.');
    mostrarEstado('invitacion');
  }
}

function mostrarTarjetaPerfil(perfil) {
  $('ec-resumen').textContent = perfil.resumen || '—';
  $('ec-fortalezas').innerHTML = (perfil.fortalezas || []).map(f => '<span class="estilo-chip">' + f + '</span>').join('');
  $('ec-objetivos').textContent = perfil.objetivos || '—';
  const e = perfil.estilo || {};
  $('ec-estilo').textContent =
    'Formalidad: ' + (e.formalidad||'—') + ' · Longitud: ' + (e.longitud||'—') + ' · Cercanía: ' + (e.cercania||'—') +
    ' · Nivel técnico: ' + (e.nivelTecnico||'—') + ' · Seguridad: ' + (e.seguridad||'—');
  $('ec-confianza').textContent = (perfil.confianza != null ? perfil.confianza : '—') + '%';

  estrellasElegidas = 0;
  renderEstrellas();
  elModificarBox.classList.add('hidden');
  mostrarEstado('tarjeta');
}

function renderEstrellas() {
  elEstrellas.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    if (i <= estrellasElegidas) s.classList.add('on');
    s.addEventListener('click', () => { estrellasElegidas = i; renderEstrellas(); });
    elEstrellas.appendChild(s);
  }
}

function mostrarResumenGuardado(perfil) {
  const e = perfil.estilo || {};
  elResumenTexto.innerHTML =
    '<strong>' + (perfil.resumen || '') + '</strong><br>' +
    (perfil.fortalezas || []).map(f => '<span class="estilo-chip">' + f + '</span>').join('') + '<br>' +
    'Tono: ' + (e.formalidad||'—') + ' / ' + (e.cercania||'—') + ' · Confianza: ' + (perfil.confianza != null ? perfil.confianza : '—') + '%';
  mostrarEstado('resumen');
}

function guardarPerfilConfirmado(perfil, confirmado) {
  const registro = { ...perfil, confirmado, calificacion: estrellasElegidas, fecha: Date.now() };
  chrome.storage.local.set({ estiloProfesional: registro }, () => {
    perfilEstiloActual = registro;
    if (confirmado) {
      toast('✅ Perfil guardado — la IA lo usará en tus postulaciones');
      mostrarResumenGuardado(registro);
    }
  });
}

// Eventos
$('estilo-empezar-btn')?.addEventListener('click', iniciarConversacionEstilo);
$('estilo-editar-btn')?.addEventListener('click', () => {
  if (perfilEstiloActual) mostrarTarjetaPerfil(perfilEstiloActual);
  else iniciarConversacionEstilo();
});
$('estilo-send-btn')?.addEventListener('click', enviarRespuestaUsuario);
elInputChat?.addEventListener('keydown', e => { if (e.key === 'Enter' && !elInputChat.disabled) enviarRespuestaUsuario(); });

$('estilo-ok-btn')?.addEventListener('click', () => guardarPerfilConfirmado(perfilEstiloActual, true));

$('estilo-modificar-btn')?.addEventListener('click', () => {
  elModificarBox.classList.remove('hidden');
  $('estilo-modificar-input')?.focus();
});

$('estilo-modificar-send')?.addEventListener('click', async () => {
  const correccion = $('estilo-modificar-input').value.trim();
  if (!correccion) return;
  toast('Actualizando tu perfil…');
  const prompt =
    'Este es el perfil profesional actual generado para un candidato, para usarlo al redactar respuestas de postulaciones laborales:\n' +
    JSON.stringify(perfilEstiloActual) + '\n\n' +
    'El candidato dice que quiere cambiar lo siguiente: "' + correccion + '"\n\n' +
    'Genera una version actualizada del mismo JSON (misma forma exacta), incorporando ese cambio. ' +
    'Recuerda: nunca digas "el candidato ES tal cosa", describe como se va a REFLEJAR en las respuestas. ' +
    'Responde SOLO JSON valido, sin texto adicional, sin markdown.';
  try {
    const actualizado = await llamarClaudeTexto(prompt, 500);
    perfilEstiloActual = actualizado;
    $('estilo-modificar-input').value = '';
    mostrarTarjetaPerfil(actualizado);
  } catch (e) {
    toast('⚠ No se pudo actualizar el perfil');
  }
});

$('estilo-rehacer-btn')?.addEventListener('click', () => {
  if (confirm('¿Quieres volver a hacer la conversación desde el principio?')) {
    iniciarConversacionEstilo();
  }
});

// Cargar estado guardado al abrir el popup
chrome.storage.local.get(['estiloProfesional'], data => {
  const p = data.estiloProfesional;
  if (p && p.confirmado) {
    perfilEstiloActual = p;
    mostrarResumenGuardado(p);
  } else if (p) {
    perfilEstiloActual = p;
    mostrarTarjetaPerfil(p);
  } else {
    mostrarEstado('invitacion');
  }
});