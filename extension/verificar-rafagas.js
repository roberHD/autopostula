// Verificación de docs/rafagas-y-ponerse-al-dia.md -- prueba la máquina de
// estados de background.js (§2.1, §3.2) contra stubs mínimos de chrome.*,
// mismo patrón que verificar-modo-observar.js: se carga el archivo REAL en
// un vm de Node, no una copia reescrita a mano.
// No está conectado a CI, es para correr a mano: node verificar-rafagas.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond) {
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

function tick(ms) {
  return new Promise(r => setTimeout(r, ms || 5));
}

// Cada bloque de prueba corre por su lado y el reporte espera a TODOS, en vez
// de a un tiempo fijo que se queda corto cada vez que se agrega uno.
const bloques = [];
function bloque(fn) { bloques.push(Promise.resolve().then(fn)); }

// ── Contexto compartido: carga background.js real en un vm de Node ────────
function cargarBackgroundJs(opts) {
  const onMessageListeners = [];
  const onAlarmListeners = [];
  const onInstalledListeners = [];
  const onStartupListeners = [];
  const alarmsStore = new Map();
  const storageLocal = {};
  const tabsCreados = [];
  const tabUpdatedListeners = [];
  const removidos = [];
  // chrome.power (§3.3): se cuentan los pedidos y las liberaciones para
  // poder afirmar cuántas veces se pidió/soltó el bloqueo de suspensión.
  const power = { pedidos: [], liberados: 0 };
  // chrome.action (§3.5): el número del ícono y su color, en el orden en que se pusieron.
  const badge = { textos: [], colores: [] };
  // Todas las llamadas a fetch, para afirmar qué se le reportó al backend (§3.4).
  const fetchLlamadas = [];
  // Por defecto el backend "acepta" solo el registro de ráfagas y rechaza lo
  // demás (así escanearAutomatico corta temprano, como antes de este paso).
  const fetchPorDefecto = async (url) => ({ ok: /\/api\/extension\/rafaga/.test(String(url)), json: async () => ({}) });
  const fetchBase = (opts && opts.fetchImpl) || fetchPorDefecto;
  let siguienteTabId = 1;

  const ctx = {
    console,
    // setTimeout real pero sin esperar la duración real -- son tests de
    // lógica/orden, no de timing; los `await tick()` del test le dan tiempo
    // al loop de eventos para que esto corra antes de la siguiente aserción.
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    fetch: (url, init) => { fetchLlamadas.push({ url: String(url), init }); return fetchBase(url, init); },
    chrome: {
      runtime: {
        onMessage: { addListener: fn => onMessageListeners.push(fn) },
        onInstalled: { addListener: fn => onInstalledListeners.push(fn) },
        onStartup: { addListener: fn => onStartupListeners.push(fn) },
        lastError: null,
      },
      storage: {
        local: {
          get: (keys, cb) => {
            const lista = typeof keys === 'string' ? [keys] : keys;
            const resultado = {};
            for (const k of lista) resultado[k] = storageLocal[k];
            if (cb) { cb(resultado); return undefined; }
            return Promise.resolve(resultado);
          },
          set: (data, cb) => {
            Object.assign(storageLocal, data);
            if (cb) { cb(); return undefined; }
            return Promise.resolve();
          },
        },
        sync: {
          get: (_keys, cb) => { const r = (opts && opts.sinToken) ? {} : { autopostulaToken: 'token-de-prueba' }; if (cb) { cb(r); return undefined; } return Promise.resolve(r); },
          set: (_data, cb) => { if (cb) cb(); return Promise.resolve(); },
        },
      },
      alarms: {
        create: (name, opts) => { alarmsStore.set(name, opts); },
        get: (name) => Promise.resolve(alarmsStore.has(name) ? Object.assign({ name }, alarmsStore.get(name)) : undefined),
        clear: (name) => { const existia = alarmsStore.delete(name); return Promise.resolve(existia); },
        onAlarm: { addListener: fn => onAlarmListeners.push(fn) },
      },
      tabs: {
        create: (opts, cb) => {
          const tab = { id: siguienteTabId++, url: opts.url, active: opts.active };
          tabsCreados.push(tab);
          cb(tab);
        },
        remove: (id, cb) => { removidos.push(id); if (cb) cb(); },
        sendMessage: (_id, _msg, cb) => { if (cb) cb({}); },
        onUpdated: {
          addListener: fn => tabUpdatedListeners.push(fn),
          removeListener: fn => {
            const i = tabUpdatedListeners.indexOf(fn);
            if (i >= 0) tabUpdatedListeners.splice(i, 1);
          },
        },
      },
      // opts.sinPower simula que el manifest no trae el permiso "power":
      // en ese caso chrome.power es undefined, como en Chrome de verdad.
      power: (opts && opts.sinPower) ? undefined : {
        requestKeepAwake: (nivel) => { power.pedidos.push(nivel); },
        releaseKeepAwake: () => { power.liberados++; },
      },
      // opts.sinAction simula que chrome.action no existe (no debería pasar en MV3).
      action: (opts && opts.sinAction) ? undefined : {
        setBadgeText: (o) => { badge.textos.push(o.text); },
        setBadgeBackgroundColor: (o) => { badge.colores.push(o.color); },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });

  return {
    ctx, onMessageListeners, onAlarmListeners, onInstalledListeners, onStartupListeners,
    alarmsStore, storageLocal, tabsCreados, removidos, power, badge, fetchLlamadas,
    // Solo las que fueron al endpoint de ráfagas, con el cuerpo ya parseado.
    reportesRafaga() {
      return fetchLlamadas
        .filter(l => /\/api\/extension\/rafaga/.test(l.url))
        .map(l => ({ headers: l.init.headers, body: JSON.parse(l.init.body) }));
    },
    completarTab(tabId) {
      for (const fn of tabUpdatedListeners.slice()) fn(tabId, { status: 'complete' });
    },
    enviarMensaje(msg, sender) {
      let respuesta;
      for (const fn of onMessageListeners) fn(msg, sender || {}, (r) => { respuesta = r; });
      return respuesta;
    },
    // Para los mensajes que contestan más tarde (PONERSE_AL_DIA y
    // ESTADO_PONERSE_AL_DIA): devuelve la respuesta cuando llega. Si el
    // listener nunca contesta -- el bug que dejaría a la persona mirando un
    // botón que dice "Empezando…" para siempre -- se resuelve con esa marca.
    enviarMensajeAsync(msg, sender) {
      return new Promise((resolve) => {
        const espera = setTimeout(() => resolve({ __sinRespuesta: true }), 400);
        for (const fn of onMessageListeners) fn(msg, sender || {}, (r) => { clearTimeout(espera); resolve(r); });
      });
    },
  };
}

// ── 1. asegurarAlarma es idempotente (arregla docs/rafagas-y-ponerse-al-dia.md §2.1) ──
bloque(async () => {
  const b = cargarBackgroundJs();
  await tick();
  check('al cargar el script, la alarma automática ya existe (llamada de nivel superior)', b.alarmsStore.has('autopostula-scan'));
  const opcionesOriginales = b.alarmsStore.get('autopostula-scan');
  check('la alarma automática se creó con el período de 60 min (§3.1: red de seguridad, no "el" disparador)', opcionesOriginales.periodInMinutes === 60);

  // Simula un "despertar" del service worker disparando onInstalled otra vez
  // -- con el bug viejo esto reiniciaba el reloj de la alarma a 120 min de
  // nuevo cada vez; con el fix, si ya existe, no se toca.
  b.alarmsStore.set('autopostula-scan', { periodInMinutes: 999, marcaDePrueba: true });
  for (const fn of b.onInstalledListeners) await fn();
  const opcionesTrasSegundoDespertar = b.alarmsStore.get('autopostula-scan');
  check(
    'un segundo "despertar" (onInstalled) NO reinicia una alarma que ya existe',
    opcionesTrasSegundoDespertar.marcaDePrueba === true && opcionesTrasSegundoDespertar.periodInMinutes === 999
  );
});

// ── 2. Máquina de estados de la ráfaga: dos pasos, avanza por eventos ──────
bloque(async () => {
  const b = cargarBackgroundJs();
  await tick();

  const pasos = [
    { tipo: 'busqueda', portal: 'Computrabajo', url: 'https://cl.computrabajo.com/trabajo-de-vendedor' },
    { tipo: 'busqueda', portal: 'Laborum', url: 'https://www.laborum.cl/empleos-busqueda-vendedor.html' },
  ];

  // iniciarRafaga no está expuesta en `ctx` directamente (no es AP.*), así
  // que se dispara indirecto: se simula la alarma automática, que llama a
  // escanearAutomatico() -- pero esa función depende del backend (fetch).
  // Más simple y más fiel a lo que se quiere probar: invocar iniciarRafaga
  // a través del propio contexto del vm, que sí la tiene como función de
  // nivel superior del script.
  await b.ctx.iniciarRafaga('manual', pasos);
  await tick();

  check('al iniciar, se abre UNA pestaña para el primer paso', b.tabsCreados.length === 1);
  check('la pestaña del primer paso apunta a la URL de Computrabajo', b.tabsCreados[0] && b.tabsCreados[0].url === pasos[0].url);
  check('se guarda el estado "en_curso" en storage', b.storageLocal.rafaga.estado === 'en_curso');
  check('tabActual apunta a la pestaña recién creada', b.storageLocal.rafaga.tabActual === b.tabsCreados[0].id);
  check('se creó el seguro de tiempo (chrome.alarms) para este paso', b.alarmsStore.has('autopostula-rafaga-seguro'));

  const segundaLlamada = await b.ctx.iniciarRafaga('manual', pasos);
  check('una ráfaga ya en curso no se pisa con una segunda llamada', b.tabsCreados.length === 1);

  // El content script "termina" el primer paso.
  b.completarTab(b.tabsCreados[0].id);
  await tick();
  const resp1 = b.enviarMensaje(
    { type: 'ESCANEO_TERMINADO', conteos: { postular: 2, descartar: 5, gris: 1 } },
    { tab: { id: b.tabsCreados[0].id } }
  );
  await tick();

  check('ESCANEO_TERMINADO desde la pestaña correcta responde ok', resp1 && resp1.ok === true);
  check('se cerró la pestaña del paso 1', b.removidos.includes(b.tabsCreados[0].id));
  check('avanzó al paso 2: se abrió una segunda pestaña', b.tabsCreados.length === 2);
  // El seguro de tiempo se limpia al cerrar el paso 1 y se vuelve a crear de
  // inmediato para el paso 2 -- lo que importa es que sigue habiendo UNO
  // activo (nunca se queda sin seguro mientras la ráfaga está en curso).
  check('el seguro de tiempo sigue activo (renovado para el paso 2)', b.alarmsStore.has('autopostula-rafaga-seguro'));
  check('la segunda pestaña apunta a la URL de Laborum', b.tabsCreados[1] && b.tabsCreados[1].url === pasos[1].url);
  check('los conteos del paso 1 quedaron sumados', b.storageLocal.rafaga.conteos.postuladas === 2 && b.storageLocal.rafaga.conteos.descartadas === 5 && b.storageLocal.rafaga.conteos.gris === 1);

  // Un ESCANEO_TERMINADO de una pestaña VIEJA (ya cerrada) no debe hacer nada.
  const tabsAntes = b.tabsCreados.length;
  const respVieja = b.enviarMensaje(
    { type: 'ESCANEO_TERMINADO', conteos: { postular: 99 } },
    { tab: { id: b.tabsCreados[0].id } } // la del paso 1, ya cerrada
  );
  await tick();
  check('ESCANEO_TERMINADO de una pestaña vieja se ignora (no abre una tercera pestaña)', b.tabsCreados.length === tabsAntes);
  check('los conteos no se contaminan con el mensaje viejo', b.storageLocal.rafaga.conteos.postuladas === 2);

  // Termina el segundo (y último) paso.
  b.completarTab(b.tabsCreados[1].id);
  await tick();
  b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { observado: 3 } }, { tab: { id: b.tabsCreados[1].id } });
  await tick();

  check('tras el último paso, la ráfaga queda "terminada"', b.storageLocal.rafaga.estado === 'terminada');
  check('se guardó ultimaRafagaFin', typeof b.storageLocal.ultimaRafagaFin === 'number');
  check('no quedan más pestañas abiertas que las que se cerraron', b.removidos.length === 2);
});

// ── 3. El seguro de tiempo (chrome.alarms) avanza si ESCANEO_TERMINADO nunca llega ──
bloque(async () => {
  const b = cargarBackgroundJs();
  await tick();
  await b.ctx.iniciarRafaga('chequeo', [{ tipo: 'busqueda', portal: 'Trabajando', url: 'https://www.trabajando.cl/x' }]);
  await tick();

  const alarmaSeguro = b.onAlarmListeners;
  for (const fn of alarmaSeguro) fn({ name: 'autopostula-rafaga-seguro' });
  await tick();

  check('el seguro de tiempo cierra la pestaña colgada', b.removidos.includes(b.tabsCreados[0].id));
  check('el seguro de tiempo cuenta un error, no un éxito', b.storageLocal.rafaga.conteos.errores === 1);
  check('la ráfaga de un solo paso queda terminada tras el seguro', b.storageLocal.rafaga.estado === 'terminada');
});

// ── 4. retomarORafagaInterrumpida: solo toca ráfagas con latido viejo ──────
bloque(async () => {
  const b = cargarBackgroundJs();
  await tick();

  // Ráfaga "colgada" hace 20 minutos -- más que el umbral de 10.
  b.storageLocal.rafaga = {
    id: 'r_vieja', disparador: 'chequeo', inicio: Date.now() - 20 * 60000,
    latido: Date.now() - 20 * 60000, pasos: [{ tipo: 'busqueda', url: 'https://x' }],
    pasoActual: 0, tabActual: 777,
    conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 },
    estado: 'en_curso',
  };
  await b.ctx.retomarORafagaInterrumpida();
  await tick();
  check('una ráfaga con latido de hace 20 min se marca interrumpida', b.storageLocal.rafaga.estado === 'interrumpida');
  check('se cierra la pestaña huérfana de la ráfaga interrumpida', b.removidos.includes(777));

  const b2 = cargarBackgroundJs();
  await tick();
  b2.storageLocal.rafaga = {
    id: 'r_reciente', disparador: 'chequeo', inicio: Date.now() - 60000,
    latido: Date.now() - 60000, pasos: [{ tipo: 'busqueda', url: 'https://x' }],
    pasoActual: 0, tabActual: 888,
    conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 },
    estado: 'en_curso',
  };
  await b2.ctx.retomarORafagaInterrumpida();
  await tick();
  check('una ráfaga con latido de hace 1 min NO se toca (puede seguir en curso de verdad)', b2.storageLocal.rafaga.estado === 'en_curso');
  check('no se cierra ninguna pestaña de una ráfaga reciente', !b2.removidos.includes(888));
});

