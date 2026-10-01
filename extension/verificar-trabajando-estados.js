// Verificación del escaneo de estados de Trabajando (docs/estado-real-de-postulaciones.md
// §5, paso 6). Carga core.js y adapters/trabajando.js REALES en un vm de Node
// con un <script id="__NUXT_DATA__"> armado con la misma forma que el de
// trabajando.cl/mis-postulaciones del 2026-09-30 (lista plana de Nuxt donde
// cada objeto guarda índices a sus valores; ver adapters/trabajando.js).
// No está conectado a CI, es para correr a mano: node verificar-trabajando-estados.js
//
// Con un archivo guardado de la página real (Ctrl+S) también se puede probar la
// lectura contra él, sin mandar nada:
//   node verificar-trabajando-estados.js "ruta/al/archivo.html"
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? extra : ''); }
  else console.log('✓ ' + desc);
}

// Arma un payload de Nuxt: los valores primitivos van sueltos en la lista y
// los objetos apuntan a ellos por índice, igual que el real.
function payloadNuxt(postulaciones) {
  const datos = [['ShallowReactive', 1], { data: 2 }, { 'obtener-candidato': 3, 'mis-postulaciones-combinadas': 4 }, { nombre: 5 }, [], 'Persona de prueba'];
  const lista = datos[4];
  for (const p of postulaciones) {
    const base = datos.length;
    datos.push({ cargo: base + 1, linkOferta: base + 2, etapaCodigo: base + 3, etapaTexto: base + 4, esExterna: base + 5 });
    datos.push(p.cargo || 'Cargo', p.link, p.etapa, 'Texto', false);
    lista.push(base);
  }
  return JSON.stringify(datos);
}

async function correr({ pathname, nuxt }) {
  const cambios = [];
  const avisos = [];
  let terminado = 0;
  let escaneoListados = 0;
  const ctx = {
    document: {
      documentElement: {}, hidden: true, body: { appendChild(){} },
      querySelector: () => null, querySelectorAll: () => [],
      getElementById: (id) => (id === '__NUXT_DATA__' && nuxt != null ? { textContent: nuxt } : null),
      addEventListener(){}, createElement: () => ({ style: {}, attachShadow: () => ({ getElementById: () => null }) }),
    },
    location: { pathname, href: 'https://www.trabajando.cl' + pathname, hostname: 'www.trabajando.cl' },
    localStorage: { getItem: () => null, setItem(){} },
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    chrome: {
      runtime: { onMessage: { addListener(){} }, sendMessage(){}, lastError: null },
      storage: { local: { get:(_k,cb)=>cb && cb({}), set(){} }, sync: { get:(_k,cb)=>cb && cb({}), set(){} } },
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'adapters/trabajando.js'), 'utf8'), ctx, { filename: 'trabajando.js' });
  AP.actualizarEstadoPostulacion = async (datos) => { cambios.push(datos); return { sinCambios: false }; };
  AP.reportarEscaneoTerminado = () => { terminado++; };
  const original = AP.escanear;
  AP.escanear = () => { escaneoListados++; return original(); };
  AP.onInit();
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
  return { cambios, avisos, terminado, escaneoListados };
}

