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

// docs/rafagas-y-ponerse-al-dia.md §3.6: el botón "Ponerme al día ahora" del
// panel viaja igual que "conectar" -- evento del DOM de esta misma página (no
// postMessage de cualquier origen), y la respuesta vuelve como otro evento.
// La extensión decide si se puede (plan, pausa, cupo, si ya está corriendo...)
// y devuelve { ok: true, estimadoMs } o { ok: false, motivo }; acá solo se
// transporta, para que el panel muestre el motivo en vez de quedarse mudo.
window.addEventListener('autopostula:ponerse-al-dia', () => {
  chrome.runtime.sendMessage({ type: 'PONERSE_AL_DIA' }, (respuesta) => {
    // lastError: la extensión se recargó o actualizó con la pestaña abierta y
    // este script quedó huérfano -- recargar la página lo arregla.
    const detail = chrome.runtime.lastError || !respuesta
      ? { ok: false, motivo: 'extension_no_responde' }
      : respuesta;
    window.dispatchEvent(new CustomEvent('autopostula:ponerse-al-dia-resultado', { detail }));
  });
});