// ── 5. quizasRafaga: los disparadores reales pasan por el umbral (§3.1) ───
bloque(async () => {
  // estado-automatico "permitido", con un objetivo y un portal -- alcanza
  // para que escanearAutomatico llegue hasta iniciarRafaga si nada la frena.
  const fetchOk = async (url) => {
    if (String(url).includes('/api/account/estado-automatico')) {
      return {
        ok: true,
        json: async () => ({
          busquedaAutomatica: true,
          objetivos: [{ etiqueta: 'vendedor', peso: 1 }],
          plataformasConectadas: ['Trabajando'],
        }),
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  // 5a. Sin ráfaga previa ni cooldown -- debe llegar a abrir una pestaña.
  {
    const b = cargarBackgroundJs({ fetchImpl: fetchOk });
    await tick();
    await b.ctx.quizasRafaga('inicio_chrome');
    await tick();
    check('quizasRafaga sin bloqueos arranca una ráfaga de verdad', b.tabsCreados.length === 1);
    check('el disparador declarado queda guardado en el estado', b.storageLocal.rafaga && b.storageLocal.rafaga.disparador === 'inicio_chrome');
  }

  // 5b. Ya hay una ráfaga en_curso -- no debe abrir una pestaña nueva.
  {
    const b = cargarBackgroundJs({ fetchImpl: fetchOk });
    await tick();
    b.storageLocal.rafaga = {
      id: 'r_otra', disparador: 'chequeo', inicio: Date.now(), latido: Date.now(),
      pasos: [{ tipo: 'busqueda', url: 'https://x' }], pasoActual: 0, tabActual: 42,
      conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
    };
    await b.ctx.quizasRafaga('chequeo');
    await tick();
    check('quizasRafaga no pisa una ráfaga ya en_curso', b.tabsCreados.length === 0);
  }

  // 5c. Última ráfaga terminó hace 1 hora (menos que el umbral de 3) -- no arranca otra.
  {
    const b = cargarBackgroundJs({ fetchImpl: fetchOk });
    await tick();
    b.storageLocal.ultimaRafagaFin = Date.now() - 1 * 3600e3;
    await b.ctx.quizasRafaga('chequeo');
    await tick();
    check('quizasRafaga respeta el umbral de 3 horas entre ráfagas', b.tabsCreados.length === 0);
  }

  // 5d. Última ráfaga terminó hace 4 horas (más que el umbral) -- sí arranca.
  {
    const b = cargarBackgroundJs({ fetchImpl: fetchOk });
    await tick();
    b.storageLocal.ultimaRafagaFin = Date.now() - 4 * 3600e3;
    await b.ctx.quizasRafaga('chequeo');
    await tick();
    check('pasado el umbral de 3 horas, quizasRafaga sí arranca una nueva', b.tabsCreados.length === 1);
  }
});

// ── 6. Disparadores conectados a los eventos reales de Chrome ─────────────
bloque(async () => {
  const b = cargarBackgroundJs();
  await tick();
  check('onStartup dispara quizasRafaga("inicio_chrome") -- hoy no existía (§3.1)', b.onStartupListeners.length >= 2);
  check('la alarma periódica bajó de 120 a 60 min (§3.1: pasa a ser red de seguridad)', b.alarmsStore.get('autopostula-scan').periodInMinutes === 60);

  // El listener de chrome.alarms.onAlarm debe existir y no reventar al
  // recibir la alarma automática (el fetch stub devuelve ok:false, así que
  // no debería llegar a abrir ninguna pestaña, pero tampoco debe tirar).
  let reventó = false;
  try {
    for (const fn of b.onAlarmListeners) fn({ name: 'autopostula-scan', scheduledTime: Date.now() });
    await tick();
  } catch (e) { reventó = true; }
  check('la alarma automática no revienta el listener aunque el backend falle', !reventó);
});

// ── 7. chrome.power: que no se suspenda a la mitad, con tope de 25 min (§3.3) ──
bloque(async () => {
  const unPaso = [{ tipo: 'busqueda', portal: 'Trabajando', url: 'https://www.trabajando.cl/x' }];

  // 7a. Iniciar una ráfaga pide el bloqueo (nivel 'system') y arma el tope.
  {
    const b = cargarBackgroundJs();
    await tick();
    await b.ctx.iniciarRafaga('manual', unPaso);
    await tick();
    check('iniciar una ráfaga pide el bloqueo de suspensión a nivel "system" (la pantalla sí se apaga)', b.power.pedidos.length === 1 && b.power.pedidos[0] === 'system');
    check('se arma el tope duro de 25 minutos con su propia alarma', b.alarmsStore.has('autopostula-rafaga-tope') && b.alarmsStore.get('autopostula-rafaga-tope').delayInMinutes === 25);
  }

  // 7b. Al terminar la ráfaga, se suelta el bloqueo y se desarma el tope.
  {
    const b = cargarBackgroundJs();
    await tick();
    const liberadosAntes = b.power.liberados;
    await b.ctx.iniciarRafaga('manual', unPaso);
    await tick();
    b.completarTab(b.tabsCreados[0].id);
    await tick();
    b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 1 } }, { tab: { id: b.tabsCreados[0].id } });
    await tick();
    check('al terminar la ráfaga se suelta el bloqueo de suspensión', b.power.liberados === liberadosAntes + 1);
    check('al terminar la ráfaga se desarma el tope (ya no hay nada que vigilar)', !b.alarmsStore.has('autopostula-rafaga-tope'));
  }

  // 7c. Si el tope vence con la ráfaga colgada, se suelta el bloqueo AUNQUE siga en curso.
  {
    const b = cargarBackgroundJs();
    await tick();
    await b.ctx.iniciarRafaga('manual', unPaso);
    await tick();
    const liberadosAntes = b.power.liberados;
    for (const fn of b.onAlarmListeners) fn({ name: 'autopostula-rafaga-tope' });
    await tick();
    check('al vencer el tope de 25 min se suelta el bloqueo de suspensión', b.power.liberados === liberadosAntes + 1);
    check('vencer el tope no aborta la ráfaga: solo libera el bloqueo', b.storageLocal.rafaga.estado === 'en_curso');
  }

  // 7d. Una ráfaga interrumpida (worker reiniciado, latido viejo) también suelta el bloqueo.
  {
    const b = cargarBackgroundJs();
    await tick();
    b.storageLocal.rafaga = {
      id: 'r_colgada', disparador: 'chequeo', inicio: Date.now() - 30 * 60000, latido: Date.now() - 30 * 60000,
      pasos: unPaso, pasoActual: 0, tabActual: 555,
      conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
    };
    b.alarmsStore.set('autopostula-rafaga-tope', { delayInMinutes: 25 });
    const liberadosAntes = b.power.liberados;
    await b.ctx.retomarORafagaInterrumpida();
    await tick();
    check('una ráfaga interrumpida suelta el bloqueo de suspensión', b.power.liberados === liberadosAntes + 1);
    check('una ráfaga interrumpida desarma el tope', !b.alarmsStore.has('autopostula-rafaga-tope'));
  }

  // 7e. Al despertar el worker SIN ráfaga en curso, se suelta cualquier bloqueo huérfano.
  {
    const b = cargarBackgroundJs();
    await tick();
    check('al arrancar sin ráfaga en curso se suelta un posible bloqueo huérfano (el pedido vive en el navegador, no en el worker)', b.power.liberados >= 1);
  }

  // 7f. ...pero NO se suelta si hay una ráfaga en curso de verdad (latido reciente).
  {
    const b = cargarBackgroundJs();
    await tick();
    b.storageLocal.rafaga = {
      id: 'r_viva', disparador: 'chequeo', inicio: Date.now() - 60000, latido: Date.now() - 60000,
      pasos: unPaso, pasoActual: 0, tabActual: 666,
      conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
    };
    const liberadosAntes = b.power.liberados;
    await b.ctx.retomarORafagaInterrumpida();
    await tick();
    check('con una ráfaga viva en curso NO se suelta el bloqueo', b.power.liberados === liberadosAntes);
  }

  // 7g. Sin el permiso "power" en el manifest, la ráfaga corre igual (que no se suspenda es un extra).
  {
    const b = cargarBackgroundJs({ sinPower: true });
    await tick();
    let reventó = false;
    try {
      await b.ctx.iniciarRafaga('manual', unPaso);
      await tick();
    } catch (e) { reventó = true; }
    check('sin el permiso "power" la ráfaga no revienta', !reventó);
    check('sin el permiso "power" la ráfaga igual abre su pestaña', b.tabsCreados.length === 1);
  }

  // 7h. El manifest real declara el permiso -- sin esto, chrome.power sería undefined en producción.
  {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    check('manifest.json declara el permiso "power"', manifest.permissions.includes('power'));
  }
});

// ── 8. Registro de la ráfaga en el backend (§3.4) ─────────────────────────
bloque(async () => {
  const unPaso = [{ tipo: 'busqueda', portal: 'Trabajando', url: 'https://www.trabajando.cl/x' }];

  // 8a. Al empezar se reporta "en_curso", con el token y sin fin ni duración.
  {
    const b = cargarBackgroundJs();
    await tick();
    await b.ctx.iniciarRafaga('inicio_chrome', unPaso);
    await tick();
    const r = b.reportesRafaga();
    check('al empezar se reporta la ráfaga al backend', r.length === 1);
    check('el reporte de inicio va con el token de la persona', r[0] && r[0].headers.Authorization === 'Bearer token-de-prueba');
    check('el reporte de inicio trae id, disparador e inicio', r[0] && r[0].body.id === b.storageLocal.rafaga.id && r[0].body.disparador === 'inicio_chrome' && typeof r[0].body.inicio === 'number');
    check('el reporte de inicio dice "en_curso" y no trae fin todavía', r[0] && r[0].body.estado === 'en_curso' && r[0].body.fin === undefined);
  }

  // 8b. Al terminar se reporta "terminada" con los conteos y la duración -- mismo id.
  {
    const b = cargarBackgroundJs();
    await tick();
    await b.ctx.iniciarRafaga('chequeo', unPaso);
    await tick();
    b.completarTab(b.tabsCreados[0].id);
    await tick();
    b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 4, observado: 2, descartar: 9, gris: 3 } }, { tab: { id: b.tabsCreados[0].id } });
    await tick();
    const r = b.reportesRafaga();
    check('al terminar se reporta una segunda vez (inicio + fin)', r.length === 2);
    const fin = r[1] && r[1].body;
    check('el reporte de fin usa el MISMO id que el de inicio (misma fila en el backend)', fin && fin.id === r[0].body.id);
    check('el reporte de fin dice "terminada" y trae fin y duracionMs', fin && fin.estado === 'terminada' && typeof fin.fin === 'number' && typeof fin.duracionMs === 'number' && fin.duracionMs >= 0);
    check('el reporte de fin trae los conteos sumados', fin && fin.conteos.postuladas === 4 && fin.conteos.observadas === 2 && fin.conteos.descartadas === 9 && fin.conteos.gris === 3);
  }

  // 8c. Una ráfaga interrumpida también se reporta, como "interrumpida".
  {
    const b = cargarBackgroundJs();
    await tick();
    b.storageLocal.rafaga = {
      id: 'r_colgada2', disparador: 'chequeo', inicio: Date.now() - 30 * 60000, latido: Date.now() - 30 * 60000,
      pasos: unPaso, pasoActual: 0, tabActual: 321,
      conteos: { postuladas: 1, descartadas: 2, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
    };
    await b.ctx.retomarORafagaInterrumpida();
    await tick();
    const r = b.reportesRafaga();
    check('una ráfaga interrumpida se reporta al backend', r.length === 1 && r[0].body.id === 'r_colgada2' && r[0].body.estado === 'interrumpida');
  }

  // 8d. Un backend caído no rompe la ráfaga ni retrasa que se suelte el bloqueo.
  {
    let liberadoAntesDeQueContesteElBackend = false;
    let b;
    const fetchColgado = (url) => {
      if (/\/api\/extension\/rafaga/.test(String(url))) {
        // El fetch de fin nunca contesta: ¿ya se había soltado el bloqueo?
        if (b && b.storageLocal.rafaga && b.storageLocal.rafaga.estado === 'terminada') {
          liberadoAntesDeQueContesteElBackend = b.power.liberados >= 2; // 1 al cargar + 1 al terminar
        }
        return new Promise(() => {});
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    };
    b = cargarBackgroundJs({ fetchImpl: fetchColgado });
    await tick();
    await b.ctx.iniciarRafaga('chequeo', unPaso);
    await tick();
    b.completarTab(b.tabsCreados[0].id);
    await tick();
    b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 1 } }, { tab: { id: b.tabsCreados[0].id } });
    await tick();
    check('con el backend colgado, la ráfaga igual queda "terminada"', b.storageLocal.rafaga.estado === 'terminada');
    check('con el backend colgado, el bloqueo de suspensión ya estaba soltado (se suelta antes de reportar)', liberadoAntesDeQueContesteElBackend);
  }

  // 8e. Un error de red al reportar no revienta nada.
  {
    const b = cargarBackgroundJs({ fetchImpl: async () => { throw new Error('sin red'); } });
    await tick();
    let reventó = false;
    try {
      await b.ctx.iniciarRafaga('chequeo', unPaso);
      await tick();
    } catch (e) { reventó = true; }
    check('un error de red al reportar no revienta iniciarRafaga', !reventó);
    check('un error de red al reportar no impide abrir la pestaña', b.tabsCreados.length === 1);
  }

  // 8f. Sin token conectado no se manda nada al backend.
  {
    const b = cargarBackgroundJs({ sinToken: true });
    await tick();
    await b.ctx.iniciarRafaga('chequeo', unPaso);
    await tick();
    check('sin token de AutoPostula no se reporta la ráfaga', b.reportesRafaga().length === 0);
  }
});

