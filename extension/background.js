// ═══════════════════════════════════════════════════════════════
//  AutoPostula — background.js v2
// ═══════════════════════════════════════════════════════════════
'use strict';

console.log('[AP] background.js cargado', new Date().toLocaleTimeString());

// TODO: cuando despliegues a producción, cambia esto por tu dominio real
// (el mismo que agregues en manifest.json para bridge.js y host_permissions).
const BACKEND_URL = 'http://localhost:3000';

let queue = [];
let busy  = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processQueue() {
  if (busy || !queue.length) return;
  busy = true;
  while (queue.length) {
    const { url, titulo } = queue.shift();
    await applyInTab(url, titulo);
    await sleep(5000);
  }
  busy = false;
}

function applyInTab(url, titulo) {
  return new Promise(resolve => {
    chrome.tabs.create({ url, active: false }, tab => {
      const id = tab.id;
      const onUpdated = (tabId, info) => {
        if (tabId !== id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        setTimeout(() => {
          chrome.tabs.sendMessage(id, { type: 'DO_APPLY' }, res => {
            if (chrome.runtime.lastError) { /* tab cerrada o sin content script */ }
            setTimeout(() => {
              chrome.tabs.remove(id, () => { if(chrome.runtime.lastError){} });
              resolve(res?.success || false);
            }, 3500);
          });
        }, 3000);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      // Timeout de seguridad
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(id, () => {});
        resolve(false);
      }, 35000);
    });
  });
}

// ── Llamadas a la IA del backend (con nuestra key, no la del usuario) ──
// Mismo motivo que reportarPostulacionBackend: corre acá porque el background
// tiene privilegios de extensión y no lo bloquea CORS.
const RUTA_POR_TIPO = {
  clasificar_ofertas: '/api/ai/clasificar-ofertas',
  analizar_oferta: '/api/ai/analizar-oferta',
  responder_pregunta: '/api/ai/responder-pregunta'
};

async function llamarIABackend(tipo, payload) {
  const ruta = RUTA_POR_TIPO[tipo];
  if (!ruta) return null;

  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — la IA no está disponible');
    return null;
  }

  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), 25000);

  try {
    const res = await fetch(BACKEND_URL + ruta, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controlador.signal
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn('[AP] IA rechazada por el backend (' + tipo + '):', data.error || res.status);
      return { error: data.error || ('Error ' + res.status) };
    }

    return data;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.warn('[AP] Timeout de 25s llamando a la IA del backend (' + tipo + ') — el service worker probablemente se durmió o la petición nunca llegó al servidor.');
      return { error: 'La IA no respondió a tiempo (timeout)' };
    }
    console.warn('[AP] Error de red llamando a la IA del backend (' + tipo + '):', e);
    return { error: 'Error de red: ' + e.message };
  }
}

// ── Actualizar estado de postulación (visto/en proceso/etc) ────
async function actualizarEstadoBackend(datos) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — no se actualizó el estado');
    return { error: 'Sin token' };
  }

  try {
    const res = await fetch(BACKEND_URL + '/api/applications/status', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(datos)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn('[AP] Backend rechazó actualización de estado:', data.error || res.status);
      return { error: data.error || ('Error ' + res.status) };
    }

    return data;
  } catch (e) {
    console.warn('[AP] Error de red actualizando estado:', e);
    return null;
  }
}

// ── Búsqueda automática en background (premium) ─────────────────
// Requiere el permiso "alarms" en manifest.json.
const NOMBRE_ALARMA_AUTOMATICA = 'autopostula-scan';
const INTERVALO_MINUTOS = 120; // cada 2 horas

// Envuelto en try/catch: si el permiso "alarms" llegara a faltar en el manifest,
// esto no debe tumbar el resto del script (y con eso, dejar de registrar los
// listeners de mensajes más abajo, como AI_CALL).
try {
  chrome.alarms.create(NOMBRE_ALARMA_AUTOMATICA, { periodInMinutes: INTERVALO_MINUTOS });
} catch (e) {
  console.error('[AP] No se pudo crear la alarma de búsqueda automática (¿falta el permiso "alarms"?):', e);
}

function normalizarParaUrl(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Un builder de URL por portal — mismo cargoObjetivo, distinta forma de armar
// la búsqueda en cada sitio. Si sumas un portal nuevo más adelante, agrégalo
// acá (y agrega su adaptador correspondiente en extension/adapters/).
const URL_BUSQUEDA_POR_PORTAL = {
  'Computrabajo': (slug) => 'https://cl.computrabajo.com/trabajo-de-' + slug,
  'Laborum': (slug) => 'https://www.laborum.cl/empleos-busqueda-' + slug + '.html',
};

// Trae los filtros de búsqueda (palabras, modalidad, jornada) del dashboard y
// los guarda en la config local, para que la búsqueda automática los use aunque
// el popup nunca se haya abierto para refrescarlos.
async function actualizarFiltrosDesdeBackend(token) {
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/perfil', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.filtrosBusqueda) return;

    const { config } = await chrome.storage.local.get('config');
    await chrome.storage.local.set({
      config: {
        ...(config || {}),
        incTags: data.filtrosBusqueda.palabrasIncluir || [],
        excTags: data.filtrosBusqueda.palabrasExcluir || [],
        filtrosBusqueda: {
          modalidad: data.filtrosBusqueda.modalidad || 'cualquiera',
          jornada: data.filtrosBusqueda.jornada || 'cualquiera',
        },
      }
    });
  } catch (e) {
    console.warn('[AP] No se pudieron actualizar los filtros antes de la búsqueda automática:', e);
  }
}

