// Verificación del recorrido de la primera vez (docs/primera-busqueda-guiada.md §13)
// y de «Revisar antes de enviar» con la persona mirando la pestaña
// (docs/panel-de-revision-en-el-portal.md §9.1):
//   1. Lo que dice cada paso, y que ningún texto hable de "banda" ni "scorer".
//   2. Dónde va el globo junto a lo que explica.
//   3. El recorrido entero: hola, las marcas, la tarjeta del final, el panel y
//      el final; la tarjeta espera hasta el paso 3.
//   4. Saltarlo, retomarlo, y cuándo no sale.
//   5. Los otros finales: "Todavía no", "Empezar a postular", cerrar el panel,
//      sin sesión en el portal.
//   6. «Revisar antes de enviar»: la tarjeta propone, el panel deja elegir y
//      lo propuesto no cuenta como ya enviado.
// Carga core.js REAL en un vm de Node con un DOM falso (el mismo enfoque que
// verificar-panel-revision.js, con `hidden`, `parentNode` y medidas). La parte
// del service worker (cuándo queda pendiente) está en verificar-rafagas.js,
// bloque 22. No está conectado a CI: node verificar-recorrido.js
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
    style: {}, attrs: {}, children: [], listeners: {}, shadowRoot: null, parentNode: null,
    scrollWidth: 0, clientWidth: 0, rect: null, desplazado: 0, enfocado: 0,
  };
  Object.defineProperty(e, 'textContent', {
    get: () => texto + e.children.map(h => h.textContent).join(''),
    set: (v) => { texto = String(v); e.children = []; },
  });
  Object.defineProperty(e, 'className', {
    get: () => [...clases].join(' '),
    set: (v) => { clases.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => clases.add(c)); },
  });
  Object.defineProperty(e, 'lastElementChild', { get: () => e.children[e.children.length - 1] || null });
  e.classList = {
    add: (...c) => c.forEach(x => clases.add(x)), remove: (...c) => c.forEach(x => clases.delete(x)),
    toggle: (c, f) => { const v = f === undefined ? !clases.has(c) : !!f; if (v) clases.add(c); else clases.delete(c); return v; },
    contains: (c) => clases.has(c),
  };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  e.hasAttribute = (k) => k in e.attrs;
  e.addEventListener = (t, fn) => { (e.listeners[t] = e.listeners[t] || []).push(fn); };
  e.appendChild = (h) => {
    if (h.parentNode) h.parentNode.children = h.parentNode.children.filter(c => c !== h);
    h.parentNode = e;
    e.children.push(h);
    return h;
  };
  e.remove = () => { if (e.parentNode) e.parentNode.children = e.parentNode.children.filter(c => c !== e); e.parentNode = null; };
  e.querySelector = () => null;
  e.attachShadow = () => { e.shadowRoot = crearRaizSombra(); return e.shadowRoot; };
  e.getBoundingClientRect = () => {
    const r = e.rect || { left: 0, top: 0, width: 0, height: 0 };
    return Object.assign({ right: r.left + r.width, bottom: r.top + r.height }, r);
  };
  e.getClientRects = () => (e.rect ? [e.rect] : [{}]);
  e.scrollIntoView = () => { e.desplazado++; };
  e.focus = () => { e.enfocado++; };
  return e;
}

// Como un navegador: lo que el HTML trae con `hidden` arranca oculto.
function crearRaizSombra() {
  const porId = new Map();
  const porSelector = new Map();
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = v;
      porId.clear();
      porSelector.clear();
      for (const m of String(v).matchAll(/<(\w+)([^>]*)>/g)) {
        const id = (m[2].match(/\bid="([^"]+)"/) || [])[1];
        if (!id) continue;
        const x = crearElemento(m[1]);
        x.id = id;
        x.hidden = /\shidden(\s|$|>)/.test(m[2] + ' ');
        porId.set(id, x);
      }
    },
    getElementById(id) { if (!porId.has(id)) { const x = crearElemento('div'); x.id = id; porId.set(id, x); } return porId.get(id); },
    querySelector(s) { if (!porSelector.has(s)) porSelector.set(s, crearElemento('div')); return porSelector.get(s); },
  };
}

