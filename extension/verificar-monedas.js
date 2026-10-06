// Verificación del aviso de horas de uso para las monedas (backend/lib/monedas.ts).
// Carga background.js REAL en un vm de Node, mismo patrón que
// verificar-perfil-cache.js, y mira cuándo llama a /api/extension/latido.
// No está en CI, es para correr a mano:
//   node verificar-monedas.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond, extra) {
  if (!cond) { fallos++; console.error('✗ ' + desc, extra !== undefined ? extra : ''); }
  else console.log('✓ ' + desc);
}
const tick = (ms) => new Promise(r => setTimeout(r, ms || 10));

function cargarBackground({ local = {}, token = 'tok', fetchOk = true } = {}) {
  const storageLocal = Object.assign({}, local);
  const latidos = [];
  const alarmas = [];
  let alAlarma = null;
  const ctx = {
    console: { log(){}, warn(){}, error: console.error, info(){}, debug(){} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams,
    fetch: async (url, init) => {
      if (String(url).endsWith('/api/extension/latido')) {
        latidos.push({ url, auth: init && init.headers && init.headers.Authorization });
        return { ok: fetchOk, status: fetchOk ? 200 : 500, json: async () => ({ ok: fetchOk, ganada: true }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    chrome: {
      runtime: {
        onMessage: { addListener(){} }, onInstalled: { addListener(){} }, onStartup: { addListener(){} },
        lastError: null, getManifest: () => ({ version: '0.0.0' }), sendMessage(){},
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
          get: (_k, cb) => { const out = token ? { autopostulaToken: token } : {}; return cb ? cb(out) : Promise.resolve(out); },
          set: (_o, cb) => (cb ? cb() : Promise.resolve()),
        },
      },
      alarms: {
        create: async (nombre, o) => { alarmas.push([nombre, o]); },
        clear: async () => true, get: async () => null,
        onAlarm: { addListener: (fn) => { alAlarma = fn; } },
      },
      tabs: {
        query: async () => [], sendMessage: async () => {}, create: async () => ({ id: 1 }),
        update: async () => ({ id: 1 }), remove: async () => {}, onUpdated: { addListener(){} },
      },
      action: { setBadgeText(){}, setBadgeBackgroundColor(){} },
      windows: { update: async () => {} },
      power: { requestKeepAwake(){}, releaseKeepAwake(){} },
    },
  };
  ctx.self = ctx;
  ctx.importScripts = (...archivos) => archivos.forEach(a => vm.runInContext(fs.readFileSync(path.join(__dirname, a), 'utf8'), ctx, { filename: a }));
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  return { storageLocal, latidos, alarmas, disparar: (nombre) => alAlarma && alAlarma({ name: nombre }) };
}

const horaActual = () => new Date().toISOString().slice(0, 13);

(async () => {
  // ── Encendida y conectada: avisa al despertar, una vez por hora ──
  {
    const b = cargarBackground({ local: { active: true } });
    await tick(30);
    check('al despertar el worker, con la extensión encendida, avisa la hora de uso', b.latidos.length === 1, b.latidos);
    check('...con el token de la cuenta', b.latidos[0] && b.latidos[0].auth === 'Bearer tok');
    check('...y anota la hora para no repetirla', b.storageLocal.ultimaHoraUso === horaActual(), b.storageLocal);
    b.disparar('autopostula-uso');
    await tick(30);
    check('la revisión de los 15 minutos, en la misma hora, no vuelve a avisar', b.latidos.length === 1, b.latidos.length);
    check('crea la alarma de revisión cada 15 minutos', b.alarmas.some(([n, o]) => n === 'autopostula-uso' && o.periodInMinutes === 15), b.alarmas);
  }

  // ── Hora nueva: la alarma sí avisa ──
  {
    const b = cargarBackground({ local: { active: true, ultimaHoraUso: '2000-01-01T00' } });
    await tick(30);
    const antes = b.latidos.length;
    b.storageLocal.ultimaHoraUso = '2000-01-01T00';
    b.disparar('autopostula-uso');
    await tick(30);
    check('con una hora anotada vieja, la alarma avisa de nuevo', b.latidos.length === antes + 1, b.latidos.length);
  }

  // ── Casos en que no cuenta ──
  {
    const b = cargarBackground({ local: { active: false } });
    await tick(30);
    b.disparar('autopostula-uso');
    await tick(30);
    check('en pausa no avisa', b.latidos.length === 0, b.latidos);
  }
  {
    const b = cargarBackground({ local: {} });
    await tick(30);
    check('sin haber sincronizado nunca con la cuenta (sin "active") no avisa', b.latidos.length === 0);
  }
  {
    const b = cargarBackground({ local: { active: true }, token: null });
    await tick(30);
    check('sin cuenta conectada (sin token) no avisa', b.latidos.length === 0);
  }
  {
    const b = cargarBackground({ local: { active: true }, fetchOk: false });
    await tick(30);
    check('si el servidor falla, no anota la hora: se reintenta en la próxima revisión', b.latidos.length === 1 && !b.storageLocal.ultimaHoraUso, b.storageLocal);
  }

  console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo OK');
  process.exit(fallos ? 1 : 0);
})();
