// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// TODO: cuando despliegues a producción, cambia esto por tu dominio real
// (el mismo que agregues en manifest.json para bridge.js).
const BACKEND_URL = 'http://localhost:3000';

// ── Estado ─────────────────────────────────────────────────────
let incTags = [];
let excTags = [];
let locTags = [];
let jornadaSel = new Set(['part time','fines de semana','turno rotativo']);
let infoItems = [];   // [{id, texto}] — datos libres del candidato para que la IA los use como contexto

// Perfil traído automáticamente desde la cuenta web (vía token) — reemplaza
// al formulario que antes había que llenar a mano acá en el popup.
// Forma: {nombre, email, tel, comuna, cargo, renta, disp, bio} — mismos
// nombres cortos que ya esperan content.js y los prompts del backend.
let perfilRemoto = null;
let cvTextoCache = '';

const DEFAULTS = {
  incTags: [],
  excTags: [],
  locTags: [],
  jornada: ['part time'],
  info: []
};

// ── DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const headerSub     = $('header-sub');
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
const infoListEl    = $('info-list');
const infoInput     = $('info-input');
const infoBtn       = $('info-btn');
const perfilCardEl  = $('perfil-card');
const perfilRefreshBtn = $('perfil-refresh-btn');
const perfilEditarLink = $('perfil-editar-link');
const saveBtn       = $('save-btn');
const openCtBtn     = $('open-ct-btn');
const toastEl       = $('toast');

perfilEditarLink.href = BACKEND_URL + '/dashboard/perfil';

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
  const comuna = perfilRemoto?.comuna;
  if (!comuna) { toast('⚠ No tenemos tu comuna todavía — complétala en la web'); return; }
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

// ── Perfil (solo lectura, viene de la cuenta web) ────────────────
function renderPerfilCard() {
  const hayDatos = perfilRemoto && (perfilRemoto.nombre || perfilRemoto.comuna || perfilRemoto.cargo);
  if (!hayDatos) {
    perfilCardEl.innerHTML = tokenActual
      ? '<span class="vacio">Todavía no hay datos — completa tu perfil en la web y presiona "Actualizar".</span>'
      : '<span class="vacio">Conecta tu cuenta más abajo para traer tu perfil automáticamente.</span>';
    return;
  }
  const linea2 = [perfilRemoto.cargo, perfilRemoto.comuna].filter(Boolean).join(' · ');
  perfilCardEl.innerHTML =
    '<div><b>' + (perfilRemoto.nombre || 'Sin nombre en tu perfil') + '</b></div>' +
    (linea2 ? '<div>' + linea2 + '</div>' : '') +
    '<div style="margin-top:4px;font-size:11px;">CV: ' +
      (cvTextoCache ? '✅ cargado' : '<span class="vacio">sin subir todavía</span>') +
    '</div>';
}

async function cargarPerfilRemoto(mostrarToast) {
  const { autopostulaToken } = await new Promise(r => chrome.storage.sync.get('autopostulaToken', r));
  if (!autopostulaToken) {
    if (mostrarToast) toast('⚠ Todavía no está conectada tu cuenta web');
    return;
  }
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/perfil', {
      headers: { 'Authorization': 'Bearer ' + autopostulaToken }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    perfilRemoto = {
      nombre: data.nombre || '',
      email:  data.email || '',
      tel:    data.telefono || '',
      comuna: data.comuna || '',
      cargo:  data.cargoObjetivo || '',
      renta:  data.expectativaRenta || '',
      disp:   data.disponibilidad || '',
      bio:    data.resumenProfesional || '',
    };
    cvTextoCache = data.textoExtraido || '';
    if (cvTextoCache) chrome.storage.local.set({ cvTexto: cvTextoCache });
    else chrome.storage.local.remove('cvTexto');

    renderPerfilCard();
    guardarConfigLocal(); // persiste el perfil recién traído para que content.js lo use ya mismo
    if (mostrarToast) toast('✓ Perfil actualizado desde la web');
  } catch (e) {
    // Sin conexión o backend caído: seguimos con lo último guardado localmente,
    // no rompemos el flujo de postulación por esto.
    if (mostrarToast) toast('⚠ No se pudo actualizar — usando los últimos datos guardados');
  }
}

perfilRefreshBtn.addEventListener('click', () => cargarPerfilRemoto(true));

// ── Token de la cuenta web ────────────────────────────────────
let tokenActual = null;

const apTokenInput      = $('ap-token');
const apTokenEye        = $('ap-token-eye');
const apTokenSaveBtn    = $('ap-token-save');
const apTokenDot        = $('ap-token-dot');
const apTokenStatusText = $('ap-token-status-text');
const apTokenMostrarManualBtn = $('ap-token-mostrar-manual');
const apTokenManualBox  = $('ap-token-manual');