// ── 9. El número en el ícono de la extensión (§3.5) ───────────────────────
bloque(async () => {
  const unPaso = [{ tipo: 'busqueda', portal: 'Trabajando', url: 'https://www.trabajando.cl/x' }];

  // Corre una ráfaga de un paso hasta el final con los conteos dados.
  async function correrRafagaCon(conteos, opts) {
    const b = cargarBackgroundJs(opts);
    await tick();
    await b.ctx.iniciarRafaga('chequeo', unPaso);
    await tick();
    b.completarTab(b.tabsCreados[0].id);
    await tick();
    b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos }, { tab: { id: b.tabsCreados[0].id } });
    await tick();
    return b;
  }

  {
    const b = await correrRafagaCon({ postular: 7, descartar: 14 });
    check('al terminar una ráfaga con postulaciones, el ícono muestra el número', b.badge.textos[b.badge.textos.length - 1] === '7');
    check('el número de postulaciones va en verde', b.badge.colores[b.badge.colores.length - 1] === '#17784F');
  }
  {
    const b = await correrRafagaCon({ observado: 3, descartar: 10 });
    check('en modo solo observar el ícono muestra lo que HABRÍA postulado', b.badge.textos[b.badge.textos.length - 1] === '3');
    check('...en gris, para que nadie lo tome por un envío real', b.badge.colores[b.badge.colores.length - 1] === '#5D6468');
  }
  {
    const b = await correrRafagaCon({ descartar: 20 });
    check('una ráfaga sin novedades limpia el número (no deja pegado el de la anterior)', b.badge.textos[b.badge.textos.length - 1] === '');
  }
  {
    const b = await correrRafagaCon({ postular: 1500 });
    check('un número gigante se acorta a "999+" (el ícono solo aguanta 4 caracteres)', b.badge.textos[b.badge.textos.length - 1] === '999+');
  }
  {
    // Una ráfaga interrumpida a mitad de camino: ya llevaba 2 postulaciones.
    const b = cargarBackgroundJs();
    await tick();
    b.storageLocal.rafaga = {
      id: 'r_cortada', disparador: 'chequeo', inicio: Date.now() - 40 * 60000, latido: Date.now() - 40 * 60000,
      pasos: unPaso, pasoActual: 0, tabActual: 99,
      conteos: { postuladas: 2, descartadas: 5, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
    };
    await b.ctx.retomarORafagaInterrumpida();
    await tick();
    check('una ráfaga interrumpida también avisa lo que alcanzó a postular', b.badge.textos[b.badge.textos.length - 1] === '2');
  }
  {
    // El número es un aviso: si falla, el cierre de la ráfaga no puede fallar con él.
    const b = await correrRafagaCon({ postular: 5 }, { sinAction: true });
    check('sin chrome.action la ráfaga igual queda terminada', b.storageLocal.rafaga.estado === 'terminada');
    check('sin chrome.action la ráfaga igual se reporta al backend', b.reportesRafaga().length === 2);
  }
  {
    // El número va ANTES del reporte a la red: un backend colgado no lo retrasa.
    let numeroYaPuestoAlReportar = false;
    let b;
    const fetchColgado = (url) => {
      if (/\/api\/extension\/rafaga/.test(String(url)) && b && b.storageLocal.rafaga && b.storageLocal.rafaga.estado === 'terminada') {
        numeroYaPuestoAlReportar = b.badge.textos[b.badge.textos.length - 1] === '4';
        return new Promise(() => {});
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    };
    b = cargarBackgroundJs({ fetchImpl: fetchColgado });
    await tick();
    await b.ctx.iniciarRafaga('chequeo', unPaso);
    await tick();
    b.completarTab(b.tabsCreados[0].id);
    await tick();
    b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 4 } }, { tab: { id: b.tabsCreados[0].id } });
    await tick();
    check('el número ya estaba puesto cuando se intentó reportar (un backend colgado no lo demora)', numeroYaPuestoAlReportar);
  }
});

// ── 10. El popup: la línea de "te pusimos al día" (§3.5) ──────────────────
bloque(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const desde = fuente.indexOf('function haceCuanto(');
  const hasta = fuente.indexOf('// ── Cargar estado');
  check('popup.js tiene el bloque de la puesta al día donde se espera', desde > 0 && hasta > desde);

  // Se extrae el bloque REAL del archivo (no una copia) y se corre contra un
  // DOM y un chrome mínimos -- mismo patrón que verificar-modo-observar.js.
  function cargarBloque() {
    const elementos = {};
    const crear = (id) => {
      const clases = new Set(id === 'rafaga-row' || id === 'rafaga-detalle' ? ['hidden'] : []);
      return {
        id, textContent: '',
        classList: {
          toggle: (c, forzar) => { if (forzar) clases.add(c); else clases.delete(c); },
          contains: (c) => clases.has(c),
        },
      };
    };
    ['rafaga-row', 'rafaga-titulo', 'rafaga-detalle'].forEach(id => { elementos[id] = crear(id); });
    const escuchas = [];
    const insignias = [];
    const ctx = {
      Date,
      document: { getElementById: (id) => elementos[id] || null },
      chrome: {
        storage: { onChanged: { addListener: (fn) => escuchas.push(fn) } },
        action: { setBadgeText: (o) => insignias.push(o.text) },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(fuente.slice(desde, hasta), ctx, { filename: 'popup.js (bloque de ráfaga)' });
    return { ctx, elementos, escuchas, insignias, oculto: (id) => elementos[id].classList.contains('hidden') };
  }

  const { ctx: p } = cargarBloque();
  const ahora = 1_800_000_000_000;
  const min = 60000;
  const conteosBase = { postuladas: 0, observadas: 0, descartadas: 0, gris: 0, errores: 0 };

  check('haceCuanto: 30 segundos', p.haceCuanto(30000) === 'hace unos segundos');
  check('haceCuanto: 12 minutos', p.haceCuanto(12 * min) === 'hace 12 min');
  check('haceCuanto: 90 minutos son "hace 1 h"', p.haceCuanto(90 * min) === 'hace 1 h');
  check('haceCuanto: 25 horas son "hace 1 día"', p.haceCuanto(25 * 60 * min) === 'hace 1 día');
  check('haceCuanto: 72 horas son "hace 3 días"', p.haceCuanto(72 * 60 * min) === 'hace 3 días');

  check('sin ráfaga no hay nada que mostrar', p.textoRafaga(undefined, ahora) === null && p.textoRafaga({}, ahora) === null);

  let t = p.textoRafaga({ estado: 'terminada', fin: ahora - 12 * min, conteos: { ...conteosBase, postuladas: 7, descartadas: 14 } }, ahora);
  check('terminada: el ejemplo del documento (hace 12 min · 7 postulaciones · 14 descartadas)', t && t.titulo === 'Te pusimos al día hace 12 min' && t.detalle === '7 postulaciones · 14 descartadas', t);

  t = p.textoRafaga({ estado: 'terminada', fin: ahora - min, conteos: { ...conteosBase, postuladas: 1, descartadas: 1 } }, ahora);
  check('singular: "1 postulación · 1 descartada"', t && t.detalle === '1 postulación · 1 descartada', t);

  t = p.textoRafaga({ estado: 'terminada', fin: ahora - min, conteos: { ...conteosBase, postuladas: 3, gris: 2, descartadas: 5 } }, ahora);
  check('las ofertas en banda gris se dicen ("2 por decidir")', t && t.detalle === '3 postulaciones · 2 por decidir · 5 descartadas', t);

  t = p.textoRafaga({ estado: 'terminada', fin: ahora - min, conteos: { ...conteosBase, observadas: 5, descartadas: 8 } }, ahora);
  check('solo observar: dice "habría postulado a 5", no "0 postulaciones"', t && t.detalle === 'habría postulado a 5 · 8 descartadas', t);

  t = p.textoRafaga({ estado: 'terminada', fin: ahora - min, conteos: conteosBase }, ahora);
  check('una ráfaga sin novedades igual lo dice ("0 postulaciones")', t && t.detalle === '0 postulaciones', t);

  t = p.textoRafaga({ estado: 'terminada', fin: ahora - min, conteos: { ...conteosBase, postuladas: 2, errores: 1 } }, ahora);
  check('una búsqueda que no terminó se dice (1)', t && t.detalle === '2 postulaciones · 1 búsqueda no terminó', t);
  t = p.textoRafaga({ estado: 'terminada', fin: ahora - min, conteos: { ...conteosBase, errores: 2 } }, ahora);
  check('una búsqueda que no terminó se dice (2, en plural)', t && t.detalle === '0 postulaciones · 2 búsquedas no terminaron', t);

  t = p.textoRafaga({ estado: 'interrumpida', fin: ahora - 3 * 60 * min, conteos: { ...conteosBase, postuladas: 2 } }, ahora);
  check('interrumpida: dice que se cortó, y lo que alcanzó a hacer', t && t.titulo === 'La última puesta al día se cortó hace 3 h' && t.detalle === '2 postulaciones', t);

  t = p.textoRafaga({ estado: 'en_curso', inicio: ahora - 2 * min, latido: ahora - 30000, pasos: [1, 2, 3, 4], pasoActual: 1, conteos: conteosBase }, ahora);
  check('en curso con latido reciente: "Poniéndose al día ahora…" y el paso', t && t.titulo === 'Poniéndose al día ahora…' && t.detalle === 'Paso 2 de 4', t);

  t = p.textoRafaga({ estado: 'en_curso', inicio: ahora - 60 * min, latido: ahora - 20 * min, pasos: [1, 2], pasoActual: 0, conteos: { ...conteosBase, postuladas: 1 } }, ahora);
  check('en curso SIN latido reciente no miente: se muestra como interrumpida', t && t.titulo === 'La última puesta al día se cortó hace 20 min', t);

  // ── El render sobre el DOM ──
  const b1 = cargarBloque();
  b1.ctx.renderRafaga({ estado: 'terminada', fin: Date.now() - 5 * min, conteos: { ...conteosBase, postuladas: 7, descartadas: 14 } });
  check('render: la fila aparece con el título', !b1.oculto('rafaga-row') && b1.elementos['rafaga-titulo'].textContent === 'Te pusimos al día hace 5 min');
  check('render: el detalle aparece con los conteos', !b1.oculto('rafaga-detalle') && b1.elementos['rafaga-detalle'].textContent === '7 postulaciones · 14 descartadas');
  b1.ctx.renderRafaga(undefined);
  check('render: sin ráfaga la fila se oculta', b1.oculto('rafaga-row'));
  b1.ctx.renderRafaga({ estado: 'en_curso', inicio: Date.now(), latido: Date.now(), pasos: [], pasoActual: 0, conteos: conteosBase });
  check('render: si no hay detalle que decir, el detalle se oculta', !b1.oculto('rafaga-row') && b1.oculto('rafaga-detalle'));

  // ── Actualización en vivo y limpieza del número ──
  const b2 = cargarBloque();
  check('el popup escucha los cambios de la ráfaga en storage', b2.escuchas.length === 1);
  b2.escuchas[0]({ rafaga: { newValue: { estado: 'terminada', fin: Date.now(), conteos: { ...conteosBase, postuladas: 3 } } } }, 'local');
  check('si la ráfaga termina con el popup abierto, la línea se actualiza sola', b2.elementos['rafaga-titulo'].textContent === 'Te pusimos al día hace unos segundos');
  check('...y el número del ícono se limpia (la persona ya lo está mirando)', b2.insignias.length === 1 && b2.insignias[0] === '');
  b2.escuchas[0]({ rafaga: { newValue: { estado: 'terminada', fin: Date.now(), conteos: conteosBase } } }, 'sync');
  check('un cambio en otra área de storage (sync) se ignora', b2.insignias.length === 1);
  b2.ctx.limpiarInsigniaRafaga();
  check('abrir el popup limpia el número del ícono', b2.insignias.length === 2 && b2.insignias[1] === '');

  // ── El HTML trae los elementos que el JS busca ──
  const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
  check('popup.html trae la fila de la puesta al día con sus tres ids', ['rafaga-row', 'rafaga-titulo', 'rafaga-detalle'].every(id => html.includes('id="' + id + '"')));
  check('la fila va arriba: antes del toggle maestro', html.indexOf('id="rafaga-row"') < html.indexOf('class="master-row"'));
  check('la fila arranca oculta (no parpadea vacía al abrir)', /class="rafaga-row hidden"/.test(html));
  check('popup.js pide las ráfagas a storage al cargar y limpia el número', /chrome\.storage\.local\.get\(\[[^\]]*'rafaga'[^\]]*\]/.test(fuente) && fuente.includes('limpiarInsigniaRafaga();\n'));
});