// ── Contexto: core.js real ────────────────────────────────────────
function crear({ cfg, recorrido, sesion, docSel, oculta } = {}) {
  const mensajes = [];
  const timers = [];
  const navegaciones = [];
  const cuadros = [];
  const local = {};
  if (recorrido !== undefined) local.recorrido = recorrido;
  const guardado = Object.assign({}, sesion || {});
  let responder = (m) => {
    if (m.type === 'PUEDE_POSTULAR') return { permitido: true, motivo: null, restantes: 15 };
    if (m.type === 'POSTULAR_ELEGIDAS') {
      const elegidas = (m.ofertas || []).filter(o => o.elegida);
      return { ok: true, encoladas: elegidas.map((o, i) => ({ decisionId: 'd' + i, externalId: o.externalId })), primeraConRevision: true };
    }
    if (m.type === 'EMPEZAR_A_POSTULAR') return { ok: true, config: { active: true, postulacionHabilitada: true } };
    return { ok: true };
  };
  const sel = docSel || {};
  const body = crearElemento('body');
  const doc = {
    body, documentElement: crearElemento('html'), hidden: !!oculta,
    createElement: crearElemento,
    querySelector: (s) => (sel[s] || [])[0] || null,
    querySelectorAll: (s) => sel[s] || [],
    getElementById: () => null,
    addEventListener() {},
  };
  const ubicacion = {
    hostname: 'cl.computrabajo.com', pathname: '/trabajo-de-vendedora', origin: 'https://cl.computrabajo.com',
    get href() { return 'https://cl.computrabajo.com' + this.pathname; },
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
        onMessage: { addListener() {} },
        sendMessage(m, cb) {
          mensajes.push(m);
          const r = responder(m);
          if (typeof cb === 'function') { Promise.resolve().then(() => cb(r)); return; }
          return Promise.resolve(r);
        },
      },
      storage: {
        local: {
          get: (claves, cb) => {
            const out = {};
            for (const k of [].concat(claves)) if (k in local) out[k] = JSON.parse(JSON.stringify(local[k]));
            if (cb) cb(out);
          },
          set: (obj) => { Object.assign(local, JSON.parse(JSON.stringify(obj))); },
        },
        sync: { get: (_k, cb) => cb && cb({}), set() {} },
        onChanged: { addListener() {} },
      },
    },
    console: { log() {}, warn() {}, error: console.error },
    setTimeout: (fn, ms) => { timers.push({ fn, ms: ms || 0 }); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { cuadros.push(fn); return cuadros.length; },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1280, innerHeight: 800,
    MutationObserver: class { constructor() {} observe() {} disconnect() {} },
    URL, URLSearchParams,
    open: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;
  AP.cfg = cfg || { active: true, postulacionHabilitada: false };
  AP.activo = true;
  const host = (id) => body.children.find(c => c.id === id) || null;
  const raiz = () => (host('ap-ov') || {}).shadowRoot;
  const rec = () => (host('ap-recorrido') || {}).shadowRoot;
  return {
    AP, ctx, doc, body, mensajes, navegaciones, local, guardado, raiz, rec, host,
    responderCon: (fn) => { responder = fn; },
    correrTimers: () => { for (let i = 0; i < 50 && timers.length; i++) timers.shift().fn(); },
    cuadro: () => { const fns = cuadros.splice(0); fns.forEach(fn => fn()); },
  };
}

const esperar = () => new Promise(r => setTimeout(r, 0));

const ROL = { tipo: 'rol', rol: 'vendedor', termino: 'vendedora' };
const JORNADA = { tipo: 'jornada_desconocida', declarada: 'part_time' };
const LUGAR = { tipo: 'ubicacion', ofertaEn: 'maipu', buscadas: ['ñuñoa'] };
const URL_CT = (id) => 'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-vendedor-' + id;

// Una página con 3 que sirven, 2 dudosas y 4 que no calzan, con su lugar en pantalla.
function conPagina(t, extra) {
  const ids = ['P1', 'P2', 'P3', 'G1', 'G2', 'D1', 'D2', 'D3', 'D4'].concat(extra || []);
  const tarjetas = ids.map((id, i) => {
    const el = crearElemento('article');
    el.rect = { left: 40, top: 120 + i * 150, width: 640, height: 130 };
    return { el, id };
  });
  t.AP.tarjetasDeLaPagina = () => tarjetas;
  const datos = (id, score) => ({ titulo: 'Oferta ' + id, empresa: 'Empresa ' + id, url: URL_CT(id), ubicacion: 'Ñuñoa', score });
  for (const id of ['P1', 'P2', 'P3'].concat(extra || [])) t.AP.marcar(id, 'postular', [ROL], datos(id, 75));
  t.AP.marcar('G1', 'gris', [ROL, JORNADA], datos('G1', 55));
  t.AP.marcar('G2', 'gris', [JORNADA], datos('G2', 50));
  for (const id of ['D1', 'D2', 'D3', 'D4']) t.AP.marcar(id, 'descartar', [LUGAR], datos(id, 20));
  return tarjetas;
}
const tarjeta = (tarjetas, id) => tarjetas.find(x => x.id === id).el;

