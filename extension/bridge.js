// ═══════════════════════════════════════════════════════════════
//  AutoPostula — bridge.js
//  Se inyecta SOLO en el dominio de la propia app de AutoPostula
//  (nunca en Computrabajo). Es el puente entre la pestaña web y la
//  extensión para conectar sin copiar/pegar el token a mano.
// ═══════════════════════════════════════════════════════════════
'use strict';

// Avisa a la página que la extensión está instalada, para que la web decida
// si mostrar el botón de "conectar automáticamente" o el flujo manual.
window.dispatchEvent(new CustomEvent('autopostula:extension-presente', {
  detail: { version: chrome.runtime.getManifest().version }
}));

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
