// Verificación de las piezas de "agregar Trabajando.com como tercer portal"
// que se pueden probar sin DOM real (las que sí necesitan DOM -- extracción
// de tarjetas, facetas, el honeypot de texto oculto -- se verificaron a mano
// contra el sitio real el 2026-09-08, no acá; ver los comentarios en
// extension/adapters/trabajando.js).
//   1. AP.siguientePaginaClick (core.js) -- paginación por botón "cargar más".
//   2. URL_BUSQUEDA_POR_PORTAL['Trabajando'] (background.js) -- extraída del
//      archivo real, no reescrita a mano.
// No está conectado a CI, es para correr a mano: node verificar-trabajando.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond) {
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

// ── 1. AP.siguientePaginaClick (core.js real) ───────────────────────────
{
  const storage = {};
  const ctx = {
    window: {},
    document: { documentElement: {}, hidden: true },
    chrome: {
      runtime: { onMessage: { addListener(){} }, sendMessage(){}, lastError: null },
      storage: { local: { get:(_k,cb)=>cb({}), set(){} }, sync: { get:(_k,cb)=>cb({}), set(){} } },
    },
    sessionStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
    },
    console, setTimeout, clearTimeout,
    MutationObserver: class { observe(){} },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  const AP = ctx.window.AP;

  let clics = 0;
  const botonFalso = { click: () => { clics++; } };

  ctx.document.hidden = false;
  check('en pestaña visible (manual) no pagina sola', AP.siguientePaginaClick(15, botonFalso) === false && clics === 0);

  ctx.document.hidden = true;
  check('sin tarjetas nuevas no hace click', AP.siguientePaginaClick(0, botonFalso) === false && clics === 0);
  check('sin botón no hace click', AP.siguientePaginaClick(15, null) === false && clics === 0);

  check('primer avance: hace click y devuelve true', AP.siguientePaginaClick(15, botonFalso) === true);
  check('...un solo click', clics === 1);
  check('segundo avance: hace click de nuevo (página 2 -> 3, con MAX=3)', AP.siguientePaginaClick(15, botonFalso) === true);
  check('...van 2 clicks en total', clics === 2);
  check('tercer avance: ya se llegó al máximo (3), no hace más click', AP.siguientePaginaClick(15, botonFalso) === false);
  check('...se quedó en 2 clicks (no un tercero)', clics === 2);
}

// ── 2. URL_BUSQUEDA_POR_PORTAL['Trabajando'] (background.js real) ──────────
{
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  // Extrae solo comunaParaUrl() + el objeto URL_BUSQUEDA_POR_PORTAL completo
  // (sin correr el resto del archivo, que depende de chrome.* a nivel top).
  const startComuna = src.indexOf('function comunaParaUrl');
  const endComuna = src.indexOf('\n}', startComuna) + 2;
  const startMapa = src.indexOf('const URL_BUSQUEDA_POR_PORTAL');
  const endMapa = src.indexOf('\n};', startMapa) + 3;
  const codigo = src.slice(startComuna, endComuna) + '\n' + src.slice(startMapa, endMapa) + '\nURL_BUSQUEDA_POR_PORTAL;';
  const ctx = {};
  vm.createContext(ctx);
  const URL_BUSQUEDA_POR_PORTAL = vm.runInContext(codigo, ctx, { filename: 'background.js (URL_BUSQUEDA_POR_PORTAL extraído)' });

  check('existe un builder para Trabajando', typeof URL_BUSQUEDA_POR_PORTAL['Trabajando'] === 'function');

  const sinFiltros = URL_BUSQUEDA_POR_PORTAL['Trabajando']('desarrollador-de-software', null);
  check('sin filtros: solo la ruta con el slug, sin query', sinFiltros === 'https://www.trabajando.cl/trabajo-empleo/desarrollador-de-software');

  const conComuna = URL_BUSQUEDA_POR_PORTAL['Trabajando']('vendedor', { comunas: ['providencia'], modalidad: 'cualquiera' });
  check('con comuna: agrega ?ubicacion=', conComuna === 'https://www.trabajando.cl/trabajo-empleo/vendedor?ubicacion=providencia');

  const comunaCompuesta = URL_BUSQUEDA_POR_PORTAL['Trabajando']('vendedor', { comunas: ['puente alto'], modalidad: 'cualquiera' });
  check('comuna de dos palabras: espacio -> guión (verificado contra el sitio real)', comunaCompuesta === 'https://www.trabajando.cl/trabajo-empleo/vendedor?ubicacion=puente-alto');

  const remoto = URL_BUSQUEDA_POR_PORTAL['Trabajando']('vendedor', { comunas: ['providencia'], modalidad: 'remoto' });
  check('modalidad remoto: NO combina con la comuna (mismo criterio que CT/Laborum)', remoto === 'https://www.trabajando.cl/trabajo-empleo/vendedor');
}