(async () => {
  const archivoReal = process.argv[2];
  if (archivoReal) {
    const html = fs.readFileSync(archivoReal, 'utf8');
    const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const r = await correr({ pathname: '/mis-postulaciones', nuxt: m ? m[1] : null });
    console.log('Archivo real:', r.cambios.map(c => c.externalId + ' → ' + c.estado).join(', ') || '(nada)');
    if (r.avisos.length) console.log('Avisos:', r.avisos);
    process.exit(0);
  }

  // ── 1. Todos los códigos de etapa de Trabajando ──
  {
    const r = await correr({
      pathname: '/mis-postulaciones',
      nuxt: payloadNuxt([
        { link: '/trabajo/6131422-vendedor-pulcro', etapa: 'POSTULACION_ENVIADA' },
        { link: '/trabajo/6125993-reponedor-part-time', etapa: 'CV_RECIBIDO' },
        { link: '/trabajo/6000001-cajero', etapa: 'CV_VISTO' },
        { link: '/trabajo/6000002-bodeguero', etapa: 'CV_EN_PROCESO' },
        { link: '/trabajo/6000003-vendedor', etapa: 'CV_FINALISTA' },
        { link: '/trabajo/6000004-cajero', etapa: 'CV_CONTRATADO' },
        { link: '/trabajo/6000005-garzon', etapa: 'CV_DESCARTADO' },
        { link: '/trabajo/6000006-guardia', etapa: 'PROCESO_FINALIZADO_DESACTIVADO' },
        { link: '/trabajo/6000007-auxiliar', etapa: 'PROCESO_FINALIZADO_EXPIRADO' },
        { link: '/trabajo/6000008-chofer', etapa: 'SIN_INFORMACION' },
        { link: '/trabajo/6000009-otro', etapa: 'ALGO_NUEVO' },
        { link: 'https://otro-sitio.cl/postular', etapa: 'CV_VISTO' },
      ]),
    });
    const por = Object.fromEntries(r.cambios.map(c => [c.externalId, c.estado]));
    check('POSTULACION_ENVIADA → ENVIADO, con el id de /trabajo/{id}-', por['6131422'] === 'ENVIADO');
    check('CV_RECIBIDO → ENVIADO (lo tienen, aún no lo leen)', por['6125993'] === 'ENVIADO');
    check('CV_VISTO → VISTO', por['6000001'] === 'VISTO');
    check('CV_EN_PROCESO → EN_PROCESO', por['6000002'] === 'EN_PROCESO');
    check('CV_FINALISTA → FINALISTA', por['6000003'] === 'FINALISTA');
    check('CV_CONTRATADO → FINALIZADO', por['6000004'] === 'FINALIZADO');
    check('CV_DESCARTADO → RECHAZADO', por['6000005'] === 'RECHAZADO');
    check('PROCESO_FINALIZADO_* → FINALIZADO', por['6000006'] === 'FINALIZADO' && por['6000007'] === 'FINALIZADO');
    check('SIN_INFORMACION no se manda (ni se avisa como desconocido)', !('6000008' in por) && !r.avisos.some(a => a.includes('SIN_INFORMACION')));
    check('un código desconocido no se manda...', !('6000009' in por));
    check('...pero queda avisado en consola', r.avisos.some(a => a.includes('ALGO_NUEVO')));
    check('un link sin /trabajo/{id}- se salta', r.cambios.length === 9, r.cambios.length);
    check('todas van como Trabajando', r.cambios.every(c => c.platformNombre === 'Trabajando'));
    check('avisa a la ráfaga que terminó, una sola vez', r.terminado === 1);
    check('no corre el escaneo de listados en esta página', r.escaneoListados === 0);
  }

  // ── 2. La misma oferta repetida en el payload se manda una vez ──
  {
    const r = await correr({ pathname: '/mis-postulaciones/', nuxt: payloadNuxt([
      { link: '/trabajo/7000001-a', etapa: 'CV_VISTO' },
      { link: '/trabajo/7000001-a', etapa: 'CV_VISTO' },
    ]) });
    check('sin duplicados (y la ruta con / final también cuenta)', r.cambios.length === 1);
  }

  // ── 3. Sin __NUXT_DATA__ (o roto) no rompe la ráfaga ──
  {
    const r1 = await correr({ pathname: '/mis-postulaciones', nuxt: null });
    check('sin __NUXT_DATA__: no manda nada y avisa que terminó', r1.cambios.length === 0 && r1.terminado === 1);
    const r2 = await correr({ pathname: '/mis-postulaciones', nuxt: '{roto' });
    check('con __NUXT_DATA__ roto: igual', r2.cambios.length === 0 && r2.terminado === 1);
  }

  // ── 4. En otras páginas no se leen estados ──
  {
    const r = await correr({ pathname: '/trabajo-empleo/vendedor', nuxt: payloadNuxt([{ link: '/trabajo/1-a', etapa: 'CV_VISTO' }]) });
    check('fuera de "Mis postulaciones" no manda estados', r.cambios.length === 0);
  }

  // ── 5. background.js real suma Trabajando al barrido de estados ──
  {
    const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
    check('background.js agrega el paso de estados de Trabajando',
      /tipo: 'estados', portal: 'Trabajando', url: 'https:\/\/www\.trabajando\.cl\/mis-postulaciones'/.test(src));
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
