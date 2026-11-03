// Verificación: los portales no le roban el foco a los paneles de AutoPostula.
//
// Error real del 2026-11-03 (cuenta nueva en trabajando.com): en el panel de
// revisión ("Revisar antes de enviar" y "Falta información para postular") no
// se podía escribir. Trabajando hace las preguntas en una ventana de Bootstrap,
// y Bootstrap tiene una trampa de foco: si el foco va a algo que no está dentro
// de su ventana, se lo devuelve. Como el panel vive en un shadow DOM agregado
// al final de la página, para Bootstrap el clic ocurría "afuera" -- y lo que la
// persona escribía terminaba en el campo del portal, no en el panel.
//
//   node verificar-foco.js     y abrir http://127.0.0.1:3303/
//
// Carga core.js REAL dentro de una página con una ventana de Bootstrap abierta
// (la 4, con jQuery, y la 5), abre el panel de revisión de verdad
// (AP.mostrarRevision) y mira dónde queda el foco. También comprueba lo
// contrario: que el campo del propio portal se siga pudiendo usar. El título
// queda en "OK" o "FALLAS: n". No está conectado a CI, es para correr a mano.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = 3303;

const ESCENAS = [
  ['bs5', 'Bootstrap 5: el cuadro del panel de revisión se queda con el foco'],
  ['bs4', 'Bootstrap 4 (jQuery): el cuadro del panel de revisión se queda con el foco'],
  ['control5', 'Bootstrap 5: el campo del propio portal se sigue pudiendo usar'],
  ['control4', 'Bootstrap 4: el campo del propio portal se sigue pudiendo usar'],
];

const CDN = {
  css5: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  js5: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  css4: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css',
  js4: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js',
  jquery: 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
};

