// Verificación del chat de preguntas de Computrabajo
// (docs/computrabajo-chat-2026-11-01.md). Corre en un navegador de verdad: el
// chat avanza con eventos, clases y una animación que escribe la pregunta de a
// poco, y eso un DOM falso en Node no lo reproduce bien.
//
//   node verificar-chat-computrabajo.js     y abrir http://127.0.0.1:3301/
//
// verificar-chat-computrabajo.html copia el HTML del chat real (leído en el
// sitio el 2026-11-01) y su comportamiento (la flecha solo acepta con la clase
// "send", las opciones se contestan con un clic, "Enviar mi CV" al final), y
// carga core.js y adapters/computrabajo.js REALES. Esta página prueba una
// escena tras otra, cada una en su propio marco, y muestra ✓ o ✗; el título
// queda en "OK" o "FALLAS: n". No está conectado a CI, es para correr a mano.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = 3301;
const ID = '18006D1086D0298661373E686DCF3405';

// Lo que tiene que pasar en cada escena.
const ESCENAS = [
  ['chat', 'Chat con 5 preguntas: la IA recibe las preguntas de verdad y se envía con la confirmación'],
  ['opcionPrimero', 'La primera pregunta es de opciones: la marca con un clic y sigue'],
  ['lenta', 'El chat tarda 1,8 s en aparecer (antes se daba por enviada sin preguntas)'],
  ['directa', 'Postulación directa: se envía sin preguntas ni IA'],
  ['muda', 'El portal no responde: queda por terminar, no enviada'],
  ['falta', 'La IA no sabe un dato: se le pregunta a la persona y su respuesta va al chat'],
  ['atascada', 'El chat no acepta la respuesta: queda por terminar con el motivo'],
];

const PAGINA_TODAS = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Corriendo…</title>
<style>body{font:15px system-ui,sans-serif;margin:24px}td{padding:6px 10px;border-bottom:1px solid #ddd;vertical-align:top}
.ok{color:#15803d}.mal{color:#b91c1c}iframe{width:900px;height:420px;border:1px solid #ccc;display:block;margin-top:16px}</style></head><body>
<h1>Chat de preguntas de Computrabajo</h1><table id="t"></table><iframe id="marco"></iframe>
<script>
const ESCENAS = ${JSON.stringify(ESCENAS)};
const PLACEHOLDER = 'Escribe tu respuesta aquí';
const REALES = ['discapacidad', 'Calzado', 'dias a trabajar', 'correo', 'experiencia en el area de calzado'];
const reportes = (x) => (x.reportes || []).map(r => r.incompleta ? 'INCOMPLETA' : 'ENVIADA');
const ESPERADO = {
  chat: (x) => x.r.ok && x.enviado && reportes(x).join() === 'ENVIADA' && x.chat.length === 5 &&
    x.preguntasIA.length === 1 && x.preguntasIA[0].length === 5 && !x.preguntasIA[0].some(p => p.includes(PLACEHOLDER)) &&
    REALES.every(r => x.preguntasIA[0].some(p => p.includes(r))) && x.reportes[0].respuestas.length === 5,
  opcionPrimero: (x) => x.r.ok && x.enviado && x.chat[0].valor === 'NO' && x.chat.length === 5,
  lenta: (x) => x.r.ok && x.enviado && x.chat.length === 5 && reportes(x).join() === 'ENVIADA',
  directa: (x) => x.r.ok && x.enviado && x.preguntasIA.length === 0 && reportes(x).join() === 'ENVIADA',
  muda: (x) => !x.r.ok && !x.enviado && reportes(x).join() === 'INCOMPLETA' && /no mostró/.test(x.reportes[0].nota),
  falta: (x) => x.r.ok && x.enviado && (x.chat.find(c => c.paso === 3) || {}).valor === 'Lunes a viernes, de 15:00 a 21:00.',
  atascada: (x) => !x.r.ok && !x.enviado && reportes(x).join() === 'INCOMPLETA' && /no dejó enviar/.test(x.reportes[0].nota),
};
const t = document.getElementById('t'); const marco = document.getElementById('marco');
let fallas = 0;
(async () => {
  for (const [escena, desc] of ESCENAS) {
    const fila = t.insertRow(); fila.insertCell().textContent = '…'; fila.insertCell().textContent = desc; const det = fila.insertCell();
    const resultado = await new Promise((resolve) => {
      const alRecibir = (e) => { if (e.data && e.data.escena === escena) { window.removeEventListener('message', alRecibir); resolve(e.data.resultado); } };
      window.addEventListener('message', alRecibir);
      marco.src = '/sim/trabajo-de-vendedor?escena=' + escena + '&auto=1&t=' + Date.now() + '#${ID}';
    });
    let bien = false;
    try { bien = !resultado.error && ESPERADO[escena](resultado); } catch (e) {}
    if (!bien) fallas++;
    fila.cells[0].textContent = bien ? '✓' : '✗'; fila.cells[0].className = bien ? 'ok' : 'mal';
    det.textContent = resultado.error ? resultado.error : reportes(resultado).join() + (resultado.reportes && resultado.reportes[0] && resultado.reportes[0].nota ? ' — ' + resultado.reportes[0].nota : '');
    window.__resultados = (window.__resultados || []).concat([{ escena, bien, resultado }]);
  }
  document.title = fallas ? 'FALLAS: ' + fallas : 'OK';
  window.__terminado = true;
})();
</script></body></html>`;

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(PAGINA_TODAS);
      return;
    }
    if (url.pathname.startsWith('/sim/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(__dirname, 'verificar-chat-computrabajo.html')));
      return;
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
