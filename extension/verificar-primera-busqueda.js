// Verificación de la primera búsqueda en el portal (docs/primera-busqueda-guiada.md §11):
//   1. La marca en cada oferta del listado: qué razón dice, cómo se guarda en la
//      pestaña y cómo se pinta (sin innerHTML con texto del aviso).
//   2. La tarjeta del final de la página: cuándo sale, qué dice, y qué hacen
//      "Empezar a postular" y "Todavía no, quiero mirar".
//   3. Lo demás que la acompaña: la primera postulación con revisión, el resumen
//      que no se borra con una pasada sin novedades, las pestañas de las ráfagas
//      y el filtro de lo que pinta la propia extensión.
//   4. Las tres frases de §4 (§12): la sesión, mirada con lo que muestra cada
//      portal real, y la línea de "qué necesita de ti" del popup.
// Carga core.js REAL en un vm de Node con un DOM falso mínimo: cada shadow root
// devuelve un elemento por id o selector (no parsea el HTML), lo justo para leer
// los textos y apretar los botones.
// No está conectado a CI, es para correr a mano: node verificar-primera-busqueda.js
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
  const e = {
    tagName: String(tag || 'div').toUpperCase(), nodeType: 1, id: '', hidden: false, disabled: false,
    textContent: '', title: '', className: '', onclick: null, href: '',
    style: {}, attrs: {}, children: [], listeners: {}, shadowRoot: null, parent: null,
    scrollWidth: 0, clientWidth: 0, animate: null,
  };
  e.classList = {
    add: (...c) => c.forEach(x => clases.add(x)), remove: (...c) => c.forEach(x => clases.delete(x)),
    toggle: (c, f) => { const v = f === undefined ? !clases.has(c) : !!f; if (v) clases.add(c); else clases.delete(c); return v; },
    contains: (c) => clases.has(c), lista: () => [...clases],
  };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  e.hasAttribute = (k) => k in e.attrs;
  e.addEventListener = (t, fn) => { (e.listeners[t] = e.listeners[t] || []).push(fn); };
  e.appendChild = (h) => { h.parent = e; e.children.push(h); return h; };
  e.remove = () => { if (e.parent) e.parent.children = e.parent.children.filter(c => c !== e); e.parent = null; };
  e.querySelector = (s) => {
    if (s === ':scope > [data-ap-marca]') return e.children.find(c => c.hasAttribute('data-ap-marca')) || null;
    return null;
  };
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
    querySelector(s) { if (!porSelector.has(s)) porSelector.set(s, crearElemento('span')); return porSelector.get(s); },
  };
}

// ── Contexto: core.js real ────────────────────────────────────────
function crear({ cfg, sesion, docSel, host } = {}) {
  const mensajes = [];
  const timers = [];
  const navegaciones = [];
  const observadores = [];
  const listeners = [];
  const guardado = Object.assign({}, sesion || {});
  let responder = () => ({ ok: true });
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
    MutationObserver: class { constructor(fn) { observadores.push(fn); } observe() {} disconnect() {} },
    URL, URLSearchParams,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;
  AP.cfg = cfg || { active: true, postulacionHabilitada: false };
  AP.activo = true;
  // Corre los temporizadores pendientes (los nuevos que agreguen, también).
  const correrTimers = (soloHasta) => {
    for (let vuelta = 0; vuelta < 50 && timers.length; vuelta++) {
      const t = timers.shift();
      if (soloHasta !== undefined && t.ms > soloHasta) continue;
      t.fn();
    }
  };
  return {
    AP, ctx, mensajes, timers, navegaciones, observadores, listeners, guardado, correrTimers,
    responderCon: (fn) => { responder = fn; },
    raiz: () => (doc.body.children.find(c => c.id === 'ap-ov') || {}).shadowRoot,
  };
}

const esperar = () => new Promise(r => setImmediate(r));

const ROL = { tipo: 'rol', rol: 'vendedor', termino: 'vendedora' };
const JORNADA = { tipo: 'jornada_desconocida', declarada: 'part_time' };
const LUGAR = { tipo: 'ubicacion', ofertaEn: 'maipu', buscadas: ['ñuñoa'] };