function escena(nombre) {
  const bs4 = nombre.endsWith('4');
  const control = nombre.startsWith('control');
  const libs = bs4
    ? `<script src="${CDN.jquery}"></script><script src="${CDN.js4}"></script>`
    : `<script src="${CDN.js5}"></script>`;
  const abrir = bs4
    ? `new Promise(r => { $('#modalConfirmarPreguntas').one('shown.bs.modal', r).modal('show'); })`
    : `new Promise(r => { const m = document.getElementById('modalConfirmarPreguntas'); m.addEventListener('shown.bs.modal', r, { once: true }); new bootstrap.Modal(m).show(); })`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="${bs4 ? CDN.css4 : CDN.css5}">
<script>
window.chrome = {
  runtime: {
    lastError: null, id: 'simulador',
    onMessage: { addListener() {} },
    sendMessage(m, cb) { const r = { ok: true }; if (typeof cb === 'function') { setTimeout(() => cb(r), 20); return; } return Promise.resolve(r); },
  },
  storage: {
    local: { get(_k, cb) { const v = { config: { active: false }, active: false, log: [] }; if (cb) setTimeout(() => cb(v), 0); return Promise.resolve(v); }, set(_o, cb) { if (cb) cb(); return Promise.resolve(); } },
    sync: { get(_k, cb) { const v = {}; if (cb) setTimeout(() => cb(v), 0); return Promise.resolve(v); }, set() {} },
    onChanged: { addListener() {} },
  },
};
</script></head><body>
<div class="modal fade" id="modalConfirmarPreguntas" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
  <div class="modal-body"><label for="campoPortal">Pregunta del portal</label><input id="campoPortal" class="form-control"></div>
</div></div></div>
${libs}
<script src="/ext/data/comunas-cl.js"></script>
<script src="/ext/core.js"></script>
<script>
(async () => {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  let resultado;
  try {
    await ${abrir};
    AP.mostrarRevision('Vendedor de prueba', [
      { pregunta: '¿Cuál es tu pretensión de renta?', respuesta: '', vacia: true, datoFaltante: 'pretensión de renta' },
      { pregunta: '¿Por qué te interesa este cargo?', respuesta: 'Tengo experiencia en atención de público.' },
    ], 'Vendedor de prueba', { titulo: 'Falta información para postular', limiteMs: 60000 });
    await esperar(300);
    const host = document.getElementById('ap-revision-panel');
    const cuadro = host && host.shadowRoot.querySelector('.ap-rev-textarea');
    const campo = document.getElementById('campoPortal');
    if (!cuadro) throw new Error('No se abrió el panel de revisión');
    // El marco no tiene el foco del sistema, y en ese caso Chrome mueve el foco
    // sin disparar focus/focusin: justo los eventos que activan la trampa de
    // Bootstrap (la 5 escucha focusin; jQuery, debajo de la 4, escucha focus en
    // captura). Se disparan a mano, igual que los dispara el navegador cuando
    // la persona hace clic de verdad, y compuestos: cruzan el shadow DOM.
    const enfocar = (el) => {
      el.focus();
      el.dispatchEvent(new FocusEvent('focus', { composed: true }));
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    };
    if (${control}) {
      enfocar(campo);
      await esperar(300);
      resultado = { ok: document.activeElement === campo, foco: document.activeElement.id || document.activeElement.tagName };
    } else {
      enfocar(cuadro);
      await esperar(300);
      resultado = { ok: host.shadowRoot.activeElement === cuadro, foco: document.activeElement.id || document.activeElement.tagName };
    }
  } catch (e) {
    resultado = { ok: false, error: String(e && e.message || e) };
  }
  parent.postMessage({ escena: '${nombre}', resultado }, '*');
})();
</script></body></html>`;
}

const PAGINA_TODAS = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Corriendo…</title>
<style>body{font:15px system-ui,sans-serif;margin:24px}td{padding:6px 10px;border-bottom:1px solid #ddd}
.ok{color:#15803d}.mal{color:#b91c1c}iframe{width:900px;height:360px;border:1px solid #ccc;display:block;margin-top:16px}</style></head><body>
<h1>Los portales no le roban el foco al panel</h1><table id="t"></table><iframe id="marco"></iframe>
<script>
const ESCENAS = ${JSON.stringify(ESCENAS)};
const t = document.getElementById('t'); const marco = document.getElementById('marco');
let fallas = 0;
(async () => {
  for (const [escena, desc] of ESCENAS) {
    const fila = t.insertRow(); fila.insertCell().textContent = '…'; fila.insertCell().textContent = desc; const det = fila.insertCell();
    const r = await new Promise((resolve) => {
      const alRecibir = (e) => { if (e.data && e.data.escena === escena) { window.removeEventListener('message', alRecibir); resolve(e.data.resultado); } };
      window.addEventListener('message', alRecibir);
      marco.src = '/escena/' + escena + '?t=' + Date.now();
    });
    if (!r.ok) fallas++;
    fila.cells[0].textContent = r.ok ? '✓' : '✗'; fila.cells[0].className = r.ok ? 'ok' : 'mal';
    det.textContent = r.error ? r.error : 'foco en: ' + r.foco;
  }
  document.title = fallas ? 'FALLAS: ' + fallas : 'OK';
  window.__terminado = true;
})();
</script></body></html>`;

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const html = (cuerpo) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(cuerpo); };
    if (url.pathname === '/') return html(PAGINA_TODAS);
    if (url.pathname.startsWith('/escena/')) {
      const nombre = url.pathname.slice(8);
      if (!ESCENAS.some(([e]) => e === nombre)) { res.writeHead(404); res.end(); return; }
      return html(escena(nombre));
    }
    if (url.pathname.startsWith('/ext/')) {
      const archivo = path.normalize(path.join(__dirname, url.pathname.slice(5)));
      if (!archivo.startsWith(path.normalize(__dirname)) || !fs.existsSync(archivo)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(archivo));
      return;
    }
    res.writeHead(404); res.end();
  })
  .listen(PUERTO, '127.0.0.1', () => console.log('Abre http://127.0.0.1:' + PUERTO + '/ en el navegador (Ctrl+C para terminar)'));
