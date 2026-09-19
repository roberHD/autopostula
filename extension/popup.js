// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// Mismo dominio que host_permissions/content_scripts en manifest.json.
// Cuando se compre el dominio propio, actualizar ambos archivos junto con background.js.
const BACKEND_URL = 'https://autopostula.cl';

// ── Estado ─────────────────────────────────────────────────────
// Modalidad y jornada mostradas acá SIEMPRE salen del perfil compilado
// (scorerRemoto.perfilCompilado) -- docs/revision-2026-09-16.md §1.4 sacó
// los campos viejos (SearchPreferences.modalidad/jornada, que solo usaba el
// filtro viejo) de la página de Filtros, así que ya no hay nada editable que
// leer ahí. Sin perfil compilado todavía, se muestra "Cualquiera".
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
// Red de seguridad por cuenta (docs/revision-2026-09-16.md §1.2) -- true por
// defecto para no bloquear a alguien que abre el popup sin conexión o con un
// backend viejo que todavía no manda este campo; solo se pone en false
// cuando /api/extension/perfil lo dice explícito.
let postulacionHabilitadaRemoto = true;

const DEFAULTS = {
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

    if (data.scorer) {
      scorerRemoto = data.scorer;
      const compilado = scorerRemoto.perfilCompilado;
      filtrosBusquedaRemoto = {
        modalidad: compilado?.modalidad || 'cualquiera',
        jornada: compilado?.jornada || 'cualquiera',
      };
      renderFiltrosBusqueda();
    }
    postulacionHabilitadaRemoto = data.postulacionHabilitada !== false;

    renderPerfilCard();
    renderModoPrueba();
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
    // Antes solo miraba computrabajo.cl -- el toggle maestro no avisaba al
    // content script si la pestaña activa era de Laborum (y ahora Trabajando),
    // así que activar/desactivar desde ahí no surtía efecto hasta el próximo
    // load. Portales conocidos (ver extension/manifest.json content_scripts).
    if (/computrabajo\.(cl|com)|laborum\.cl|trabajando\.cl/.test(tabs[0]?.url || '')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE', active }).catch(() => {});
    }
  });
});

function setActiveUI(active) {
  if (active) {
    pulse.className = 'pulse active';
    pulseLabel.className = 'pulse-label active';
    pulseLabel.textContent = 'Activo';
    toggleHint.textContent = 'Escaneando ofertas…';
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
    filtrosBusqueda: filtrosBusquedaRemoto,
    scorer: scorerRemoto,
    info: infoItems,
    modoRevision: document.getElementById('toggle-revision')?.checked || false,
    soloObservar: document.getElementById('toggle-observar')?.checked || false,
    postulacionHabilitada: postulacionHabilitadaRemoto,
    perfil: perfilRemoto || {},
  };
}

// docs/revision-2026-09-16.md §1.2: cuenta en modo prueba -- el toggle de
// "solo observar" se ve marcado y bloqueado. El freno real vive en la cuenta
// (AP.soloObservarEfectivo, en el content script, ya lo exige igual aunque
// alguien lograra destildarlo); esto es solo para que el popup no mienta
// mostrando un switch editable que no cambiaría nada.
function renderModoPrueba() {
  const toggleObservar = document.getElementById('toggle-observar');
  const observarHint = document.getElementById('observar-hint');
  if (!toggleObservar) return;
  toggleObservar.disabled = !postulacionHabilitadaRemoto;
  if (!postulacionHabilitadaRemoto) {
    toggleObservar.checked = true;
    actualizarModoObservar(true);
    if (observarHint) observarHint.textContent = 'Tu cuenta está en modo prueba — actívala desde el panel';
  }
}

// docs/modo-solo-observar.md §3.4/§4.4: mientras el modo esté puesto, "revisar
// antes de enviar" se atenúa (no hay nada que revisar si no se envía nada) y
// el hint de observar deja explícito que está mandando por sobre revisión.
function actualizarModoObservar(activo) {
  const opcionRevision = document.getElementById('opcion-revision');
  const revisionHint = document.getElementById('revision-hint');
  const observarHint = document.getElementById('observar-hint');
  if (opcionRevision) opcionRevision.classList.toggle('opcion-atenuada', activo);
  if (revisionHint) revisionHint.textContent = activo
    ? 'No aplica mientras "solo observar" esté activo'
    : 'Muestra las respuestas y pide confirmación';
  if (observarHint) observarHint.textContent = activo
    ? 'Activo — no se va a enviar ninguna postulación'
    : 'Escanea y puntúa, pero no postula ni gasta cupo';
}
function guardarConfigLocal() {
  chrome.storage.local.set({ config: construirConfig() });
}

