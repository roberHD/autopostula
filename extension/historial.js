'use strict';

const statusCfg = {
  ok:        { label: 'Postulada',  color: '#17784F', bg: '#E2F3EA' },
  pending:   { label: 'Pendiente',  color: '#9A5B00', bg: '#FBF0DC' },
  err:       { label: 'Con error',  color: '#B3283C', bg: '#FBE9EC' },
  skip:      { label: 'Omitida',    color: '#6B6A7D', bg: '#FAFAF6' },
  working:   { label: 'En proceso', color: '#5A2FD6', bg: '#EEE9FD' },
  // docs/modo-solo-observar.md §3.3: no es una postulación real -- necesita
  // su propio color para no confundirse con "Postulada" (verde) ni con
  // "En proceso" (el mismo morado que la IA usa mientras trabaja de verdad).
  observado: { label: '👁 Observada', color: '#1D4ED8', bg: '#DBEAFE' },
};

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function render(entry) {
  const content = document.getElementById('content');
  if (!entry) {
    content.innerHTML = '<div class="empty-state">No se encontró esta postulación en el historial (puede que se haya limpiado).</div>';
    return;
  }

  const cfg = statusCfg[entry.status] || { label: entry.status, color: '#9CA3AF', bg: '#F3F4F6' };
  const fecha = new Date(entry.ts).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  const respuestas = Array.isArray(entry.respuestas) ? entry.respuestas : [];

  const qaHtml = respuestas.length
    ? respuestas.map(r => `
        <div class="qa-item">
          <div class="qa-q">${escapeHtml(r.pregunta || 'Pregunta')}</div>
          <div class="qa-a${r.vacia ? ' vacia' : ''}">${r.vacia ? 'Sin respuesta' : escapeHtml(r.respuesta || '')}</div>
        </div>
      `).join('')
    : '<div class="empty-state">Esta postulación no tiene preguntas y respuestas guardadas.</div>';

  document.title = 'AutoPostula — ' + (entry.title || 'Historial');

  content.innerHTML = `
    <div class="header-card">
      <div class="header-title">${escapeHtml(entry.title || 'Oferta')}</div>
      <div class="header-meta">
        <span class="status-pill" style="color:${cfg.color};background:${cfg.bg}">${cfg.label}</span>
        <span>${fecha}</span>
        ${entry.reason ? `<span>· ${escapeHtml(entry.reason)}</span>` : ''}
        ${entry.url ? `<a class="header-link" href="${entry.url}" target="_blank" rel="noopener">Ver oferta original ↗</a>` : ''}
      </div>
    </div>
    ${qaHtml}
  `;
}

const params = new URLSearchParams(location.search);
const uid = params.get('uid');

chrome.storage.local.get(['log'], data => {
  const log = data.log || [];
  const entry = log.find(e => e.uid === uid) || null;
  render(entry);
});