// ── 11. "Ponerme al día ahora": el service worker (§3.6) ──────────────────
bloque(async () => {
  const unPaso = [{ tipo: 'busqueda', portal: 'Trabajando', url: 'https://www.trabajando.cl/x' }];
  const estadoBase = {
    busquedaAutomatica: true, disponibleEnPlan: true, motivo: null,
    objetivos: [{ etiqueta: 'vendedor', peso: 1 }],
    plataformasConectadas: ['Trabajando'],
  };
  // El backend simulado: estado-automatico configurable; acepta el registro de ráfagas.
  const conEstado = (cambios) => async (url) => {
    if (/\/api\/account\/estado-automatico/.test(String(url))) return { ok: true, json: async () => ({ ...estadoBase, ...cambios }) };
    return { ok: /\/api\/extension\/rafaga/.test(String(url)), json: async () => ({}) };
  };
  const pulsar = (b) => b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  const estadoBoton = (b) => b.enviarMensajeAsync({ type: 'ESTADO_PONERSE_AL_DIA' });
  const nuevo = async (cambios, opts) => {
    const b = cargarBackgroundJs({ fetchImpl: conEstado(cambios), ...(opts || {}) });
    await tick();
    return b;
  };
  const enCurso = (latidoHaceMin, tabActual) => ({
    id: 'r_previa', disparador: 'chequeo', inicio: Date.now() - 40 * 60000, latido: Date.now() - latidoHaceMin * 60000,
    pasos: unPaso, pasoActual: 0, tabActual,
    conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
  });

  // ── Apretarlo ──
  let b = await nuevo({});
  let r = await pulsar(b);
  await tick();
  check('Premium: apretar el botón arranca una ráfaga', r.ok === true && b.tabsCreados.length === 1, r);
  check('la ráfaga arrancada dice que fue "manual"', b.storageLocal.rafaga && b.storageLocal.rafaga.disparador === 'manual');
  check('...y así se reporta al backend', b.reportesRafaga().length >= 1 && b.reportesRafaga()[0].body.disparador === 'manual');
  check('sin ráfagas previas no hay estimación todavía (no se inventa una duración)', r.estimadoMs === null, r);

  // ── Sin el umbral de 3 h (a diferencia de los disparadores automáticos) ──
  b = await nuevo({});
  b.storageLocal.ultimaRafagaFin = Date.now() - 60 * 60000; // hace 1 h: dentro de las 3 h del umbral
  await b.ctx.quizasRafaga('chequeo');
  await tick();
  check('control: un disparador automático SÍ respeta el umbral (terminó hace 1 h)', b.tabsCreados.length === 0);
  r = await pulsar(b);
  await tick();
  check('el botón NO respeta el umbral de 3 h: la persona lo pidió a propósito', r.ok === true && b.tabsCreados.length === 1, r);

  // ── Enfriamiento corto (lo único que sí frena al botón por tiempo) ──
  b = await nuevo({});
  b.storageLocal.ultimaRafagaFin = Date.now() - 2 * 60000;
  r = await pulsar(b);
  check('terminó hace 2 min: "reciente", no abre nada', r.ok === false && r.motivo === 'reciente' && b.tabsCreados.length === 0, r);
  b = await nuevo({});
  b.storageLocal.ultimaRafagaFin = Date.now() - 6 * 60000;
  r = await pulsar(b);
  check('terminó hace 6 min: ya se puede', r.ok === true, r);

  // ── Ya hay una corriendo ──
  b = await nuevo({});
  b.storageLocal.rafaga = enCurso(1, 4242); // latido de hace 1 min: viva
  r = await pulsar(b);
  check('con una ráfaga viva en curso: "en_curso", no abre otra', r.ok === false && r.motivo === 'en_curso' && b.tabsCreados.length === 0, r);
  b = await nuevo({});
  b.storageLocal.rafaga = enCurso(30, 4242); // latido de hace 30 min: el worker la perdió
  r = await pulsar(b);
  await tick();
  check('una "en_curso" que el worker perdió NO deja el botón bloqueado para siempre', r.ok === true && b.tabsCreados.length === 1, r);
  check('...y de paso cierra la pestaña huérfana de la vieja', b.removidos.includes(4242));

  // ── Lo que dice el servidor: plan, pausa, cupo, portales ──
  const casosServidor = [
    [{ busquedaAutomatica: false, disponibleEnPlan: false, motivo: 'sin-plan' }, 'sin_plan'],
    [{ busquedaAutomatica: false, motivo: 'pausada' }, 'pausada'],
    [{ busquedaAutomatica: false, motivo: 'sin-cupo' }, 'sin_cupo'],
    [{ busquedaAutomatica: false, motivo: 'sin-portales' }, 'sin_portales'],
    [{ busquedaAutomatica: false, motivo: undefined }, 'no_disponible'], // backend viejo, sin `motivo`
  ];
  for (const [cambios, esperado] of casosServidor) {
    b = await nuevo(cambios);
    r = await pulsar(b);
    check('el servidor dice "' + (cambios.motivo || 'sin motivo') + '" → la extensión explica "' + esperado + '" y no abre nada', r.ok === false && r.motivo === esperado && b.tabsCreados.length === 0, r);
  }

  // ── Lo que falta de la cuenta ──
  b = await nuevo({ objetivos: [], cargoObjetivo: null });
  r = await pulsar(b);
  check('sin objetivo: "sin_objetivo"', r.ok === false && r.motivo === 'sin_objetivo', r);
  b = await nuevo({ plataformasConectadas: [] });
  r = await pulsar(b);
  check('sin portales conectados: "sin_portales"', r.ok === false && r.motivo === 'sin_portales', r);
  b = await nuevo({ plataformasConectadas: ['PortalSinAdaptador'] });
  r = await pulsar(b);
  check('un portal conectado que la extensión no sabe recorrer tampoco arranca nada: "sin_portales"', r.ok === false && r.motivo === 'sin_portales' && b.tabsCreados.length === 0, r);

  // ── Sin red / sin cuenta ──
  b = cargarBackgroundJs({ fetchImpl: async () => { throw new Error('sin red'); } });
  await tick();
  r = await pulsar(b);
  check('sin red: "sin_conexion"', r.ok === false && r.motivo === 'sin_conexion', r);
  b = cargarBackgroundJs({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  await tick();
  r = await pulsar(b);
  check('el backend responde error: "sin_conexion"', r.ok === false && r.motivo === 'sin_conexion', r);
  b = await nuevo({}, { sinToken: true });
  r = await pulsar(b);
  check('extensión sin conectar a una cuenta: "sin_token"', r.ok === false && r.motivo === 'sin_token', r);

  // ── "Poner al día" es con TODO: todos los objetivos, y no toca el contador de ciclos ──
  const dosObjetivos = { objetivos: [{ etiqueta: 'vendedor', peso: 1 }, { etiqueta: 'cajero', peso: 0.5 }] };
  b = await nuevo(dosObjetivos);
  await pulsar(b);
  check('el botón recorre TODOS los objetivos (2 objetivos × 1 portal = 2 pasos)', b.storageLocal.rafaga.pasos.length === 2, b.storageLocal.rafaga.pasos);
  check('...y no consume el contador de ciclos (no descuadra la alternancia de las automáticas)', b.storageLocal.cicloBusquedaAutomatica === undefined);
  b = await nuevo(dosObjetivos);
  await b.ctx.quizasRafaga('chequeo');
  await tick();
  check('control: la automática, en su primer ciclo, sigue visitando solo el objetivo principal (1 paso)', b.storageLocal.rafaga.pasos.length === 1 && b.storageLocal.cicloBusquedaAutomatica === 1);

  // ── Un fallo por dentro igual contesta ──
  b = await nuevo({});
  b.ctx.chrome.storage.local.get = () => Promise.reject(new Error('storage roto'));
  r = await pulsar(b);
  check('si algo revienta por dentro, igual se responde (no deja el botón en "Empezando…")', r && r.ok === false && r.__sinRespuesta !== true, r);

  // ── Guardar las duraciones: las últimas 5 que TERMINARON ──
  b = cargarBackgroundJs();
  await tick();
  for (let i = 0; i < 7; i++) {
    await b.ctx.iniciarRafaga('chequeo', unPaso);
    await tick();
    const tab = b.tabsCreados[b.tabsCreados.length - 1];
    b.completarTab(tab.id);
    await tick();
    b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: {} }, { tab: { id: tab.id } });
    await tick();
  }
  check('se guardan solo las últimas 5 duraciones (7 ráfagas terminadas → 5)', Array.isArray(b.storageLocal.duracionesRafaga) && b.storageLocal.duracionesRafaga.length === 5, b.storageLocal.duracionesRafaga);
  check('...y cada una es un número no negativo', b.storageLocal.duracionesRafaga.every(d => typeof d === 'number' && d >= 0));
  b = cargarBackgroundJs();
  await tick();
  b.storageLocal.rafaga = enCurso(30, 77);
  await b.ctx.retomarORafagaInterrumpida();
  await tick();
  check('una ráfaga interrumpida NO cuenta para la estimación (no dice cuánto tarda una completa)', b.storageLocal.duracionesRafaga === undefined);

  // ── Dibujar el botón sin apretarlo ──
  b = await nuevo({ disponibleEnPlan: false, busquedaAutomatica: false, motivo: 'sin-plan' });
  r = await estadoBoton(b);
  check('cuenta gratis: el botón NO se muestra', r.mostrar === false, r);
  b = await nuevo({}, { sinToken: true });
  r = await estadoBoton(b);
  check('sin cuenta conectada: no se muestra', r.mostrar === false, r);
  b = cargarBackgroundJs({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  await tick();
  r = await estadoBoton(b);
  check('sin respuesta del servidor no se sabe si el plan lo permite: no se ofrece', r.mostrar === false, r);
  b = await nuevo({ disponibleEnPlan: undefined });
  r = await estadoBoton(b);
  check('un backend viejo (no manda disponibleEnPlan) tampoco lo muestra', r.mostrar === false, r);

  b = await nuevo({});
  b.storageLocal.duracionesRafaga = [60000, 480000, 300000];
  r = await estadoBoton(b);
  check('Premium disponible: se muestra, sin bloqueo, con la MEDIANA de las duraciones (300000)', r.mostrar === true && r.bloqueo === null && r.estimadoMs === 300000, r);
  b = await nuevo({});
  b.storageLocal.duracionesRafaga = [60000, 120000];
  r = await estadoBoton(b);
  check('con cantidad par la mediana es el promedio de las dos del medio (90000)', r.estimadoMs === 90000, r);
  b = await nuevo({});
  b.storageLocal.duracionesRafaga = [60000, 60000, 60000, 60000, 3000000];
  r = await estadoBoton(b);
  check('la mediana no se deja correr por UNA ráfaga colgada (60000, no el promedio)', r.estimadoMs === 60000, r);
  b = await nuevo({});
  r = await estadoBoton(b);
  check('sin ráfagas terminadas, estimadoMs es null', r.mostrar === true && r.estimadoMs === null, r);

  const bloqueos = [
    [{ busquedaAutomatica: false, motivo: 'pausada' }, null, 'pausada'],
    [{ busquedaAutomatica: false, motivo: 'sin-cupo' }, null, 'sin_cupo'],
    [{ objetivos: [] }, null, 'sin_objetivo'],
    [{ plataformasConectadas: [] }, null, 'sin_portales'],
    [{}, { rafaga: enCurso(1, 5) }, 'en_curso'],
    [{}, { ultimaRafagaFin: Date.now() - 60000 }, 'reciente'],
  ];
  for (const [cambios, almacen, esperado] of bloqueos) {
    b = await nuevo(cambios);
    Object.assign(b.storageLocal, almacen || {});
    r = await estadoBoton(b);
    check('Premium bloqueado por "' + esperado + '": se muestra, con el bloqueo (para explicarlo)', r.mostrar === true && r.bloqueo === esperado, r);
  }
  b = await nuevo({});
  await estadoBoton(b);
  await tick();
  check('preguntar el estado NO tiene efectos: no abre pestañas ni arranca ráfagas', b.tabsCreados.length === 0 && b.storageLocal.rafaga === undefined);
});

// ── 12. bridge.js: el evento del panel (§3.6) ─────────────────────────────
bloque(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');
  function cargarBridge() {
    const window = new EventTarget();
    const enviados = [];
    const resultados = [];
    const est = { respuesta: undefined, error: null };
    window.addEventListener('autopostula:ponerse-al-dia-resultado', (e) => resultados.push(e.detail));
    const ctx = {
      window, CustomEvent, console,
      document: { documentElement: { dataset: {} } },
      chrome: {
        runtime: {
          getManifest: () => ({ version: '9.9.9' }),
          sendMessage: (m, cb) => { enviados.push(m); cb(est.respuesta); },
          get lastError() { return est.error; },
        },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(fuente, ctx, { filename: 'bridge.js' });
    return { ctx, window, enviados, resultados, est };
  }

  let br = cargarBridge();
  check('bridge.js sigue dejando la marca de la extensión en el DOM', br.ctx.document.documentElement.dataset.autopostulaExtension === '9.9.9');

  br.est.respuesta = { ok: true, estimadoMs: 480000 };
  br.window.dispatchEvent(new CustomEvent('autopostula:ponerse-al-dia'));
  check('el evento del panel se convierte en el mensaje PONERSE_AL_DIA a la extensión', br.enviados.length === 1 && br.enviados[0].type === 'PONERSE_AL_DIA');
  check('la respuesta de la extensión vuelve al panel como evento, tal cual', br.resultados.length === 1 && JSON.stringify(br.resultados[0]) === JSON.stringify({ ok: true, estimadoMs: 480000 }), br.resultados);

  br.est.respuesta = { ok: false, motivo: 'pausada' };
  br.window.dispatchEvent(new CustomEvent('autopostula:ponerse-al-dia'));
  check('un rechazo lleva su motivo al panel sin tocarlo (el panel lo explica)', br.resultados[1] && br.resultados[1].ok === false && br.resultados[1].motivo === 'pausada', br.resultados);

  br.est.respuesta = undefined;
  br.window.dispatchEvent(new CustomEvent('autopostula:ponerse-al-dia'));
  check('si la extensión no contesta nada, el panel recibe "extension_no_responde" (no queda esperando)', br.resultados[2] && br.resultados[2].motivo === 'extension_no_responde', br.resultados);

  br.est.error = { message: 'Extension context invalidated.' };
  br.est.respuesta = { ok: true };
  br.window.dispatchEvent(new CustomEvent('autopostula:ponerse-al-dia'));
  check('con la extensión recargada (lastError) también: "extension_no_responde"', br.resultados[3] && br.resultados[3].ok === false && br.resultados[3].motivo === 'extension_no_responde', br.resultados);

  // Lo que ya existía no se rompió: conectar con el token.
  br = cargarBridge();
  br.est.respuesta = { ok: true };
  br.window.dispatchEvent(new CustomEvent('autopostula:conectar', { detail: { token: 'tok' } }));
  check('el evento "conectar" sigue mandando GUARDAR_TOKEN', br.enviados.length === 1 && br.enviados[0].type === 'GUARDAR_TOKEN' && br.enviados[0].token === 'tok');
});

// ── 13. El popup: el botón "Ponerme al día ahora" (§3.6) ──────────────────
bloque(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const desde = fuente.indexOf('function haceCuanto(');
  const hasta = fuente.indexOf('// ── Cargar estado');

  function cargarPopup() {
    const ids = ['ponerse-row', 'ponerse-btn', 'ponerse-hint', 'rafaga-row', 'rafaga-titulo', 'rafaga-detalle'];
    const elementos = {};
    for (const id of ids) {
      const clases = new Set(id.endsWith('-row') ? ['hidden'] : []);
      elementos[id] = {
        id, textContent: '', disabled: false,
        classList: { toggle: (c, f) => { if (f) clases.add(c); else clases.delete(c); }, contains: (c) => clases.has(c) },
      };
    }
    const enviados = [];
    const estado = { respuestas: {}, error: null };
    const escuchas = [];
    const ctx = {
      Date,
      document: { getElementById: (id) => elementos[id] || null },
      chrome: {
        runtime: {
          sendMessage: (m, cb) => { enviados.push(m); cb(estado.respuestas[m.type]); },
          get lastError() { return estado.error; },
        },
        storage: { onChanged: { addListener: (fn) => escuchas.push(fn) } },
        action: { setBadgeText: () => {} },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(fuente.slice(desde, hasta), ctx, { filename: 'popup.js (bloque de ráfaga)' });
    return {
      ctx, elementos, enviados, estado, escuchas,
      oculto: (id) => elementos[id].classList.contains('hidden'),
      leer: (nombre) => vm.runInContext(nombre, ctx), // también alcanza a las `const`
    };
  }

  const p = cargarPopup();

  // ── duracionAproximada / estimación (misma tabla que scripts/verificar-texto-rafaga.ts) ──
  const tabla = [
    [null, 'unos minutos'], [0, 'unos minutos'], [30000, 'menos de un minuto'], [60000, 'un minuto'],
    [89000, 'un minuto'], [90000, 'unos 2 minutos'], [480000, 'unos 8 minutos'], [3540000, 'unos 59 minutos'], [3600000, 'más de una hora'], [7200000, 'más de una hora'],
  ];
  for (const [ms, esperado] of tabla) {
    check('duracionAproximada(' + ms + ') = "' + esperado + '"', p.ctx.duracionAproximada(ms) === esperado, p.ctx.duracionAproximada(ms));
  }
  check('con estimación: "Suele tardar unos 8 minutos."', p.ctx.textoEstimadoPonerse(480000) === 'Suele tardar unos 8 minutos.');
  check('sin estimación no inventa un número: "Puede tardar unos minutos."', p.ctx.textoEstimadoPonerse(null) === 'Puede tardar unos minutos.');

  // ── Qué muestra según el estado ──
  check('cuenta gratis / sin estado: la fila no se muestra', p.ctx.estadoBotonPonerse(undefined) === null && p.ctx.estadoBotonPonerse({ mostrar: false }) === null);
  let e = p.ctx.estadoBotonPonerse({ mostrar: true, bloqueo: 'pausada', estimadoMs: 480000 });
  check('bloqueado: deshabilitado y explica por qué', e.deshabilitado === true && e.hint === 'La búsqueda automática está en pausa. Reanúdala desde tu panel.', e);
  e = p.ctx.estadoBotonPonerse({ mostrar: true, bloqueo: null, estimadoMs: 480000 });
  check('disponible: habilitado y dice cuánto suele tardar', e.deshabilitado === false && e.hint === 'Suele tardar unos 8 minutos.', e);
  e = p.ctx.estadoBotonPonerse({ mostrar: true, bloqueo: 'algo_que_no_conozco' });
  check('un bloqueo desconocido cae al texto genérico, nunca a una clave cruda', e.hint === 'No se pudo poner al día ahora. Inténtalo de nuevo en unos minutos.', e);

  // ── El render ──
  p.ctx.renderPonerse({ mostrar: true, bloqueo: null, estimadoMs: 480000 });
  check('render: la fila aparece, el botón habilitado, con la estimación debajo', !p.oculto('ponerse-row') && p.elementos['ponerse-btn'].disabled === false && p.elementos['ponerse-hint'].textContent === 'Suele tardar unos 8 minutos.');
  p.ctx.renderPonerse({ mostrar: true, bloqueo: 'reciente' });
  check('render: bloqueado se ve deshabilitado con la razón', !p.oculto('ponerse-row') && p.elementos['ponerse-btn'].disabled === true && p.elementos['ponerse-hint'].textContent.startsWith('Te pusimos al día hace muy poco'));
  p.ctx.renderPonerse({ mostrar: false });
  check('render: cuenta gratis, la fila se oculta', p.oculto('ponerse-row'));

  // ── Apretarlo ──
  let q = cargarPopup();
  q.estado.respuestas.PONERSE_AL_DIA = { ok: true, estimadoMs: 480000 };
  q.ctx.apretarPonerse();
  check('apretar manda PONERSE_AL_DIA a la extensión', q.enviados.length === 1 && q.enviados[0].type === 'PONERSE_AL_DIA');
  check('si arrancó: lo dice, y el botón queda deshabilitado (ya está corriendo)', q.elementos['ponerse-hint'].textContent === q.leer('TEXTO_EMPEZO_PONERSE') && q.elementos['ponerse-btn'].disabled === true, q.elementos['ponerse-hint'].textContent);

  q = cargarPopup();
  q.estado.respuestas.PONERSE_AL_DIA = { ok: false, motivo: 'reciente' };
  q.ctx.apretarPonerse();
  check('si no se puede por algo que no cambia apretando de nuevo ("reciente"), explica y queda deshabilitado', q.elementos['ponerse-hint'].textContent.startsWith('Te pusimos al día hace muy poco') && q.elementos['ponerse-btn'].disabled === true);

  q = cargarPopup();
  q.estado.respuestas.PONERSE_AL_DIA = { ok: false, motivo: 'sin_conexion' };
  q.ctx.apretarPonerse();
  check('si falló la conexión, explica y deja REINTENTAR', q.elementos['ponerse-hint'].textContent.startsWith('No pudimos consultar tu cuenta') && q.elementos['ponerse-btn'].disabled === false);

  q = cargarPopup();
  q.estado.error = { message: 'The message port closed before a response was received.' };
  q.ctx.apretarPonerse();
  check('si el worker no contesta: "la extensión no respondió" y deja reintentar', q.elementos['ponerse-hint'].textContent.startsWith('La extensión no respondió') && q.elementos['ponerse-btn'].disabled === false);

  // ── Se vuelve a evaluar cuando la ráfaga TERMINA, no en cada paso ──
  q = cargarPopup();
  q.escuchas[0]({ rafaga: { newValue: { estado: 'en_curso', pasos: [1, 2], pasoActual: 1, latido: Date.now(), inicio: Date.now(), conteos: {} } } }, 'local');
  check('un paso de una ráfaga en curso NO vuelve a consultar el estado del botón', !q.enviados.some(m => m.type === 'ESTADO_PONERSE_AL_DIA'));
  q.escuchas[0]({ rafaga: { newValue: { estado: 'terminada', fin: Date.now(), conteos: {} } } }, 'local');
  check('cuando la ráfaga termina, sí (vuelve el enfriamiento y hay que decirlo)', q.enviados.some(m => m.type === 'ESTADO_PONERSE_AL_DIA'));

  // ── Los textos son LOS MISMOS que los del panel (backend/lib/texto-rafaga.ts) ──
  const ts = fs.readFileSync(path.join(__dirname, '..', 'backend', 'lib', 'texto-rafaga.ts'), 'utf8');
  const ini = ts.indexOf('export const MOTIVOS_PONERSE_AL_DIA');
  const bloqueTs = ts.slice(ini, ts.indexOf('};', ini));
  const delPanel = {};
  for (const m of bloqueTs.matchAll(/^\s*(\w+):\s*"([^"]*)",?\s*$/gm)) delPanel[m[1]] = m[2];
  const delPopup = q.leer('MOTIVOS_PONERSE_AL_DIA');
  const clavesPanel = Object.keys(delPanel).sort().join(',');
  const clavesPopup = Object.keys(delPopup).sort().join(',');
  check('el popup y el panel explican los MISMOS motivos (' + clavesPopup + ')', clavesPanel.length > 0 && clavesPanel === clavesPopup, { clavesPanel, clavesPopup });
  const distintos = Object.keys(delPopup).filter(k => delPanel[k] !== delPopup[k]);
  check('...con las MISMAS palabras', distintos.length === 0, distintos);
  const genericoTs = (ts.match(/MOTIVO_GENERICO_PONERSE\s*=\s*"([^"]*)"/) || [])[1];
  check('el texto genérico es el mismo en los dos', genericoTs && genericoTs === q.leer('MOTIVO_GENERICO_PONERSE'));
  const tsx = fs.readFileSync(path.join(__dirname, '..', 'backend', 'app', 'dashboard', 'BotonPonerseAlDia.tsx'), 'utf8');
  const empezoTsx = (tsx.match(/TEXTO_EMPEZO\s*=\s*"([^"]*)"/) || [])[1];
  check('lo que dice cuando arrancó es lo mismo en el popup y en el panel', empezoTsx && empezoTsx === q.leer('TEXTO_EMPEZO_PONERSE'));
  const estimadoTs = /Suele tardar \$\{duracionAproximada\(ms\)\}\./.test(ts) && /Puede tardar unos minutos\./.test(ts);
  check('la frase de la estimación es la misma en los dos', estimadoTs);

  // ── El HTML ──
  const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
  check('popup.html trae la fila del botón con sus ids', ['ponerse-row', 'ponerse-btn', 'ponerse-hint'].every(id => html.includes('id="' + id + '"')));
  check('la fila del botón arranca oculta (una cuenta gratis nunca la ve parpadear)', /class="ponerse-row hidden"/.test(html));
  check('va arriba: después de la línea de la última puesta al día y antes del toggle maestro', html.indexOf('id="rafaga-row"') < html.indexOf('id="ponerse-row"') && html.indexOf('id="ponerse-row"') < html.indexOf('class="master-row"'));
  check('popup.js conecta el clic del botón y pide el estado al abrir', fuente.includes("getElementById('ponerse-btn')?.addEventListener('click', apretarPonerse)") && /loadState[\s\S]{0,900}cargarEstadoPonerse\(\)/.test(fuente));
});

// ── 14. La prueba de 5 postulaciones automáticas: quién postuló, y cuándo se corta (§4.1) ──
bloque(async () => {
  const estadoPrueba = {
    busquedaAutomatica: true, disponibleEnPlan: false, motivo: null,
    modo: 'prueba', pruebaRestantes: 5, pruebaTotal: 5,
    objetivos: [{ etiqueta: 'vendedor', peso: 1 }],
    // Dos portales = dos pasos de búsqueda: si se corta a la mitad, hay un "resto" que saltarse.
    plataformasConectadas: ['Trabajando', 'Laborum'],
  };
  // Un backend simulado configurable: el estado, puede-postular y POST /api/applications.
  function servidor(cambiosEstado) {
    const s = {
      estado: { ...estadoPrueba, ...(cambiosEstado || {}) },
      puede: { permitido: true, motivo: null, restantes: 18 },
      postulacion: { id: 'a1' },
    };
    s.fetchImpl = async (url) => {
      const u = String(url);
      if (/estado-automatico/.test(u)) return { ok: true, json: async () => s.estado };
      if (/puede-postular/.test(u)) return { ok: true, json: async () => s.puede };
      if (/\/api\/applications$/.test(u)) return { ok: true, json: async () => s.postulacion };
      return { ok: /\/api\/extension\/rafaga/.test(u), json: async () => ({}) };
    };
    return s;
  }
  // Devuelve un backend con una ráfaga YA en curso (su pestaña es la que abrió ella).
  async function conRafaga(cambios) {
    const s = servidor(cambios);
    const b = cargarBackgroundJs({ fetchImpl: s.fetchImpl });
    await tick();
    await b.ctx.quizasRafaga('chequeo');
    await tick();
    return { s, b, tab: b.storageLocal.rafaga && b.storageLocal.rafaga.tabActual };
  }
  const llamadasA = (b, re) => b.fetchLlamadas.filter(l => re.test(l.url));
  const ultimoPuede = (b) => llamadasA(b, /puede-postular/).slice(-1)[0].url;
  const cuerpoPost = (b) => JSON.parse(llamadasA(b, /\/api\/applications$/).slice(-1)[0].init.body);
  const oferta = { id: 'x1', titulo: 'Vendedor', plataforma: 'Trabajando' };
  const puede = (b, tab) => b.enviarMensajeAsync({ type: 'PUEDE_POSTULAR', plataforma: 'Trabajando' }, tab === undefined ? {} : { tab: { id: tab } });
  const reportar = (b, tab) => b.enviarMensajeAsync({ type: 'REPORTAR_POSTULACION', oferta }, tab === undefined ? {} : { tab: { id: tab } });

  // ── ¿Quién es la pestaña de la ráfaga? ──
  let { s, b, tab } = await conRafaga();
  check('control: una cuenta en prueba arranca su ráfaga y guarda cuál es su pestaña', !!b.storageLocal.rafaga && b.storageLocal.rafaga.estado === 'en_curso' && tab === 1, b.storageLocal.rafaga);

  let r = await puede(b, tab);
  check('PUEDE_POSTULAR desde la pestaña de la ráfaga pregunta con origen=rafaga', /[?&]origen=rafaga/.test(ultimoPuede(b)) && r.permitido === true, ultimoPuede(b));
  await puede(b, 999);
  check('...desde cualquier otra pestaña (la persona entrando a mano) NO lleva origen', !/origen=/.test(ultimoPuede(b)), ultimoPuede(b));
  await puede(b);
  check('...ni desde el popup (mensaje sin pestaña)', !/origen=/.test(ultimoPuede(b)), ultimoPuede(b));

  r = await reportar(b, tab);
  check('lo que postula la pestaña de la ráfaga se reporta con desdeRafaga: true (es lo que gasta la prueba)', cuerpoPost(b).desdeRafaga === true && r.ok === true, cuerpoPost(b));
  await reportar(b, 999);
  check('...lo que postula la persona a mano, con desdeRafaga: false', cuerpoPost(b).desdeRafaga === false, cuerpoPost(b));
  check('...y `origen` sigue siendo MANUAL, como siempre (el campo de siempre, con su propio significado, no se toca)', cuerpoPost(b).origen === 'MANUAL');

  // ── Lo que responde el servidor: cuántas quedan ──
  s.postulacion = { id: 'a2', prueba: { restantes: 2, total: 5 } };
  r = await reportar(b, tab);
  check('el servidor dice cuántas quedan de la prueba y el adaptador lo recibe', r.ok === true && r.prueba && r.prueba.restantes === 2 && r.prueba.total === 5, r);
  check('con 2 restantes la ráfaga sigue: no se corta', !b.storageLocal.rafaga.cortadaPorPrueba);
  s.postulacion = { id: 'a3' };
  r = await reportar(b, tab);
  check('una postulación que no gastó prueba (Premium, o manual) no trae `prueba` y no cambia nada', r.ok === true && !r.prueba && !b.storageLocal.rafaga.cortadaPorPrueba, r);

  s.postulacion = { id: 'a4', prueba: { restantes: 0, total: 5 } };
  r = await reportar(b, 999);
  check('la misma respuesta ante una pestaña que NO es de la ráfaga no corta nada', !b.storageLocal.rafaga.cortadaPorPrueba, b.storageLocal.rafaga);
  r = await reportar(b, tab);
  check('con 0 restantes, desde la pestaña de la ráfaga: queda marcada como cortada por la prueba', b.storageLocal.rafaga.cortadaPorPrueba === true, b.storageLocal.rafaga);
  check('...y el adaptador igual recibe su ok:true (la postulación quedó registrada)', r.ok === true && r.prueba.restantes === 0, r);

  // ── Al cortarse, el resto de la ráfaga se salta ──
  const tabsAntes = b.tabsCreados.length;
  b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 5 } }, { tab: { id: tab } });
  await tick();
  check('al terminar ese paso NO abre el siguiente portal: la ráfaga termina ahí (criterio 2 de §4.1)', b.tabsCreados.length === tabsAntes && b.storageLocal.rafaga.estado === 'terminada', { tabs: b.tabsCreados.length, estado: b.storageLocal.rafaga.estado });
  check('...y cuenta lo que se envió, y suelta el bloqueo de suspensión como cualquier ráfaga que termina', b.storageLocal.rafaga.conteos.postuladas === 5 && b.power.liberados >= 1, b.storageLocal.rafaga.conteos);
  check('...y se reporta al backend como terminada', b.reportesRafaga().slice(-1)[0].body.estado === 'terminada');

  // Control: sin corte, el segundo portal SÍ se abre.
  ({ s, b, tab } = await conRafaga());
  b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 2 } }, { tab: { id: tab } });
  await tick();
  check('control: sin corte, al terminar el primer paso abre el segundo portal', b.tabsCreados.length === 2 && b.storageLocal.rafaga.estado === 'en_curso', b.tabsCreados.length);

  // ── puede-postular dice "prueba_terminada" (otro camino al mismo corte) ──
  ({ s, b, tab } = await conRafaga());
  s.puede = { permitido: false, motivo: 'prueba_terminada', restantes: 18 };
  r = await puede(b, 999);
  check('ante una pestaña de la persona, "prueba_terminada" llega tal cual pero NO corta la ráfaga', r.motivo === 'prueba_terminada' && !b.storageLocal.rafaga.cortadaPorPrueba, r);
  r = await puede(b, tab);
  check('desde la pestaña de la ráfaga: el veredicto llega tal cual al adaptador Y la ráfaga queda cortada', r.permitido === false && r.motivo === 'prueba_terminada' && b.storageLocal.rafaga.cortadaPorPrueba === true, r);

  // ── Una pestaña vieja no cuenta como de la ráfaga ──
  ({ s, b, tab } = await conRafaga());
  b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: {} }, { tab: { id: tab } });
  await tick();
  b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: {} }, { tab: { id: b.storageLocal.rafaga.tabActual } });
  await tick();
  check('control: la ráfaga de dos pasos terminó', b.storageLocal.rafaga.estado === 'terminada');
  await puede(b, tab);
  check('con la ráfaga TERMINADA, su pestaña vieja ya no cuenta como de la ráfaga (no lleva origen)', !/origen=/.test(ultimoPuede(b)), ultimoPuede(b));

  // ── Si el servidor falla, no se traba el escaneo ──
  const rota = cargarBackgroundJs({ fetchImpl: async (url) => { if (/puede-postular/.test(String(url))) throw new Error('sin red'); return { ok: true, json: async () => ({}) }; } });
  await tick();
  r = await rota.enviarMensajeAsync({ type: 'PUEDE_POSTULAR', plataforma: 'Trabajando' }, { tab: { id: 1 } });
  check('sin red al preguntar puede-postular: se deja pasar (permitido: true) -- /api/applications sigue validando después', r.permitido === true, r);
});

