// Verificación de Computrabajo (2026-10-01, docs/extension-laborum-2026-10-01.md):
//   1. La jornada del listado (§7): la ráfaga busca con el filtro
//      "-jornada-part-time" del sitio, pero la tarjeta no muestra la jornada y
//      acá los dudosos no se abren -- todo lo que no dijera "part time" en el
//      título terminaba en "Por decidir" por "no dice la jornada".
//   2. Las aprobadas de "Por decidir" (§10): en la página suelta de un aviso,
//      "Postularme" lleva a otra página y la pestaña perdía el hilo. Ahora se
//      abren en el panel de un listado ("#ID") y esa pestaña no escanea.
// Carga core.js y adapters/computrabajo.js REALES en un vm de Node, con un DOM
// falso armado con los selectores que lee el adaptador (los mismos verificados
// contra el sitio real; ver adapters/computrabajo.js) y títulos de la búsqueda
// real de vendedor part time en la RM de ese día. urlParaPostular se saca de
// background.js tal cual.
// No está conectado a CI, es para correr a mano: node verificar-computrabajo.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? extra : ''); }
  else console.log('✓ ' + desc);
}

function el(props) {
  const e = Object.assign({ textContent: '', sel: {}, attrs: {}, offsetParent: {} }, props);
  e.querySelectorAll = (s) => e.sel[s] || [];
  e.querySelector = (s) => (e.sel[s] || [])[0] || null;
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  return e;
}

function tarjeta({ id, titulo, empresa, ubicacion }) {
  const a = { href: 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-' + id, textContent: titulo };
  return el({
    attrs: { 'data-id': id },
    sel: {
      h2: [el({ textContent: titulo, sel: { a: [a] } })],
      'h2 a, a[href*="oferta"], a[href*="trabajo"]': [a],
      '[offer-grid-article-company-url]': [el({ textContent: empresa })],
      'p.fs16.fc_base:not(.dFlex)': [el({ textContent: ubicacion })],
    },
  });
}

async function esperarTodo() { for (let i = 0; i < 40; i++) await new Promise(r => setImmediate(r)); }

// `selectores`: lo que devuelve document.querySelector(All) para cada selector
// (además de las tarjetas del listado).
function crear({ pathname, hash, tarjetas, selectores }) {
  const mensajes = [];
  const sel = selectores || {};
  const ctx = {
    document: {
      documentElement: {}, body: {}, hidden: false,
      querySelectorAll: (s) => (s === 'article.box_offer' ? (tarjetas || []) : (sel[s] || [])),
      querySelector: (s) => (sel[s] || [])[0] || null,
      getElementById: () => null, addEventListener() {},
    },
    location: { pathname, hash: hash || '', href: 'https://cl.computrabajo.com' + pathname + (hash || ''), hostname: 'cl.computrabajo.com' },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    chrome: {
      runtime: {
        lastError: null, onMessage: { addListener() {} },
        sendMessage(m, cb) {
          mensajes.push(m);
          const r = m.type === 'DUPLICADOS' ? { duplicados: [] } : { ok: true };
          if (typeof cb === 'function') { Promise.resolve().then(() => cb(r)); return; }
          return Promise.resolve(r);
        },
      },
      storage: { local: { get: (_k, cb) => cb && cb({}), set() {} }, sync: { get: (_k, cb) => cb && cb({}), set() {} }, onChanged: { addListener() {} } },
    },
    console: { log() {}, warn() {}, error: console.error },
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    URL, URLSearchParams,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'data', 'comunas-cl.js'), 'utf8'), ctx, { filename: 'comunas-cl.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;
  AP.msg = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'adapters', 'computrabajo.js'), 'utf8'), ctx, { filename: 'computrabajo.js' });
  const comunasRM = AP.COMUNAS_CL.filter(c => c.region === 'RM').map(c => c.nombre);
  // Solo observar: el escaneo decide y anota, sin abrir ninguna oferta.
  AP.cfg = {
    active: true, soloObservar: true,
    scorer: { usarScorerLocal: true, versionPerfil: 1, perfilCompilado: {
      roles: [{ canonico: 'vendedor', sinonimos: [], peso: 1 }],
      ubicacion: { comunas: comunasRM, aceptaRemoto: false },
      jornada: 'part_time', umbralPostular: 65, umbralGris: 45,
    } },
  };
  AP.activo = true;
  AP.log = [];
  const evaluadas = [];
  const evaluarReal = AP.evaluarOferta;
  AP.evaluarOferta = (campos) => { const r = evaluarReal(campos); evaluadas.push({ titulo: campos.titulo, cuerpo: campos.cuerpo, banda: r.banda, razon: r.razones && r.razones[0] }); return r; };
  return { AP, mensajes, evaluadas };
}

async function escanear(pathname, tarjetas) {
  const t = crear({ pathname, tarjetas });
  await t.AP.escanear();
  await esperarTodo();
  return t;
}

const ID = '3564775805B9C1DF61373E686DCF3405';
const URL_AVISO = 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-vendedora-volante-30hrs-pm-diferentes-comunas-en-santiago-centro-' + ID;

