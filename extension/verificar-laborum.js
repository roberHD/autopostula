// Verificación del escaneo de Laborum (adapters/laborum.js), con el arreglo del
// 2026-10-01: en las ráfagas Laborum abría avisos y cerraba la pestaña sin
// postular. Carga core.js y adapters/laborum.js REALES en un vm de Node, con un
// DOM falso armado con la estructura que se leyó en el sitio real ese día
// (tarjetas del listado, ficha del aviso con su lista "Información adicional
// del aviso", avisos relacionados en la página de un aviso).
// El flujo completo contra el sitio real (listado → aviso → listado, con el
// envío bloqueado) se verificó a mano el 2026-10-01; ver
// docs/extension-laborum-2026-10-01.md.
// No está conectado a CI, es para correr a mano: node verificar-laborum.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? extra : ''); }
  else console.log('✓ ' + desc);
}

// ── DOM falso ─────────────────────────────────────────────────────
// Cada elemento responde querySelector/querySelectorAll solo con los
// selectores que usa el adaptador, declarados a mano en `sel`.
function el(props) {
  const e = Object.assign({
    tagName: 'DIV', textContent: '', innerText: '', id: '', href: '', sel: {},
    offsetParent: {}, attrs: {},
  }, props);
  e.querySelectorAll = (s) => e.sel[s] || [];
  e.querySelector = (s) => (e.sel[s] || [])[0] || null;
  e.closest = () => e.padre || e;
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  e.getBoundingClientRect = () => ({ width: 10, height: 10 });
  if (!e.innerText) e.innerText = e.textContent;
  return e;
}

function tarjeta({ id, titulo, empresa, ubicacion }) {
  const contUbic = el({ textContent: ubicacion || 'Santiago de Chile, Región Metropolitana' });
  const icono = el({ tagName: 'I', padre: contUbic });
  const cabecera = el({ sel: { h3: [el({ textContent: 'Publicado hace 2 horas' }), el({ textContent: empresa || 'Empresa SpA' })] } });
  return el({
    tagName: 'A', href: 'https://www.laborum.cl/empleos/' + titulo.toLowerCase().replace(/\W+/g, '-') + '-' + id + '.html',
    sel: {
      h2: [el({ textContent: titulo })],
      ['#header-col-job-posting-' + id]: [cabecera],
      'i[name="icon-light-location-pin"]': [icono],
    },
  });
}

// La página de un aviso: título, ficha con su lista, descripción y, aparte,
// enlaces a avisos relacionados (con la misma forma que las tarjetas).
function paginaDeAviso({ titulo, ficha, descripcion, empresa, relacionados }) {
  const lis = (ficha || []).map(t => el({ tagName: 'LI', textContent: t }));
  const ul = el({ tagName: 'UL', sel: { li: lis } });
  const desc = el({ id: 'descripcion-aviso', textContent: descripcion || '', innerText: descripcion || '' });
  const contUbic = el({ textContent: 'Santiago de Chile, Región Metropolitana, Chile' });
  const fichaEl = el({
    id: 'ficha-detalle',
    sel: {
      'ul[aria-label="Información adicional del aviso"]': [ul],
      '#descripcion-aviso': [desc],
      'i[name="icon-light-location-pin"]': [el({ tagName: 'I', padre: contUbic })],
    },
  });
  return {
    porId: { 'ficha-detalle': fichaEl },
    sel: {
      h1: [el({ tagName: 'H1', textContent: titulo })],
      'h1,h2,h3': [el({ tagName: 'H1', textContent: titulo })],
      '#descripcion-aviso': [desc],
      'a[href*="/perfiles/empresa_"]': empresa ? [el({ tagName: 'A', textContent: empresa })] : [],
      'a[href^="/empleos/"]': (relacionados || []).map(tarjeta),
      button: [],
    },
  };
}

