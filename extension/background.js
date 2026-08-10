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
        origen: 'MANUAL'
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
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoPostula v2 instalado.');
});