(async () => {
  // ── 1. Qué razón dice la marca ──────────────────────────────────
  {
    const { AP } = crear();
    check('te sirve: dice la primera razón a favor', AP.razonDeLaMarca('postular', [{ tipo: 'senal', patron: 'turno noche', delta: -10 }, ROL]) === ROL);
    check('para que decidas: dice lo que la dejó en duda (la primera en contra)', AP.razonDeLaMarca('gris', [ROL, JORNADA]) === JORNADA);
    check('no calza: dice la que la descartó', AP.razonDeLaMarca('descartar', [LUGAR]) === LUGAR);
    check('sin razones no inventa ninguna', AP.razonDeLaMarca('postular', undefined) === null);
    check('las palabras son las del panel', AP.razonComoEnElPanel(JORNADA) === 'No dice la jornada, y buscas part time');
  }

  // ── 2. Se guarda en la pestaña ─────────────────────────────────
  {
    const t = crear();
    t.AP.marcar('A1', 'postular', [ROL]);
    t.AP.marcar('A2', 'gris', [ROL, JORNADA]);
    t.AP.marcar('A3', 'descartar', [LUGAR]);
    t.AP.marcar('A4', 'inventada', [ROL]);
    const marcas = JSON.parse(t.guardado.ap_marcas);
    check('cada decisión queda con su banda y su razón', marcas.A1.b === 'postular' && marcas.A1.r.tipo === 'rol' && marcas.A2.r.tipo === 'jornada_desconocida' && marcas.A3.r.tipo === 'ubicacion', marcas);
    check('una banda que no existe no se guarda', !('A4' in marcas));
    for (let i = 0; i < 320; i++) t.AP.marcar('X' + i, 'descartar', [LUGAR]);
    const muchas = JSON.parse(t.guardado.ap_marcas);
    check('guarda hasta 300 y bota las más viejas', Object.keys(muchas).length === 300 && !('A1' in muchas) && ('X319' in muchas));
  }

  // ── 3. Se pinta en cada tarjeta ────────────────────────────────
  {
    const t = crear();
    const tarjetas = ['C1', 'C2', 'C3', 'C4'].map(id => ({ el: crearElemento('article'), id }));
    tarjetas.push({ el: crearElemento('article'), id: 'C1' }); // el mismo aviso dos veces en la página
    t.AP.tarjetasDeLaPagina = () => tarjetas;
    const malicioso = { tipo: 'rol', rol: 'vendedor', termino: '<img src=x onerror=alert(1)>' };
    t.AP.marcar('C1', 'postular', [malicioso]);
    t.AP.marcar('C2', 'gris', [ROL, JORNADA]);
    t.AP.marcar('C3', 'descartar', [LUGAR]);
    t.correrTimers();
    const marca = (i) => tarjetas[i].el.children.find(c => c.hasAttribute('data-ap-marca'));
    const textos = (i) => marca(i) ? marca(i).shadowRoot.querySelector('.t').textContent + marca(i).shadowRoot.querySelector('.r').textContent : null;
    check('te sirve, con su razón', textos(0) === 'Te sirve · Es de vendedor, lo que buscas (dice "<img src=x onerror=alert(1)>")', textos(0));
    check('...el texto del aviso va como texto, nunca como HTML', !marca(0).shadowRoot.innerHTML.includes('onerror'));
    check('para que decidas, con lo que la dejó en duda', textos(1) === 'Para que decidas · No dice la jornada, y buscas part time', textos(1));
    check('no calza, con la razón del descarte', textos(2) === 'No calza · Queda en maipu, fuera de tus comunas', textos(2));
    check('la banda va como clase (el color)', marca(1).shadowRoot.querySelector('.m').classList.contains('gris'));
    check('sin decisión, sin marca', !marca(3));
    check('el mismo aviso repetido en la página se marca una sola vez', !marca(4));
    check('un clic en la marca no abre la oferta', (marca(0).listeners.click || []).length === 1);
    const host = marca(0);
    t.AP.pintarMarcas();
    t.correrTimers();
    check('pintar de nuevo no duplica la marca', tarjetas[0].el.children.filter(c => c.hasAttribute('data-ap-marca')).length === 1 && marca(0) === host);
    t.AP.marcar('C2', 'descartar', [LUGAR]);
    t.correrTimers();
    check('si la decisión cambia, la marca cambia', textos(1) === 'No calza · Queda en maipu, fuera de tus comunas', textos(1));
  }

  // ── 4. Lo que dice la tarjeta del final ────────────────────────
  {
    const { AP } = crear();
    let x = AP.textoCierre({ total: 20, postular: 3, gris: 6, descartar: 11, razonTop: LUGAR });
    check('el ejemplo del documento', x.principal === 'De las 20 ofertas de esta página: postularía a 3, te dejaría 6 para que decidas y descartaría 11.', x.principal);
    check('...la razón más repetida, con las palabras del panel', x.razon === 'La razón más repetida para descartar: queda en maipu, fuera de tus comunas.', x.razon);
    check('...y el botón: "Empezar a postular"', x.boton === 'Empezar a postular');
    check('...al activarla avisa que la primera se muestra antes', x.listo === 'Listo: empieza por las 3 que te sirven. La primera te la muestra antes de enviarla.');
    x = AP.textoCierre({ total: 9, postular: 0, gris: 2, descartar: 7, razonTop: LUGAR });
    check('si no postularía a ninguna, lo dice', x.principal === 'De las 9 ofertas de esta página no postularía a ninguna: te dejaría 2 para que decidas y descartaría 7.', x.principal);
    check('...y el botón no promete postular acá', x.boton === 'Activar la postulación');
    x = AP.textoCierre({ total: 4, postular: 1, gris: 0, descartar: 3, razonTop: null });
    check('sin razón guardada no dice "la razón más repetida"', x.razon === '' && x.principal === 'De las 4 ofertas de esta página: postularía a 1 y descartaría 3.', x);
    check('...una sola que sirve: en singular', x.listo === 'Listo: empieza por la que te sirve. Te la muestra antes de enviarla.');
    x = AP.textoCierre({ total: 1, postular: 0, gris: 0, descartar: 1, razonTop: LUGAR });
    check('una sola oferta en la página', x.principal === 'En esta página hay una sola oferta, y no calza.' && x.razon === 'Por qué se descarta: queda en maipu, fuera de tus comunas.', x);
  }

  // ── 5. Las cifras salen de las marcas de esta página ───────────
  {
    const { AP } = crear();
    const marcas = {
      a: { b: 'postular', r: ROL }, b: { b: 'gris', r: JORNADA }, c: { b: 'descartar', r: LUGAR },
      d: { b: 'descartar', r: LUGAR }, e: { b: 'descartar', r: JORNADA }, f: { b: 'otra' }, z: { b: 'postular', r: ROL },
    };
    const c = AP.resumenDeMarcas(['a', 'b', 'c', 'd', 'e', 'f', 'a', 'sinmarca'], marcas);
    check('cuenta una vez cada oferta de la página, y solo las de esta página', c.total === 5 && c.postular === 1 && c.gris === 1 && c.descartar === 3, c);
    check('la razón más repetida entre los descartes', c.razonTop && c.razonTop.tipo === 'ubicacion', c.razonTop);
  }

  // ── 6. Cuándo sale la tarjeta ──────────────────────────────────
  const conMarcas = (t) => {
    t.AP.tarjetasDeLaPagina = () => ['P1', 'P2', 'P3', 'G1', 'D1', 'D2'].map(id => ({ el: crearElemento('article'), id }));
    ['P1', 'P2', 'P3'].forEach(id => { t.AP.marcar(id, 'postular', [ROL]); t.AP.vistos.add(id); });
    t.AP.marcar('G1', 'gris', [JORNADA]); t.AP.vistos.add('G1');
    ['D1', 'D2'].forEach(id => { t.AP.marcar(id, 'descartar', [LUGAR]); t.AP.vistos.add(id); });
  };
  {
    const t = crear({ cfg: { active: true, postulacionHabilitada: true } });
    conMarcas(t);
    check('postulando de verdad: no sale (no hay nada que autorizar)', t.AP.cierreDePagina() === false);
  }
  {
    const t = crear({ sesion: { ap_pestana_de_rafaga: '1' } });
    conMarcas(t);
    check('en la pestaña de una ráfaga: no sale (nadie la está mirando)', t.AP.cierreDePagina() === false);
  }
  {
    const t = crear();
    t.AP.tarjetasDeLaPagina = () => [{ el: crearElemento('article'), id: 'sin' }];
    check('sin ninguna decisión en la página: no sale', t.AP.cierreDePagina() === false);
  }
  {
    const t = crear({ cfg: { active: true, postulacionHabilitada: true, soloObservar: true } });
    conMarcas(t);
    check('con "solo observar" pedido por la persona: sí sale', t.AP.cierreDePagina() === true);
  }
  {
    const t = crear();
    conMarcas(t);
    check('mirando, con decisiones: sale', t.AP.cierreDePagina() === true);
    const r = t.raiz();
    check('...dice qué haría con estas ofertas', r.getElementById('ap-ov-cierre-t').textContent === 'De las 6 ofertas de esta página: postularía a 3, te dejaría 1 para que decidas y descartaría 2.', r.getElementById('ap-ov-cierre-t').textContent);
    check('...con el botón para empezar', r.getElementById('ap-ov-cierre-si').textContent === 'Empezar a postular' && !r.getElementById('ap-ov-cierre').hidden);
    check('...y sin aviso de sesión si no se sabe que falte', r.getElementById('ap-ov-cierre-sesion').textContent === '');
    r.getElementById('ap-ov-cierre-no').onclick();
    check('"Todavía no, quiero mirar": se cierra', r.getElementById('ap-ov-cierre').hidden === true);
    check('...no envía nada ni cambia la cuenta', !t.mensajes.some(m => m.type === 'EMPEZAR_A_POSTULAR'));
    check('...y no vuelve a salir en esta pestaña', t.guardado.ap_cierre_listo === '1' && t.AP.cierreDePagina() === false);
  }

  // ── 7. "Empezar a postular" ────────────────────────────────────
  {
    const t = crear();
    conMarcas(t);
    let escaneos = 0;
    t.AP.escanear = () => { escaneos++; };
    t.responderCon((m) => (m.type === 'EMPEZAR_A_POSTULAR' ? { ok: true, config: { active: true, postulacionHabilitada: true, soloObservar: false } } : { ok: true }));
    t.AP.cierreDePagina();
    const r = t.raiz();
    r.getElementById('ap-ov-cierre-si').onclick();
    check('pide activar la postulación en la cuenta', t.mensajes.filter(m => m.type === 'EMPEZAR_A_POSTULAR').length === 1);
    check('...el botón queda en "Activando…" mientras tanto', r.getElementById('ap-ov-cierre-si').disabled && r.getElementById('ap-ov-cierre-si').textContent === 'Activando…');
    r.getElementById('ap-ov-cierre-si').onclick();
    check('...apretar dos veces no la pide dos veces', t.mensajes.filter(m => m.type === 'EMPEZAR_A_POSTULAR').length === 1);
    await esperar();
    check('activada: la extensión deja de solo mirar', t.AP.soloObservarEfectivo() === false && t.AP.cfg.postulacionHabilitada === true);
    check('...dice qué viene, sin botones', r.getElementById('ap-ov-cierre-resultado').textContent === 'Listo: empieza por las 3 que te sirven. La primera te la muestra antes de enviarla.' && r.getElementById('ap-ov-cierre-botones').hidden === true);
    check('...la primera se va a mostrar antes de enviarla', t.guardado.ap_revisar_primera === '1' && t.AP.conRevision() === true);
    check('...las que solo miró vuelven a estar disponibles; las dudosas y las descartadas no', !t.AP.vistos.has('P1') && !t.AP.vistos.has('P3') && t.AP.vistos.has('G1') && t.AP.vistos.has('D1'));
    check('...todavía no escanea (deja leer el mensaje)', escaneos === 0);
    t.correrTimers();
    check('...después se cierra y sigue con esta misma página', r.getElementById('ap-ov-cierre').hidden === true && escaneos === 1);
    check('...y no vuelve a salir', t.AP.cierreDePagina() === false);
  }
  {
    const t = crear();
    conMarcas(t);
    t.responderCon((m) => (m.type === 'EMPEZAR_A_POSTULAR' ? { ok: false, error: 'Confirma tu objetivo laboral primero' } : { ok: true }));
    t.AP.cierreDePagina();
    const r = t.raiz();
    r.getElementById('ap-ov-cierre-si').onclick();
    await esperar();
    check('si la cuenta no cumple, lo dice en la tarjeta', r.getElementById('ap-ov-cierre-resultado').textContent === 'Confirma tu objetivo laboral primero' && r.getElementById('ap-ov-cierre-resultado').className.includes('error'));
    check('...el botón vuelve a estar listo', !r.getElementById('ap-ov-cierre-si').disabled && r.getElementById('ap-ov-cierre-si').textContent === 'Empezar a postular');
    check('...sigue en solo mirar y sin la "primera con revisión"', t.AP.soloObservarEfectivo() === true && !t.guardado.ap_revisar_primera);
    r.getElementById('ap-ov-cierre-si').onclick();
    check('...y se puede volver a intentar', t.mensajes.filter(m => m.type === 'EMPEZAR_A_POSTULAR').length === 2);
  }

  // ── 8. Sin sesión en el portal ─────────────────────────────────
  // Con lo que muestra cada portal real sin sesión (core.js, SESION_POR_PORTAL;
  // mirado en los tres sitios el 2026-10-03). Antes solo Laborum decía algo.
  const SEL_SIN = 'a[href*="/login" i], a[href*="iniciar-sesion" i], a[href*="iniciarsesion" i], a[href*="signin" i]';
  for (const [host, portal, indicio, ingreso] of [
    ['cl.computrabajo.com', 'Computrabajo', '[data-login-button-desktop]', 'https://candidato.cl.computrabajo.com/acceso/'],
    ['www.laborum.cl', 'Laborum', SEL_SIN, 'https://www.laborum.cl/login'],
    ['www.trabajando.cl', 'Trabajando', 'a[href*="/ingresa-a-tu-cuenta" i]', 'https://www.trabajando.cl/ingresa-a-tu-cuenta'],
  ]) {
    const t = crear({ host, docSel: { [indicio]: [crearElemento('span')] } });
    conMarcas(t);
    t.AP.cierreDePagina();
    const r = t.raiz();
    check(portal + ' sin sesión: lo dice donde se pide el permiso', r.getElementById('ap-ov-cierre-sesion').textContent === 'Para postular necesitas tu sesión iniciada en ' + portal + '.', r.getElementById('ap-ov-cierre-sesion').textContent);
    check('...y el botón lleva a iniciarla', r.getElementById('ap-ov-cierre-si').textContent === 'Iniciar sesión en ' + portal);
    r.getElementById('ap-ov-cierre-si').onclick();
    check('...a la página para entrar del propio portal', t.navegaciones.length === 1 && t.navegaciones[0] === ingreso && !t.mensajes.some(m => m.type === 'EMPEZAR_A_POSTULAR'), t.navegaciones);
  }
  {
    const t = crear({ docSel: { '[data-info-user], #logout': [crearElemento('div')], [SEL_SIN]: [crearElemento('a')] } });
    conMarcas(t);
    t.AP.cierreDePagina();
    const r = t.raiz();
    check('con sesión, aunque quede escondido un enlace para entrar: los botones de siempre', r.getElementById('ap-ov-cierre-sesion').textContent === '' && r.getElementById('ap-ov-cierre-si').textContent === 'Empezar a postular');
  }
  {
    const ajeno = crearElemento('a');
    ajeno.href = 'https://otro-sitio.example/login';
    const t = crear({ docSel: { [SEL_SIN]: [ajeno] } });
    conMarcas(t);
    t.AP.cierreDePagina();
    t.raiz().getElementById('ap-ov-cierre-si').onclick();
    check('un enlace de la página nunca se sigue: va a la página del propio portal', t.navegaciones.length === 1 && t.navegaciones[0] === 'https://candidato.cl.computrabajo.com/acceso/', t.navegaciones);
  }

  // ── 9. La primera postulación con revisión ─────────────────────
  {
    const t = crear({ cfg: { active: true, postulacionHabilitada: true } });
    check('sin "Revisar antes de enviar" ni la marca: sin revisión', t.AP.conRevision() === false);
    t.guardado.ap_revisar_primera = '1';
    check('con la marca de "Empezar a postular": con revisión', t.AP.conRevision() === true);
    t.AP.gastarRevisionPrimera();
    check('...hasta que termina esa postulación', t.AP.conRevision() === false);
    t.AP.cfg.modoRevision = true;
    check('"Revisar antes de enviar" sigue mandando como siempre', t.AP.conRevision() === true);
  }

  // ── 10. Una pasada sin novedades no borra el resumen ───────────
  {
    const t = crear();
    const lleno = t.AP.mensajeEscaneo({ observado: 3, gris: 1, descartar: 2 }, null, true);
    const vacio = t.AP.mensajeEscaneo({ observado: 0, gris: 0, descartar: 0 }, null, true);
    check('misma página, nada nuevo: se queda el resumen de lo que ya revisó', vacio.texto === lleno.texto, vacio.texto);
    t.ctx.location._href = 'https://cl.computrabajo.com/trabajo-de-vendedora?p=2';
    const otra = t.AP.mensajeEscaneo({ observado: 0, gris: 0, descartar: 0 }, null, true);
    check('en otra página sí dice que no hay nada nuevo', /Sin ofertas nuevas/.test(otra.texto), otra.texto);
  }

  // ── 11. Las pestañas de las ráfagas, y lo que pinta la extensión ──
  {
    const t = crear();
    t.listeners.forEach(fn => fn({ type: 'AUTO_SCAN' }, {}, () => {}));
    check('la orden de la ráfaga marca la pestaña', t.guardado.ap_pestana_de_rafaga === '1' && t.AP.esPestanaDeRafaga() === true);
  }
  {
    const t = crear();
    t.AP.escanear = () => {};
    const observador = t.observadores[0];
    const marca = crearElemento('div'); marca.setAttribute('data-ap-marca', 'x');
    const aviso = crearElemento('div'); aviso.id = 'ap-ov';
    t.timers.length = 0;
    observador([{ addedNodes: [marca], removedNodes: [] }, { addedNodes: [aviso], removedNodes: [] }]);
    check('pintar marcas o el aviso no dispara otro escaneo', t.timers.length === 0, t.timers.map(x => x.ms));
    observador([{ addedNodes: [crearElemento('article')], removedNodes: [] }]);
    check('un cambio del portal sí: repinta las marcas y vuelve a escanear', t.timers.some(x => x.ms === 120) && t.timers.some(x => x.ms === 2500), t.timers.map(x => x.ms));
  }

  // ── 12. La sesión se le avisa al popup, y se vuelve a mirar ────
  {
    const sel = {};
    const t = crear({ docSel: sel });
    const avisos = () => t.mensajes.filter(m => m.type === 'SESION_PORTAL');
    check('una página que no dice nada: no se avisa (no se pisa lo anterior)', avisos().length === 0);
    sel['[data-login-button-desktop]'] = [crearElemento('span')];
    t.AP.reportarSesion();
    check('sin sesión en Computrabajo: se avisa', avisos().length === 1 && avisos()[0].portal === 'Computrabajo' && avisos()[0].hay === false, avisos());
    t.AP.reportarSesion();
    check('...una sola vez mientras no cambie', avisos().length === 1);
    delete sel['[data-login-button-desktop]'];
    sel['[data-info-user], #logout'] = [crearElemento('div')];
    t.AP.reportarSesion();
    check('entró sin recargar la página: se avisa que ahora hay', avisos().length === 2 && avisos()[1].hay === true, avisos());
    t.timers.length = 0;
    t.observadores[0]([{ addedNodes: [crearElemento('header')], removedNodes: [] }]);
    check('cuando el portal cambia la página, la sesión se vuelve a mirar (el encabezado llega tarde)', t.timers.some(x => x.ms === 1500), t.timers.map(x => x.ms));
  }

  // ── 13. El popup: "qué necesita de ti" (§4 y §12) ──────────────
  // Se extrae el bloque REAL de popup.js (el mismo que prueban las ráfagas) y se
  // corre con un DOM y un chrome mínimos.
  {
    const fuente = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
    const desde = fuente.indexOf('function haceCuanto(');
    const hasta = fuente.indexOf('// ── Cargar estado');
    function elementoPopup(tag) {
      const clases = new Set();
      const el = {
        tagName: String(tag || 'div').toUpperCase(), children: [], href: '', target: '', rel: '', disabled: false,
        classList: { toggle: (c, f) => { if (f) clases.add(c); else clases.delete(c); }, contains: (c) => clases.has(c) },
        appendChild: (h) => { el.children.push(h); return h; },
      };
      let texto = '';
      Object.defineProperty(el, 'textContent', {
        get: () => texto + el.children.map(h => h.textContent).join(''),
        set: (v) => { texto = String(v); el.children = []; },
      });
      return el;
    }
    function cargarPopup() {
      const elementos = {};
      ['aviso', 'aviso-texto', 'aviso-links', 'rafaga-row', 'rafaga-titulo', 'rafaga-detalle', 'prueba-row', 'prueba-titulo',
        'prueba-detalle', 'prueba-links', 'prueba-ver', 'prueba-premium', 'ponerse-row', 'ponerse-btn', 'ponerse-hint']
        .forEach((id) => { elementos[id] = elementoPopup(); elementos[id].classList.toggle('hidden', true); });
      const guardados = [];
      const ctx = {
        Date, BACKEND_URL: 'https://autopostula.cl',
        document: { getElementById: (id) => elementos[id] || null, createElement: elementoPopup },
        chrome: {
          runtime: { sendMessage: () => {}, lastError: null },
          storage: { local: { set: (o) => guardados.push(o) }, onChanged: { addListener: () => {} } },
          action: { setBadgeText: () => {} },
        },
      };
      vm.createContext(ctx);
      vm.runInContext(fuente.slice(desde, hasta), ctx, { filename: 'popup.js (bloque de ráfaga)' });
      return { ctx, elementos, guardados, oculto: (id) => elementos[id].classList.contains('hidden'), leer: (n) => vm.runInContext(n, ctx) };
    }

    const p = cargarPopup();
    const ahora = Date.now();
    const conectados = [{ nombre: 'Computrabajo', conectado: true }, { nombre: 'Laborum', conectado: true }, { nombre: 'Trabajando', conectado: true }];
    const cortada = { id: 'r_1', estado: 'interrumpida', inicio: ahora - 3600e3, latido: ahora - 3500e3, fin: ahora - 3500e3, conteos: { postuladas: 2 } };
    const aviso = (d) => p.ctx.avisoParaTi(Object.assign({ portales: null, sesiones: {}, rafaga: null, automatica: null, pausada: false, chromeVisto: null }, d), ahora);
    const CHROME = p.leer('TEXTO_CHROME_ABIERTO');

    // La 1: la sesión en el portal
    let x = aviso({ portales: conectados, sesiones: { Laborum: { hay: false } } });
    check('a un portal conectado le falta la sesión: la frase de §4', x && x.tipo === 'sesion' && x.texto === 'Necesitas tener tu sesión iniciada en Laborum. Sin ella, la extensión no puede postular ahí.', x);
    check('...con el enlace a la página para entrar', x.enlaces.length === 1 && x.enlaces[0].texto === 'Iniciar sesión en Laborum' && x.enlaces[0].url === 'https://www.laborum.cl/login', x.enlaces);
    x = aviso({ portales: conectados, sesiones: { Laborum: { hay: false }, Trabajando: { hay: false }, Computrabajo: { hay: true } } });
    check('dos portales: "en Laborum y Trabajando", con un enlace para cada uno', x.texto.startsWith('Necesitas tener tu sesión iniciada en Laborum y Trabajando.') && x.enlaces.map(e => e.url).join(' ') === 'https://www.laborum.cl/login https://www.trabajando.cl/ingresa-a-tu-cuenta', x);
    x = aviso({ portales: conectados, sesiones: { Laborum: { hay: false }, Trabajando: { hay: false }, Computrabajo: { hay: false } } });
    check('los tres: "en Computrabajo, Laborum y Trabajando"', x.texto.startsWith('Necesitas tener tu sesión iniciada en Computrabajo, Laborum y Trabajando.'), x.texto);
    check('si ningún portal avisó, no se dice nada (no se sabe)', aviso({ portales: conectados, sesiones: {} }) === null);
    check('con la sesión iniciada, tampoco', aviso({ portales: conectados, sesiones: { Laborum: { hay: true } } }) === null);
    check('a un portal que la persona no conectó no se le pide', aviso({ portales: [{ nombre: 'Laborum', conectado: false }], sesiones: { Laborum: { hay: false } } }) === null);
    check('si la cuenta no contestó (no se sabe qué conectó), tampoco', aviso({ portales: null, sesiones: { Laborum: { hay: false } } }) === null);

    // La 2: que trabaja con Chrome abierto
    x = aviso({ rafaga: cortada, automatica: true });
    check('una puesta al día cortada, y se pone al día sola: la frase de §4', x && x.tipo === 'chrome' && x.texto === 'La extensión trabaja mientras Chrome está abierto, y se pone al día sola cuando lo abres.' && x.enlaces.length === 0 && x.rafagaId === 'r_1', x);
    check('"en curso" sin latido en 10 minutos también cuenta como cortada', aviso({ rafaga: { id: 'r_2', estado: 'en_curso', inicio: ahora - 30 * 60000, latido: ahora - 11 * 60000 }, automatica: true }) !== null);
    check('una que está corriendo, no', aviso({ rafaga: { id: 'r_3', estado: 'en_curso', inicio: ahora - 60000, latido: ahora - 30000 }, automatica: true }) === null);
    check('una que terminó bien, no', aviso({ rafaga: Object.assign({}, cortada, { estado: 'terminada' }), automatica: true }) === null);
    check('si hoy no se pone al día sola (gratis sin prueba, sin cupo, en pausa en la cuenta), no lo promete', aviso({ rafaga: cortada, automatica: false }) === null && aviso({ rafaga: cortada, automatica: null }) === null);
    check('en pausa desde el popup, tampoco', aviso({ rafaga: cortada, automatica: true, pausada: true }) === null);
    check('la primera vez: con la misma cortada sigue saliendo', aviso({ rafaga: cortada, automatica: true, chromeVisto: 'r_1' }) !== null);
    check('...con otra cortada después, ya no', aviso({ rafaga: Object.assign({}, cortada, { id: 'r_9' }), automatica: true, chromeVisto: 'r_1' }) === null);
    for (const r of [cortada, { id: 'a', estado: 'en_curso', inicio: ahora - 3e6, latido: ahora - 11 * 60000 },
      { id: 'b', estado: 'en_curso', inicio: ahora - 60000, latido: ahora - 9 * 60000 }, Object.assign({}, cortada, { estado: 'terminada' })]) {
      const dice = ((p.ctx.textoRafaga(r, ahora) || {}).titulo || '');
      check('"cortada" es lo mismo que la línea de la ráfaga llama "se cortó" (' + dice + ')', p.ctx.rafagaCortada(r, ahora) === /se cortó/.test(dice));
    }

    // De a una, y nunca las tres
    x = aviso({ portales: conectados, sesiones: { Laborum: { hay: false } }, rafaga: cortada, automatica: true });
    check('si faltan la sesión y lo de Chrome, va la sesión (sin ella no postula ahí)', x.tipo === 'sesion');
    check('la 3 (lo del plan gratis) la dice la fila de la prueba cuando se acaba', p.ctx.textoPrueba({ estado: 'terminada', total: 5 }).detalle === p.leer('TEXTO_DESPUES_DE_LA_PRUEBA') && /Con el plan gratis, entra a/.test(p.leer('TEXTO_DESPUES_DE_LA_PRUEBA')));

    // El render
    const q = cargarPopup();
    q.ctx.renderPonerse({ mostrar: true, bloqueo: null, estimadoMs: null, prueba: null, automatica: true });
    q.ctx.renderRafaga(cortada);
    check('render: lo de Chrome abierto sale en el semáforo, en gris (es un dato)', !q.oculto('aviso') && !q.elementos.aviso.classList.contains('falta') && q.elementos['aviso-texto'].textContent === CHROME && q.oculto('aviso-links'));
    check('...y se anota con qué puesta al día se dijo', q.guardados.length === 1 && q.guardados[0].avisoChromeVisto === 'r_1', q.guardados);
    q.ctx.renderRafaga(cortada);
    check('...una sola vez', q.guardados.length === 1);
    q.ctx.actualizarAviso({ portales: conectados, sesiones: { Computrabajo: { hay: false } } });
    check('render: falta la sesión: la frase va en ámbar, con su enlace', !q.oculto('aviso') && q.elementos.aviso.classList.contains('falta') && q.elementos['aviso-texto'].textContent.startsWith('Necesitas tener tu sesión iniciada en Computrabajo.'));
    const enlace = q.elementos['aviso-links'].children[0];
    check('...el enlace abre la página para entrar, en otra pestaña', !q.oculto('aviso-links') && q.elementos['aviso-links'].children.length === 1 && enlace.href === 'https://candidato.cl.computrabajo.com/acceso/' && enlace.target === '_blank' && enlace.rel === 'noreferrer' && enlace.textContent === 'Iniciar sesión en Computrabajo ↗', enlace);
    q.ctx.actualizarAviso({ sesiones: { Computrabajo: { hay: true } } });
    check('inició sesión: vuelve lo de Chrome (la misma cortada), sin enlaces', !q.oculto('aviso') && q.elementos['aviso-texto'].textContent === CHROME && q.elementos['aviso-links'].children.length === 0 && q.oculto('aviso-links') && !q.elementos.aviso.classList.contains('falta'));
    q.ctx.renderRafaga(Object.assign({}, cortada, { estado: 'terminada' }));
    check('se puso al día: la línea se va', q.oculto('aviso'));
    q.ctx.renderRafaga(Object.assign({}, cortada, { id: 'r_9' }));
    check('otra cortada después: ya no se repite', q.oculto('aviso'));

    const g = cargarPopup();
    g.ctx.renderPonerse({ mostrar: false, prueba: { estado: 'terminada', total: 5 }, automatica: false });
    g.ctx.renderRafaga(cortada);
    g.ctx.actualizarAviso({ portales: conectados, sesiones: { Laborum: { hay: false } } });
    const textoAviso = g.oculto('aviso') ? '' : g.elementos['aviso-texto'].textContent;
    const visibles = [
      !g.oculto('prueba-row') && g.elementos['prueba-detalle'].textContent === p.leer('TEXTO_DESPUES_DE_LA_PRUEBA') && 'plan gratis',
      textoAviso.startsWith('Necesitas') && 'sesión',
      textoAviso === CHROME && 'chrome',
    ].filter(Boolean);
    check('gratis con la prueba terminada, sin sesión y con una cortada: dos de las tres, nunca las tres (criterio 5)', visibles.join(',') === 'plan gratis,sesión', visibles);

    // Las piezas están donde se esperan
    const semaforo = html.slice(html.indexOf('<div class="estado-row">'), html.indexOf('<!-- ÚLTIMA PUESTA AL DÍA -->'));
    check('popup.html: la línea va dentro del semáforo, con sus tres ids', semaforo.length > 0 && ['aviso', 'aviso-texto', 'aviso-links'].every(id => semaforo.includes('id="' + id + '"')));
    check('popup.js: con qué puesta al día ya se dijo lo de Chrome se lee antes de pintar la ráfaga', /avisoChromeVisto[\s\S]{0,300}renderRafaga\(data\.rafaga\)/.test(fuente.slice(fuente.indexOf('function loadState()'))));
    check('popup.js: los portales y su sesión alimentan la línea', /function renderPortales[\s\S]{0,600}actualizarAviso\(/.test(fuente));
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
