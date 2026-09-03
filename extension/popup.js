// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// Mismo dominio que host_permissions/content_scripts en manifest.json.
// Cuando se compre el dominio propio, actualizar ambos archivos junto con background.js.
const BACKEND_URL = 'https://autopostula.vercel.app';

// ── Estado ─────────────────────────────────────────────────────
let incTags = [];
let excTags = [];
let locTags = [];
// Palabras clave, modalidad y jornada ya no se editan acá — vienen del dashboard
// web (/dashboard/filtros) vía /api/extension/perfil, igual que el resto del
// perfil. Esto es lo último que se trajo de ahí (o lo cacheado localmente).
let filtrosBusquedaRemoto = { modalidad: 'cualquiera', jornada: 'cualquiera' };
// Scorer local (docs/rediseno-filtrado-ofertas.md §6) -- apagado por defecto
// hasta que el propio backend diga que hay perfil compilado Y el flag activo.
let scorerRemoto = { usarScorerLocal: false, perfilCompilado: null, versionPerfil: 0 };
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
const locInput      = $('loc-input');
const locBtn        = $('loc-btn');
const locUsarComunaBtn = $('loc-usar-comuna-btn');
const filtroModalidadBadge = $('filtro-modalidad-badge');
const filtroJornadaBadge   = $('filtro-jornada-badge');
const filtrosEditarLink    = $('filtros-editar-link');
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
filtrosEditarLink.href = BACKEND_URL + '/dashboard/filtros';

const ETIQUETAS_MODALIDAD = { cualquiera: 'Cualquiera', remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };
const ETIQUETAS_JORNADA = { cualquiera: 'Cualquiera', full_time: 'Full time', part_time: 'Part time' };

function renderFiltrosBusqueda() {
  filtroModalidadBadge.textContent = ETIQUETAS_MODALIDAD[filtrosBusquedaRemoto.modalidad] || 'Cualquiera';
  filtroJornadaBadge.textContent = ETIQUETAS_JORNADA[filtrosBusquedaRemoto.jornada] || 'Cualquiera';
}

// ── Utilidades ─────────────────────────────────────────────────
function toast(msg, duration = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function uid() { return Date.now() + Math.random().toString(36).slice(2,6); }

// ── Tags ───────────────────────────────────────────────────────
// inc/exc son de solo lectura acá (vienen del dashboard) — solo loc sigue
// siendo editable directo desde el popup.
function renderTags() {
  renderTagsInto(incTagsEl, incTags, 'inc', true);
  renderTagsInto(excTagsEl, excTags, 'exc', true);
  renderTagsInto(locTagsEl, locTags, 'loc', false);
}

function renderTagsInto(container, list, type, soloLectura) {
  container.innerHTML = '';
  list.forEach((tag, i) => {
    const span = document.createElement('span');
    span.className = `tag ${type}`;
    span.innerHTML = soloLectura
      ? tag
      : `${tag} <button class="tag-x" data-i="${i}">×</button>`;
    container.appendChild(span);
  });
}

function addTag(type, val) {
  const v = val.trim().toLowerCase();
  if (!v) return;
  if (type === 'loc' && !locTags.includes(v)) { locTags.push(v); locInput.value = ''; }
  renderTags();
}

document.addEventListener('click', e => {
  if (!e.target.classList.contains('tag-x')) return;
  locTags.splice(+e.target.dataset.i, 1);
  renderTags();
});

locBtn.addEventListener('click', () => addTag('loc', locInput.value));
locInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag('loc', locInput.value); });
locUsarComunaBtn?.addEventListener('click', () => {
  const comuna = perfilRemoto?.comuna;
  if (!comuna) { toast('⚠ No tenemos tu comuna todavía — complétala en la web'); return; }
  addTag('loc', comuna);
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

    if (data.filtrosBusqueda) {
      incTags = data.filtrosBusqueda.palabrasIncluir || [];
      excTags = data.filtrosBusqueda.palabrasExcluir || [];
      filtrosBusquedaRemoto = {
        modalidad: data.filtrosBusqueda.modalidad || 'cualquiera',
        jornada: data.filtrosBusqueda.jornada || 'cualquiera',
      };
      renderTags();
      renderFiltrosBusqueda();
    }
    if (data.scorer) {
      scorerRemoto = data.scorer;
    }

    renderPerfilCard();
    guardarConfigLocal(); // persiste el perfil y los filtros recién traídos para que content.js los use ya mismo
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
    filtrosBusqueda: filtrosBusquedaRemoto,
    scorer: scorerRemoto,
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

    // Se avisa por chrome.runtime (canal privado de la extensión) en vez de un
    // CustomEvent de DOM — un evento de DOM lo puede disparar cualquier script
    // de la propia página (un aviso comprometido, un XSS del portal), lo que
    // dejaba activar el escaneo/postulación real sin que la persona lo pidiera.
    chrome.tabs.sendMessage(tabId, { type: 'FORCE_SCAN' }, () => {});
    toast('🔍 Escaneando...');
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
    filtrosBusquedaRemoto = cfg.filtrosBusqueda || { modalidad: 'cualquiera', jornada: 'cualquiera' };
    scorerRemoto = cfg.scorer || { usarScorerLocal: false, perfilCompilado: null, versionPerfil: 0 };

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
    renderFiltrosBusqueda();
    renderInfo();
    renderPerfilCard();
    actualizarStats(data.log || []);
  });
}

loadState();