// Persiste la config y avisa a TODAS las pestañas abiertas de cualquier portal
// soportado -- antes solo cubría Computrabajo, así que Laborum (y ahora
// Trabajando) se quedaban con la config vieja hasta el próximo load de esa
// pestaña.
function guardarYAvisar(mostrarToast) {
  const config = construirConfig();
  chrome.storage.local.set({ config }, () => {
    chrome.tabs.query({
      url: [
        '*://*.computrabajo.com/*', '*://*.computrabajo.cl/*',
        '*://*.laborum.cl/*', '*://*.trabajando.cl/*',
      ],
    }, tabs => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, { type: 'CONFIG_UPDATED', config }).catch(() => {}));
    });
    if (mostrarToast) toast('✓ Cambios guardados');
  });
}

// Bug real (2026-09-14): estos tres switches solo actualizaban el DOM (el
// hint de texto) -- la config real quedaba sin guardar y sin avisarle a las
// pestañas abiertas hasta que alguien apretaba "Guardar cambios" más abajo.
// El toggle maestro "Activo" sí aplica al instante, así que quien apagaba
// "Solo observar" acá y no se acordaba de guardar, seguía viendo el
// comportamiento de antes -- exactamente como si el toggle nunca hubiera
// funcionado. Ahora los tres guardan y avisan de inmediato, igual que el
// toggle maestro.
document.getElementById('toggle-observar')?.addEventListener('change', (e) => {
  actualizarModoObservar(e.target.checked);
  guardarYAvisar(false);
});
document.getElementById('toggle-revision')?.addEventListener('change', () => guardarYAvisar(false));

saveBtn.addEventListener('click', () => guardarYAvisar(true));

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

// ── Última puesta al día (docs/rafagas-y-ponerse-al-dia.md §3.5) ────────
// textoRafaga y haceCuanto son puras a propósito (sin DOM ni chrome.*):
// verificar-rafagas.js las extrae de este archivo y las prueba tal cual.
function haceCuanto(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace unos segundos';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : 'hace ' + d + ' días';
}

// Devuelve { titulo, detalle } o null si no hay nada que mostrar. "Te pusimos
// al día hace 12 min" + "7 postulaciones · 14 descartadas". En modo solo
// observar nada se postuló, y decir "0 postulaciones" sería mentir por
// omisión: se cuenta lo que HABRÍA postulado.
function textoRafaga(rafaga, ahora) {
  if (!rafaga || !rafaga.estado) return null;

  // Mismo umbral que retomarORafagaInterrumpida (background.js): un "en_curso"
  // sin latido reciente es una ráfaga que el service worker perdió sin llegar
  // a marcarla -- decir que se está poniendo al día sería mentira, así que se
  // muestra como lo que va a terminar siendo: interrumpida.
  const LATIDO_MAX_MS = 10 * 60000;
  const viva = rafaga.estado === 'en_curso' && ahora - (rafaga.latido || rafaga.inicio) < LATIDO_MAX_MS;
  if (viva) {
    const total = (rafaga.pasos || []).length;
    const paso = Math.min((rafaga.pasoActual || 0) + 1, total);
    return { titulo: 'Poniéndose al día ahora…', detalle: total ? 'Paso ' + paso + ' de ' + total : '' };
  }
  const estado = rafaga.estado === 'en_curso' ? 'interrumpida' : rafaga.estado;

  const c = rafaga.conteos || {};
  const postuladas = c.postuladas || 0;
  const observadas = c.observadas || 0;
  const partes = [];
  if (postuladas === 0 && observadas > 0) partes.push('habría postulado a ' + observadas);
  else partes.push(postuladas + (postuladas === 1 ? ' postulación' : ' postulaciones'));
  if (c.gris > 0) partes.push(c.gris + ' por decidir');
  if (c.descartadas > 0) partes.push(c.descartadas + (c.descartadas === 1 ? ' descartada' : ' descartadas'));
  // Una búsqueda que no terminó (venció el seguro de tiempo) se dice, no se
  // esconde: si no, "0 postulaciones" parece "no había nada" y era "no llegó".
  if (c.errores > 0) partes.push(c.errores + (c.errores === 1 ? ' búsqueda no terminó' : ' búsquedas no terminaron'));

  const cuando = haceCuanto(ahora - (rafaga.fin || rafaga.latido || rafaga.inicio));
  const titulo = estado === 'interrumpida'
    ? 'La última puesta al día se cortó ' + cuando
    : 'Te pusimos al día ' + cuando;
  return { titulo, detalle: partes.join(' · ') };
}

