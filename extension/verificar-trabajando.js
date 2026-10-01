// Verificación de las piezas de "agregar Trabajando.com como tercer portal"
// que se pueden probar sin DOM real (las que sí necesitan DOM -- extracción
// de tarjetas, facetas, el honeypot de texto oculto -- se verificaron a mano
// contra el sitio real el 2026-09-08, no acá; ver los comentarios en
// extension/adapters/trabajando.js).
//   1. AP.siguientePaginaClick (core.js) -- paginación por botón "cargar más".
//   2. URL_BUSQUEDA_POR_PORTAL (background.js) -- comuna o región en los tres
//      portales, extraída del archivo real, no reescrita a mano.
//   3. huboEvidenciaDeExito() / obtenerBotonPostular() (trabajando.js).
//   4. soloNumero() / opcionQueCalza() (trabajando.js).
// El flujo con el DOM real (Postula fácil, Comenzar, la pantalla de
// preguntas) se verificó contra el sitio el 2026-09-30.
// No está conectado a CI, es para correr a mano: node verificar-trabajando.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, detalle) {
  if (!cond) { fallos++; console.error('✗ ' + desc, detalle !== undefined ? detalle : ''); }
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

// ── 2. URL_BUSQUEDA_POR_PORTAL (background.js real) ─────────────────────
{
  const src = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  // Extrae desde COMUNAS_RM hasta el final de URL_BUSQUEDA_POR_PORTAL (las
  // comunas de Laborum, comunaParaUrl, ubicacionDeBusqueda y las regiones de
  // cada portal), sin correr el resto del archivo, que depende de chrome.* a
  // nivel top. La tabla de comunas es la real, cargada como en el service
  // worker (sin window: queda en self.AP).
  const desde = src.indexOf('const COMUNAS_RM');
  const startMapa = src.indexOf('const URL_BUSQUEDA_POR_PORTAL');
  const endMapa = src.indexOf('\n};', startMapa) + 3;
  const codigo = src.slice(desde, endMapa) + '\nURL_BUSQUEDA_POR_PORTAL;';
  const ctx = {};
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'data', 'comunas-cl.js'), 'utf8'), ctx, { filename: 'data/comunas-cl.js' });
  check('la tabla de comunas carga sin window (como en el service worker)', Array.isArray(ctx.AP && ctx.AP.COMUNAS_CL) && ctx.AP.COMUNAS_CL.length > 300);
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

  // Caso real del 2026-09-30: "toda la Región Metropolitana". El perfil
  // compilado trae sus comunas en orden alfabético, con variantes sin tilde y
  // abreviaturas, y antes se buscaba solo en la primera: "vendedor en Alhué",
  // 0 ofertas en los tres portales (431 / 1.274 / 328 en toda la región).
  const todaLaRM = ctx.AP.COMUNAS_CL.filter(c => c.region === 'RM').map(c => c.nombre)
    .concat(['e. central', 'pac', 'stgo']).sort();
  const T = (comunas, extra) => URL_BUSQUEDA_POR_PORTAL['Trabajando']('vendedor', Object.assign({ comunas, modalidad: 'presencial' }, extra));
  const C = (comunas, extra) => URL_BUSQUEDA_POR_PORTAL['Computrabajo']('vendedor', Object.assign({ comunas, modalidad: 'presencial', jornada: 'part_time' }, extra));
  const L = (comunas, extra) => URL_BUSQUEDA_POR_PORTAL['Laborum']('vendedor', Object.assign({ comunas, modalidad: 'presencial', jornada: 'part_time' }, extra));
  check('el caso real empieza por Alhué (lo que se buscaba antes)', /^alhu/.test(todaLaRM[0]), todaLaRM[0]);
  check('toda la RM, Trabajando: ?region=1', T(todaLaRM) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?region=1', T(todaLaRM));
  check('toda la RM, Computrabajo: su filtro de región (-en-rmetropolitana)', C(todaLaRM) === 'https://cl.computrabajo.com/trabajo-de-vendedor-en-rmetropolitana-jornada-part-time', C(todaLaRM));
  check('toda la RM, Laborum: en-region-metropolitana/ sin comuna', L(todaLaRM) === 'https://www.laborum.cl/en-region-metropolitana/empleos-part-time-busqueda-vendedor.html', L(todaLaRM));
  check('toda la RM en remoto: sin ubicación, como antes', T(todaLaRM, { modalidad: 'remoto' }) === 'https://www.trabajando.cl/trabajo-empleo/vendedor');

  const unaConVariantes = ['estación central', 'estacion central', 'e. central'];
  check('una comuna con sus variantes cuenta como UNA (Trabajando)', T(unaConVariantes) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?ubicacion=estacion-central', T(unaConVariantes));
  check('...(Computrabajo)', C(unaConVariantes) === 'https://cl.computrabajo.com/trabajo-de-vendedor-en-estacion-central-jornada-part-time', C(unaConVariantes));
  check('...(Laborum, comuna de la RM con su prefijo)', L(unaConVariantes) === 'https://www.laborum.cl/en-region-metropolitana/estacion-central/empleos-part-time-busqueda-vendedor.html', L(unaConVariantes));
  check('la comuna va sin tildes en la dirección (ñuñoa -> nunoa)', T(['ñuñoa', 'nunoa']) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?ubicacion=nunoa', T(['ñuñoa', 'nunoa']));

  const variasRM = ['providencia', 'las condes', 'ñuñoa'];
  check('varias comunas de la RM elegidas a mano: la región, no la primera', T(variasRM) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?region=1' && C(variasRM) === 'https://cl.computrabajo.com/trabajo-de-vendedor-en-rmetropolitana-jornada-part-time', [T(variasRM), C(variasRM)]);

  const quinta = ['valparaiso', 'viña del mar'];
  check('dos comunas de Valparaíso: la región en Trabajando (6) y en Computrabajo', T(quinta) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?region=6' && C(quinta) === 'https://cl.computrabajo.com/trabajo-de-vendedor-en-valparaiso-jornada-part-time', [T(quinta), C(quinta)]);
  check('...y en Laborum sin ubicación (solo la RM está verificada)', L(quinta) === 'https://www.laborum.cl/empleos-part-time-busqueda-vendedor.html', L(quinta));

  const dosRegiones = ['providencia', 'viña del mar'];
  check('comunas de dos regiones: sin ubicación en los tres', T(dosRegiones) === 'https://www.trabajando.cl/trabajo-empleo/vendedor' && C(dosRegiones) === 'https://cl.computrabajo.com/trabajo-de-vendedor-jornada-part-time' && L(dosRegiones) === 'https://www.laborum.cl/empleos-part-time-busqueda-vendedor.html', [T(dosRegiones), C(dosRegiones), L(dosRegiones)]);

  const nuble = ['chillan', 'chillan viejo'];
  check('Ñuble en Computrabajo va como Biobío (ahí están las ofertas de Chillán); en Trabajando, su región (556)', C(nuble) === 'https://cl.computrabajo.com/trabajo-de-vendedor-en-biobio-jornada-part-time' && T(nuble) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?region=556', [C(nuble), T(nuble)]);

  check('la tabla trae abreviaturas como entradas propias: "stgo" cuenta como Santiago', T(['santiago', 'stgo']) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?ubicacion=santiago', T(['santiago', 'stgo']));
  check('..."pac" como Pedro Aguirre Cerda', T(['pedro aguirre cerda', 'pac']) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?ubicacion=pedro-aguirre-cerda', T(['pedro aguirre cerda', 'pac']));
  check('dos comunas distintas que empiezan igual no se confunden (santiago + san miguel -> región)', T(['santiago', 'stgo', 'san miguel']) === 'https://www.trabajando.cl/trabajo-empleo/vendedor?region=1', T(['santiago', 'stgo', 'san miguel']));
  check('un nombre que no es comuna no cuenta: sin ubicación', T(['narnia']) === 'https://www.trabajando.cl/trabajo-empleo/vendedor');
  check('sin comunas: sin ubicación, como antes', T([]) === 'https://www.trabajando.cl/trabajo-empleo/vendedor');
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

  function crearDocumento({ botonEnPanel, listadoTexto, textoFueraDelListado, sinPanel, pantallaDeExito }) {
    const panel = sinPanel ? null : { querySelectorAll: () => (botonEnPanel ? [botonEnPanel] : []) };
    const listado = elemento(null, { innerText: listadoTexto || '' });
    const bodyInnerText = (textoFueraDelListado || '') + ' ' + (listadoTexto || '');
    const exito = pantallaDeExito ? elemento('¡Has postulado al empleo!') : null;
    return {
      querySelector: (sel) => (sel === SELECTOR_PANEL ? panel : sel === '#listadoOfertas' ? listado : sel === SELECTOR_EXITO ? exito : null),
      querySelectorAll: () => (botonEnPanel ? [botonEnPanel] : []),
      body: { innerText: bodyInnerText },
    };
  }

  const SELECTOR_PANEL = '#detalleOferta';
  const SELECTOR_EXITO = '.seccion-postulacion-ok';
  check('el selector de la pantalla de éxito del test es el mismo del adaptador', src.includes("const SELECTOR_EXITO = '" + SELECTOR_EXITO + "'"));
  const ctx = { document: null, n, SELECTOR_PANEL, SELECTOR_EXITO };
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

  // 2026-09-30: la ausencia del botón ya NO cuenta como éxito. En la pantalla
  // de preguntas ("Estás postulando a…") no hay panel ni botón de postular, y
  // eso es una postulación a medio hacer, no una hecha.
  ctx.document = crearDocumento({ sinPanel: true, listadoTexto: '', textoFueraDelListado: 'Estás postulando a Vendedor de Vehículos Postular Pregunta 1' });
  check('pantalla de preguntas (sin panel ni botón) -> NO es éxito', huboEvidenciaDeExito() === false);
  ctx.document = crearDocumento({ botonEnPanel: null, listadoTexto: '', textoFueraDelListado: '' });
  check('sin texto de éxito y sin botón de postular -> ya no cuenta como éxito', huboEvidenciaDeExito() === false);

  // La pantalla real de éxito del sitio, y su texto (también el de una oferta
  // que se termina en el sitio de la empresa).
  ctx.document = crearDocumento({ sinPanel: true, pantallaDeExito: true, listadoTexto: 'Vendedor Postula fácil' });
  check('la pantalla de éxito del sitio (.seccion-postulacion-ok) -> éxito', huboEvidenciaDeExito() === true);
  ctx.document = crearDocumento({ sinPanel: true, listadoTexto: '', textoFueraDelListado: '¡Has postulado al empleo! Vendedor Revisa el estado del proceso en la sección Mis Postulaciones' });
  check('"¡Has postulado al empleo!" -> éxito (antes no se reconocía)', huboEvidenciaDeExito() === true);
  ctx.document = crearDocumento({ sinPanel: true, listadoTexto: '', textoFueraDelListado: 'Has iniciado tu inscripción al empleo' });
  check('"Has iniciado tu inscripción al empleo" (se termina en el sitio de la empresa) -> éxito', huboEvidenciaDeExito() === true);

  // Sin ninguna señal -- el botón real sigue ahí y nada confirma nada.
  ctx.document = crearDocumento({ botonEnPanel: elemento('Postular'), listadoTexto: '', textoFueraDelListado: '' });
  check('sin ninguna señal -> no se confirma', huboEvidenciaDeExito() === false);

  // obtenerBotonPostular: sin panel no hay botón (antes buscaba en todo el
  // documento y encontraba el "Mis postulaciones" del menú de arriba).
  const obtenerBotonPostular = vm.runInContext('obtenerBotonPostular', ctx);
  ctx.document = crearDocumento({ sinPanel: true, botonEnPanel: elemento('Mis postulaciones') });
  check('sin panel, obtenerBotonPostular no toma "Mis postulaciones"', obtenerBotonPostular() === null);
}

// ── 4. Respuestas de número y de lista (trabajando.js real) ──────────────
// La pregunta de número del sitio solo acepta dígitos (hasta 11): con
// "$800.000 líquidos" su botón Postular no se habilitaba nunca.
{
  const src = fs.readFileSync(path.join(__dirname, 'adapters', 'trabajando.js'), 'utf8');
  const extraer = (nombre) => {
    const desde = src.indexOf('function ' + nombre + '(');
    if (desde === -1) throw new Error('No se encontró ' + nombre + '() en trabajando.js -- ¿se renombró?');
    return src.slice(desde, src.indexOf('\n}', desde) + 2);
  };
  const n = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const ctx = { n };
  vm.createContext(ctx);
  vm.runInContext(extraer('soloNumero') + '\n' + extraer('opcionQueCalza'), ctx, { filename: 'trabajando.js (soloNumero, opcionQueCalza)' });
  const soloNumero = vm.runInContext('soloNumero', ctx);
  const opcionQueCalza = vm.runInContext('opcionQueCalza', ctx);

  const casos = [
    ['800000', '800000'],
    ['$800.000', '800000'],
    ['Mi expectativa de renta líquida es de $800.000 mensuales.', '800000'],
    ['800 mil', '800000'],
    ['1,2 millones', '1200000'],
    ['1.5 millones', '1500000'],
    ['1.200.000', '1200000'],
    ['Tengo 3 años de experiencia', '3'],
    ['entre 700.000 y 900.000', '700000'],
    ['A convenir', ''],
    ['', ''],
    [null, ''],
    ['123456789012345', ''],
  ];
  for (const [entrada, esperado] of casos) {
    check('soloNumero(' + JSON.stringify(entrada) + ') -> ' + JSON.stringify(esperado), soloNumero(entrada) === esperado, soloNumero(entrada));
  }

  const siNo = [{ texto: 'Si' }, { texto: 'No' }];
  check('"Sí" -> Si', opcionQueCalza('Sí', siNo) === siNo[0]);
  check('"No" -> No', opcionQueCalza('No', siNo) === siNo[1]);
  check('"No, sin licencia" -> No (antes caía en Si por el "si" de "sin")', opcionQueCalza('No, sin licencia', siNo) === siNo[1]);
  check('"Sí, tengo disponibilidad inmediata" -> Si', opcionQueCalza('Sí, tengo disponibilidad inmediata', siNo) === siNo[0]);
  const niveles = [{ texto: 'Media completa' }, { texto: 'Técnico' }, { texto: 'Universitario' }];
  check('respuesta que contiene la opción -> esa opción', opcionQueCalza('Tengo educación media completa', niveles) === niveles[0]);
  check('sin calce -> null', opcionQueCalza('Postgrado', niveles) === null);
  check('respuesta vacía -> null', opcionQueCalza('', siNo) === null);
}

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