async function escanearAutomatico() {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  let estado;
  try {
    const res = await fetch(BACKEND_URL + '/api/account/estado-automatico', {
      headers: { 'Authorization': 'Bearer ' + autopostulaToken }
    });
    if (!res.ok) return;
    estado = await res.json();
  } catch (e) {
    console.warn('[AP] No se pudo consultar estado automático:', e);
    return;
  }

  // Sin el beneficio del plan, o sin objetivo laboral guardado, no hay nada que buscar
  if (!estado.busquedaAutomatica || !estado.cargoObjetivo) return;

  const slug = normalizarParaUrl(estado.cargoObjetivo);
  if (!slug) return;

  // La búsqueda automática corre en background sin que nadie haya abierto el
  // popup — si no se refresca acá, usaría los filtros de búsqueda que haya
  // cacheados de la última vez (quizás desactualizados). Se actualiza antes
  // de escanear para que siempre respete lo último guardado en la web.
  await actualizarFiltrosDesdeBackend(autopostulaToken);

  const plataformas = estado.plataformasConectadas || [];
  for (const nombre of plataformas) {
    const construirUrl = URL_BUSQUEDA_POR_PORTAL[nombre];
    if (!construirUrl) continue; // portal conectado pero sin adaptador de búsqueda automática todavía
    abrirYEscanear(construirUrl(slug));
  }
}

// Abre una pestaña oculta en la URL de búsqueda, dispara el escaneo cuando
// carga, y la cierra sola — mismo flujo sin importar el portal.
function abrirYEscanear(url) {
  chrome.tabs.create({ url, active: false }, tab => {
    const id = tab.id;
    // El flujo normal cierra la pestaña a los ~5 min, y aparte hay un timeout
    // de seguridad a los 6 min por si nunca terminó de cargar. Sin este guard,
    // si el primero ya la cerró, el segundo igual intenta cerrarla de nuevo un
    // minuto después — y como el tab ya no existe, Chrome tira "No tab with id".
    let manejado = false;
    function cerrarTab() {
      if (manejado) return;
      manejado = true;
      chrome.tabs.remove(id, () => { if (chrome.runtime.lastError) {} });
    }

    const onUpdated = (tabId, info) => {
      if (tabId !== id || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setTimeout(() => {
        if (manejado) return; // la pestaña ya se cerró (ej. por el timeout de seguridad)
        chrome.tabs.sendMessage(id, { type: 'AUTO_SCAN' }, () => {
          if (chrome.runtime.lastError) { /* pestaña cerrada o sin content script */ }
        });
        // El escaneo puede postular a varias ofertas seguidas — le damos tiempo
        // antes de cerrar la pestaña sola. Ajusta si ves que corta muy justo.
        setTimeout(cerrarTab, 5 * 60 * 1000);
      }, 2000);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Timeout de seguridad, por si el tab nunca termina de cargar
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      cerrarTab();
    }, 6 * 60 * 1000);
  });
}

try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === NOMBRE_ALARMA_AUTOMATICA) {
      escanearAutomatico();
    }
  });
} catch (e) {
  console.error('[AP] No se pudo registrar el listener de alarmas:', e);
}

// ── Reportar postulación al backend de AutoPostula (web) ───────
// Corre en el background porque acá sí hay privilegios de extensión —
// un fetch hecho desde content.js (contexto de la página) lo bloquea CORS.
async function reportarPostulacionBackend(oferta) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');

  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — no se reportó al backend');
    return;
  }

  try {
    const res = await fetch(BACKEND_URL + '/api/applications', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platformNombre: oferta.plataforma || 'Computrabajo',
        externalId: oferta.id,
        titulo: oferta.titulo,
        empresa: oferta.empresa || null,
        url: oferta.url || null,
        origen: 'MANUAL',
        respuestas: oferta.respuestas || [],
        incompleta: !!oferta.incompleta,
        nota: oferta.nota || null,
        matchScore: typeof oferta.matchScore === 'number' ? oferta.matchScore : null
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó la postulación:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando al backend:', e);
  }
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'OPEN_AND_APPLY') {
    queue.push({ url: msg.url, titulo: msg.titulo });
    processQueue();
    sendResponse({ queued: true });
  }
  if (msg.type === 'REPORTAR_POSTULACION') {
    reportarPostulacionBackend(msg.oferta);
  }
  if (msg.type === 'ACTUALIZAR_ESTADO') {
    actualizarEstadoBackend(msg.datos).then(sendResponse);
    return true;
  }
  if (msg.type === 'AI_CALL') {
    llamarIABackend(msg.tipo, msg.payload).then(sendResponse);
    return true; // mantiene el canal abierto — la respuesta llega async
  }
  if (msg.type === 'GUARDAR_TOKEN') {
    // Llega desde bridge.js, inyectado solo en la pestaña de la propia web de
    // AutoPostula — es el handshake de "conectar extensión automáticamente".
    if (!msg.token) {
      sendResponse({ ok: false, error: 'Token vacío' });
      return false;
    }
    chrome.storage.sync.set({ autopostulaToken: msg.token }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[AP] Token conectado automáticamente desde la web.');
        sendResponse({ ok: true });
      }
    });
    return true; // async
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoPostula v2 instalado.');
});