// ── 15. La prueba y los tres modos: qué corre y qué muestra el popup (§4, §4.1) ──
bloque(async () => {
  const base = {
    busquedaAutomatica: true, disponibleEnPlan: false, motivo: null,
    modo: 'prueba', pruebaRestantes: 3, pruebaTotal: 5,
    objetivos: [{ etiqueta: 'vendedor', peso: 1 }],
    plataformasConectadas: ['Trabajando'],
  };
  const conEstado = (cambios) => async (url) => {
    if (/\/api\/account\/estado-automatico/.test(String(url))) return { ok: true, json: async () => ({ ...base, ...cambios }) };
    return { ok: /\/api\/extension\/rafaga/.test(String(url)), json: async () => ({}) };
  };
  const nuevo = async (cambios, opts) => {
    const b = cargarBackgroundJs({ fetchImpl: conEstado(cambios), ...(opts || {}) });
    await tick();
    return b;
  };
  const gastada = { busquedaAutomatica: false, motivo: 'prueba-terminada', modo: 'manual', pruebaRestantes: null };

  // ── Gratis con prueba por gastar ──
  let b = await nuevo({});
  await b.ctx.quizasRafaga('chequeo');
  await tick();
  check('cuenta gratis con prueba: los disparadores automáticos SÍ arrancan una ráfaga', b.tabsCreados.length === 1 && b.storageLocal.rafaga.disparador === 'chequeo');
  check('la extensión le avisa al servidor que sabe de la prueba (?prueba=1): sin eso, el servidor no la deja correr sola', b.fetchLlamadas.some(l => /estado-automatico\?prueba=1$/.test(l.url)), b.fetchLlamadas.map(l => l.url));

  b = await nuevo({});
  let r = await b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  check('"Ponerme al día ahora" NO existe en el plan gratis, ni durante la prueba: "sin_plan" y no abre nada', r.ok === false && r.motivo === 'sin_plan' && b.tabsCreados.length === 0, r);

  r = await b.enviarMensajeAsync({ type: 'ESTADO_PONERSE_AL_DIA' });
  check('el popup no muestra el botón durante la prueba (mostrar: false)…', r.mostrar === false, r);
  check('…pero sí cuántas lleva: en_curso, 3 restantes de 5', !!r.prueba && r.prueba.estado === 'en_curso' && r.prueba.restantes === 3 && r.prueba.total === 5, r);

  // ── Prueba gastada: nada corre solo ──
  for (const disparador of ['inicio_chrome', 'despertar', 'chequeo']) {
    b = await nuevo(gastada);
    await b.ctx.quizasRafaga(disparador);
    await tick();
    check('prueba gastada: "' + disparador + '" NO dispara ráfaga (criterio 4 de §4.1)', b.tabsCreados.length === 0 && !b.storageLocal.rafaga, b.tabsCreados.length);
  }
  b = await nuevo(gastada);
  r = await b.enviarMensajeAsync({ type: 'ESTADO_PONERSE_AL_DIA' });
  check('prueba gastada: el popup no muestra el botón, y sí el mensaje de fin de prueba', r.mostrar === false && !!r.prueba && r.prueba.estado === 'terminada' && r.prueba.total === 5, r);
  r = await b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  check('prueba gastada: "Ponerme al día" tampoco (sin_plan)', r.ok === false && r.motivo === 'sin_plan' && b.tabsCreados.length === 0, r);

  // ── Premium y servidores anteriores: nada de la prueba ──
  b = await nuevo({ disponibleEnPlan: true, modo: 'premium', pruebaRestantes: null });
  r = await b.enviarMensajeAsync({ type: 'ESTADO_PONERSE_AL_DIA' });
  check('Premium: el botón sí, y NADA de la prueba (prueba: null) -- criterio 5 de §4.1', r.mostrar === true && r.prueba === null, r);
  b = await nuevo({ disponibleEnPlan: true, modo: undefined, pruebaRestantes: undefined, pruebaTotal: undefined });
  r = await b.enviarMensajeAsync({ type: 'ESTADO_PONERSE_AL_DIA' });
  check('un servidor anterior a la prueba (sin `modo`): no inventa nada (prueba: null)', r.prueba === null, r);
  b = await nuevo({ disponibleEnPlan: true, modo: 'premium', pruebaRestantes: null });
  r = await b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  await tick();
  check('Premium: "Ponerme al día" sigue funcionando igual que antes', r.ok === true && b.tabsCreados.length === 1, r);

  // Sin `pruebaTotal` (no debería pasar) se asume 5.
  b = await nuevo({ pruebaTotal: undefined });
  r = await b.enviarMensajeAsync({ type: 'ESTADO_PONERSE_AL_DIA' });
  check('si el servidor no manda el total, se asume 5', r.prueba && r.prueba.total === 5, r);
});

