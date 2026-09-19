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
