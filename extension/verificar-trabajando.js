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

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