(async () => {
  const tarjetas = () => [
    tarjeta({ id: 'A1B2C3D4E5F6', titulo: 'vendedora de retail tiendas', empresa: 'Importante empresa del sector', ubicacion: 'Santiago - Las Condes, R.Metropolitana' }),
    tarjeta({ id: 'B1B2C3D4E5F6', titulo: 'Vendedor/a Dermocosmética 42 hrs / Skincare y Beauty Store', empresa: 'Tua Retail', ubicacion: 'Santiago - Lo Barnechea, R.Metropolitana' }),
  ];

  // ── 1. La jornada del listado ─────────────────────────────────
  const conFiltro = await escanear('/trabajo-de-vendedor-en-rmetropolitan-jornada-part-time', tarjetas());
  const [retail, dermo] = conFiltro.evaluadas;
  check('búsqueda con "-jornada-part-time": la tarjeta va al puntaje con esa jornada', retail && retail.cuerpo === 'Jornada part time', retail);
  check('...y "vendedora de retail tiendas" queda para postular (antes: Por decidir)', retail && retail.banda === 'postular', retail);
  check('"42 hrs" en el título manda sobre el filtro: se descarta por jornada', dermo && dermo.banda === 'descartar' && dermo.razon.tipo === 'jornada', dermo);
  check('nada va a "Por decidir"', !conFiltro.mensajes.some(m => m.type === 'REPORTAR_BANDA_GRIS'));

  const sinFiltro = await escanear('/trabajo-de-vendedor-en-rmetropolitan', tarjetas());
  check('búsqueda sin filtro de jornada: la tarjeta va sin texto', sinFiltro.evaluadas[0] && sinFiltro.evaluadas[0].cuerpo === '', sinFiltro.evaluadas[0]);
  check('...y la que no dice jornada sigue en duda, como antes', sinFiltro.evaluadas[0].banda === 'gris' && sinFiltro.mensajes.some(m => m.type === 'REPORTAR_BANDA_GRIS'), sinFiltro.evaluadas[0]);

  // ── 2. Aprobadas: dónde se abren (urlParaPostular, background.js real) ──
  {
    // Sin los "\r" de Windows: el corte busca el cierre de la función.
    const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8').replace(/\r\n/g, '\n');
    const ini = src.indexOf('function urlParaPostular');
    const fin = src.indexOf('\n}\n', ini) + 3;
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(src.slice(ini, fin) + '\nthis.urlParaPostular = urlParaPostular;', ctx);
    const f = ctx.urlParaPostular;
    check('Computrabajo: la aprobada se abre en el panel de un listado ("trabajo-de-{palabra}#ID")', f(URL_AVISO, 'Computrabajo') === 'https://cl.computrabajo.com/trabajo-de-vendedora#' + ID, f(URL_AVISO, 'Computrabajo'));
    check('...Laborum y Trabajando se abren tal cual', f('https://www.laborum.cl/empleos/vendedor-1118460672.html', 'Laborum') === 'https://www.laborum.cl/empleos/vendedor-1118460672.html' && f('https://www.trabajando.cl/trabajo/6131055-vendedor', 'Trabajando') === 'https://www.trabajando.cl/trabajo/6131055-vendedor');
    check('...una dirección de Computrabajo sin el código del aviso queda igual', f('https://cl.computrabajo.com/algo', 'Computrabajo') === 'https://cl.computrabajo.com/algo');
  }

  // ── 3. La pestaña de la aprobada no escanea el listado ──
  {
    const t = crear({ pathname: '/trabajo-de-vendedora', hash: '#' + ID, tarjetas: tarjetas() });
    t.AP.onInit();
    await t.AP.escanear();
    await esperarTodo();
    check('listado abierto con "#ID": no escanea sus ofertas (antes podía postular a otras)', t.evaluadas.length === 0, t.evaluadas.map(e => e.titulo));
    t.AP.escaneoPedido = true;
    await t.AP.escanear();
    await esperarTodo();
    check('...salvo que se lo pidan (Escanear)', t.evaluadas.length === 2);
  }

  // ── 4. La aprobada postula en el panel, con el código y el título del panel ──
  {
    const panel = el({ innerText: 'Vendedora volante 30hrs pm · Ya aplicaste', sel: {
      '.offer-detail-applied:not(.hide), span.b_primary.postulated:not(.hide)': [el({})],
    } });
    const t = crear({ pathname: '/trabajo-de-vendedora', hash: '#' + ID, selectores: {
      '.box_detail span[offer-detail-button], [data-offers-grid-box-detail] span[offer-detail-button]': [el({})],
      '.box_detail p.title_offer, [data-offers-grid-box-detail] p.title_offer': [el({ textContent: 'Vendedora volante 30hrs pm' })],
      '.box_detail,[data-offers-grid-box-detail]': [panel],
    } });
    const r = await t.AP.aplicarDirecto('decision-1', URL_AVISO);
    const entrada = t.AP.log[t.AP.log.length - 1] || {};
    check('aprobada ya postulada: la reconoce en el panel y la da por vencida', r && r.ok === false && r.expirada === true, r);
    check('...con el código del aviso (del "#") y el título del panel, no el del listado', entrada.uid === ID && entrada.title === 'Vendedora volante 30hrs pm', entrada);
    check('...y la dirección del aviso, no la del listado', entrada.url === URL_AVISO, entrada.url);
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
