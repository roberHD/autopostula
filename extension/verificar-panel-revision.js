// Verificación del panel de revisión del portal (docs/panel-de-revision-en-el-portal.md):
//   1. Lo que se guarda de cada oferta al marcarla, y la lista del panel.
//   2. Los textos: la cabeza (eligiendo, enviando, terminado) y el pie, con el cupo.
//   3. El panel en la página: grupos, casillas, "no calzan" plegado, "ver más".
//   4. Apretar "Postular": qué se manda, qué hace el cupo, el avance de la cola,
//      y que cerrar sin apretar no manda nada.
//   5. Con la cuenta postulando, lo que el escaneo ya envió sale sin casilla.
//   6. Los mensajes del popup, la revisión de la primera y lo que la pestaña
//      recuerda para no volver a postular sola lo que se decidió.
// Carga core.js REAL en un vm de Node con un DOM falso mínimo (el mismo enfoque
// que verificar-primera-busqueda.js). La cola de background.js se prueba en
// verificar-rafagas.js (bloque 21).
// No está conectado a CI, es para correr a mano: node verificar-panel-revision.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? JSON.stringify(extra) : ''); }
  else console.log('✓ ' + desc);
}

// ── DOM falso ─────────────────────────────────────────────────────
function crearElemento(tag) {
  const clases = new Set();
  let texto = '';
  const e = {
    tagName: String(tag || 'div').toUpperCase(), nodeType: 1, id: '', hidden: false, disabled: false, checked: false,
    title: '', onclick: null, onchange: null, href: '', type: '', scrollTop: 0,
    style: {}, attrs: {}, children: [], listeners: {}, shadowRoot: null, parent: null,
    scrollWidth: 0, clientWidth: 0,
  };
  Object.defineProperty(e, 'textContent', {
    get: () => texto + e.children.map(h => h.textContent).join(''),
    set: (v) => { texto = String(v); e.children = []; },
  });
  Object.defineProperty(e, 'className', {
    get: () => [...clases].join(' '),
    set: (v) => { clases.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => clases.add(c)); },
  });
  e.classList = {
    add: (...c) => c.forEach(x => clases.add(x)), remove: (...c) => c.forEach(x => clases.delete(x)),
    toggle: (c, f) => { const v = f === undefined ? !clases.has(c) : !!f; if (v) clases.add(c); else clases.delete(c); return v; },
    contains: (c) => clases.has(c),
  };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  e.hasAttribute = (k) => k in e.attrs;
  e.addEventListener = (t, fn) => { (e.listeners[t] = e.listeners[t] || []).push(fn); };
  e.appendChild = (h) => { h.parent = e; e.children.push(h); return h; };
  e.remove = () => { if (e.parent) e.parent.children = e.parent.children.filter(c => c !== e); e.parent = null; };
  e.querySelector = () => null;
  e.attachShadow = () => { e.shadowRoot = crearRaizSombra(); return e.shadowRoot; };
  e.getBoundingClientRect = () => ({ width: 0, height: 0 });
  return e;
}

function crearRaizSombra() {
  const porId = new Map();
  const porSelector = new Map();
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; porId.clear(); porSelector.clear(); },
    getElementById(id) { if (!porId.has(id)) { const x = crearElemento('div'); x.id = id; porId.set(id, x); } return porId.get(id); },
    querySelector(s) { if (!porSelector.has(s)) porSelector.set(s, crearElemento('div')); return porSelector.get(s); },
  };
}