// ── Contexto: core.js + laborum.js reales ─────────────────────────
function crear({ pathname, historia, pagina, sesion, perfil, cfgExtra }) {
  const mensajes = [];
  const navegaciones = [];
  const sesionStorage = Object.assign({}, sesion || {});
  const local = { config: null, active: true, log: [] };
  const doc = {
    documentElement: {}, body: { innerText: '' }, hidden: false,
    querySelector: (s) => ((pagina.sel || {})[s] || [])[0] || null,
    querySelectorAll: (s) => (pagina.sel || {})[s] || [],
    getElementById: (id) => (pagina.porId || {})[id] || null,
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener() {},
  };
  const ubicacion = {
    pathname, hostname: 'www.laborum.cl',
    get href() { return 'https://www.laborum.cl' + this.pathname; },
    set href(v) { navegaciones.push(v); },
  };
  const ctx = {
    document: doc,
    location: ubicacion,
    history: { length: historia, back() { navegaciones.push('atrás'); } },
    sessionStorage: {
      getItem: (k) => (k in sesionStorage ? sesionStorage[k] : null),
      setItem: (k, v) => { sesionStorage[k] = String(v); },
      removeItem: (k) => { delete sesionStorage[k]; },
    },
    localStorage: { getItem: () => null, setItem() {} },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage(m, cb) {
          mensajes.push(m);
          let r = { ok: true };
          if (m.type === 'PUEDE_POSTULAR') r = { permitido: true };
          if (m.type === 'DUPLICADOS') r = { duplicados: [] };
          if (typeof cb === 'function') { Promise.resolve().then(() => cb(r)); return; }
          return Promise.resolve(r);
        },
      },
      storage: {
        local: { get: (_k, cb) => cb && cb(JSON.parse(JSON.stringify(local))), set: (o, cb) => { Object.assign(local, o); if (cb) cb(); } },
        sync: { get: (_k, cb) => cb && cb({}), set() {} },
        onChanged: { addListener() {} },
      },
    },
    console: { log() {}, warn() {}, error: console.error },
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    MutationObserver: class { observe() {} disconnect() {} },
    NodeFilter: { SHOW_TEXT: 4 },
    CSS: { escape: (s) => s },
    getComputedStyle: () => ({ visibility: 'visible' }),
    URL, URLSearchParams,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'data', 'comunas-cl.js'), 'utf8'), ctx, { filename: 'comunas-cl.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;
  AP.msg = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'adapters', 'laborum.js'), 'utf8'), ctx, { filename: 'laborum.js' });

  AP.cfg = Object.assign({
    active: true,
    scorer: { usarScorerLocal: true, versionPerfil: 1, perfilCompilado: perfil },
  }, cfgExtra || {});
  AP.activo = true;
  AP.log = [];
  // Lo que el scorer recibió, sin cambiar lo que decide.
  const evaluadas = [];
  const evaluarReal = AP.evaluarOferta;
  AP.evaluarOferta = (campos) => { const r = evaluarReal(campos); evaluadas.push({ campos, banda: r.banda }); return r; };
  const terminados = () => mensajes.filter(m => m.type === 'ESCANEO_TERMINADO');
  return { AP, ctx, mensajes, navegaciones, sesion: sesionStorage, local, evaluadas, terminados };
}

async function esperarTodo() { for (let i = 0; i < 80; i++) await new Promise(r => setImmediate(r)); }

const comunasRM = (() => {
  const c = {}; c.self = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'data', 'comunas-cl.js'), 'utf8'), c);
  return c.AP.COMUNAS_CL.filter(x => x.region === 'RM').map(x => x.nombre);
})();
const PERFIL = {
  roles: [{ canonico: 'vendedor', sinonimos: [], peso: 1 }],
  ubicacion: { comunas: comunasRM, aceptaRemoto: false },
  jornada: 'part_time',
  umbralPostular: 65, umbralGris: 45,
};
const LISTADO_PT = '/en-region-metropolitana/empleos-part-time-busqueda-vendedor.html';