function renderRafaga(rafaga) {
  const fila = document.getElementById('rafaga-row');
  if (!fila) return;
  const texto = textoRafaga(rafaga, Date.now());
  fila.classList.toggle('hidden', !texto);
  if (!texto) return;
  document.getElementById('rafaga-titulo').textContent = texto.titulo;
  const detalle = document.getElementById('rafaga-detalle');
  detalle.textContent = texto.detalle;
  detalle.classList.toggle('hidden', !texto.detalle);
}

// ── "Ponerme al día ahora" (docs/rafagas-y-ponerse-al-dia.md §3.6) ─────────
// Los textos son los mismos que en el panel (backend/lib/texto-rafaga.ts): la
// persona ve el botón en los dos lados y tienen que explicar lo mismo.
// verificar-rafagas.js compara este archivo contra ese.

// "unos 8 minutos". No promete un número de ofertas: no se sabe cuántas hay
// hasta escanear -- solo cuánto suele tardar, que sí se sabe.
function duracionAproximada(ms) {
  if (!ms || ms <= 0) return 'unos minutos';
  if (ms < 60000) return 'menos de un minuto';
  const min = Math.round(ms / 60000);
  if (min === 1) return 'un minuto';
  if (min >= 60) return 'más de una hora';
  return 'unos ' + min + ' minutos';
}

function textoEstimadoPonerse(ms) {
  return ms ? 'Suele tardar ' + duracionAproximada(ms) + '.' : 'Puede tardar unos minutos.';
}

// Por qué no arrancó. Las claves son las que devuelve background.js.
const MOTIVOS_PONERSE_AL_DIA = {
  en_curso: 'Ya se está poniendo al día. Te avisamos en el ícono de la extensión.',
  reciente: 'Te pusimos al día hace muy poco. Vuelve a intentarlo en unos minutos.',
  sin_plan: 'Ponerte al día ahora es parte de Premium.',
  pausada: 'La búsqueda automática está en pausa. Reanúdala desde tu panel.',
  sin_cupo: 'Ya usaste tus postulaciones de este mes. Se reinicia el día 1.',
  sin_portales: 'Conecta un portal para empezar.',
  sin_objetivo: 'Cuéntanos qué buscas, en tu panel, para poder empezar.',
  sin_token: 'Conecta la extensión con tu cuenta desde tu panel.',
  sin_conexion: 'No pudimos consultar tu cuenta. Revisa tu conexión e inténtalo de nuevo.',
  extension_no_responde: 'La extensión no respondió. Recarga esta página e inténtalo de nuevo.',
};
const MOTIVO_GENERICO_PONERSE = 'No se pudo poner al día ahora. Inténtalo de nuevo en unos minutos.';
const TEXTO_EMPEZO_PONERSE = 'Empezó. Puedes cerrar esto: te avisamos en el ícono de la extensión.';

// Estos motivos pueden pasar (mala conexión, un worker que se reinició): tiene
// sentido dejar volver a apretar. Los demás no cambian por apretar de nuevo.
const MOTIVOS_REINTENTABLES_PONERSE = ['sin_conexion', 'extension_no_responde'];

function textoMotivoPonerse(motivo) {
  return (motivo && MOTIVOS_PONERSE_AL_DIA[motivo]) || MOTIVO_GENERICO_PONERSE;
}

// { deshabilitado, hint } o null si la fila no se muestra: en una cuenta
// gratis el botón ni aparece (§3.6). Bloqueado se ve, deshabilitado, con la
// razón debajo -- más útil que esconderlo y dejar a la persona sin saber qué
// hacer. Habilitado dice cuánto suele tardar.
function estadoBotonPonerse(estado) {
  if (!estado || !estado.mostrar) return null;
  if (estado.bloqueo) return { deshabilitado: true, hint: textoMotivoPonerse(estado.bloqueo) };
  return { deshabilitado: false, hint: textoEstimadoPonerse(estado.estimadoMs) };
}

