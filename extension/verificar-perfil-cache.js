// Verificación del refresco del perfil en la extensión.
//
// El perfil con el que la IA responde los formularios lo guardaba el popup
// (construirConfig, `perfil: perfilRemoto || {}`). El commit 9896a68 movió el
// estado a la cuenta y le quitó esa tarea al popup, pero nadie se la dio a
// actualizarFiltrosDesdeBackend: config.perfil quedó congelado en la última
// foto del popup. Lo que la persona completara después -- su pretensión de
// renta, por ejemplo -- no llegaba nunca, y la IA lo reportaba como dato
// faltante dejando la postulación a medias.
//
// Se carga background.js REAL en un vm de Node, mismo patrón que
// verificar-rafagas.js. No está en CI, es para correr a mano:
//   node verificar-perfil-cache.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? extra : ''); }
  else console.log('✓ ' + desc);
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 10));

// Lo que /api/extension/perfil devuelve. Los nombres son los del endpoint, que
// NO son los de PerfilIA (backend/lib/contexto-ia.ts) -- justamente el mapeo
// que esta prueba cuida.
const RESPUESTA_PERFIL = {
  nombre: 'Carlos Sosa',
  email: 'carlos@ejemplo.cl',
  telefono: '+56959969506',
  comuna: 'Ñuñoa',
  cargoObjetivo: 'Vendedor',
  expectativaRenta: '$650.000 líquidos',
  disponibilidad: 'Inmediata, turnos rotativos',
  resumenProfesional: 'Tres años en retail.',
  filtrosBusqueda: { palabrasIncluir: [], palabrasExcluir: [], modalidad: 'cualquiera', jornada: 'cualquiera' },
  scorer: { usarScorerLocal: false, perfilCompilado: null },
  bandaGrisAprobadas: [],
  infoAdicional: [],
  postulacionHabilitada: true,
};

function cargarBackground({ configInicial } = {}) {
  const storageLocal = configInicial ? { config: configInicial } : {};
  const listeners = [];
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams,
    fetch: async () => ({ ok: true, status: 200, json: async () => RESPUESTA_PERFIL }),
    chrome: {
      runtime: {
        onMessage: { addListener: (fn) => listeners.push(fn) },
        onInstalled: { addListener(){} },
        onStartup: { addListener(){} },
        lastError: null,
        getManifest: () => ({ version: '0.0.0' }),
        sendMessage(){},
      },
      storage: {
        local: {
          get: (k, cb) => {
            const claves = Array.isArray(k) ? k : [k];
            const out = {};
            claves.forEach(c => { if (c in storageLocal) out[c] = storageLocal[c]; });
            return cb ? cb(out) : Promise.resolve(out);
          },
          set: (obj, cb) => { Object.assign(storageLocal, obj); return cb ? cb() : Promise.resolve(); },
        },
        sync: {
          get: (k, cb) => {
            const out = { autopostulaToken: 'tok' };
            return cb ? cb(out) : Promise.resolve(out);
          },
          set: (_o, cb) => (cb ? cb() : Promise.resolve()),
        },
      },
      // La lista sale de: grep -oE "chrome\.[a-zA-Z]+\.[a-zA-Z]+" background.js
      alarms: { create(){}, clear: async () => true, get: async () => null, onAlarm: { addListener(){} } },
      tabs: {
        query: async () => [], sendMessage: async () => {}, create: async () => ({ id: 1 }),
        update: async () => ({ id: 1 }), remove: async () => {}, onUpdated: { addListener(){} },
      },
      action: { setBadgeText(){}, setBadgeBackgroundColor(){} },
      windows: { update: async () => {} },
      power: { requestKeepAwake(){}, releaseKeepAwake(){} },
    },
  };
  // background.js carga la tabla de comunas con importScripts, como en Chrome.
  ctx.self = ctx;
  ctx.importScripts = (...archivos) => archivos.forEach(a => vm.runInContext(fs.readFileSync(path.join(__dirname, a), 'utf8'), ctx, { filename: a }));
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });

  // Invoca el handler de mensajes como lo haría Chrome, devolviendo la
  // respuesta que el listener pase a sendResponse.
  const enviar = (msg) => new Promise((resolve) => {
    let contestado = false;
    for (const fn of listeners) {
      const r = fn(msg, {}, (resp) => { contestado = true; resolve(resp); });
      if (r === true) return;
    }
    if (!contestado) resolve(undefined);
  });

  return { ctx, storageLocal, enviar };
}

(async () => {
  // ── El perfil se guarda al sincronizar, con las claves de PerfilIA ────────
  {
    const { storageLocal, enviar } = cargarBackground();
    await enviar({ type: 'SINCRONIZAR_PERFIL' });
    await tick(30);
    const p = storageLocal.config && storageLocal.config.perfil;

    check('se guarda un perfil (antes no se guardaba ninguno)', !!p, storageLocal.config);
    check('expectativaRenta -> renta: el campo que dejaba la postulación a medias',
      p && p.renta === '$650.000 líquidos', p);
    check('telefono -> tel', p && p.tel === '+56959969506', p);
    check('cargoObjetivo -> cargo', p && p.cargo === 'Vendedor', p);
    check('resumenProfesional -> bio', p && p.bio === 'Tres años en retail.', p);
    check('disponibilidad -> disp', p && p.disp === 'Inmediata, turnos rotativos', p);
    check('nombre, email y comuna pasan con el mismo nombre',
      p && p.nombre === 'Carlos Sosa' && p.email === 'carlos@ejemplo.cl' && p.comuna === 'Ñuñoa', p);
    check('no quedan claves del endpoint mezcladas (serían ignoradas por el backend)',
      p && !('expectativaRenta' in p) && !('telefono' in p), p);
  }

  // ── Un perfil viejo se reemplaza, no se conserva ──────────────────────────
  {
    const viejo = { config: { perfil: { renta: '', cargo: '', nombre: 'Carlos Sosa' } } };
    const { storageLocal, enviar } = cargarBackground({ configInicial: viejo.config });
    await enviar({ type: 'SINCRONIZAR_PERFIL' });
    await tick(30);
    const p = storageLocal.config.perfil;
    check('la foto vieja con renta vacía se reemplaza por la del servidor',
      p.renta === '$650.000 líquidos' && p.cargo === 'Vendedor', p);
  }

  // ── El guardián de tiempo evita una petición por cada página del portal ───
  {
    const recien = { perfil: { renta: 'x' }, perfilActualizadoEn: Date.now() };
    const { enviar } = cargarBackground({ configInicial: recien });
    const r = await enviar({ type: 'SINCRONIZAR_PERFIL' });
    await tick(30);
    check('sincronizado hace un momento: se omite', r && r.omitido === true, r);
  }
  {
    const viejo = { perfil: { renta: 'x' }, perfilActualizadoEn: Date.now() - 10 * 60e3 };
    const { enviar } = cargarBackground({ configInicial: viejo });
    const r = await enviar({ type: 'SINCRONIZAR_PERFIL' });
    await tick(30);
    check('sincronizado hace 10 minutos: se rehace', r && r.omitido === false, r);
  }

  // ── La respuesta trae la config, para que la pestaña que preguntó la aplique ──
  {
    const { enviar } = cargarBackground();
    const r = await enviar({ type: 'SINCRONIZAR_PERFIL' });
    await tick(30);
    check('la respuesta incluye la config fresca (la pestaña no se entera sola)',
      r && r.config && r.config.perfil && r.config.perfil.renta === '$650.000 líquidos', r);
  }

  console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
  process.exit(fallos ? 1 : 0);
})();