// ── 3. huboEvidenciaDeExito (trabajando.js real) ─────────────────────────
// Bug real reportado en vivo el 2026-09-30: buscaba la señal de éxito en
// document.body.innerText COMPLETO, que incluye el listado de tarjetas de
// la izquierda -- y trabajando.com le pone "Ya postulaste" a cualquier
// tarjeta a la que la cuenta ya se le haya postulado antes (de otro
// escaneo, de otra oferta sin relación). Con una cuenta que ya tiene
// postulaciones reales, eso está casi siempre visible en la lista, así que
// CUALQUIER intento -- funcionara o no el clic -- se reportaba como
// confirmado. Se extraen obtenerBotonPostular() y huboEvidenciaDeExito()
// tal cual del archivo real (no se reescriben a mano).
{
  const src = fs.readFileSync(path.join(__dirname, 'adapters', 'trabajando.js'), 'utf8');
  const desdeBoton = src.indexOf('function obtenerBotonPostular()');
  const hastaBoton = src.indexOf('\n}', desdeBoton) + 2;
  const desdeExito = src.indexOf('function huboEvidenciaDeExito()');
  const hastaExito = src.indexOf('\n}', desdeExito) + 2;
  if (desdeBoton === -1 || desdeExito === -1) {
    throw new Error('No se encontró obtenerBotonPostular() o huboEvidenciaDeExito() en trabajando.js -- ¿se renombraron?');
  }
  const n = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  function elemento(textContent, opts) {
    opts = opts || {};
    return {
      textContent,
      innerText: opts.innerText != null ? opts.innerText : textContent,
      offsetParent: opts.oculto ? null : {},
      disabled: !!opts.disabled,
    };
  }

  function crearDocumento({ botonEnPanel, listadoTexto, textoFueraDelListado }) {
    const panel = { querySelectorAll: () => (botonEnPanel ? [botonEnPanel] : []) };
    const listado = elemento(null, { innerText: listadoTexto || '' });
    const bodyInnerText = (textoFueraDelListado || '') + ' ' + (listadoTexto || '');
    return {
      querySelector: (sel) => (sel === SELECTOR_PANEL ? panel : sel === '#listadoOfertas' ? listado : null),
      querySelectorAll: () => (botonEnPanel ? [botonEnPanel] : []),
      body: { innerText: bodyInnerText },
    };
  }

  const SELECTOR_PANEL = '#detalleOferta';
  const ctx = { document: null, n, SELECTOR_PANEL };
  vm.createContext(ctx);
  const huboEvidenciaDeExito = vm.runInContext(
    src.slice(desdeBoton, hastaBoton) + '\n' + src.slice(desdeExito, hastaExito) + '\nhuboEvidenciaDeExito;',
    ctx,
    { filename: 'trabajando.js (huboEvidenciaDeExito extraído)' }
  );

  // Caso real reportado: el botón de postular sigue ahí (el clic no logró
  // nada), pero el LISTADO de la izquierda muestra "Ya postulaste" en OTRA
  // tarjeta -- antes esto se leía como éxito de la oferta actual.
  ctx.document = crearDocumento({
    botonEnPanel: elemento('Postular'),
    listadoTexto: 'Vendedor/a otra oferta cualquiera Ya postulaste hace 3 días',
    textoFueraDelListado: 'Vendedor(a) Temporada Verano - Portal La Reina Postular',
  });
  check('un "Ya postulaste" que viene del LISTADO (otra oferta) ya no cuenta como éxito', huboEvidenciaDeExito() === false);

  // Si la confirmación aparece FUERA del listado (el panel de detalle, un
  // modal, un toast) sigue contando -- no se rompió la señal real.
  ctx.document = crearDocumento({
    botonEnPanel: elemento('Postular'),
    listadoTexto: '',
    textoFueraDelListado: 'Postulación enviada con éxito',
  });
  check('un "postulación enviada" FUERA del listado sigue contando como éxito', huboEvidenciaDeExito() === true);

  // Sin ninguna señal de texto, pero el botón de postular ya no está (se
  // deshabilitó/desapareció) -- la señal (b) sigue funcionando igual que antes.
  ctx.document = crearDocumento({ botonEnPanel: null, listadoTexto: '', textoFueraDelListado: '' });
  check('sin texto de éxito y sin botón de postular -> sigue contando como éxito (señal b)', huboEvidenciaDeExito() === true);

  // Sin ninguna señal -- el botón real sigue ahí y nada confirma nada.
  ctx.document = crearDocumento({ botonEnPanel: elemento('Postular'), listadoTexto: '', textoFueraDelListado: '' });
  check('sin ninguna señal -> no se confirma', huboEvidenciaDeExito() === false);
}

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
