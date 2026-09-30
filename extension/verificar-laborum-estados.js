// Verificación del escaneo de estados de Laborum (docs/estado-real-de-postulaciones.md
// §5, paso 5). Carga core.js y adapters/laborum.js REALES en un vm de Node y
// les da una respuesta de /api/candidates/postulaciones con la forma que
// devolvió el sitio real el 2026-09-29 (mismos campos y valores de estado;
// ver el comentario en adapters/laborum.js).
// No está conectado a CI, es para correr a mano: node verificar-laborum-estados.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? extra : ''); }
  else console.log('✓ ' + desc);
}

function fila(avisoId, estado, extra) {
  return Object.assign({
    estado, avisoId, id: 11455650000 + avisoId % 1000, titulo: 'Oferta ' + avisoId,
    estadoAviso: 'activo', estadoPostulacion: 'REALIZADA', estadoSeleccion: null,
  }, extra || {});
}

async function correr({ pathname, paginas, fetchFalla, localStorage: ls }) {
  const pedidos = [];
  const cambios = [];
  const avisos = [];
  let terminado = 0;
  const storage = Object.assign({ sessionJwt: 'jwt-de-prueba' }, ls || {});

  const ctx = {
    window: {},
    document: {
      documentElement: {}, hidden: true, body: {},
      querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, addEventListener(){},
    },
    location: { pathname, href: 'https://www.laborum.cl' + pathname, hostname: 'www.laborum.cl' },
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem(){}, get token() { return storage.token; },
    },
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    chrome: {
      runtime: { onMessage: { addListener(){} }, sendMessage(){}, lastError: null },
      storage: { local: { get:(_k,cb)=>cb && cb({}), set(){} }, sync: { get:(_k,cb)=>cb && cb({}), set(){} } },
    },
    fetch: async (url, opts) => {
      pedidos.push({ url, headers: (opts && opts.headers) || {} });
      if (fetchFalla) return { ok: false, status: 401, json: async () => ({}) };
      const pagina = Number((url.match(/[?&]page=(\d+)/) || [])[1] || 0);
      const contenido = paginas[pagina] || [];
      const total = paginas.reduce((s, p) => s + p.length, 0);
      return { ok: true, status: 200, json: async () => ({ number: pagina, size: 50, total, content: contenido, filters: [] }) };
    },
    console: { log(){}, warn: (...a) => avisos.push(a.join(' ')), error: console.error },
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout(){},
    setInterval(){ return 0; }, clearInterval(){},
    MutationObserver: class { observe(){} disconnect(){} },
    URL, URLSearchParams,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;
  AP.msg = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'adapters/laborum.js'), 'utf8'), ctx, { filename: 'laborum.js' });

  AP.actualizarEstadoPostulacion = async (datos) => { cambios.push(datos); return { sinCambios: false }; };
  AP.reportarEscaneoTerminado = () => { terminado++; };
  let escaneoListados = 0;
  const escanearOriginal = AP.escanear;
  AP.escanear = () => { escaneoListados++; return escanearOriginal(); };

  AP.onInit();
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
  return { pedidos, cambios, avisos, terminado, escaneoListados };
}

(async () => {
  // ── 1. Una página, los cuatro estados de Laborum + uno desconocido ──
  {
    const r = await correr({
      pathname: '/postulantes/postulaciones',
      paginas: [[
        fila(1118460193, 'recibido'),
        fila(1118458118, 'leido'),
        fila(1118000001, 'contactado'),
        fila(1118000002, 'finalizada'),
        fila(1118000003, 'algo_nuevo'),
        fila(null, 'recibido'),
      ]],
    });
    const por = Object.fromEntries(r.cambios.map(c => [c.externalId, c.estado]));
    if (!r.pedidos.length) r.pedidos.push({ url: '', headers: {} }); // sin escaneo: que falle cada check, no que reviente
    check('pide la lista a /api/candidates/postulaciones', r.pedidos.length === 1 && r.pedidos[0].url.startsWith('/api/candidates/postulaciones?'));
    check('manda los encabezados de la página (site id + sessionJwt)', r.pedidos[0].headers['x-site-id'] === 'BMCL' && r.pedidos[0].headers['x-session-jwt'] === 'jwt-de-prueba');
    check('recibido → ENVIADO, con el avisoId como externalId (string)', por['1118460193'] === 'ENVIADO');
    check('leido → VISTO', por['1118458118'] === 'VISTO');
    check('contactado → EN_PROCESO (no se adivina una entrevista)', por['1118000001'] === 'EN_PROCESO');
    check('finalizada → FINALIZADO', por['1118000002'] === 'FINALIZADO');
    check('un estado desconocido no se manda', !('1118000003' in por));
    check('...pero queda avisado en consola', r.avisos.some(a => a.includes('algo_nuevo')));
    check('una fila sin avisoId se salta', r.cambios.length === 4);
    check('todas van como Laborum', r.cambios.every(c => c.platformNombre === 'Laborum'));
    check('avisa a la ráfaga que terminó, una sola vez', r.terminado === 1);
    check('no corre el escaneo de listados en esta página', r.escaneoListados === 0);
  }

  // ── 2. Paginación: 50 + 3 → pide dos páginas ──
  {
    const primera = Array.from({ length: 50 }, (_, i) => fila(1000 + i, 'recibido'));
    const segunda = [fila(2001, 'leido'), fila(2002, 'leido'), fila(2003, 'leido')];
    const r = await correr({ pathname: '/postulantes/postulaciones', paginas: [primera, segunda] });
    check('pagina: pide page=0 y page=1', r.pedidos.length === 2 && /page=1/.test(r.pedidos[1].url));
    check('...y procesa las 53', r.cambios.length === 53);
  }

  // ── 3. Si Laborum rechaza (sesión vencida), no rompe la ráfaga ──
  {
    const r = await correr({ pathname: '/postulantes/postulaciones', paginas: [], fetchFalla: true });
    check('con error HTTP no manda cambios', r.cambios.length === 0);
    check('...y aun así avisa que terminó (la ráfaga sigue)', r.terminado === 1);
  }

  // ── 4. En cualquier otra página de Laborum no se toca la API ──
  {
    const r = await correr({ pathname: '/empleos-busqueda-vendedor.html', paginas: [[fila(1, 'leido')]] });
    check('fuera de "Mis postulaciones" no pide estados', r.pedidos.length === 0 && r.cambios.length === 0);
  }

  // ── 5. background.js real suma Laborum al barrido de estados ──
  {
    const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
    check('background.js agrega el paso de estados de Laborum',
      /tipo: 'estados', portal: 'Laborum', url: 'https:\/\/www\.laborum\.cl\/postulantes\/postulaciones'/.test(src));
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
