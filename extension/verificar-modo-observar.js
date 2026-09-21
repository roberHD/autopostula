// Verificación de docs/modo-solo-observar.md -- prueba con stubs mínimos las
// piezas de lógica pura (sin chrome.*) que se pueden probar fuera del
// contexto real de la extensión:
//   1. AP.mensajeEscaneo con soloObservar (core.js) -- carga el archivo real.
//   2. actualizarModoObservar (popup.js) -- se extrae la función del archivo
//      real (no se reescribe a mano) y se corre contra un DOM falso mínimo.
// No está conectado a CI, es para correr a mano: node verificar-modo-observar.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond) {
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

// ── 0. Contexto compartido para cargar core.js real en un vm de Node ───────
// Mismo patrón que verificar-scorer.js -- captura los listeners de
// chrome.runtime.onMessage para poder invocarlos directamente (así se
// prueba el handler de DO_APPLY tal como corre de verdad, no una copia).
function cargarCoreJs() {
  const onMessageListeners = [];
  const ctx = {
    window: {},
    document: { documentElement: {} },
    chrome: {
      runtime: { onMessage: { addListener: (fn) => onMessageListeners.push(fn) }, sendMessage(){}, lastError: null },
      storage: { local: { get:(_k,cb)=>cb({}), set(){} }, sync: { get:(_k,cb)=>cb({}), set(){} } },
    },
    console, setTimeout, clearTimeout,
    MutationObserver: class { observe(){} },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  return { AP: ctx.window.AP, onMessageListeners };
}

// ── 1. AP.mensajeEscaneo con soloObservar (core.js real) ───────────────────
{
  const { AP } = cargarCoreJs();

  const rNormal = AP.mensajeEscaneo({ postular: 2, gris: 6, descartar: 12 }, 'no calza', false);
  check('sin soloObservar: mensaje normal sin el prefijo del ojo', !rNormal.texto.includes('👁') && rNormal.texto.includes('2 postuladas'));

  const rObs = AP.mensajeEscaneo({ observado: 2, gris: 6, descartar: 12 }, 'no calza con "desarrollador de software"', true);
  check('soloObservar: antepone el prefijo "👁 Solo observar"', rObs.texto.startsWith('👁 Solo observar · '));
  check('soloObservar: dice "habría postulado", no "postuladas"', rObs.texto.includes('2 habría postulado') && !rObs.texto.includes('postuladas'));
  check('soloObservar: sigue mostrando gris y descartadas', rObs.texto.includes('6 por decidir') && rObs.texto.includes('12 descartadas'));
  check('soloObservar: estado pendiente porque hay grises', rObs.estado === 'pendiente');

  const rObsSoloDescartes = AP.mensajeEscaneo({ observado: 0, gris: 0, descartar: 5 }, null, true);
  check('soloObservar sin observadas ni grises: estado neutral', rObsSoloDescartes.estado === 'neutral');

  // conteos.postular (aunque viniera seteado por error) no debe colarse al
  // texto cuando soloObservar está activo -- solo debe leerse c.observado.
  const rMixto = AP.mensajeEscaneo({ postular: 99, observado: 3, gris: 0, descartar: 0 }, null, true);
  check('soloObservar ignora c.postular y usa solo c.observado', rMixto.texto.includes('3 habría postulado') && !rMixto.texto.includes('99'));
}

// ── 1b. DO_APPLY se bloquea en modo observar (core.js real, §4.3) ──────────
// AP.aplicarDirecto lo define cada adaptador (no core.js) -- si no está
// definido, este caso de prueba prueba igual lo que importa: que el gate de
// soloObservar responde ANTES de llegar a esa línea, sin necesitar el
// adaptador real.
{
  const { AP, onMessageListeners } = cargarCoreJs();
  AP.cfg = { soloObservar: true };
  let intentoLlamarAplicarDirecto = false;
  AP.aplicarDirecto = () => { intentoLlamarAplicarDirecto = true; return Promise.resolve({ success: true }); };

  check('se registró al menos un listener de chrome.runtime.onMessage', onMessageListeners.length > 0);

  let respuesta = null;
  const sendResponse = (r) => { respuesta = r; };
  for (const listener of onMessageListeners) {
    listener({ type: 'DO_APPLY', decisionId: 'abc123' }, {}, sendResponse);
  }
  check('DO_APPLY con soloObservar=true responde sin llamar a AP.aplicarDirecto', !intentoLlamarAplicarDirecto);
  check('DO_APPLY con soloObservar=true responde success:false', respuesta && respuesta.success === false);
  check('DO_APPLY con soloObservar=true NO marca expirada (reintenta cuando se desactive el modo)', respuesta && respuesta.expirada === false);

  // Con el modo apagado, sí debe llegar a AP.aplicarDirecto -- si este caso
  // fallara junto al de arriba, sería señal de que el gate bloquea siempre,
  // no solo cuando corresponde.
  AP.cfg = { soloObservar: false };
  intentoLlamarAplicarDirecto = false;
  for (const listener of onMessageListeners) {
    listener({ type: 'DO_APPLY', decisionId: 'abc123' }, {}, sendResponse);
  }
  check('DO_APPLY con soloObservar=false sí llama a AP.aplicarDirecto', intentoLlamarAplicarDirecto);
}

// ── 2. actualizarModoObservar (popup.js real, extraída del archivo) ────────
{
  const src = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const start = src.indexOf('function actualizarModoObservar');
  if (start === -1) throw new Error('No se encontró actualizarModoObservar en popup.js -- ¿se renombró?');
  const end = src.indexOf('\n}', start) + 2;
  const fnSrc = src.slice(start, end);

  // DOM falso mínimo: solo lo que la función necesita (getElementById de sus
  // 3 ids, con classList.toggle y textContent reales sobre un objeto plano).
  function crearElemento() {
    const clases = new Set();
    return {
      textContent: '',
      classList: {
        toggle(clase, on) { if (on) clases.add(clase); else clases.delete(clase); },
        contains(clase) { return clases.has(clase); },
      },
    };
  }
  const elementos = {
    'opcion-revision': crearElemento(),
    'revision-hint': crearElemento(),
    'observar-hint': crearElemento(),
  };
  const ctx = { document: { getElementById: (id) => elementos[id] || null } };
  vm.createContext(ctx);
  vm.runInContext(fnSrc, ctx, { filename: 'popup.js (actualizarModoObservar extraída)' });

  ctx.actualizarModoObservar(true);
  check('activo=true: atenúa la fila de "revisar antes de enviar"', elementos['opcion-revision'].classList.contains('opcion-atenuada'));
  check('activo=true: el hint de revisión explica que no aplica', elementos['revision-hint'].textContent.includes('No aplica'));
  check('activo=true: el hint de observar dice que está activo', elementos['observar-hint'].textContent.includes('Activo'));

  ctx.actualizarModoObservar(false);
  check('activo=false: ya no atenúa la fila de revisión', !elementos['opcion-revision'].classList.contains('opcion-atenuada'));
  check('activo=false: el hint de revisión vuelve al texto original', elementos['revision-hint'].textContent === 'Muestra las respuestas y pide confirmación');
  check('activo=false: el hint de observar vuelve al texto original', elementos['observar-hint'].textContent === 'Escanea y puntúa, pero no postula ni gasta cupo');
}

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