// ── 16. Activar la postulación desde el panel: una ráfaga de inmediato (§4.1) ──
bloque(async () => {
  const base = {
    busquedaAutomatica: true, disponibleEnPlan: false, motivo: null,
    modo: 'prueba', pruebaRestantes: 5, pruebaTotal: 5,
    objetivos: [{ etiqueta: 'vendedor', peso: 1 }, { etiqueta: 'cajero', peso: 0.5 }],
    plataformasConectadas: ['Trabajando'],
  };
  const conEstado = (cambios) => async (url) => {
    if (/\/api\/account\/estado-automatico/.test(String(url))) return { ok: true, json: async () => ({ ...base, ...cambios }) };
    return { ok: /\/api\/extension\/rafaga/.test(String(url)), json: async () => ({}) };
  };
  const nuevo = async (cambios, opts) => {
    const b = cargarBackgroundJs({ fetchImpl: conEstado(cambios), ...(opts || {}) });
    await tick();
    return b;
  };
  const activar = (b) => b.enviarMensajeAsync({ type: 'ACTIVACION_POSTULACION' });
  const enCurso = (latidoHaceMin, tabActual) => ({
    id: 'r_previa', disparador: 'chequeo', inicio: Date.now() - 40 * 60000, latido: Date.now() - latidoHaceMin * 60000,
    pasos: [{ tipo: 'busqueda', portal: 'Trabajando', url: 'https://www.trabajando.cl/x' }], pasoActual: 0, tabActual,
    conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 }, estado: 'en_curso',
  });

  let b = await nuevo({});
  b.storageLocal.ultimaRafagaFin = Date.now() - 60000; // hace 1 min: dentro del umbral de 3 h Y del enfriamiento de 5 min
  let r = await activar(b);
  await tick();
  check('activar arranca una ráfaga de inmediato, aunque la anterior (en solo observar) terminara hace 1 min', r.ok === true && b.tabsCreados.length === 1, r);
  check('...con disparador "activacion"', b.storageLocal.rafaga.disparador === 'activacion');
  check('...y así se reporta al backend', b.reportesRafaga()[0].body.disparador === 'activacion');
  check('recorre TODOS los objetivos (dos búsquedas), no la mitad', b.storageLocal.rafaga.pasos.filter(p => p.tipo === 'busqueda').length === 2, b.storageLocal.rafaga.pasos);
  check('...sin gastar el contador de ciclos de las automáticas', b.storageLocal.cicloBusquedaAutomatica === undefined, b.storageLocal.cicloBusquedaAutomatica);

  b = await nuevo({});
  await b.ctx.quizasRafaga('chequeo');
  await tick();
  check('control: un chequeo normal recorre solo el objetivo principal (una búsqueda) y cuenta el ciclo', b.storageLocal.rafaga.pasos.filter(p => p.tipo === 'busqueda').length === 1 && b.storageLocal.cicloBusquedaAutomatica === 1, b.storageLocal.rafaga.pasos);

  // ── Si ya hay una corriendo ──
  b = await nuevo({});
  b.storageLocal.rafaga = enCurso(1, 4242); // latido de hace 1 min: viva
  r = await activar(b);
  check('con una ráfaga viva en curso: "en_curso", no abre otra', r.ok === false && r.motivo === 'en_curso' && b.tabsCreados.length === 0, r);
  b = await nuevo({});
  b.storageLocal.rafaga = enCurso(30, 4242); // el worker la perdió
  r = await activar(b);
  await tick();
  check('una "en_curso" que el worker perdió NO bloquea la activación', r.ok === true && b.tabsCreados.length === 1, r);
  check('...y cierra la pestaña huérfana de la vieja', b.removidos.includes(4242));

  // ── Solo si hay algo automático que arrancar (lo decide el servidor, no el panel) ──
  b = await nuevo({ busquedaAutomatica: false, motivo: 'prueba-terminada', modo: 'manual', pruebaRestantes: null });
  r = await activar(b);
  check('prueba gastada: no arranca nada y dice por qué ("prueba_terminada")', r.ok === false && r.motivo === 'prueba_terminada' && b.tabsCreados.length === 0, r);
  b = await nuevo({ busquedaAutomatica: false, motivo: 'pausada' });
  r = await activar(b);
  check('en pausa: "pausada", no arranca', r.ok === false && r.motivo === 'pausada' && b.tabsCreados.length === 0, r);
  b = await nuevo({ objetivos: [], cargoObjetivo: null });
  r = await activar(b);
  check('sin objetivo: "sin_objetivo"', r.ok === false && r.motivo === 'sin_objetivo' && b.tabsCreados.length === 0, r);
  b = await nuevo({ plataformasConectadas: [] });
  r = await activar(b);
  check('sin portales: "sin_portales"', r.ok === false && r.motivo === 'sin_portales' && b.tabsCreados.length === 0, r);
  b = cargarBackgroundJs({ fetchImpl: async () => { throw new Error('sin red'); } });
  await tick();
  r = await activar(b);
  check('sin red: "sin_conexion" (el panel recibe respuesta, no se queda esperando)', r.ok === false && r.motivo === 'sin_conexion', r);
  b = await nuevo({}, { sinToken: true });
  r = await activar(b);
  check('extensión sin conectar: "sin_token"', r.ok === false && r.motivo === 'sin_token', r);

  // ── Premium también: activar es el momento en que dice "sí, actúa" ──
  b = await nuevo({ disponibleEnPlan: true, modo: 'premium', pruebaRestantes: null });
  r = await activar(b);
  await tick();
  check('una cuenta Premium que activa también arranca su ráfaga', r.ok === true && b.storageLocal.rafaga.disparador === 'activacion', r);
});

// ── 17. bridge.js: el evento de la activación (§4.1) ──────────────────────
bloque(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, 'bridge.js'), 'utf8');
  function cargarBridge() {
    const window = new EventTarget();
    const enviados = [];
    const resultados = [];
    const est = { respuesta: undefined, error: null };
    window.addEventListener('autopostula:activacion-resultado', (e) => resultados.push(e.detail));
    const ctx = {
      window, CustomEvent, console,
      document: { documentElement: { dataset: {} } },
      chrome: {
        runtime: {
          getManifest: () => ({ version: '9.9.9' }),
          sendMessage: (m, cb) => { enviados.push(m); cb(est.respuesta); },
          get lastError() { return est.error; },
        },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(fuente, ctx, { filename: 'bridge.js' });
    return { window, enviados, resultados, est };
  }
  const br = cargarBridge();
  br.est.respuesta = { ok: true };
  br.window.dispatchEvent(new CustomEvent('autopostula:activacion'));
  check('el evento del panel se convierte en el mensaje ACTIVACION_POSTULACION', br.enviados.length === 1 && br.enviados[0].type === 'ACTIVACION_POSTULACION', br.enviados);
  check('...que no lleva nada más (la página no le dice a la extensión qué abrir ni qué postular)', Object.keys(br.enviados[0]).join(',') === 'type', br.enviados[0]);
  check('la respuesta vuelve al panel como evento, tal cual', br.resultados.length === 1 && br.resultados[0].ok === true, br.resultados);
  br.est.respuesta = { ok: false, motivo: 'sin_portales' };
  br.window.dispatchEvent(new CustomEvent('autopostula:activacion'));
  check('un rechazo lleva su motivo al panel (el panel lo explica)', br.resultados[1] && br.resultados[1].ok === false && br.resultados[1].motivo === 'sin_portales', br.resultados);
  br.est.respuesta = undefined;
  br.window.dispatchEvent(new CustomEvent('autopostula:activacion'));
  check('si la extensión no contesta: "extension_no_responde" (el panel no queda esperando)', br.resultados[2] && br.resultados[2].motivo === 'extension_no_responde', br.resultados);
  br.est.error = { message: 'Extension context invalidated.' };
  br.est.respuesta = { ok: true };
  br.window.dispatchEvent(new CustomEvent('autopostula:activacion'));
  check('con la extensión recargada (lastError) también', br.resultados[3] && br.resultados[3].ok === false && br.resultados[3].motivo === 'extension_no_responde', br.resultados);
  const pw = cargarBridge();
  pw.window.addEventListener('autopostula:ponerse-al-dia-resultado', (e) => pw.resultados.push(e.detail));
  pw.est.respuesta = { ok: true };
  pw.window.dispatchEvent(new CustomEvent('autopostula:ponerse-al-dia'));
  check('lo que ya existía no se rompió: "ponerse al día" sigue mandando PONERSE_AL_DIA', pw.enviados.length === 1 && pw.enviados[0].type === 'PONERSE_AL_DIA');
});

