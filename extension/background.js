// ═══════════════════════════════════════════════════════════════
//  AutoPostula — background.js v2
// ═══════════════════════════════════════════════════════════════
'use strict';

console.log('[AP] background.js cargado', new Date().toLocaleTimeString());

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
    const res = await fetch('http://localhost:3000' + ruta, {
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
    const res = await fetch('http://localhost:3000/api/applications/status', {
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

async function escanearAutomatico() {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  let estado;
  try {
    const res = await fetch('http://localhost:3000/api/account/estado-automatico', {
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

  const url = 'https://cl.computrabajo.com/trabajo-de-' + slug;

  chrome.tabs.create({ url, active: false }, tab => {
    const id = tab.id;
    const onUpdated = (tabId, info) => {
      if (tabId !== id || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setTimeout(() => {
        chrome.tabs.sendMessage(id, { type: 'AUTO_SCAN' }, () => {
          if (chrome.runtime.lastError) { /* pestaña cerrada o sin content script */ }
        });
        // El escaneo puede postular a varias ofertas seguidas — le damos tiempo
        // antes de cerrar la pestaña sola. Ajusta si ves que corta muy justo.
        setTimeout(() => {
          chrome.tabs.remove(id, () => { if (chrome.runtime.lastError) {} });
        }, 5 * 60 * 1000);
      }, 2000);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Timeout de seguridad, por si el tab nunca termina de cargar
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.remove(id, () => {});
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
    const res = await fetch('http://localhost:3000/api/applications', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platformNombre: 'Computrabajo',
        externalId: oferta.id,
        titulo: oferta.titulo,
        empresa: oferta.empresa || null,
        origen: 'MANUAL',
        respuestas: oferta.respuestas || []
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
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoPostula v2 instalado.');
});