// ── Contexto: core.js real ────────────────────────────────────────
function crear({ cfg, sesion, docSel, host, log, cupo } = {}) {
  const mensajes = [];
  const timers = [];
  const navegaciones = [];
  const abiertas = [];
  const listeners = [];
  const guardado = Object.assign({}, sesion || {});
  let responder = (m) => {
    if (m.type === 'PUEDE_POSTULAR') return cupo === undefined ? { permitido: true, motivo: null, restantes: 15 } : cupo;
    return { ok: true };
  };
  const sel = docSel || {};
  const doc = {
    body: crearElemento('body'), documentElement: crearElemento('html'), hidden: false,
    createElement: crearElemento,
    querySelector: (s) => (sel[s] || [])[0] || null,
    querySelectorAll: (s) => sel[s] || [],
    getElementById: () => null,
    addEventListener() {},
  };
  const nombreHost = host || 'cl.computrabajo.com';
  const ubicacion = {
    hostname: nombreHost, pathname: '/trabajo-de-vendedora', origin: 'https://' + nombreHost, _href: null,
    get href() { return this._href || 'https://' + nombreHost + this.pathname; },
    set href(v) { navegaciones.push(v); },
  };
  const ctx = {
    document: doc,
    location: ubicacion,
    sessionStorage: {
      getItem: (k) => (k in guardado ? guardado[k] : null),
      setItem: (k, v) => { guardado[k] = String(v); },
      removeItem: (k) => { delete guardado[k]; },
    },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener: (fn) => listeners.push(fn) },
        sendMessage(m, cb) {
          mensajes.push(m);
          const r = responder(m);
          if (typeof cb === 'function') { Promise.resolve().then(() => cb(r)); return; }
          return Promise.resolve(r);
        },
      },
      storage: { local: { get: (_k, cb) => cb && cb({}), set() {} }, sync: { get: (_k, cb) => cb && cb({}), set() {} }, onChanged: { addListener() {} } },
    },
    console: { log() {}, warn() {}, error: console.error },
    setTimeout: (fn, ms) => { timers.push({ fn, ms: ms || 0 }); return timers.length; },
    clearTimeout: () => {},
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    URL, URLSearchParams,
    open: (url, destino) => { abiertas.push([url, destino]); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;
  AP.cfg = cfg || { active: true, postulacionHabilitada: false };
  AP.activo = true;
  if (log) AP.log = log;
  const raiz = () => (doc.body.children.find(c => c.id === 'ap-ov') || {}).shadowRoot;
  return {
    AP, ctx, mensajes, timers, navegaciones, abiertas, listeners, guardado, raiz,
    responderCon: (fn) => { responder = fn; },
    mensaje: (m) => { let r; listeners.forEach(fn => fn(m, {}, (x) => { r = x; })); return r; },
    correrTimers: (minMs) => {
      for (let vuelta = 0; vuelta < 50 && timers.length; vuelta++) {
        const t = timers.shift();
        if (minMs !== undefined && t.ms < minMs) continue;
        t.fn();
      }
    },
  };
}

const esperar = () => new Promise(r => setImmediate(r));

// Lo que muestra el panel, leído del DOM falso: grupos con sus filas.
function leerPanel(r) {
  const lista = r.getElementById('ap-ov-panel-lista');
  return lista.children.map((grupo) => {
    const cab = grupo.children[0];
    const ul = grupo.children[1];
    const mas = grupo.children[2] || null;
    const ver = cab.children[2] || null;
    return {
      banda: ['postular', 'gris', 'descartar'].find(b => cab.classList.contains(b)),
      nombre: cab.children[1].textContent,
      ver,
      mas,
      filas: ul.children.map((li) => {
        const fila = li.children[0];
        const casilla = fila.children.find(h => h.tagName === 'INPUT') || null;
        const txt = fila.children.find(h => h.className === 'txt');
        const estado = fila.children[fila.children.length - 1];
        return {
          casilla, fija: fila.classList.contains('fija'),
          titulo: txt.children[0].textContent, meta: txt.children[1].textContent, razon: txt.children[2].textContent,
          estado: estado.textContent, estadoClase: estado.className,
        };
      }),
    };
  });
}

const ROL = { tipo: 'rol', rol: 'vendedor', termino: 'vendedora' };
const JORNADA = { tipo: 'jornada_desconocida', declarada: 'part_time' };
const LUGAR = { tipo: 'ubicacion', ofertaEn: 'maipu', buscadas: ['ñuñoa'] };
const URL_CT = (id) => 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-vendedor-' + id;

// Una página con 3 que sirven, 2 dudosas y 4 descartadas (una repetida).
function conPagina(t, extra) {
  const ids = ['P1', 'P2', 'P3', 'G1', 'G2', 'D1', 'D2', 'D3', 'D4'].concat(extra || []);
  t.AP.tarjetasDeLaPagina = () => ids.map(id => ({ el: crearElemento('article'), id }));
  const datos = (id, score, empresa, comuna) => ({ titulo: 'Oferta ' + id, empresa, url: URL_CT(id), ubicacion: comuna, score });
  t.AP.marcar('P1', 'postular', [ROL], datos('P1', 80, 'Falabella', 'Ñuñoa'));
  t.AP.marcar('P2', 'postular', [ROL], datos('P2', 75, 'Ripley', 'Providencia'));
  t.AP.marcar('P3', 'postular', [ROL], datos('P3', 70, null, 'La Reina'));
  t.AP.marcar('G1', 'gris', [ROL, JORNADA], datos('G1', 55, 'Líder', 'Ñuñoa'));
  t.AP.marcar('G2', 'gris', [JORNADA], { titulo: 'Oferta G2', empresa: 'Agencia', url: null, ubicacion: 'Santiago', score: 50 });
  t.AP.marcar('D1', 'descartar', [LUGAR], datos('D1', 20, 'Transportes', 'Maipú'));
  t.AP.marcar('D2', 'descartar', [LUGAR], datos('D2', 25, 'Bodega', 'Maipú'));
  t.AP.marcar('D3', 'descartar', [LUGAR], datos('D3', 30, 'Retail', 'Maipú'));
  t.AP.marcar('D4', 'postular', [ROL], datos('D4', 72, 'Paris', 'Ñuñoa'));
  t.AP.marcar('D4', 'descartar', [{ tipo: 'duplicado', fecha: '2026-10-03' }]); // resultó repetida, sin datos nuevos
}