// ── 18. El popup: la prueba de 5 postulaciones (§4.1) ──────────────────────
bloque(async () => {
  const fuente = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const desde = fuente.indexOf('function haceCuanto(');
  const hasta = fuente.indexOf('// ── Cargar estado');

  function cargarPopup() {
    const ids = ['ponerse-row', 'ponerse-btn', 'ponerse-hint', 'rafaga-row', 'rafaga-titulo', 'rafaga-detalle',
      'prueba-row', 'prueba-titulo', 'prueba-detalle', 'prueba-links', 'prueba-ver', 'prueba-premium'];
    const elementos = {};
    for (const id of ids) {
      const clases = new Set(/-(row|links|detalle)$/.test(id) ? ['hidden'] : []);
      elementos[id] = {
        id, textContent: '', disabled: false, href: '',
        classList: { toggle: (c, f) => { if (f) clases.add(c); else clases.delete(c); }, contains: (c) => clases.has(c) },
      };
    }
    const ctx = {
      Date,
      BACKEND_URL: 'https://autopostula.cl', // es una `const` de arriba del archivo, fuera del bloque que se recorta
      document: { getElementById: (id) => elementos[id] || null },
      chrome: {
        runtime: { sendMessage: () => {}, lastError: null },
        storage: { onChanged: { addListener: () => {} } },
        action: { setBadgeText: () => {} },
      },
    };
    vm.createContext(ctx);
    vm.runInContext(fuente.slice(desde, hasta), ctx, { filename: 'popup.js (bloque de ráfaga)' });
    return { ctx, elementos, oculto: (id) => elementos[id].classList.contains('hidden'), leer: (n) => vm.runInContext(n, ctx) };
  }
  const p = cargarPopup();

  // ── Los textos ──
  check('en curso: "Prueba automática: 3 de 5 postulaciones" (cuántas lleva, no cuántas quedan)', p.ctx.textoPruebaEnCurso(2, 5) === 'Prueba automática: 3 de 5 postulaciones');
  check('recién empezada: 0 de 5', p.ctx.textoPruebaEnCurso(5, 5) === 'Prueba automática: 0 de 5 postulaciones');
  check('un dato raro nunca dibuja "7 de 5" ni un negativo', p.ctx.textoPruebaEnCurso(-2, 5) === 'Prueba automática: 5 de 5 postulaciones' && p.ctx.textoPruebaEnCurso(9, 5) === 'Prueba automática: 0 de 5 postulaciones');
  check('sin prueba (Premium, servidor viejo) no hay texto', p.ctx.textoPrueba(null) === null && p.ctx.textoPrueba(undefined) === null && p.ctx.textoPrueba({ estado: 'algo_raro' }) === null);
  let t = p.ctx.textoPrueba({ estado: 'en_curso', restantes: 2, total: 5 });
  check('en curso: solo el título, sin enlaces ni detalle', t.titulo === 'Prueba automática: 3 de 5 postulaciones' && t.detalle === '' && t.enlaces === null, t);
  t = p.ctx.textoPrueba({ estado: 'terminada', total: 5 });
  check('terminada: el texto del documento', t.titulo === 'Tu prueba terminó: AutoPostula envió 5 postulaciones sin que entraras a ningún portal.', t);
  check('...con las dos salidas (Premium, o entrar a mano a un portal)', t.detalle.includes('Con Premium') && t.detalle.includes('Computrabajo, Laborum o Trabajando'), t.detalle);
  check('...y los dos enlaces: "Ver las 5" (historial filtrado) y "Pasar a Premium"', t.enlaces.length === 2 && t.enlaces[0].texto === 'Ver las 5' && t.enlaces[0].ruta === '/dashboard/historial?filtro=prueba' && t.enlaces[1].texto === 'Pasar a Premium' && t.enlaces[1].ruta === '/dashboard/premium', t.enlaces);

  // ── El render ──
  p.ctx.renderPonerse({ mostrar: false, prueba: { estado: 'en_curso', restantes: 2, total: 5 } });
  check('render: cuenta gratis en prueba: se ve la fila con cuántas lleva, y NO la del botón', !p.oculto('prueba-row') && p.elementos['prueba-titulo'].textContent === 'Prueba automática: 3 de 5 postulaciones' && p.oculto('ponerse-row'));
  check('...sin enlaces ni detalle mientras dura', p.oculto('prueba-links') && p.oculto('prueba-detalle'));
  p.ctx.renderPonerse({ mostrar: false, prueba: { estado: 'terminada', total: 5 } });
  check('render: terminada: título, detalle y enlaces visibles', !p.oculto('prueba-row') && !p.oculto('prueba-links') && !p.oculto('prueba-detalle') && p.elementos['prueba-titulo'].textContent.startsWith('Tu prueba terminó'));
  check('...los enlaces apuntan al panel real: "Ver las 5" filtra el historial, "Pasar a Premium" va a Premium', p.elementos['prueba-ver'].textContent === 'Ver las 5' && p.elementos['prueba-ver'].href === 'https://autopostula.cl/dashboard/historial?filtro=prueba' && p.elementos['prueba-premium'].textContent === 'Pasar a Premium' && p.elementos['prueba-premium'].href === 'https://autopostula.cl/dashboard/premium', [p.elementos['prueba-ver'].href, p.elementos['prueba-premium'].href]);
  p.ctx.renderPonerse({ mostrar: true, bloqueo: null, estimadoMs: 480000, prueba: null });
  check('render: Premium (prueba: null): la fila de la prueba se oculta y el botón se ve', p.oculto('prueba-row') && !p.oculto('ponerse-row'));
  p.ctx.renderPonerse({ mostrar: false });
  check('render: sin datos de prueba, la fila se oculta (y la del botón también)', p.oculto('prueba-row') && p.oculto('ponerse-row'));
  p.ctx.renderPonerse(undefined);
  check('render con la extensión sin contestar (undefined) no revienta y deja todo oculto', p.oculto('prueba-row') && p.oculto('ponerse-row'));

  // ── Son LOS MISMOS textos que el panel y el correo (backend/lib/texto-rafaga.ts) ──
  const ts = fs.readFileSync(path.join(__dirname, '..', 'backend', 'lib', 'texto-rafaga.ts'), 'utf8');
  const plantilla = (nombre) => {
    const i = ts.indexOf('export function ' + nombre);
    const j = ts.indexOf('`', i);
    return ts.slice(j + 1, ts.indexOf('`', j + 1));
  };
  const constante = (nombre) => (ts.match(new RegExp(nombre + '\\s*=\\s*"([^"]*)"')) || [])[1];
  const rellenar = (tpl, vars) => tpl.replace(/\$\{(\w+)\}/g, (_, k) => vars[k]);
  check('"en curso" dice lo mismo en el panel y en el popup', rellenar(plantilla('textoPruebaEnCurso'), { enviadas: 3, total: 5 }) === p.ctx.textoPruebaEnCurso(2, 5), plantilla('textoPruebaEnCurso'));
  check('"terminó" dice lo mismo en el panel y en el popup', rellenar(plantilla('textoPruebaTerminada'), { total: 5 }) === p.ctx.textoPruebaTerminada(5), plantilla('textoPruebaTerminada'));
  check('"Ver las N" dice lo mismo', rellenar(plantilla('textoVerLasDePrueba'), { total: 5 }) === p.ctx.textoVerLasDePrueba(5), plantilla('textoVerLasDePrueba'));
  check('lo que sigue después de la prueba dice lo mismo', constante('TEXTO_DESPUES_DE_LA_PRUEBA') && constante('TEXTO_DESPUES_DE_LA_PRUEBA') === p.leer('TEXTO_DESPUES_DE_LA_PRUEBA'));
  check('"Pasar a Premium" dice lo mismo', constante('TEXTO_PASAR_A_PREMIUM') && constante('TEXTO_PASAR_A_PREMIUM') === p.leer('TEXTO_PASAR_A_PREMIUM'));
  check('"Ver las 5" lleva a la misma ruta del historial', constante('RUTA_VER_LAS_DE_PRUEBA') && constante('RUTA_VER_LAS_DE_PRUEBA') === p.leer('RUTA_VER_LAS_DE_PRUEBA'));
  const historial = fs.readFileSync(path.join(__dirname, '..', 'backend', 'app', 'dashboard', 'historial', 'page.tsx'), 'utf8');
  check('y esa ruta (?filtro=prueba) es la que el historial del panel sabe leer', /get\("filtro"\)\s*===\s*"prueba"/.test(historial));

  // ── El HTML ──
  const html = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
  check('popup.html trae la fila de la prueba con todos sus ids', ['prueba-row', 'prueba-titulo', 'prueba-detalle', 'prueba-links', 'prueba-ver', 'prueba-premium'].every(id => html.includes('id="' + id + '"')));
  check('arranca oculta (una cuenta Premium nunca la ve parpadear)', /class="prueba-row hidden"/.test(html) && /class="prueba-links hidden"/.test(html));
  check('va después del botón y antes del toggle maestro', html.indexOf('id="ponerse-row"') < html.indexOf('id="prueba-row"') && html.indexOf('id="prueba-row"') < html.indexOf('class="master-row"'));
  check('los enlaces abren en pestaña nueva (target="_blank"), como los demás del popup', /id="prueba-ver"\s+target="_blank"/.test(html) && /id="prueba-premium"\s+target="_blank"/.test(html));
});

