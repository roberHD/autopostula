// Verificación de docs/modo-solo-observar.md -- prueba con stubs mínimos las
// piezas de lógica pura (sin chrome.*) que se pueden probar fuera del
// contexto real de la extensión:
//   1. AP.mensajeEscaneo con soloObservar (core.js) -- carga el archivo real.
//   2. El semáforo del popup (popup.js) -- se extrae renderEstado del archivo
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

// ── 2. El semáforo del popup (popup.js real, extraído del archivo) ─────────
// docs/estrategia-y-rediseno.md §6: el popup dejó de tener interruptores
// propios. Lo que antes probaba actualizarModoObservar -- "la persona nunca
// puede quedar en duda sobre si la extensión está postulando o no" -- ahora lo
// tiene que cumplir el semáforo, que dibuja lo que dice la cuenta.
{
  const src = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

  const desdeTextos = src.indexOf('const TEXTO_MODO = {');
  // Hasta el bloque de DOM: incluye TEXTO_MODO, TEXTO_MODO_PRUEBA y TEXTO_SIN_CUENTA.
  const hastaTextos = src.indexOf('// ── DOM');
  const desdeFn = src.indexOf('function renderEstado()');
  const hastaFn = src.indexOf('\n}', desdeFn) + 2;
  if (desdeTextos === -1 || desdeFn === -1) {
    throw new Error('No se encontró TEXTO_MODO o renderEstado en popup.js -- ¿se renombraron?');
  }

  function crearElemento() {
    return { textContent: '', className: '', disabled: false };
  }
  const elementos = {
    estadoLuz: crearElemento(),
    estadoTitulo: crearElemento(),
    estadoDetalle: crearElemento(),
    pausarBtn: crearElemento(),
    pulse: crearElemento(),
    pulseLabel: crearElemento(),
  };
  const ctx = Object.assign({}, elementos, { tokenActual: null, estadoActual: null });
  vm.createContext(ctx);
  vm.runInContext(
    src.slice(desdeTextos, hastaTextos) +
      src.slice(desdeFn, hastaFn),
    ctx,
    { filename: 'popup.js (semáforo extraído)' },
  );

  // Sin cuenta conectada no se promete nada: no hay estado que mostrar.
  ctx.renderEstado();
  check('sin cuenta conectada: dice "Sin conectar" y no deja pausar', elementos.estadoTitulo.textContent === 'Sin conectar' && elementos.pausarBtn.disabled === true);

  ctx.tokenActual = 'tok';
  ctx.estadoActual = { modo: 'postulando', pausada: false, soloObservar: false, porModoPrueba: false };
  ctx.renderEstado();
  check('postulando: la luz y el título lo dicen, y el botón ofrece pausar', elementos.estadoLuz.className.includes('postulando') && elementos.estadoTitulo.textContent === 'Postulando por ti' && elementos.pausarBtn.textContent === 'Pausar');

  ctx.estadoActual = { modo: 'observando', pausada: false, soloObservar: true, porModoPrueba: false };
  ctx.renderEstado();
  check('solo observar: el título dice que solo mira', elementos.estadoTitulo.textContent === 'Solo mirando' && elementos.estadoLuz.className.includes('observando'));
  check('solo observar: el detalle deja claro que no envía ninguna', elementos.estadoDetalle.textContent.includes('no envía ninguna'));
  check('solo observar: el pulso del encabezado no dice "activo"', !elementos.pulse.className.includes('active'));

  // §1.2 de docs/revision-2026-09-16.md: si lo que la frena es el modo prueba,
  // hay que decirlo -- si no, parece algo que la persona eligió y no encuentra
  // dónde apagarlo.
  ctx.estadoActual = { modo: 'observando', pausada: false, soloObservar: false, porModoPrueba: true };
  ctx.renderEstado();
  check('modo prueba: explica por qué solo mira, en vez de dejarlo en misterio', elementos.estadoDetalle.textContent.includes('modo prueba'));

  ctx.estadoActual = { modo: 'pausada', pausada: true, soloObservar: false, porModoPrueba: false };
  ctx.renderEstado();
  check('en pausa: lo dice y el botón pasa a "Reanudar"', elementos.estadoTitulo.textContent === 'En pausa' && elementos.pausarBtn.textContent === 'Reanudar');
  check('en pausa: aclara que tampoco hace nada al entrar a un portal', elementos.estadoDetalle.textContent.includes('ni siquiera cuando entras a un portal'));

  // Los interruptores viejos no pueden volver por la puerta de atrás: si
  // alguien los reintroduce en el popup, vuelven las dos verdades distintas.
  check('el popup ya no tiene interruptores propios de observar/revisión', !src.includes('toggle-observar') && !src.includes('toggle-revision'));
  check('pausar y reanudar pasan por la cuenta (CAMBIAR_ESTADO), no por storage local', src.includes("type: 'CAMBIAR_ESTADO'"));
}

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