(async () => {
  // ── 1. Lo que se guarda de cada oferta ──────────────────────────
  {
    const t = crear();
    conPagina(t);
    const guardadas = JSON.parse(t.guardado.ap_ofertas);
    check('cada oferta marcada guarda su título, empresa, comuna, enlace, puntaje y razones', guardadas.P1.t === 'Oferta P1' && guardadas.P1.e === 'Falabella' && guardadas.P1.l === 'Ñuñoa' && guardadas.P1.u === URL_CT('P1') && guardadas.P1.s === 80 && guardadas.P1.rz.length === 1, guardadas.P1);
    check('...con la banda que tenía al guardarse', guardadas.G1.b === 'gris');
    const marcas = JSON.parse(t.guardado.ap_marcas);
    check('las marcas siguen como antes (lo nuevo va aparte)', marcas.P1.b === 'postular' && marcas.P1.r.tipo === 'rol' && !('t' in marcas.P1));
    const lista = t.AP.ofertasDelPanel();
    check('la lista del panel va por grupo, y dentro de cada uno en el orden de la página', lista.map(o => o.id).join() === 'P1,P2,P3,G1,G2,D1,D2,D3,D4');
    const revuelta = crear();
    revuelta.AP.tarjetasDeLaPagina = () => ['D1', 'G1', 'P1', 'D2', 'P2'].map(id => ({ el: crearElemento('article'), id }));
    ['D1', 'D2'].forEach(id => revuelta.AP.marcar(id, 'descartar', [LUGAR], { titulo: id, url: URL_CT(id) }));
    revuelta.AP.marcar('G1', 'gris', [JORNADA], { titulo: 'G1', url: URL_CT('G1') });
    ['P1', 'P2'].forEach(id => revuelta.AP.marcar(id, 'postular', [ROL], { titulo: id, url: URL_CT(id) }));
    check('...aunque en la página vengan mezcladas (es también el orden en que se envían)', revuelta.AP.ofertasDelPanel().map(o => o.id).join() === 'P1,P2,G1,D1,D2', revuelta.AP.ofertasDelPanel().map(o => o.id));
    const d4 = lista.find(o => o.id === 'D4');
    check('una que resultó repetida después: vale la razón de la marca, no la de su primera evaluación', d4.banda === 'descartar' && d4.repetida === true && d4.razones[0].tipo === 'duplicado', d4);
    check('...pero conserva su título y enlace', d4.titulo === 'Oferta D4' && d4.url === URL_CT('D4'));
    t.AP.tarjetasDeLaPagina = () => [{ el: crearElemento('article'), id: 'P1' }, { el: crearElemento('article'), id: 'P1' }, { el: crearElemento('article'), id: 'SIN' }];
    check('la misma oferta dos veces en la página va una vez; una sin marca no va', t.AP.ofertasDelPanel().map(o => o.id).join() === 'P1');
    for (let i = 0; i < 320; i++) t.AP.marcar('X' + i, 'descartar', [LUGAR], { titulo: 'X' + i, url: URL_CT('X' + i) });
    check('se guardan hasta 300, las más viejas se van primero', Object.keys(JSON.parse(t.guardado.ap_ofertas)).length === 300);
  }

  // ── 2. Los textos ───────────────────────────────────────────────
  {
    const { AP } = crear();
    let x = AP.textoPiePanel(3, { permitido: true, restantes: 15 }, 'Computrabajo', false);
    check('el pie: cuántas y el botón, con el número', x.cuenta === 'Vas a postular a 3 ofertas.' && x.boton === 'Postular a las 3' && x.accion === 'postular' && x.enviar === 3, x);
    x = AP.textoPiePanel(1, null, 'Laborum', false);
    check('...una sola, en singular; sin saber el cupo se deja postular', x.cuenta === 'Vas a postular a una oferta.' && x.boton === 'Postular a una' && x.enviar === 1, x);
    x = AP.textoPiePanel(0, { permitido: true, restantes: 15 }, 'Laborum', false);
    check('ninguna marcada: el botón no hace nada', x.accion === null && x.cuenta === 'No marcaste ninguna.', x);
    x = AP.textoPiePanel(12, { permitido: true, restantes: 8 }, 'Laborum', false);
    check('§2.3: marcó más de lo que queda: lo dice, y ofrece enviar las primeras', x.cupo === 'Marcaste 12 y te quedan 8 postulaciones este mes. Saca 4, o envío las primeras 8.' && x.boton === 'Postular a las primeras 8' && x.enviar === 8, x);
    x = AP.textoPiePanel(3, { permitido: true, restantes: 1 }, 'Laborum', false);
    check('...con una sola que queda, en singular', x.cupo === 'Marcaste 3 y te queda 1 postulación este mes. Saca 2, o envío la primera.' && x.boton === 'Postular a la primera' && x.enviar === 1, x);
    x = AP.textoPiePanel(3, { permitido: false, motivo: 'limite', restantes: 0 }, 'Laborum', false);
    check('sin cupo: el botón lleva a conseguir más, sin enviar nada', x.accion === 'comprar' && x.enviar === 0 && x.cupo === 'Ya usaste las postulaciones de este mes.', x);
    x = AP.textoPiePanel(3, { permitido: false, motivo: 'portal' }, 'Trabajando', false);
    check('el portal no está conectado: lo dice, y el botón lleva a conectarlo', x.accion === 'conectar' && x.boton === 'Conectar Trabajando', x);
    x = AP.textoPiePanel(3, null, 'Computrabajo', true);
    check('sin sesión en el portal: antes que todo, iniciarla', x.accion === 'sesion' && x.boton === 'Iniciar sesión en Computrabajo' && x.cupo === 'Para postular necesitas tu sesión iniciada en Computrabajo.', x);

    let c = AP.textoCabezaPanel('eligiendo', { total: 20, observando: true });
    check('la cabeza mirando: cuántas revisó, que todavía no envió nada y que nada sale sin el botón', c.titulo === 'Revisé 20 ofertas de esta página' && c.quien === 'AutoPostula · todavía no envió nada' && /No se envía nada hasta que aprietes el botón/.test(c.ayuda), c);
    c = AP.textoCabezaPanel('eligiendo', { total: 1, observando: false });
    check('...postulando: una sola, y que las que sirven ya las envió', c.titulo === 'Revisé 1 oferta de esta página' && c.quien === 'AutoPostula' && /ya las envié/.test(c.ayuda), c);
    c = AP.textoCabezaPanel('enviando', { enviando: 3, primeraConRevision: true });
    check('enviando: a cuántas, cómo (de a una, en otra pestaña) y que la primera se muestra antes', c.titulo === 'Postulando a 3 ofertas…' && /de a una, en otra pestaña/.test(c.ayuda) && /La primera te la muestro antes de enviarla/.test(c.ayuda), c);
    c = AP.textoCabezaPanel('listo', { enviando: 3, enviadas: 3 });
    check('terminado, todas: "Listo: postulaste a 3 ofertas."', c.titulo === 'Listo: postulaste a 3 ofertas.' && c.ayuda === '', c);
    c = AP.textoCabezaPanel('listo', { enviando: 3, enviadas: 2, sinCupo: 1 });
    check('...algunas: cuántas de cuántas, y por qué no las otras', c.titulo === 'Postulaste a 2 de 3.' && c.ayuda === 'Se acabaron las postulaciones del mes.', c);
    c = AP.textoCabezaPanel('listo', { enviando: 3, enviadas: 1, reintentos: 2 });
    check('...las que fallaron por otra cosa: se reintentan solas', c.titulo === 'Postulaste a 1 de 3.' && c.ayuda === 'Las que no se pudieron se vuelven a intentar solas más tarde.', c);
    c = AP.textoCabezaPanel('listo', { enviando: 2, enviadas: 0, enCola: 2 });
    check('...ninguna, con las que siguen en cola', c.titulo === 'No se pudo enviar ninguna.' && c.ayuda === 'Las que quedaron en cola se envían solas más tarde.', c);
  }

  // ── 3. El panel en la página (mirando) ──────────────────────────
  {
    const t = crear();
    conPagina(t);
    check('abre con las ofertas de la página', t.AP.abrirPanel() === true);
    await esperar();
    const r = t.raiz();
    check('se ve, en el lugar de la tarjeta y el aviso', r.getElementById('ap-ov-panel').hidden === false && r.querySelector('.pila').classList.contains('con-panel'));
    check('la cabeza dice cuántas revisó', r.getElementById('ap-ov-panel-t').textContent === 'Revisé 9 ofertas de esta página');
    let g = leerPanel(r);
    check('tres grupos, en orden, con cuántas tiene cada uno', g.map(x => x.nombre).join(' | ') === 'Te sirven · 3 | Para que decidas · 2 | No calzan · 4', g.map(x => x.nombre));
    check('las que te sirven vienen marcadas; las dudosas no', g[0].filas.every(f => f.casilla && f.casilla.checked) && g[1].filas[0].casilla && !g[1].filas[0].casilla.checked);
    check('cada fila: título, empresa · comuna y la razón con las palabras del panel', g[0].filas[0].titulo === 'Oferta P1' && g[0].filas[0].meta === 'Falabella · Ñuñoa' && g[0].filas[0].razon === 'Es de vendedor, lo que buscas (dice "vendedora")', g[0].filas[0]);
    check('sin empresa, solo la comuna', g[0].filas[2].meta === 'La Reina');
    check('la dudosa dice lo que la dejó en duda', g[1].filas[0].razon === 'No dice la jornada, y buscas part time', g[1].filas[0].razon);
    check('una sin enlace no se puede marcar, y dice por qué', !g[1].filas[1].casilla && g[1].filas[1].fija && /No pude leer su enlace/.test(g[1].filas[1].razon), g[1].filas[1]);
    check('"No calzan" viene plegado: se ve el botón para verlas, no las filas', g[2].filas.length === 0 && g[2].ver.textContent === 'Ver las 4' && g[2].ver.getAttribute('aria-expanded') === 'false');
    check('el pie: 3 marcadas y el botón con el número', r.getElementById('ap-ov-panel-cuenta').textContent === 'Vas a postular a 3 ofertas.' && r.getElementById('ap-ov-panel-si').textContent === 'Postular a las 3');

    g[2].ver.onclick();
    g = leerPanel(r);
    check('"Ver las 4" despliega los descartes', g[2].filas.length === 4 && g[2].ver.textContent === 'Ocultar');
    const repetida = g[2].filas.find(f => f.titulo === 'Oferta D4');
    check('la repetida va sin casilla, con su razón', !repetida.casilla && repetida.fija && /^Ya postulaste a este cargo/.test(repetida.razon), repetida);

    // Marcar una dudosa y una descartada, desmarcar una que servía.
    g[1].filas[0].casilla.checked = true; g[1].filas[0].casilla.onchange();
    g[2].filas[0].casilla.checked = true; g[2].filas[0].casilla.onchange();
    g[0].filas[1].casilla.checked = false; g[0].filas[1].casilla.onchange();
    check('el contador cambia en vivo', r.getElementById('ap-ov-panel-si').textContent === 'Postular a las 4' && r.getElementById('ap-ov-panel-cuenta').textContent === 'Vas a postular a 4 ofertas.');
    g = leerPanel(r);
    g[2].ver.onclick();
    g = leerPanel(r);
    check('plegado otra vez, la descartada que marcó se sigue viendo', g[2].filas.length === 1 && g[2].filas[0].titulo === 'Oferta D1' && g[2].filas[0].casilla.checked);
    check('marcar o desmarcar no manda nada todavía', !t.mensajes.some(m => m.type === 'POSTULAR_ELEGIDAS'));

    r.getElementById('ap-ov-panel-cerrar').listeners.click[0]();
    check('cerrar sin apretar: se cierra, y no se manda ni se registra nada (§2.2)', r.getElementById('ap-ov-panel').hidden === true && !t.mensajes.some(m => m.type === 'POSTULAR_ELEGIDAS') && !t.guardado.ap_decididas_panel);
    check('...vuelven la tarjeta y el aviso', !r.querySelector('.pila').classList.contains('con-panel'));
    t.AP.abrirPanel();
    check('al volver a abrir, parte de cero: lo que sirve marcado, nada más', leerPanel(r)[0].filas.every(f => f.casilla.checked) && r.getElementById('ap-ov-panel-si').textContent === 'Postular a las 3');
  }
  {
    // Más de 20 en un grupo: de a 20, con "ver más" (§4).
    const t = crear();
    const ids = Array.from({ length: 27 }, (_, i) => 'M' + i);
    t.AP.tarjetasDeLaPagina = () => ids.map(id => ({ el: crearElemento('article'), id }));
    ids.forEach(id => t.AP.marcar(id, 'gris', [JORNADA], { titulo: 'Oferta ' + id, url: URL_CT(id) }));
    t.AP.abrirPanel();
    let g = leerPanel(t.raiz());
    check('§4: con 27, se ven las primeras 20 y "Ver 7 más"', g[0].filas.length === 20 && g[0].mas && g[0].mas.textContent === 'Ver 7 más');
    g[0].mas.onclick();
    g = leerPanel(t.raiz());
    check('...y "ver más" las muestra todas', g[0].filas.length === 27 && !g[0].mas);
  }
  {
    const t = crear();
    t.AP.tarjetasDeLaPagina = () => [];
    check('una página sin nada revisado: no hay panel', t.AP.abrirPanel() === false);
    const r = crear({ sesion: { ap_pestana_de_rafaga: '1' } });
    conPagina(r);
    check('en la pestaña de una ráfaga tampoco (nadie la está mirando)', r.AP.abrirPanel() === false);
  }

  // ── 4. Apretar "Postular" ───────────────────────────────────────
  {
    const t = crear();
    conPagina(t);
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    let g = leerPanel(r);
    g[1].filas[0].casilla.checked = true; g[1].filas[0].casilla.onchange();   // G1: dudosa, marcada
    g[0].filas[2].casilla.checked = false; g[0].filas[2].casilla.onchange();  // P3: servía, desmarcada
    g[2].ver.onclick();
    g = leerPanel(r);
    g[2].filas[1].casilla.checked = true; g[2].filas[1].casilla.onchange();   // D2: descartada, marcada
    let respuesta = null;
    t.responderCon((m) => {
      if (m.type === 'PUEDE_POSTULAR') return { permitido: true, restantes: 15 };
      if (m.type === 'POSTULAR_ELEGIDAS') return respuesta;
      return { ok: true };
    });
    respuesta = {
      ok: true, primeraConRevision: true, pesoReducido: false,
      config: { active: true, postulacionHabilitada: true, soloObservar: false },
      encoladas: [{ decisionId: 'd1', externalId: 'P1' }, { decisionId: 'd2', externalId: 'P2' }, { decisionId: 'd3', externalId: 'G1' }, { decisionId: 'd4', externalId: 'D2' }],
    };
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    const envio = t.mensajes.find(m => m.type === 'POSTULAR_ELEGIDAS');
    check('apretar manda lo elegido a background.js, con el portal', !!envio && envio.plataforma === 'Computrabajo');
    const por = (id) => envio.ofertas.find(o => o.externalId === id);
    check('va cada oferta revisada, con su banda y si quedó marcada', envio.ofertas.length === 7 && por('P1').elegida && !por('P3').elegida && por('G1').elegida && por('D2').elegida && !por('D1').elegida, envio.ofertas.map(o => o.externalId + ':' + o.elegida));
    check('...menos las que iban sin casilla (sin enlace, repetida): sobre esas no se decidió nada', !por('G2') && !por('D4'), envio.ofertas.map(o => o.externalId));
    check('...con el puntaje y las razones que tenía', por('G1').scoreLocal === 55 && por('G1').razones.length === 2 && por('P1').url === URL_CT('P1'));
    check('...y mirando, nada cuenta como ya enviado', envio.ofertas.every(o => o.yaEnviada === false));
    check('mientras tanto: "Postulando a 4 ofertas…", sin botón y sin poder cambiar las casillas', r.getElementById('ap-ov-panel-t').textContent === 'Postulando a 4 ofertas…' && r.getElementById('ap-ov-panel-si').hidden === true && leerPanel(r)[0].filas[0].casilla.disabled === true);
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    check('apretar dos veces no manda dos veces', t.mensajes.filter(m => m.type === 'POSTULAR_ELEGIDAS').length === 1);
    await esperar();
    check('la cuenta empezó a postular: la página lo sabe', t.AP.soloObservarEfectivo() === false);
    check('dice que la primera se muestra antes de enviarla', /La primera te la muestro antes de enviarla/.test(r.getElementById('ap-ov-panel-ayuda').textContent));
    g = leerPanel(r);
    check('las elegidas quedan "En cola"', g[0].filas[0].estado === 'En cola' && g[1].filas[0].estado === 'En cola');
    check('la pestaña recuerda lo decidido: lo elegido y lo que se quitó', t.AP.decididaEnPanel('P1') && t.AP.decididaEnPanel('P3') && t.AP.decididaEnPanel('D2') && !t.AP.decididaEnPanel('D1') && !t.AP.decididaEnPanel('G2'));
    check('la tarjeta del final ya no vuelve en esta pestaña', t.guardado.ap_cierre_listo === '1' && t.AP.cierreDePagina() === false);

    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd1', estado: 'enviando' });
    g = leerPanel(r);
    check('la cola cuenta el avance: "Enviando…"', g[0].filas[0].estado === 'Enviando…' && g[0].filas[0].estadoClase.includes('activo'));
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd1', estado: 'enviada' });
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd2', estado: 'enviada' });
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'zzz', estado: 'enviada' });
    g = leerPanel(r);
    check('"Enviada", y el pie lleva la cuenta', g[0].filas[0].estado === 'Enviada' && r.getElementById('ap-ov-panel-cuenta').textContent === 'Enviadas: 2 de 4.');
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd3', estado: 'expirada' });
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd4', estado: 'enviada' });
    check('terminado: cuántas de cuántas', r.getElementById('ap-ov-panel-t').textContent === 'Postulaste a 3 de 4.' && leerPanel(r)[1].filas[0].estado === 'Ya no está disponible');
    r.getElementById('ap-ov-panel-cerrar').listeners.click[0]();
    check('cerrar al terminar lo cierra de verdad', r.getElementById('ap-ov-panel').hidden === true);
  }
  {
    // El cupo no alcanza: van las primeras, y las demás no se registran (§2.3).
    const t = crear({ cupo: { permitido: true, motivo: null, restantes: 2 } });
    conPagina(t);
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    check('marcó 3 y le quedan 2: lo dice antes de enviar', r.getElementById('ap-ov-panel-cupo').textContent === 'Marcaste 3 y te quedan 2 postulaciones este mes. Saca 1, o envío las primeras 2.' && r.getElementById('ap-ov-panel-si').textContent === 'Postular a las primeras 2');
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    const envio = t.mensajes.find(m => m.type === 'POSTULAR_ELEGIDAS');
    check('van las 2 primeras; la tercera ni se marca como elegida ni como quitada', envio.ofertas.filter(o => o.elegida).map(o => o.externalId).join() === 'P1,P2' && !envio.ofertas.some(o => o.externalId === 'P3'), envio.ofertas.map(o => o.externalId + ':' + o.elegida));
  }
  {
    const t = crear({ cupo: { permitido: false, motivo: 'limite', restantes: 0 } });
    conPagina(t);
    t.AP.abrirPanel();
    await esperar();
    t.raiz().getElementById('ap-ov-panel-si').listeners.click[0]();
    check('sin cupo: el botón abre dónde conseguir más, y no manda nada', t.abiertas.length === 1 && t.abiertas[0][0] === 'https://autopostula.cl/dashboard/premium' && !t.mensajes.some(m => m.type === 'POSTULAR_ELEGIDAS'), t.abiertas);
  }
  {
    // Sin sesión en el portal: el botón lleva al ingreso del portal.
    const t = crear({ docSel: { '[data-login-button-desktop]': [crearElemento('span')] } });
    conPagina(t);
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    check('sin sesión: lo dice en el pie', r.getElementById('ap-ov-panel-si').textContent === 'Iniciar sesión en Computrabajo');
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    check('...y el botón va al ingreso del propio portal, sin mandar nada', t.navegaciones[0] === 'https://candidato.cl.computrabajo.com/acceso/' && !t.mensajes.some(m => m.type === 'POSTULAR_ELEGIDAS'));
  }
  {
    // Si no se pudo (no cumple los requisitos para activar, sin red): lo dice y vuelve a elegir.
    const t = crear();
    conPagina(t);
    t.responderCon((m) => (m.type === 'POSTULAR_ELEGIDAS' ? { ok: false, error: 'Confirma tu objetivo laboral primero' } : { permitido: true, restantes: 15 }));
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    await esperar();
    check('si no se pudo, lo dice', r.getElementById('ap-ov-panel-resultado').textContent === 'Confirma tu objetivo laboral primero' && r.getElementById('ap-ov-panel-resultado').className.includes('error'));
    check('...y se puede volver a elegir y a intentar', r.getElementById('ap-ov-panel-si').hidden === false && leerPanel(r)[0].filas[0].casilla.disabled === false);
    check('...sin recordar nada como decidido', !t.guardado.ap_decididas_panel && t.AP.soloObservarEfectivo() === true);
  }
  {
    // Si la cola deja de contar (se reinició el service worker), no queda "Enviando…" para siempre.
    const t = crear();
    conPagina(t);
    t.responderCon((m) => (m.type === 'POSTULAR_ELEGIDAS' ? { ok: true, encoladas: [{ decisionId: 'd1', externalId: 'P1' }, { decisionId: 'd2', externalId: 'P2' }, { decisionId: 'd3', externalId: 'P3' }] } : { permitido: true, restantes: 15 }));
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    await esperar();
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd1', estado: 'enviada' });
    t.correrTimers(4 * 60 * 1000);
    const g = leerPanel(r);
    check('pasado el tope sin noticias, las que faltaban quedan "Sigue en cola"', g[0].filas[1].estado === 'Sigue en cola' && g[0].filas[2].estado === 'Sigue en cola' && g[0].filas[0].estado === 'Enviada');
    check('...y la cabeza lo explica', r.getElementById('ap-ov-panel-t').textContent === 'Postulaste a 1 de 3.' && r.getElementById('ap-ov-panel-ayuda').textContent === 'Las que quedaron en cola se envían solas más tarde.');
  }
  {
    // Cerrar mientras se envía no corta nada: se puede volver a abrir y ver cómo va.
    const t = crear();
    conPagina(t);
    t.responderCon((m) => (m.type === 'POSTULAR_ELEGIDAS' ? { ok: true, encoladas: [{ decisionId: 'd1', externalId: 'P1' }] } : { permitido: true, restantes: 15 }));
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    await esperar();
    r.getElementById('ap-ov-panel-cerrar').listeners.click[0]();
    check('cerrar mientras se envía lo esconde', r.getElementById('ap-ov-panel').hidden === true);
    check('...el popup ofrece ver cómo va', t.mensaje({ type: 'ESTADO_REVISION' }).enCurso === true);
    t.mensaje({ type: 'PROGRESO_REVISION', decisionId: 'd1', estado: 'enviada' });
    check('al volver a abrirlo, está el avance', t.mensaje({ type: 'ABRIR_REVISION' }).ok === true && r.getElementById('ap-ov-panel').hidden === false && leerPanel(r)[0].filas[0].estado === 'Enviada');
  }

  // ── 5. Con la cuenta postulando ─────────────────────────────────
  {
    const log = [
      { ts: 1, status: 'ok', title: 'Oferta P1', uid: 'P1' },
      { ts: 2, status: 'skip', title: 'Oferta P2', uid: 'P2', reason: 'Panel no cargó' },
    ];
    const t = crear({ cfg: { active: true, postulacionHabilitada: true }, log });
    conPagina(t);
    t.AP.abrirPanel();
    await esperar();
    const r = t.raiz();
    const g = leerPanel(r);
    check('las que te sirven salen sin casilla: ya las vio el escaneo', g[0].filas.every(f => !f.casilla && f.fija));
    check('...con lo que pasó con cada una', g[0].filas[0].estado === 'Enviada' && g[0].filas[1].estado === 'No se envió' && g[0].filas[2].estado === '', g[0].filas.map(f => f.estado));
    check('...y la cabeza no dice "todavía no envió nada"', r.getElementById('ap-ov-panel-quien').textContent === 'AutoPostula');
    check('sin marcar nada más, el botón no hace nada', r.getElementById('ap-ov-panel-si').disabled === true);
    g[1].filas[0].casilla.checked = true; g[1].filas[0].casilla.onchange();
    r.getElementById('ap-ov-panel-si').listeners.click[0]();
    const envio = t.mensajes.find(m => m.type === 'POSTULAR_ELEGIDAS');
    check('se puede sumar una dudosa; las que ya vio el escaneo van como ya enviadas', envio.ofertas.find(o => o.externalId === 'G1').elegida && envio.ofertas.filter(o => o.banda === 'postular').every(o => o.yaEnviada));
  }

  // ── 6. La tarjeta del final, el popup y la primera con revisión ──
  {
    const t = crear();
    conPagina(t);
    t.AP.cierreDePagina();
    const r = t.raiz();
    const ver = r.getElementById('ap-ov-cierre-ver');
    check('la tarjeta del final ofrece "Ver las 9 y elegir"', ver.hidden === false && ver.textContent === 'Ver las 9 y elegir');
    ver.onclick();
    check('...y abre el panel', r.getElementById('ap-ov-panel').hidden === false);
  }
  {
    const t = crear({ docSel: { '[data-login-button-desktop]': [crearElemento('span')] } });
    conPagina(t);
    t.AP.cierreDePagina();
    check('sin sesión, la tarjeta no ofrece la lista (primero hay que iniciarla)', t.raiz().getElementById('ap-ov-cierre-ver').hidden === true);
  }
  {
    const t = crear();
    conPagina(t);
    const estado = t.mensaje({ type: 'ESTADO_REVISION' });
    check('el popup pregunta: cuántas se revisaron en esta página', estado.total === 9 && estado.enCurso === false, estado);
    check('...y le pide abrir el panel', t.mensaje({ type: 'ABRIR_REVISION' }).ok === true && t.raiz().getElementById('ap-ov-panel').hidden === false);
    const vacia = crear();
    vacia.AP.tarjetasDeLaPagina = () => [];
    check('en una página sin revisar, el popup no ofrece nada', vacia.mensaje({ type: 'ESTADO_REVISION' }).total === 0);
  }
  {
    // La primera del panel, cuando la cuenta recién empieza: se muestra antes de enviarla.
    const t = crear({ cfg: { active: true, postulacionHabilitada: true } });
    let revisionAlPostular = null;
    t.AP.aplicarDirecto = async () => { revisionAlPostular = t.AP.conRevision(); return { ok: true }; };
    let respuesta = null;
    t.listeners.forEach(fn => fn({ type: 'DO_APPLY', decisionId: 'd1', url: URL_CT('P1'), revisar: true }, {}, (x) => { respuesta = x; }));
    await esperar();
    check('DO_APPLY con revisar: esa postulación se muestra antes de enviarse', revisionAlPostular === true && respuesta && respuesta.ok === true);
    const s = crear({ cfg: { active: true, postulacionHabilitada: true } });
    let sinMarca = null;
    s.AP.aplicarDirecto = async () => { sinMarca = s.AP.conRevision(); return { ok: true }; };
    s.listeners.forEach(fn => fn({ type: 'DO_APPLY', decisionId: 'd2', url: URL_CT('P2') }, {}, () => {}));
    await esperar();
    check('...sin revisar, como siempre', sinMarca === false);
  }
  {
    // Los adaptadores: guardan los datos al marcar, y no vuelven a decidir solos lo decidido en el panel.
    for (const archivo of ['computrabajo.js', 'laborum.js', 'trabajando.js']) {
      const src = fs.readFileSync(path.join(__dirname, 'adapters', archivo), 'utf8');
      check(archivo + ': no vuelve a decidir solo lo que se decidió en el panel', /AP\.decididaEnPanel\(id\)/.test(src));
      const marcas = src.match(/AP\.marcar\([^;]*\);/g) || [];
      const conDatos = marcas.filter(m => /,\s*(datos|oferta|datosMarca|datosCand)\)/.test(m));
      check(archivo + ': la primera marca de cada oferta lleva sus datos para el panel', conDatos.length >= 2, marcas);
    }
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