function renderPonerse(estado) {
  const fila = document.getElementById('ponerse-row');
  if (!fila) return;
  const e = estadoBotonPonerse(estado);
  fila.classList.toggle('hidden', !e);
  if (!e) return;
  document.getElementById('ponerse-btn').disabled = e.deshabilitado;
  document.getElementById('ponerse-hint').textContent = e.hint;
}

function cargarEstadoPonerse() {
  try {
    chrome.runtime.sendMessage({ type: 'ESTADO_PONERSE_AL_DIA' }, (estado) => {
      if (chrome.runtime.lastError) return; // el worker no contestó: la fila queda como estaba
      renderPonerse(estado);
    });
  } catch (e) { /* popup sin runtime (no debería pasar) */ }
}

function apretarPonerse() {
  const boton = document.getElementById('ponerse-btn');
  const hint = document.getElementById('ponerse-hint');
  if (!boton || !hint) return;
  boton.disabled = true;
  hint.textContent = 'Empezando…';
  chrome.runtime.sendMessage({ type: 'PONERSE_AL_DIA' }, (respuesta) => {
    if (chrome.runtime.lastError || !respuesta) {
      hint.textContent = textoMotivoPonerse('extension_no_responde');
      boton.disabled = false;
      return;
    }
    if (respuesta.ok) {
      hint.textContent = TEXTO_EMPEZO_PONERSE;
      return; // queda deshabilitado: ya está corriendo
    }
    hint.textContent = textoMotivoPonerse(respuesta.motivo);
    boton.disabled = !MOTIVOS_REINTENTABLES_PONERSE.includes(respuesta.motivo);
  });
}

// El número del ícono (background.js) dice "pasó algo"; abrir el popup es
// verlo, así que se limpia. La línea de arriba sigue contando la última
// ráfaga aunque el número ya no esté.
function limpiarInsigniaRafaga() {
  try { chrome.action.setBadgeText({ text: '' }); } catch (e) { /* sin chrome.action (no debería pasar) */ }
}

// Si una ráfaga termina con el popup abierto, se actualiza sola la línea y
// el número que acaba de aparecer se limpia: la persona ya lo está mirando.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rafaga) {
    renderRafaga(changes.rafaga.newValue);
    limpiarInsigniaRafaga();
    // Cada paso de una ráfaga en curso también cambia `rafaga`, pero el botón
    // solo tiene algo nuevo que decir cuando terminó (vuelve el enfriamiento).
    const nueva = changes.rafaga.newValue;
    if (nueva && nueva.estado !== 'en_curso') cargarEstadoPonerse();
  }
});

// ── Cargar estado ──────────────────────────────────────────────
document.getElementById('ponerse-btn')?.addEventListener('click', apretarPonerse);

function loadState() {
  chrome.storage.local.get(['config', 'active', 'log', 'cvTexto', 'rafaga'], data => {
    renderRafaga(data.rafaga);
    limpiarInsigniaRafaga();
    cargarEstadoPonerse();
    const cfg = data.config || {};

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
    if (cfg.perfil?.nombre) headerSub.textContent = cfg.perfil.nombre;

    const toggleRevision = document.getElementById('toggle-revision');
    const toggleObservar = document.getElementById('toggle-observar');
    if (toggleRevision) toggleRevision.checked = cfg.modoRevision || false;
    if (toggleObservar) toggleObservar.checked = cfg.soloObservar || false;
    actualizarModoObservar(cfg.soloObservar || false);
    // Cacheado localmente -- cargarPerfilRemoto() lo refresca abajo apenas
    // resuelva el fetch. Sin esto, abrir el popup mostraba el switch como
    // editable por un instante aunque la cuenta estuviera en modo prueba.
    postulacionHabilitadaRemoto = cfg.postulacionHabilitada !== false;
    renderModoPrueba();

    const active = data.active ?? cfg.active ?? false;
    toggleMain.checked = active;
    setActiveUI(active);

    renderFiltrosBusqueda();
    renderInfo();
    renderPerfilCard();
    actualizarStats(data.log || []);
  });
}

loadState();