(async () => {
  // ── 1. Mientras la pestaña navega o postula, no se le avisa a la ráfaga ──
  // El bug: un escaneo que llegaba en ese momento veía "procesando" y mandaba
  // ESCANEO_TERMINADO; la ráfaga cerraba la pestaña con el aviso recién abierto.
  {
    const t = crear({ pathname: LISTADO_PT, historia: 2, pagina: { sel: { 'a[href^="/empleos/"]': [tarjeta({ id: 1, titulo: 'Vendedor de tienda' })] } }, perfil: PERFIL });
    t.AP.navegando = true;
    await t.AP.escanear();
    await esperarTodo();
    check('navegando: no escanea ni avisa que terminó', t.terminados().length === 0 && t.evaluadas.length === 0);
    t.AP.navegando = false;
    t.AP.procesando = true;
    await t.AP.escanear();
    await esperarTodo();
    check('postulando: tampoco avisa que terminó (antes cerraba la pestaña)', t.terminados().length === 0);
  }

  // ── 2. La búsqueda filtrada por jornada: la tarjeta lleva esa jornada ──
  {
    const t = crear({ pathname: LISTADO_PT, historia: 1, pagina: { sel: { 'a[href^="/empleos/"]': [tarjeta({ id: 11, titulo: 'Vendedor de tienda' })] } }, perfil: PERFIL });
    await t.AP.escanear();
    await esperarTodo();
    const ev = t.evaluadas[0];
    check('listado part time: el scorer recibe "Part-time" como texto de la tarjeta', ev && ev.campos.cuerpo === 'Part-time', ev && ev.campos);
    check('...y la tarjeta queda para postular (antes: "no dice la jornada", Por decidir)', ev && ev.banda === 'postular', ev && ev.banda);
    check('abre el aviso en la misma pestaña', t.navegaciones.length === 1 && /-11\.html$/.test(t.navegaciones[0]), t.navegaciones);
    const pendiente = JSON.parse(t.sesion.ap_aviso_pendiente || 'null');
    check('...con lo que decía la tarjeta y el listado al que volver', pendiente && pendiente.id === '11' && pendiente.empresa === 'Empresa SpA' && /empleos-part-time-busqueda-vendedor\.html$/.test(pendiente.desde), pendiente);
    check('no avisa que terminó: todavía falta el aviso', t.terminados().length === 0);

    const sin = crear({ pathname: '/en-region-metropolitana/empleos-busqueda-vendedor.html', historia: 1, pagina: { sel: { 'a[href^="/empleos/"]': [tarjeta({ id: 12, titulo: 'Vendedor de tienda' })] } }, perfil: PERFIL });
    await sin.AP.escanear();
    await esperarTodo();
    check('listado sin filtro de jornada: la tarjeta va sin texto', sin.evaluadas[0] && sin.evaluadas[0].campos.cuerpo === '');
    check('...queda en duda y se abre para revisar (Etapa 2)', sin.evaluadas[0].banda === 'gris' && /-12\.html$/.test(sin.navegaciones[0] || ''), sin.navegaciones);
  }

  // ── 3. Pestaña abierta directo en un aviso (una aprobada de "Por decidir") ──
  // Los avisos relacionados de la página no son un listado: antes se
  // escaneaban y la pestaña podía irse a otro aviso antes de la orden.
  {
    const pagina = paginaDeAviso({
      titulo: 'Vendedor/a 30 hrs RayBan Mall Parque Arauco', ficha: ['Presencial', 'Ventas', 'Part-time, Indeterminado'],
      descripcion: 'Atención de clientes en tienda.', empresa: 'EssilorLuxottica',
      relacionados: [{ id: 21, titulo: 'Vendedor part time' }, { id: 22, titulo: 'Vendedora part time' }],
    });
    const t = crear({ pathname: '/empleos/vendedor-a-30-hrs-rayban-1118460672.html', historia: 1, pagina, perfil: PERFIL });
    await t.AP.escanear();
    await esperarTodo();
    check('aviso abierto directo: no escanea los relacionados', t.evaluadas.length === 0, t.evaluadas.map(e => e.campos.titulo));
    check('...no navega a ninguna parte', t.navegaciones.length === 0, t.navegaciones);
    check('...ni le pregunta nada al servidor', !t.mensajes.some(m => m.type === 'DUPLICADOS' || m.type === 'PUEDE_POSTULAR'));
  }

  // ── 4. Aviso abierto desde el listado: se puntúa con su ficha completa ──
  {
    const pendiente = { id: '31', titulo: 'Vendedor/a 40 hrs Mall Los Dominicos', url: 'https://www.laborum.cl/empleos/vendedor-a-40-hrs-31.html', empresa: 'Tienda SpA', ubicacion: 'Las Condes, Región Metropolitana', desde: 'https://www.laborum.cl' + LISTADO_PT };
    const pagina = paginaDeAviso({ titulo: pendiente.titulo, ficha: ['Presencial', 'Ventas', 'Full-time, Indeterminado', 'Junior'], descripcion: 'Buscamos vendedor para tienda.' });
    const t = crear({ pathname: '/empleos/vendedor-a-40-hrs-31.html', historia: 2, pagina, sesion: { ap_aviso_pendiente: JSON.stringify(pendiente), ap_conteos_laborum: JSON.stringify({ postular: 1 }) }, perfil: PERFIL });
    await t.AP.escanear();
    await esperarTodo();
    const ev = t.evaluadas[0];
    check('el texto que puntúa empieza con la ficha del aviso', ev && ev.campos.cuerpo.startsWith('Presencial · Ventas · Full-time, Indeterminado · Junior'), ev && ev.campos.cuerpo);
    check('...con la empresa y la comuna de la tarjeta', ev && ev.campos.empresa === 'Tienda SpA' && ev.campos.ubicacion === pendiente.ubicacion);
    check('ficha "Full-time" con part time declarado -> descarta (antes: Por decidir)', ev && ev.banda === 'descartar');
    const d = t.mensajes.find(m => m.type === 'REPORTAR_DESCARTES');
    check('...el descarte va al panel con su razón y la evaluación', d && d.descartes[0].razon.tipo === 'jornada' && !!d.descartes[0].entrada, d && d.descartes[0]);
    check('...queda anotado en el log (el listado no lo vuelve a abrir)', t.local.log.some(e => e.uid === '31'));
    check('...y vuelve al listado del que salió', t.navegaciones[t.navegaciones.length - 1] === pendiente.desde, t.navegaciones);
    check('el pendiente se borra', !('ap_aviso_pendiente' in t.sesion));
    check('los conteos de la pestaña suman el descarte a lo que ya había', JSON.parse(t.sesion.ap_conteos_laborum).descartar === 1 && JSON.parse(t.sesion.ap_conteos_laborum).postular === 1);
    check('no avisa que terminó: vuelve al listado', t.terminados().length === 0);
  }

  // ── 5. Fin del escaneo: la ráfaga recibe lo de todas las páginas ──
  {
    const tarjetas = [tarjeta({ id: 41, titulo: 'Cajero bancario' }), tarjeta({ id: 42, titulo: 'Bodeguero' })];
    const t = crear({ pathname: LISTADO_PT, historia: 5, pagina: { sel: { 'a[href^="/empleos/"]': tarjetas } }, sesion: { ap_conteos_laborum: JSON.stringify({ postular: 2, gris: 1, descartar: 3 }) }, perfil: PERFIL });
    await t.AP.escanear();
    await esperarTodo();
    const fin = t.terminados();
    check('nada más que hacer: avisa que terminó una vez', fin.length === 1, fin);
    check('...con lo de las pasadas anteriores más esta (2 postuladas, 1 por decidir, 5 descartadas)', fin[0] && fin[0].conteos.postular === 2 && fin[0].conteos.gris === 1 && fin[0].conteos.descartar === 5, fin[0] && fin[0].conteos);
    check('...y deja los conteos en cero para el próximo escaneo', !('ap_conteos_laborum' in t.sesion));
  }

  // ── 6. Un aviso que se fue a abrir y Laborum mostró otro ──
  {
    const pendiente = { id: '51', titulo: 'Vendedor', url: 'https://www.laborum.cl/empleos/vendedor-51.html', desde: 'https://www.laborum.cl' + LISTADO_PT };
    const pagina = paginaDeAviso({ titulo: 'Otro aviso', ficha: ['Part-time, Indeterminado'] });
    const t = crear({ pathname: '/empleos/otro-aviso-52.html', historia: 3, pagina, sesion: { ap_aviso_pendiente: JSON.stringify(pendiente) }, perfil: PERFIL });
    await t.AP.escanear();
    await esperarTodo();
    check('otro aviso que el pedido: no lo puntúa ni postula', t.evaluadas.length === 0);
    check('...anota el pedido para no reintentarlo y vuelve al listado', t.local.log.some(e => e.uid === '51' && e.status === 'err') && t.navegaciones[0] === pendiente.desde, t.navegaciones);
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
