// ═══════════════════════════════════════════════════════════════
//  AutoPostula — background.js v2
// ═══════════════════════════════════════════════════════════════
'use strict';

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

  try {
    const res = await fetch('http://localhost:3000' + ruta, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn('[AP] IA rechazada por el backend (' + tipo + '):', data.error || res.status);
      return { error: data.error || ('Error ' + res.status) };
    }

    return data;
  } catch (e) {
    console.warn('[AP] Error de red llamando a la IA del backend (' + tipo + '):', e);
    return null;
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

chrome.alarms.create(NOMBRE_ALARMA_AUTOMATICA, { periodInMinutes: INTERVALO_MINUTOS });

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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === NOMBRE_ALARMA_AUTOMATICA) {
    escanearAutomatico();
  }
});

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
  if (msg.type === 'AI_CALL') {
    llamarIABackend(msg.tipo, msg.payload).then(sendResponse);
    return true; // mantiene el canal abierto — la respuesta llega async
  }
  if (msg.type === 'ACTUALIZAR_ESTADO') {
    actualizarEstadoBackend(msg.datos).then(sendResponse);
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoPostula v2 instalado.');
});