function actualizarEstadoToken(hayToken) {
  apTokenDot.className = 'dot' + (hayToken ? ' ok' : '');
  apTokenStatusText.textContent = hayToken
    ? 'Conectada — tus postulaciones se guardan en la web'
    : 'Sin conectar — conéctala desde el onboarding de la web';
}

chrome.storage.sync.get('autopostulaToken', (d) => {
  tokenActual = d.autopostulaToken || null;
  actualizarEstadoToken(!!tokenActual);
  if (tokenActual) cargarPerfilRemoto(false);
  else renderPerfilCard();
});

apTokenMostrarManualBtn.addEventListener('click', () => {
  apTokenManualBox.classList.toggle('hidden');
});

apTokenEye.addEventListener('click', () => {
  apTokenInput.type = apTokenInput.type === 'password' ? 'text' : 'password';
});

apTokenSaveBtn.addEventListener('click', () => {
  const valor = apTokenInput.value.trim();
  chrome.storage.sync.set({ autopostulaToken: valor || null }, () => {
    tokenActual = valor || null;
    actualizarEstadoToken(!!tokenActual);
    if (tokenActual) {
      cargarPerfilRemoto(true);
      apTokenManualBox.classList.add('hidden');
      apTokenInput.value = '';
    }
  });
});

// Si bridge.js conecta el token mientras el popup está abierto (poco frecuente,
// pero puede pasar si el usuario tiene la pestaña de onboarding y el popup a
// la vez), reflejarlo sin que el usuario tenga que cerrar y volver a abrir.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.autopostulaToken) {
    tokenActual = changes.autopostulaToken.newValue || null;
    actualizarEstadoToken(!!tokenActual);
    if (tokenActual) cargarPerfilRemoto(false);
  }
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

// ── Stats (a partir del log guardado — ya no se muestra la lista completa) ──
function actualizarStats(entries) {
  if (!entries?.length) {
    statTotal.textContent = 0; statHoy.textContent = 0; statOk.textContent = 0;
    return;
  }
  const today = new Date().toDateString();
  let hoy = 0, ok = 0;
  entries.forEach(e => {
    if (new Date(e.ts).toDateString() === today) hoy++;
    if (e.status === 'ok') ok++;
  });
  statTotal.textContent = entries.length;
  statHoy.textContent = hoy;
  statOk.textContent = ok;
}

// ── Guardar ────────────────────────────────────────────────────
function construirConfig(activeOverride) {
  return {
    active: activeOverride ?? toggleMain.checked,
    incTags,
    excTags,
    locTags,
    jornada: [...jornadaSel],
    info: infoItems,
    modoRevision: document.getElementById('toggle-revision')?.checked || false,
    usarIAFiltros: document.getElementById('toggle-ia-filtros')?.checked || false,
    perfil: perfilRemoto || {},
  };
}

function guardarConfigLocal() {
  chrome.storage.local.set({ config: construirConfig() });
}

saveBtn.addEventListener('click', () => {
  const config = construirConfig();
  chrome.storage.local.set({ config }, () => {
    // Notificar a TODAS las pestañas de Computrabajo abiertas con la nueva config
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

    const config = construirConfig(true);
    await new Promise(r => chrome.storage.local.set({ config, active: true }, r));

    // Disparar evento custom en el DOM — el content script lo escucha
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          if (window._apReset) window._apReset();
          document.dispatchEvent(new CustomEvent('autopostula-scan'));
        }
      });
      toast('🔍 Escaneando...');
    } catch(e) {
      chrome.tabs.sendMessage(tabId, { type: 'FORCE_SCAN' }, () => {});
      toast('🔍 Escaneando...');
    }
  });
});

// ── Escuchar actualizaciones del content script ────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'LOG_UPDATED') actualizarStats(msg.log);
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
  chrome.storage.local.get(['config', 'active', 'log', 'cvTexto'], data => {
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

    // Perfil cacheado localmente (de la última vez que se trajo desde la web) —
    // se muestra de inmediato mientras cargarPerfilRemoto() intenta refrescarlo.
    if (cfg.perfil && (cfg.perfil.nombre || cfg.perfil.comuna || cfg.perfil.cargo)) {
      perfilRemoto = cfg.perfil;
    }
    cvTextoCache = data.cvTexto || '';
    if (cfg.perfil?.nombre) headerSub.textContent = cfg.perfil.nombre + ' · Computrabajo';

    const toggleRevision = document.getElementById('toggle-revision');
    const toggleIAFiltros = document.getElementById('toggle-ia-filtros');
    if (toggleRevision) toggleRevision.checked = cfg.modoRevision || false;
    if (toggleIAFiltros) toggleIAFiltros.checked = cfg.usarIAFiltros || false;

    const active = data.active ?? cfg.active ?? false;
    toggleMain.checked = active;
    setActiveUI(active);

    renderTags();
    renderInfo();
    renderPerfilCard();
    actualizarStats(data.log || []);
  });
}

loadState();
