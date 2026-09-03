// ═══════════════════════════════════════════════════════════════
//  AutoPostula — bridge.js
//  Se inyecta SOLO en el dominio de la propia app de AutoPostula
//  (nunca en Computrabajo). Es el puente entre la pestaña web y la
//  extensión para conectar sin copiar/pegar el token a mano.
// ═══════════════════════════════════════════════════════════════
'use strict';

const VERSION = chrome.runtime.getManifest().version;

// Marca en el DOM, no un evento: el content script corre en document_start,
// mucho antes de que React hidrate y registre sus listeners, así que un evento
// suelto se dispara al vacío y la web concluye que no hay extensión. El
// atributo queda puesto y la página lo lee cuando le toca, sin carreras.
document.documentElement.dataset.autopostulaExtension = VERSION;

function avisarPresencia() {
  window.dispatchEvent(new CustomEvent('autopostula:extension-presente', {
    detail: { version: VERSION }
  }));
}

// Se mantiene el evento para la página que ya esté escuchando, y además se
// responde a un ping explícito por si la web se montó después del inyectado.
avisarPresencia();
window.addEventListener('autopostula:ping', avisarPresencia);

// La web dispara este evento con el token cuando el usuario hace clic en
// "Conectar extensión automáticamente". Solo escuchamos eventos del DOM de
// esta misma página (nunca postMessage de cualquier origen), así que no hay
// forma de que otro sitio abusado le inyecte un token falso a la extensión.
window.addEventListener('autopostula:conectar', (e) => {
  const token = e && e.detail && e.detail.token;
  if (!token) return;

  chrome.runtime.sendMessage({ type: 'GUARDAR_TOKEN', token }, (respuesta) => {
    if (chrome.runtime.lastError) {
      window.dispatchEvent(new CustomEvent('autopostula:error-conexion', {
        detail: { error: chrome.runtime.lastError.message }
      }));
      return;
    }
    if (respuesta && respuesta.ok) {
      window.dispatchEvent(new CustomEvent('autopostula:conectado'));
    } else {
      window.dispatchEvent(new CustomEvent('autopostula:error-conexion', {
        detail: { error: (respuesta && respuesta.error) || 'No se pudo guardar el token.' }
      }));
    }
  });
});