// ── 19. Los adaptadores: se pregunta antes de CADA postulación y el conteo no miente (§4.1) ──
bloque(async () => {
  for (const [archivo, portal] of [['computrabajo.js', 'Computrabajo'], ['trabajando.js', 'Trabajando']]) {
    const fuente = fs.readFileSync(path.join(__dirname, 'adapters', archivo), 'utf8').replace(/\r\n/g, '\n');
    const marcaInicio = '  AP.procesando = true;\n  let cortado = false;';
    const marcaFin = '    conteos.postular = intentadas;\n    AP.reportarEscaneoTerminado(conteos);\n    return;\n  }\n';
    const desde = fuente.indexOf(marcaInicio);
    const hasta = fuente.indexOf(marcaFin);
    check(archivo + ': el bucle de postulación está donde se espera', desde > 0 && hasta > desde);
    if (!(desde > 0 && hasta > desde)) continue;
    check(archivo + ': ya no queda la consulta única antes del bucle', !/if \(!soloObservar\) \{\s*const verificacion = await AP\.puedePostular/.test(fuente));
    // El texto REAL del bucle, ejecutado con stubs (no una copia reescrita a mano).
    const trozo = fuente.slice(desde, hasta + marcaFin.length);
    const correr = async ({ permitidos, cantidad, soloObservar, sinPanelEn }) => {
      const llamadas = { puede: 0, postular: [], msgs: [], terminado: null, logs: [] };
      const ctx = {
        AP: {
          activo: true, procesando: false, vistos: new Set(),
          puedePostular: async (p) => { llamadas.portal = p; return llamadas.puede++ < permitidos ? { permitido: true, motivo: null } : { permitido: false, motivo: 'prueba_terminada' }; },
          motivoPuedePostular: (m) => 'motivo:' + m,
          reportarEscaneoTerminado: (c) => { llamadas.terminado = { ...c }; },
        },
        soloObservar: !!soloObservar,
        pendientes: Array.from({ length: cantidad }, (_, i) => ({ t: { querySelector: () => ({ href: 'https://portal/oferta-' + (i + 1) + '#x' }) }, id: 'id' + (i + 1), titulo: 'Titulo ' + (i + 1) })),
        conteos: { postular: cantidad, gris: 0, descartar: 0 },
        activar: async (t) => (sinPanelEn && t.querySelector().href.includes('oferta-' + sinPanelEn + '#') ? null : {}),
        postular: async (url, id) => { llamadas.postular.push(id); },
        msg: (texto, color) => llamadas.msgs.push([texto, color]),
        addLog: (e) => llamadas.logs.push(e), sleep: async () => {}, DELAY: 0,
      };
      vm.createContext(ctx);
      const salida = await vm.runInContext('(async function () {\n' + trozo + '\n  return "sigue";\n})()', ctx);
      return { salida, llamadas, ctx };
    };

    let x = await correr({ permitidos: 2, cantidad: 5 });
    check(archivo + ': con cupo para 2 de 5, postula 2 y se corta EN MEDIO al tercero (no al terminar la página)', x.salida !== 'sigue' && x.llamadas.postular.join() === 'id1,id2' && x.llamadas.puede === 3, x.llamadas);
    check(archivo + ': ...pregunta por el portal correcto (' + portal + ')', x.llamadas.portal === portal, x.llamadas.portal);
    check(archivo + ': ...y el conteo dice lo que se postuló (2), no lo que se iba a postular (5)', x.llamadas.terminado && x.llamadas.terminado.postular === 2, x.llamadas.terminado);
    check(archivo + ': ...deja el aviso rojo con el motivo (no se pisa con un resumen alegre)', x.llamadas.msgs.slice(-1)[0][0] === 'motivo:prueba_terminada' && x.llamadas.msgs.slice(-1)[0][1] === '#DC2626', x.llamadas.msgs.slice(-1)[0]);
    check(archivo + ': ...y suelta AP.procesando', x.ctx.AP.procesando === false);

    x = await correr({ permitidos: 0, cantidad: 5 });
    check(archivo + ': sin cupo desde el principio: no postula nada y reporta 0 (antes reportaba las 5 que "iba a" postular)', x.llamadas.postular.length === 0 && x.llamadas.terminado && x.llamadas.terminado.postular === 0, x.llamadas);

    x = await correr({ permitidos: 99, cantidad: 5 });
    check(archivo + ': con cupo para todas: postula las 5 y sigue de largo (a paginar), sin reportar terminado todavía', x.salida === 'sigue' && x.llamadas.postular.length === 5 && x.llamadas.terminado === null && x.llamadas.puede === 5, x.llamadas);
    check(archivo + ': ...una consulta por oferta (5), no una por página', x.llamadas.puede === 5);

    x = await correr({ permitidos: 99, cantidad: 5, soloObservar: true });
    check(archivo + ': en solo observar no pregunta nada ni postula (no hay nada que limitar), y deja constancia de las 5', x.llamadas.puede === 0 && x.llamadas.postular.length === 0 && x.llamadas.logs.length === 5 && x.llamadas.logs.every(l => l.status === 'observado') && x.salida === 'sigue', x.llamadas);

    x = await correr({ permitidos: 99, cantidad: 4, sinPanelEn: 2 });
    check(archivo + ': si el panel del aviso no cargó, esa oferta no se postuló ni cuenta', x.llamadas.postular.join() === 'id1,id3,id4' && x.llamadas.logs.some(l => l.reason === 'Panel no cargó'), x.llamadas);
    x = await correr({ permitidos: 2, cantidad: 4, sinPanelEn: 1 });
    check(archivo + ': si además se corta, el conteo es de lo realmente postulado (una saltada por el panel, una postulada y el corte: cuenta 1)', x.llamadas.terminado && x.llamadas.terminado.postular === x.llamadas.postular.length, x.llamadas);
  }
  // Laborum no cambia: procesa una oferta por pasada, así que ya preguntaba por oferta.
  const laborum = fs.readFileSync(path.join(__dirname, 'adapters', 'laborum.js'), 'utf8');
  check('laborum.js: sigue preguntando antes de navegar a cada oferta (una por pasada), sin tocar', /await AP\.puedePostular\('Laborum'\)/.test(laborum));
});

// ── 20. Lo aprobado en "Por decidir" va primero, en serie, y cuenta (§3.7) ──
bloque(async () => {
  const aprobada = (n) => ({ id: 'd' + n, url: 'https://cl.computrabajo.com/oferta-' + n, titulo: 'Oferta ' + n, plataforma: 'Computrabajo' });
  const estadoBase = {
    busquedaAutomatica: true, disponibleEnPlan: true, motivo: null, modo: 'premium',
    objetivos: [{ etiqueta: 'vendedor', peso: 1 }], plataformasConectadas: ['Trabajando'],
  };
  function servidor({ aprobadas, perfil, estado } = {}) {
    return async (url) => {
      const u = String(url);
      if (/estado-automatico/.test(u)) return { ok: true, json: async () => ({ ...estadoBase, ...(estado || {}) }) };
      if (/\/api\/extension\/perfil/.test(u)) return { ok: true, json: async () => ({ filtrosBusqueda: {}, postulacionHabilitada: true, bandaGrisAprobadas: aprobadas || [], ...(perfil || {}) }) };
      if (/puede-postular/.test(u)) return { ok: true, json: async () => ({ permitido: true, motivo: null, restantes: 10 }) };
      return { ok: /\/api\/extension\/rafaga/.test(u), json: async () => ({}) };
    };
  }
  // Un backend con el orden de todo lo que pasa anotado: cada oferta de la cola
  // ("cola:dN") y cada pestaña que abre la ráfaga ("pestana:...").
  async function nuevo(cfg, { demoraCola, fallaEn, resultados } = {}) {
    const b = cargarBackgroundJs({ fetchImpl: servidor(cfg) });
    await tick();
    b.eventos = [];
    b.aplicadas = [];
    b.alarmas = [];
    b.ctx.applyInTab = async (_url, _titulo, decisionId) => {
      b.eventos.push('cola:' + decisionId);
      b.aplicadas.push(decisionId);
      await tick(demoraCola || 5);
      if (fallaEn === decisionId) throw new Error('la pestaña reventó');
      return (resultados && resultados[decisionId]) || { ok: true, expirada: false };
    };
    const crear = b.ctx.chrome.tabs.create;
    b.ctx.chrome.tabs.create = (o, cb) => { b.eventos.push('pestana:' + o.url); return crear(o, cb); };
    const crearAlarma = b.ctx.chrome.alarms.create;
    b.ctx.chrome.alarms.create = (name, o) => { b.alarmas.push([name, o]); return crearAlarma(name, o); };
    return b;
  }
  const busquedas = (b) => b.eventos.filter(e => e.startsWith('pestana:'));

  // ── El orden: la cola termina ANTES de abrir la primera búsqueda ──
  let b = await nuevo({ aprobadas: [aprobada(1), aprobada(2)] });
  await b.ctx.quizasRafaga('chequeo');
  await tick(150);
  let r = b.storageLocal.rafaga;
  check('con aprobadas por enviar, el PRIMER paso de la ráfaga es "aprobadas"', r.pasos[0].tipo === 'aprobadas' && r.pasos[1].tipo === 'busqueda', r.pasos);
  check('se envían las 2, una a la vez, y solo después se abre la primera búsqueda (nunca dos pestañas a la vez)', JSON.stringify(b.eventos.slice(0, 2)) === '["cola:d1","cola:d2"]' && !!b.eventos[2] && b.eventos[2].startsWith('pestana:') && busquedas(b).length === 1, b.eventos);
  check('...y lo enviado ya cuenta en el resumen de la ráfaga (2 postuladas) antes de buscar nada', r.conteos.postuladas === 2, r.conteos);
  check('...la ráfaga sigue con la búsqueda de ofertas nuevas (paso 2)', r.estado === 'en_curso' && r.pasoActual === 1, { estado: r.estado, paso: r.pasoActual });
  b.enviarMensaje({ type: 'ESCANEO_TERMINADO', conteos: { postular: 3 } }, { tab: { id: r.tabActual } });
  await tick(30);
  r = b.storageLocal.rafaga;
  check('al terminar la búsqueda, el resumen suma las aprobadas y las nuevas (2 + 3)', r.estado === 'terminada' && r.conteos.postuladas === 5, r.conteos);
  check('...y así se reporta al backend (el ícono y la tarjeta del panel no cuentan de menos)', b.reportesRafaga().slice(-1)[0].body.conteos.postuladas === 5, b.reportesRafaga().slice(-1)[0].body);
  check('el bloqueo de suspensión cubre el paso de las aprobadas (se pidió al empezar la ráfaga, no después)', b.power.pedidos.length >= 1 && b.power.liberados >= 1);

  // ── Solo cuenta lo que se envió de verdad ──
  b = await nuevo({ aprobadas: [aprobada(1), aprobada(2), aprobada(3)] }, { resultados: { d2: { ok: false, expirada: false }, d3: { ok: false, expirada: true } } });
  await b.ctx.quizasRafaga('chequeo');
  await tick(150);
  check('de 3 aprobadas, solo cuenta la que se envió (las otras no: una falló, otra expiró)', b.storageLocal.rafaga.conteos.postuladas === 1, b.storageLocal.rafaga.conteos);
  check('...y la que ya no existe se marca expirada en el backend, como antes (no se reintenta para siempre)', b.fetchLlamadas.some(l => /banda-gris-expirada/.test(l.url) && JSON.parse(l.init.body).decisionId === 'd3'));

  // ── Sin aprobadas, todo como siempre ──
  b = await nuevo({ aprobadas: [] });
  await b.ctx.quizasRafaga('chequeo');
  await tick(50);
  check('sin aprobadas por enviar NO hay paso de aprobadas: la ráfaga abre la búsqueda directo', b.storageLocal.rafaga.pasos.length === 1 && b.storageLocal.rafaga.pasos[0].tipo === 'busqueda' && b.aplicadas.length === 0, b.storageLocal.rafaga.pasos);

  // ── Todos los disparadores ──
  b = await nuevo({ aprobadas: [aprobada(1)], estado: { disponibleEnPlan: false, modo: 'prueba', pruebaRestantes: 5, pruebaTotal: 5 } });
  let x = await b.enviarMensajeAsync({ type: 'ACTIVACION_POSTULACION' });
  await tick(100);
  check('la ráfaga de activación (cuenta en prueba) también manda primero lo aprobado', x.ok === true && b.storageLocal.rafaga.pasos[0].tipo === 'aprobadas' && b.aplicadas.join() === 'd1', b.storageLocal.rafaga.pasos);
  b = await nuevo({ aprobadas: [aprobada(1)] });
  x = await b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  await tick(100);
  check('y "Ponerme al día ahora" también', x.ok === true && b.storageLocal.rafaga.pasos[0].tipo === 'aprobadas', x);

  // ── Solo observar: la oferta aprobada no se envía, y no se abren pestañas para nada ──
  b = await nuevo({ aprobadas: [aprobada(1), aprobada(2)] });
  b.storageLocal.config = { soloObservar: true };
  await b.ctx.quizasRafaga('chequeo');
  await tick(50);
  check('en solo observar no se encola nada (DO_APPLY lo rechazaría) y la ráfaga sigue con su búsqueda', b.aplicadas.length === 0 && b.storageLocal.rafaga.pasos.every(p => p.tipo === 'busqueda'), { aplicadas: b.aplicadas, pasos: b.storageLocal.rafaga.pasos });
  b = await nuevo({ aprobadas: [aprobada(1)], perfil: { postulacionHabilitada: false } });
  await b.ctx.quizasRafaga('chequeo');
  await tick(50);
  check('con la cuenta en modo prueba (postulacionHabilitada: false) tampoco', b.aplicadas.length === 0 && b.storageLocal.rafaga.pasos.every(p => p.tipo === 'busqueda'), b.aplicadas);

  // ── Sin nada que buscar, lo aprobado igual se envía (no depende de tener objetivo ni portales) ──
  b = await nuevo({ aprobadas: [aprobada(1)], estado: { objetivos: [], cargoObjetivo: null } });
  x = await b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  await tick(50);
  check('sin objetivo: no hay ráfaga (sin_objetivo) pero lo aprobado se envía igual, como antes', x.ok === false && x.motivo === 'sin_objetivo' && b.aplicadas.join() === 'd1' && !b.storageLocal.rafaga, x);
  b = await nuevo({ aprobadas: [aprobada(1)], estado: { plataformasConectadas: [] } });
  x = await b.enviarMensajeAsync({ type: 'PONERSE_AL_DIA' });
  await tick(50);
  check('sin portales conectados: igual', x.ok === false && x.motivo === 'sin_portales' && b.aplicadas.join() === 'd1', x);

  // ── Una cola que ya arrancó otro camino (abrir Chrome, el panel) ──
  b = await nuevo({ aprobadas: [aprobada(1), aprobada(2)] }, { demoraCola: 40 });
  x = await b.enviarMensajeAsync({ type: 'APROBAR_PENDIENTES' });
  check('control: el panel arranca la cola por su cuenta', x.ok === true && x.encoladas === 2, x);
  await b.ctx.quizasRafaga('chequeo');
  await tick(250);
  check('si la cola ya estaba en proceso, la ráfaga espera a ESA (cada oferta se envía UNA vez, no dos)', b.aplicadas.join() === 'd1,d2', b.aplicadas);
  check('...y la búsqueda solo abre después de que la cola terminó', b.eventos.indexOf('cola:d2') < b.eventos.findIndex(e => e.startsWith('pestana:')) && busquedas(b).length === 1, b.eventos);
  check('...y lo que envió esa cola también cuenta en la ráfaga', b.storageLocal.rafaga.conteos.postuladas === 2, b.storageLocal.rafaga.conteos);

  // ── El seguro de tiempo escala con la cola, y no hace avanzar dos veces ──
  b = await nuevo({ aprobadas: [aprobada(1), aprobada(2), aprobada(3)] }, { demoraCola: 60 });
  await b.ctx.quizasRafaga('chequeo');
  await tick(20);
  const seguros = b.alarmas.filter(([n]) => n === 'autopostula-rafaga-seguro');
  check('el seguro de tiempo del paso de aprobadas suma un minuto por oferta (8 + 3 = 11), para no cortar una cola larga', seguros.length >= 1 && seguros[0][1].delayInMinutes === 11, seguros);
  for (const fn of b.onAlarmListeners) fn({ name: 'autopostula-rafaga-seguro' }); // el seguro se dispara con la cola todavía en proceso
  await tick(20);
  check('si el seguro se dispara antes de tiempo, la ráfaga sigue con su búsqueda (y lo anota como error)', b.storageLocal.rafaga.pasoActual === 1 && b.storageLocal.rafaga.conteos.errores === 1 && busquedas(b).length === 1, b.storageLocal.rafaga);
  await tick(300);
  check('...y cuando la cola por fin termina, NO hace avanzar el paso otra vez (una sola búsqueda, paso 2 de 2)', b.storageLocal.rafaga.pasoActual === 1 && busquedas(b).length === 1 && b.storageLocal.rafaga.estado === 'en_curso', { paso: b.storageLocal.rafaga.pasoActual, busquedas: busquedas(b).length });

  // ── Un fallo a la mitad no deja la cola trabada ──
  b = await nuevo({ aprobadas: [aprobada(1), aprobada(2)] }, { fallaEn: 'd1' });
  await b.ctx.quizasRafaga('chequeo');
  await tick(150);
  check('una oferta que revienta no se lleva a las demás: la d2 se envía igual y solo esa cuenta', b.aplicadas.join() === 'd1,d2' && b.storageLocal.rafaga.conteos.postuladas === 1, { aplicadas: b.aplicadas, conteos: b.storageLocal.rafaga.conteos });
  check('...la ráfaga sigue con su búsqueda, sin marcar error (una oferta que falla no es una búsqueda que no terminó)', b.storageLocal.rafaga.conteos.errores === 0 && busquedas(b).length === 1 && b.storageLocal.rafaga.pasoActual === 1, b.storageLocal.rafaga);
  check('...y la que falló se puede volver a encolar (no queda marcada "en cola" para siempre)', vm.runInContext('decisionesEnCola.has("d1")', b.ctx) === false);
  b.ctx.applyInTab = async (_u, _t, id) => { b.aplicadas.push('reintento:' + id); return { ok: true }; };
  const nuevas = vm.runInContext('encolarAprobadas([{ id: "dZ", url: "https://x/oferta-z", titulo: "Z", plataforma: "Computrabajo" }])', b.ctx);
  const enviadas = await vm.runInContext('processQueue()', b.ctx);
  check('...y la cola sigue funcionando después (antes, una excepción la dejaba "ocupada" para siempre)', nuevas === 1 && enviadas === 1 && b.aplicadas.includes('reintento:dZ'), { nuevas, enviadas });

  // Una excepción que SÍ escapa del bucle (aquí forzada en la consulta de puede-postular)
  // tampoco deja la cola "ocupada": la siguiente vuelta corre.
  b = await nuevo({ aprobadas: [] });
  b.ctx.puedePostularBackend = async () => { throw new Error('forzado'); };
  vm.runInContext('encolarAprobadas([{ id: "dQ", url: "https://x/q", titulo: "Q", plataforma: "Computrabajo" }])', b.ctx);
  let rechazo = null;
  try { await vm.runInContext('processQueue()', b.ctx); } catch (e) { rechazo = e; }
  b.ctx.puedePostularBackend = async () => ({ permitido: true, motivo: null, restantes: 1 });
  vm.runInContext('encolarAprobadas([{ id: "dR", url: "https://x/r", titulo: "R", plataforma: "Computrabajo" }])', b.ctx);
  const despues = await Promise.race([vm.runInContext('processQueue()', b.ctx).then(n => n, () => 'rechazada de nuevo'), new Promise((ok) => setTimeout(() => ok('colgada'), 300))]);
  check('una excepción que escapa de la cola no la deja "ocupada" para siempre: la vuelta siguiente corre', rechazo !== null && despues === 1, { rechazo: rechazo && rechazo.message, despues });

  // Si la cola entera falla (no una oferta), el paso cuenta como error y la ráfaga sigue.
  b = await nuevo({ aprobadas: [aprobada(1)] });
  b.ctx.processQueue = () => Promise.reject(new Error('reventó todo'));
  await b.ctx.quizasRafaga('chequeo');
  await tick(150);
  check('si la cola falla entera, el paso cuenta como error y la ráfaga sigue con la búsqueda', b.storageLocal.rafaga.conteos.errores === 1 && busquedas(b).length === 1 && b.storageLocal.rafaga.pasoActual === 1, b.storageLocal.rafaga);

  // applyInTab real: si Chrome no puede abrir la pestaña, no se cuelga.
  b = cargarBackgroundJs({ fetchImpl: servidor({}) });
  await tick();
  b.ctx.chrome.tabs.create = (_o, cb) => cb(undefined);
  const res = await Promise.race([vm.runInContext('applyInTab("https://x/oferta", "t", "d1")', b.ctx), new Promise((ok) => setTimeout(() => ok('colgada'), 300))]);
  check('si no se puede abrir la pestaña, applyInTab responde (antes se colgaba y dejaba la cola trabada)', res && res.success === false && res.expirada === false, res);

  // ── Lo que ya existía: sin ráfaga, las aprobadas se envían igual ──
  b = await nuevo({ aprobadas: [aprobada(1), aprobada(2)] });
  x = await b.enviarMensajeAsync({ type: 'APROBAR_PENDIENTES' });
  await tick(60);
  check('sin ráfaga (el panel o abrir Chrome), las aprobadas se envían igual, sin abrir ninguna búsqueda', x.ok === true && b.aplicadas.join() === 'd1,d2' && busquedas(b).length === 0 && !b.storageLocal.rafaga, { x, eventos: b.eventos });
});

const tope = setTimeout(() => {
  console.error('✗ tiempo agotado: algún bloque de prueba nunca terminó');
  process.exit(1);
}, 20000);

Promise.all(bloques)
  .catch((e) => { fallos++; console.error('✗ un bloque de prueba lanzó una excepción:', e); })
  .then(() => {
    clearTimeout(tope);
    console.log('\n' + (fallos === 0 ? '✓ Todo OK' : '✗ ' + fallos + ' fallo(s)'));
    process.exit(fallos === 0 ? 0 : 1);
  });