const PENDIENTE = () => ({ estado: 'pendiente', origen: 'web', desde: Date.now() });

(async () => {
  // ── 1. Lo que dice cada paso ────────────────────────────────────
  {
    const t = crear();
    const T = t.AP.textoRecorrido;
    const hola = T('hola', { total: 20 });
    check('paso 1: se presenta y dice qué hizo, con la promesa de no enviar nada', hola.paso === 'Paso 1 de 4' && hola.titulo === 'Hola, soy AutoPostula' && /Revisé las 20 ofertas de esta página/.test(hola.texto) && /no envío nada sin que me digas/.test(hola.texto) && hola.boton === 'Muéstrame', hola);
    check('...y con una sola oferta, en singular', /^Revisé la oferta de esta página y la marqué/.test(T('hola', { total: 1 }).texto));
    const sirve = T('marcas', { banda: 'postular' });
    check('paso 2, una que sirve: qué es la marca y qué haría', sirve.paso === 'Paso 2 de 4' && sirve.titulo === 'Esta te sirve' && /postularía/.test(sirve.texto) && sirve.boton === 'Siguiente', sirve);
    check('...una dudosa: se queda en «Por decidir»', T('marcas', { banda: 'gris' }).titulo === 'Esta, mejor que la decidas tú' && /«Por decidir»/.test(T('marcas', { banda: 'gris' }).texto));
    const no = T('marcas', { banda: 'descartar', ultima: true });
    check('...una que no calza, y el último ejemplo lleva al resumen', no.titulo === 'Esta no calza' && /rescatar/.test(no.texto) && no.boton === 'Ver el resumen', no);
    const cierre = T('cierre', { total: 20, postular: 3, portal: 'Computrabajo' });
    check('paso 3: antes de que salga nada, tú eliges', cierre.paso === 'Paso 3 de 4' && cierre.titulo === 'Antes de que salga nada, tú eliges' && /las 20/.test(cierre.texto) && /las que te sirven\.$/.test(cierre.texto) && cierre.boton === 'Ver la lista', cierre);
    check('...con una sola que sirve, en singular', /la que te sirve\.$/.test(T('cierre', { total: 20, postular: 1 }).texto));
    check('...si no sirve ninguna, lo dice', T('cierre', { total: 20, postular: 0 }).titulo === 'Aquí no hay ninguna que te sirva');
    const sinSesion = T('cierre', { total: 20, postular: 3, portal: 'Computrabajo', sinSesion: true });
    check('...y sin sesión en el portal, lleva a iniciarla (el botón corto: el texto ya nombra el portal)', sinSesion.titulo === 'Para postular, inicia sesión' && /Sin tu sesión en Computrabajo/.test(sinSesion.texto) && sinSesion.boton === 'Iniciar sesión', sinSesion);
    const panel0 = T('panel', { sub: 0 }), panel1 = T('panel', { sub: 1 });
    check('paso 4: marcar y desmarcar, y que nada sale sin el botón', panel0.paso === 'Paso 4 de 4' && panel0.titulo === 'Marca a cuáles postular' && panel1.titulo === 'Nada sale sin este botón' && /la primera te la muestro antes de enviarla/.test(panel1.texto) && panel1.boton === 'Entendido', [panel0, panel1]);
    const enviado = T('fin', { variante: 'enviado', portal: 'Computrabajo' });
    check('el final, si apretó: partimos, y qué pasa desde ahora', enviado.paso === 'Listo' && enviado.n === 5 && enviado.titulo === '¡Partimos!' && /cada vez que abras Computrabajo en Chrome/.test(enviado.texto), enviado);
    check('...si activó desde la tarjeta: la primera se muestra antes', /la primera te la muestro antes de enviarla/.test(T('fin', { variante: 'activada', portal: 'Computrabajo' }).texto));
    check('...si dijo "todavía no": sigue mirando, y cómo empezar después', T('fin', { variante: 'todavia_no' }).titulo === 'Sigo mirando contigo' && /No envío nada/.test(T('fin', { variante: 'todavia_no' }).texto));
    check('...si cerró la lista: no se envió nada, y cómo volver', T('fin', { variante: 'cerrado', total: 20 }).titulo === 'No envié nada' && /«Ver las 20 y elegir»/.test(T('fin', { variante: 'cerrado', total: 20 }).texto) && /«Verla y elegir»/.test(T('fin', { variante: 'cerrado', total: 1 }).texto));
    const todos = [hola, sirve, no, cierre, sinSesion, panel0, panel1, enviado, T('marcas', { banda: 'gris' }), T('fin', { variante: 'todavia_no' }), T('fin', { variante: 'cerrado' })];
    check('ningún paso dice "banda", "scorer", "modo observar" ni "puntaje" (criterio 4)', todos.every(x => !/banda|scorer|modo observar|puntaje/i.test(x.titulo + ' ' + x.texto)));
  }

  // ── 2. Dónde va el globo ────────────────────────────────────────
  {
    const t = crear();
    const L = t.AP.lugarDelGlobo;
    const card = { left: 40, top: 300, width: 640, height: 130, right: 680, bottom: 430 };
    let l = L(card, 312, 170, ['derecha', 'abajo'], 1280, 800);
    check('una oferta del listado: el globo va a su derecha, centrado en alto', l.lado === 'derecha' && l.x === 694 && l.y === 280, l);
    l = L(card, 312, 170, ['derecha', 'abajo'], 900, 800);
    check('...si a la derecha no cabe, abajo', l.lado === 'abajo' && l.y === 444, l);
    const tarjetaFinal = { left: 908, top: 560, width: 356, height: 224, right: 1264, bottom: 784 };
    l = L(tarjetaFinal, 312, 170, ['izquierda', 'arriba'], 1280, 800);
    check('la tarjeta del final (abajo a la derecha): a su izquierda', l.lado === 'izquierda' && l.x === 582, l);
    const aviso = { left: 1000, top: 730, width: 264, height: 54, right: 1264, bottom: 784 };
    l = L(aviso, 312, 170, ['arriba', 'izquierda'], 1280, 800);
    check('el aviso de abajo: arriba de él, sin salirse de la pantalla', l.lado === 'arriba' && l.y === 546 && l.x === 952, l);
    l = L({ left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800 }, 312, 170, ['derecha', 'izquierda'], 700, 800);
    check('si no cabe en ningún lado: abajo al centro', l.lado === 'centro' && l.y === 614, l);
  }

  // ── 3. El recorrido entero ──────────────────────────────────────
  {
    const t = crear({ recorrido: PENDIENTE() });
    const tarjetas = conPagina(t);
    check('la página se revisó: AP.cierreDePagina la toma el recorrido', t.AP.cierreDePagina() === true);
    let e = t.AP.estadoRecorrido();
    check('empieza en el paso 1', e && e.paso === 'hola', e);
    check('...y la tarjeta del final espera (sale en el paso 3)', t.raiz().getElementById('ap-ov-cierre').hidden === true && t.raiz().getElementById('ap-ov-cierre-t').textContent === '');
    check('queda guardado que va en curso, en el paso 1', t.local.recorrido.estado === 'en_curso' && t.local.recorrido.paso === 'hola', t.local.recorrido);
    const r = t.rec();
    check('el recorrido se dibuja en su propio host, encima del aviso', !!r && t.body.children[t.body.children.length - 1].id === 'ap-recorrido');
    check('...con el texto del paso, los puntos y "saltar"', r.getElementById('ap-rec-t').textContent === 'Hola, soy AutoPostula' && /Revisé las 9 ofertas/.test(r.getElementById('ap-rec-d').textContent) && r.getElementById('ap-rec-puntos').getAttribute('data-n') === '1' && r.getElementById('ap-rec-saltar').hidden === false && r.getElementById('ap-rec-globo').hidden === false);
    check('...y el botón queda listo para Enter', r.getElementById('ap-rec-si').enfocado > 0);

    // El foco sigue al aviso (sin medidas en este DOM, el globo va al centro).
    t.raiz().getElementById('ap-ov-chip').rect = { left: 1000, top: 730, width: 264, height: 54 };
    t.cuadro();
    check('el foco enmarca lo que se explica (el aviso de abajo)', r.getElementById('ap-rec-foco').hidden === false && r.getElementById('ap-rec-foco').style.left === '994px' && r.getElementById('ap-rec-foco').style.width === '276px', r.getElementById('ap-rec-foco').style);
    check('...y el globo va arriba de él, con la flecha hacia abajo', r.getElementById('ap-rec-flecha').getAttribute('data-lado') === 'arriba' && r.getElementById('ap-rec-globo').style.top === '546px', [r.getElementById('ap-rec-flecha').attrs, r.getElementById('ap-rec-globo').style]);

    r.getElementById('ap-rec-si').listeners.click[0]();
    e = t.AP.estadoRecorrido();
    check('"Muéstrame": paso 2, con una oferta de cada marca de la página', e.paso === 'marcas' && e.sub === 0 && e.ejemplos.join() === 'postular,gris,descartar', e);
    check('...la que sirve, a la vista', r.getElementById('ap-rec-t').textContent === 'Esta te sirve' && tarjeta(tarjetas, 'P1').desplazado === 1);
    t.cuadro();
    check('...enmarcada, con el globo a su derecha', r.getElementById('ap-rec-foco').style.top === '114px' && r.getElementById('ap-rec-flecha').getAttribute('data-lado') === 'derecha', [r.getElementById('ap-rec-foco').style, r.getElementById('ap-rec-flecha').attrs]);
    check('...y al cambiar de paso, el foco viaja (no salta)', r.getElementById('ap-rec-foco').classList.contains('anima') && r.getElementById('ap-rec-globo').classList.contains('cambia'));
    r.getElementById('ap-rec-si').listeners.click[0]();
    check('después la dudosa', t.AP.estadoRecorrido().sub === 1 && r.getElementById('ap-rec-t').textContent === 'Esta, mejor que la decidas tú' && tarjeta(tarjetas, 'G1').desplazado === 1);
    r.getElementById('ap-rec-si').listeners.click[0]();
    check('y la que no calza, que lleva al resumen', r.getElementById('ap-rec-t').textContent === 'Esta no calza' && r.getElementById('ap-rec-si').textContent === 'Ver el resumen' && tarjeta(tarjetas, 'D1').desplazado === 1);
    check('la tarjeta del final todavía espera', t.raiz().getElementById('ap-ov-cierre-t').textContent === '');

    r.getElementById('ap-rec-si').listeners.click[0]();
    check('paso 3: aparece la tarjeta del final, con lo de siempre', t.AP.estadoRecorrido().paso === 'cierre' && t.raiz().getElementById('ap-ov-cierre').hidden === false && /^De las 9 ofertas de esta página: postularía a 3/.test(t.raiz().getElementById('ap-ov-cierre-t').textContent), t.raiz().getElementById('ap-ov-cierre-t').textContent);
    check('...y el globo la explica', r.getElementById('ap-rec-t').textContent === 'Antes de que salga nada, tú eliges' && r.getElementById('ap-rec-puntos').getAttribute('data-n') === '3');

    r.getElementById('ap-rec-si').listeners.click[0]();
    check('"Ver la lista" abre el panel, y el recorrido pasa al 4', t.raiz().getElementById('ap-ov-panel').hidden === false && t.AP.estadoRecorrido().paso === 'panel' && r.getElementById('ap-rec-t').textContent === 'Marca a cuáles postular');
    r.getElementById('ap-rec-si').listeners.click[0]();
    check('...después señala el botón', t.AP.estadoRecorrido().sub === 1 && r.getElementById('ap-rec-t').textContent === 'Nada sale sin este botón');
    r.getElementById('ap-rec-si').listeners.click[0]();
    check('"Entendido": ahora le toca a la persona, sin globo', t.AP.estadoRecorrido().paso === 'esperando' && r.getElementById('ap-rec-globo').hidden === true && r.getElementById('ap-rec-foco').hidden === true);

    await esperar(); // el cupo
    t.raiz().getElementById('ap-ov-panel-si').onclick ? t.raiz().getElementById('ap-ov-panel-si').onclick() : t.raiz().getElementById('ap-ov-panel-si').listeners.click[0]();
    await esperar();
    await esperar();
    e = t.AP.estadoRecorrido();
    check('apretó "Postular": el final de partimos', e && e.paso === 'fin' && e.variante === 'enviado' && r.getElementById('ap-rec-t').textContent === '¡Partimos!' && r.getElementById('ap-rec-saltar').hidden === true, e);
    check('...y desde ahí ya cuenta como hecho', t.local.recorrido.estado === 'hecho' && t.local.recorrido.como === 'enviado', t.local.recorrido);
    r.getElementById('ap-rec-si').listeners.click[0]();
    check('"Entendido" lo cierra y se va del DOM', t.AP.estadoRecorrido() === null && t.host('ap-recorrido') === null);
    check('no volvió a tocar lo guardado', t.local.recorrido.como === 'enviado');
  }

  // ── 4. Saltarlo, retomarlo, y cuándo no sale ─────────────────────
  {
    let t = crear({ recorrido: PENDIENTE() });
    conPagina(t);
    t.AP.cierreDePagina();
    t.rec().getElementById('ap-rec-saltar').listeners.click[0]();
    check('saltarlo: queda hecho ("saltado") y se va', t.local.recorrido.estado === 'hecho' && t.local.recorrido.como === 'saltado' && t.host('ap-recorrido') === null, t.local.recorrido);
    check('...y la tarjeta del final sale en ese momento', t.raiz().getElementById('ap-ov-cierre').hidden === false && /^De las 9 ofertas/.test(t.raiz().getElementById('ap-ov-cierre-t').textContent));

    t = crear({ recorrido: PENDIENTE() });
    conPagina(t);
    t.AP.cierreDePagina();
    t.AP.accionRecorrido();
    t.rec().getElementById('ap-rec-globo').listeners.keydown[0]({ key: 'Escape' });
    check('Escape también lo salta', t.local.recorrido.como === 'saltado' && t.AP.estadoRecorrido() === null);

    t = crear({ recorrido: { estado: 'hecho', como: 'saltado', en: 1 } });
    conPagina(t);
    t.AP.cierreDePagina();
    check('ya hecho: no sale, y la tarjeta del final sale como siempre', t.AP.estadoRecorrido() === null && t.host('ap-recorrido') === null && t.raiz().getElementById('ap-ov-cierre').hidden === false);

    t = crear();
    conPagina(t);
    t.AP.cierreDePagina();
    check('sin nada pendiente (una actualización, por ejemplo): no sale', t.AP.estadoRecorrido() === null && t.raiz().getElementById('ap-ov-cierre').hidden === false);

    t = crear({ recorrido: PENDIENTE(), cfg: { active: true, postulacionHabilitada: true } });
    conPagina(t);
    t.AP.cierreDePagina();
    check('una cuenta que ya postula no lo ve, y queda hecho para siempre', t.AP.estadoRecorrido() === null && t.local.recorrido.estado === 'hecho' && t.local.recorrido.como === 'ya_postulaba', t.local.recorrido);

    t = crear({ recorrido: PENDIENTE(), sesion: { ap_pestana_de_rafaga: '1' } });
    conPagina(t);
    t.AP.cierreDePagina();
    check('en la pestaña de una ráfaga (nadie mira): no sale, y sigue pendiente', t.AP.estadoRecorrido() === null && t.local.recorrido.estado === 'pendiente');

    t = crear({ recorrido: PENDIENTE(), oculta: true });
    conPagina(t);
    t.AP.cierreDePagina();
    check('en una pestaña de fondo: tampoco, sigue pendiente', t.AP.estadoRecorrido() === null && t.local.recorrido.estado === 'pendiente');

    t = crear({ recorrido: { estado: 'en_curso', paso: 'cierre', desde: Date.now() - 10 * 60 * 1000 } });
    conPagina(t);
    t.AP.cierreDePagina();
    check('uno a medias (fue a iniciar sesión) se retoma donde iba: paso 3, con la tarjeta', t.AP.estadoRecorrido().paso === 'cierre' && t.raiz().getElementById('ap-ov-cierre').hidden === false);
    check('...conservando cuándo empezó', t.local.recorrido.desde < Date.now() - 9 * 60 * 1000, t.local.recorrido);

    t = crear({ recorrido: { estado: 'en_curso', paso: 'marcas', desde: Date.now() - 3 * 60 * 60 * 1000 } });
    conPagina(t);
    t.AP.cierreDePagina();
    check('...pero si pasaron horas, empieza de nuevo', t.AP.estadoRecorrido().paso === 'hola' && t.local.recorrido.desde > Date.now() - 60 * 1000);

    t = crear({ recorrido: PENDIENTE() });
    conPagina(t);
    t.AP.cierreDePagina();
    t.AP.cierreDePagina(); // el portal cambió algo y se volvió a revisar
    check('una segunda revisión de la página no lo reinicia ni suelta la tarjeta', t.AP.estadoRecorrido().paso === 'hola' && t.raiz().getElementById('ap-ov-cierre-t').textContent === '');
  }

  // ── 5. Los otros finales ────────────────────────────────────────
  {
    const alPaso3 = (opciones) => {
      const t = crear(Object.assign({ recorrido: PENDIENTE() }, opciones || {}));
      conPagina(t);
      t.AP.cierreDePagina();
      for (let i = 0; i < 4; i++) t.AP.accionRecorrido();
      return t;
    };
    let t = alPaso3();
    check('(llega al paso 3 en cuatro pasos)', t.AP.estadoRecorrido().paso === 'cierre');
    t.raiz().getElementById('ap-ov-cierre-no').onclick();
    check('"Todavía no, quiero mirar" en la tarjeta: el final que sigue mirando', t.AP.estadoRecorrido().variante === 'todavia_no' && t.rec().getElementById('ap-rec-t').textContent === 'Sigo mirando contigo' && t.local.recorrido.como === 'todavia_no');

    t = alPaso3();
    t.raiz().getElementById('ap-ov-cierre-si').onclick();
    await esperar();
    await esperar();
    check('"Empezar a postular" en la tarjeta: el final de partimos', t.AP.estadoRecorrido().variante === 'activada' && /la primera te la muestro antes de enviarla/.test(t.rec().getElementById('ap-rec-d').textContent) && t.local.recorrido.como === 'activada');

    t = alPaso3();
    t.AP.accionRecorrido(); // abre el panel
    t.raiz().getElementById('ap-ov-panel-cerrar').listeners.click[0]();
    check('cerrar la lista sin apretar: el final de "no envié nada"', t.AP.estadoRecorrido().variante === 'cerrado' && t.rec().getElementById('ap-rec-t').textContent === 'No envié nada' && t.local.recorrido.como === 'cerrado');

    t = crear({ recorrido: PENDIENTE() });
    conPagina(t);
    t.AP.cierreDePagina();
    t.AP.abrirPanel(); // desde el ícono, a la mitad del recorrido
    check('si la persona abre la lista antes (desde el ícono), salta al paso 4', t.AP.estadoRecorrido().paso === 'panel');

    t = alPaso3({ docSel: { '[data-login-button-desktop]': [crearElemento('a')] } });
    check('sin sesión en el portal, el paso 3 lo dice', t.rec().getElementById('ap-rec-t').textContent === 'Para postular, inicia sesión' && t.rec().getElementById('ap-rec-si').textContent === 'Iniciar sesión');
    t.AP.accionRecorrido();
    check('...y lleva a iniciarla, guardando el paso para retomarlo al volver', t.navegaciones[0] === 'https://candidato.cl.computrabajo.com/acceso/' && t.local.recorrido.estado === 'en_curso' && t.local.recorrido.paso === 'cierre', [t.navegaciones, t.local.recorrido]);
  }

  // ── 6. «Revisar antes de enviar» con la persona mirando ──────────
  {
    const POSTULA_REVISANDO = { active: true, postulacionHabilitada: true, modoRevision: true };
    let t = crear({ cfg: POSTULA_REVISANDO });
    check('con la cuenta postulando y «Revisar antes de enviar», mirando la pestaña: propone', t.AP.proponeEnVezDeEnviar() === true);
    check('...sin «Revisar antes de enviar», no', crear({ cfg: { active: true, postulacionHabilitada: true } }).AP.proponeEnVezDeEnviar() === false);
    check('...en "solo mirar", no (eso es otra cosa)', crear({ cfg: { active: true, postulacionHabilitada: false, modoRevision: true } }).AP.proponeEnVezDeEnviar() === false);
    check('...en una pestaña de fondo, no: postula como siempre', crear({ cfg: POSTULA_REVISANDO, oculta: true }).AP.proponeEnVezDeEnviar() === false);
    check('...ni en una ráfaga', crear({ cfg: POSTULA_REVISANDO, sesion: { ap_pestana_de_rafaga: '1' } }).AP.proponeEnVezDeEnviar() === false);

    const m = t.AP.mensajeEscaneo({ propuestas: 3, gris: 2, descartar: 4 }, null, false, true);
    check('el aviso dice que espera, y cuántas sirven', m.texto === 'Esperando tu visto bueno · 3 te sirven · 2 por decidir · 4 descartadas' && m.estado === 'pendiente', m);

    conPagina(t);
    ['P1', 'P2', 'P3'].forEach(id => t.AP.anotarPropuesta(id));
    check('la tarjeta del final sale', t.AP.cierreDePagina() === true);
    const r = t.raiz();
    check('...y propone, sin hablar de lo que ya se decidió', r.getElementById('ap-ov-cierre-t').textContent === 'En esta página hay 3 ofertas que te sirven. No envío ninguna hasta que me digas.' && r.getElementById('ap-ov-cierre-razon').textContent === 'Las 2 dudosas las dejé en «Por decidir».', [r.getElementById('ap-ov-cierre-t').textContent, r.getElementById('ap-ov-cierre-razon').textContent]);
    check('...el botón lleva a elegir, y el otro es "Ahora no"', r.getElementById('ap-ov-cierre-si').textContent === 'Elegir a cuáles postular' && r.getElementById('ap-ov-cierre-no').textContent === 'Ahora no' && r.getElementById('ap-ov-cierre-ver').hidden === true);
    check('...el recorrido de la primera vez no aparece (la cuenta ya postula)', t.AP.estadoRecorrido() === null);

    r.getElementById('ap-ov-cierre-si').onclick();
    check('"Elegir a cuáles postular" abre el panel', r.getElementById('ap-ov-panel').hidden === false);
    check('...que dice que no envió ninguna', r.getElementById('ap-ov-panel-quien').textContent === 'AutoPostula · todavía no envió nada' && /«Revisar antes de enviar»: no envié ninguna/.test(r.getElementById('ap-ov-panel-ayuda').textContent), r.getElementById('ap-ov-panel-ayuda').textContent);
    const grupoSirve = r.getElementById('ap-ov-panel-lista').children[0];
    const casillas = grupoSirve.children[1].children.map(li => li.children[0].children.find(h => h.tagName === 'INPUT'));
    check('...y las que sirven vienen con casilla, marcadas (no "ya enviadas")', casillas.length === 3 && casillas.every(c => c && c.checked));

    await esperar();
    r.getElementById('ap-ov-panel-si').listeners.click ? r.getElementById('ap-ov-panel-si').listeners.click[0]() : null;
    await esperar();
    await esperar();
    const envio = t.mensajes.find(x => x.type === 'POSTULAR_ELEGIDAS');
    const por = (id) => envio && envio.ofertas.find(o => o.externalId === id);
    check('apretar manda las propuestas como no enviadas y elegidas', !!envio && ['P1', 'P2', 'P3'].every(id => por(id).yaEnviada === false && por(id).elegida === true), envio && envio.ofertas.map(o => o.externalId + ':' + o.yaEnviada + ':' + o.elegida));
    check('...y avisa que cada una se muestra antes de enviarla', /Cada una te la muestro antes de enviarla\./.test(r.getElementById('ap-ov-panel-ayuda').textContent), r.getElementById('ap-ov-panel-ayuda').textContent);
    check('una nueva revisión de la página ya no saca la tarjeta: se eligió todo', t.AP.cierreDePagina() === false);

    t = crear({ cfg: POSTULA_REVISANDO });
    conPagina(t);
    ['P1', 'P2', 'P3'].forEach(id => t.AP.anotarPropuesta(id));
    t.AP.cierreDePagina();
    t.raiz().getElementById('ap-ov-cierre-no').onclick();
    check('"Ahora no": la tarjeta se va y no vuelve por esas mismas', t.raiz().getElementById('ap-ov-cierre').hidden === true && t.AP.cierreDePagina() === false);
    const otra = conPagina(t, ['P5']);
    t.AP.anotarPropuesta('P5');
    check('...pero sí por una nueva ("ver más", la página siguiente)', t.AP.cierreDePagina() === true && t.raiz().getElementById('ap-ov-cierre-t').textContent === 'En esta página hay una oferta que te sirve. No la envío hasta que me digas.' && t.raiz().getElementById('ap-ov-cierre-si').textContent === 'Verla y decidir', t.raiz().getElementById('ap-ov-cierre-t').textContent);
    void otra;

    t = crear({ cfg: { active: true, postulacionHabilitada: true } });
    conPagina(t);
    check('sin «Revisar antes de enviar», con la cuenta postulando, no hay tarjeta (como antes)', t.AP.cierreDePagina() === false);
  }

  console.log('\n' + (fallos === 0 ? '✓ Todo OK' : '✗ ' + fallos + ' fallo(s)'));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('✗ la prueba se cayó:', e); process.exit(1); });
