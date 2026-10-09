// ═══════════════════════════════════════════════════════════════
//  AutoPostula — background.js v2
// ═══════════════════════════════════════════════════════════════
'use strict';

// Las comunas de Chile con su región (la misma tabla que usa el scorer en las
// páginas): la búsqueda automática la necesita para saber si la persona busca
// en una comuna o en toda una región (ver ubicacionDeBusqueda).
importScripts('data/comunas-cl.js');

console.log('[AP] background.js cargado', new Date().toLocaleTimeString());

// Mismo dominio que host_permissions/content_scripts en manifest.json --
// si cambia, actualizar ambos archivos juntos.
const BACKEND_URL = 'https://autopostula.cl';

let queue = [];
// La cola en proceso, o null si no hay ninguna. processQueue() devuelve esta
// misma promesa mientras haya una: quien quiera esperar a que se vacíe (el primer
// paso de la ráfaga, docs/rafagas-y-ponerse-al-dia.md §3.7) espera lo mismo, la
// haya arrancado quien la haya arrancado (el panel, abrir Chrome, el chequeo).
let drenando = null;
// docs/revision-2026-09-16.md §2.9: una aprobación puede llegar por tres
// caminos a la vez (el panel, la ráfaga, el chequeo periódico) -- sin esto la
// misma oferta se abriría y postularía dos veces.
const decisionesEnCola = new Set();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Encola las aprobadas de banda gris que todavía no están en la cola. Devuelve
// cuántas quedaron nuevas.
// Las del panel de revisión del portal traen además `origenTab` (a qué pestaña
// contarle el avance) y `revisar` (mostrarla antes de enviarla).
function encolarAprobadas(aprobadas) {
  let nuevas = 0;
  for (const item of aprobadas || []) {
    if (!item.url) continue;
    if (decisionesEnCola.has(item.id)) {
      // Ya estaba en la cola (la trajo otro camino): que igual se le cuente al panel.
      const enCola = queue.find((q) => q.decisionId === item.id);
      if (enCola && item.origenTab != null) enCola.origenTab = item.origenTab;
      continue;
    }
    decisionesEnCola.add(item.id);
    queue.push({
      url: item.url, titulo: item.titulo, decisionId: item.id, plataforma: item.plataforma,
      origenTab: item.origenTab != null ? item.origenTab : null, revisar: !!item.revisar,
    });
    nuevas++;
  }
  return nuevas;
}

// docs/panel-de-revision-en-el-portal.md §2.2: el panel de la pestaña desde
// donde se pidió muestra cómo va cada una. Si esa pestaña ya no está, no pasa nada.
function avisarPanel(item, estado) {
  if (!item || item.origenTab == null || !item.decisionId) return;
  try {
    chrome.tabs.sendMessage(item.origenTab, { type: 'PROGRESO_REVISION', decisionId: item.decisionId, estado }, () => {
      void chrome.runtime.lastError;
    });
  } catch (e) { /* la pestaña se cerró */ }
}

function processQueue() {
  if (drenando) return drenando;
  if (!queue.length) return Promise.resolve(0);
  // finally: si algo revienta a la mitad, la cola no queda "ocupada" para siempre.
  drenando = vaciarCola().finally(() => { drenando = null; });
  return drenando;
}

// Devuelve cuántas de esas ofertas se enviaron de verdad -- es lo que se suma al
// resumen de la ráfaga. La respuesta de DO_APPLY es { ok, expirada } (lo que
// devuelve postular() del adaptador); `success` solo aparece en las negativas de
// core.js, y se acepta por si alguna versión lo usa.
async function vaciarCola() {
  let enviadas = 0;
  while (queue.length) {
    const item = queue.shift();
    // §1.3: lo aprobado a mano también respeta el tope del mes y el portal
    // conectado -- antes de abrir nada. Sin cupo se corta todo (lo que quede
    // sigue aprobado en el backend y se reintenta en el próximo ciclo); si es
    // solo ese portal, se salta esa oferta y se sigue con las demás.
    if (item.decisionId && item.plataforma) {
      const verificacion = await puedePostularBackend(item.plataforma);
      if (!verificacion.permitido) {
        decisionesEnCola.delete(item.decisionId);
        if (verificacion.motivo === 'limite') {
          avisarPanel(item, 'sin_cupo');
          queue.forEach((q) => {
            if (q.decisionId) decisionesEnCola.delete(q.decisionId);
            avisarPanel(q, 'sin_cupo');
          });
          queue = [];
          break;
        }
        avisarPanel(item, 'no_enviada');
        continue;
      }
    }
    avisarPanel(item, 'enviando');
    let resultado;
    try {
      resultado = await applyInTab(urlParaPostular(item.url, item.plataforma), item.titulo, item.decisionId, item.url, item.revisar);
    } catch (e) {
      // Una oferta que revienta no debe llevarse a las demás ni dejar la cola
      // trabada: se sigue con la siguiente, y esta queda pendiente para el próximo ciclo.
      console.warn('[AP] Falló al enviar una oferta aprobada:', e);
    }
    if (item.decisionId) decisionesEnCola.delete(item.decisionId);
    const enviada = !!(resultado && (resultado.ok === true || resultado.success === true));
    if (enviada) enviadas++;
    avisarPanel(item, enviada ? 'enviada' : resultado && resultado.expirada ? 'expirada' : 'no_enviada');
    if (item.decisionId) {
      // §8.4/§8.6: si la oferta aprobada en banda gris ya no existe, no tiene
      // botón de postular o ya estaba postulada, se marca EXPIRADA en vez de
      // reintentarla para siempre en cada ciclo -- "silencio ahí sería peor
      // que el error".
      if (resultado && resultado.expirada) {
        marcarBandaGrisExpirada(item.decisionId);
        await olvidarIntentosAprobada(item.decisionId);
      } else if (enviada) {
        await olvidarIntentosAprobada(item.decisionId);
      } else if (!(resultado && resultado.soloObservar) && (await anotarIntentoFallidoAprobada(item.decisionId))) {
        // docs/revision-2026-09-28.md §6: cualquier otra falla (la pestaña no
        // respondió, se saltó en la revisión, faltó un dato...) se reintentaba
        // sin fin; y como el servidor entregaba siempre las 5 más antiguas,
        // cinco así bloqueaban todas las aprobaciones nuevas. Tres intentos y se cierra.
        marcarBandaGrisExpirada(item.decisionId);
      }
    }
    await sleep(5000);
  }
  return enviadas;
}

// docs/revision-2026-09-28.md §6: intentos fallidos de cada aprobada, en
// chrome.storage (sobrevive a que el service worker se duerma).
const MAX_INTENTOS_APROBADA = 3;

async function anotarIntentoFallidoAprobada(decisionId) {
  const { intentosAprobadas } = await chrome.storage.local.get('intentosAprobadas');
  const intentos = intentosAprobadas || {};
  const n = (intentos[decisionId] || 0) + 1;
  if (n >= MAX_INTENTOS_APROBADA) {
    delete intentos[decisionId];
    await chrome.storage.local.set({ intentosAprobadas: intentos });
    return true;
  }
  intentos[decisionId] = n;
  await chrome.storage.local.set({ intentosAprobadas: intentos });
  return false;
}

async function olvidarIntentosAprobada(decisionId) {
  const { intentosAprobadas } = await chrome.storage.local.get('intentosAprobadas');
  if (!intentosAprobadas || !(decisionId in intentosAprobadas)) return;
  delete intentosAprobadas[decisionId];
  await chrome.storage.local.set({ intentosAprobadas });
}

async function marcarBandaGrisExpirada(decisionId) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/banda-gris-expirada', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó marcar expirada la banda gris:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red marcando banda gris expirada:', e);
  }
}

// Computrabajo: en la página suelta de un aviso, "Postularme" lleva a otra
// página (candidato.cl.computrabajo.com/match/?oi=...) y la pestaña pierde el
// hilo: ninguna aprobada de "Por decidir" llegaba a enviarse (verificado el
// 2026-10-01, docs/extension-laborum-2026-10-01.md §10). El mismo aviso abierto
// en el panel de un listado ("trabajo-de-{palabra}#ID", como queda al elegir
// una oferta en una búsqueda) postula en la misma página, igual que el escaneo.
// El panel lo carga el sitio por el ID, aunque el aviso no esté en ese listado.
function urlParaPostular(url, plataforma) {
  if (plataforma !== 'Computrabajo') return url;
  const limpia = String(url || '').split('#')[0];
  const id = (limpia.match(/-([A-F0-9]{32})$/i) || [])[1];
  if (!id) return url;
  const palabra = (limpia.match(/\/oferta-de-trabajo-de-([a-z0-9]+)-/i) || [])[1] || 'vendedor';
  return 'https://cl.computrabajo.com/trabajo-de-' + palabra.toLowerCase() + '#' + id.toUpperCase();
}

// decisionId presente = viene de una aprobación de banda gris (§8.6): se le
// pasa al content script en el mensaje DO_APPLY para que la postulación
// resultante quede enlazada a esa decisión (ver reportarPostulacionBackend).
// Devuelve { success, expirada } -- si la pestaña nunca contestó (cerrada,
// sin content script, o timeout de seguridad) no se marca nada, queda
// pendiente para el siguiente ciclo en vez de asumir que expiró.
// docs/revision-2026-09-28.md §5: el tope era de 35 s desde que se abría la
// pestaña. Una postulación con formulario (la IA sola puede tardar hasta 25 s,
// más la carga del portal) podía quedar cortada a la mitad, y con "Revisar
// antes de enviar" no alcanzaba nunca: la pestaña se cerraba antes de que la
// persona viera el panel. Ahora el tope base es más holgado y, mientras el
// panel de revisión esté abierto (REVISION_EN_CURSO), se alarga.
const TOPE_APROBADA_MS = 90 * 1000;
const TOPE_EN_REVISION_MS = 4 * 60 * 1000;
const TOPE_TRAS_REVISION_MS = 60 * 1000;
// Pestañas de aprobadas abiertas ahora: tabId → { alargar(ms) }.
const pestanasDeAprobadas = new Map();

// `urlOferta` es la dirección del aviso, la que queda en la postulación; `url`
// es la que se abre (ver urlParaPostular). `revisar`: se muestra antes de
// enviarla aunque la cuenta no tenga "Revisar antes de enviar" (la primera
// del panel de revisión cuando la cuenta recién empieza a postular).
function applyInTab(url, titulo, decisionId, urlOferta, revisar) {
  return new Promise(resolve => {
    chrome.tabs.create({ url, active: false }, tab => {
      // Sin pestaña no hay nada que esperar: antes esto reventaba adentro del
      // callback y la promesa no se resolvía nunca, dejando la cola colgada.
      if (chrome.runtime.lastError || !tab) { resolve({ success: false, expirada: false }); return; }
      const id = tab.id;
      let terminado = false;
      let seguro = null;
      const terminar = (res) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(seguro);
        pestanasDeAprobadas.delete(id);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(id, () => { if (chrome.runtime.lastError) {} });
        resolve(res);
      };
      // Timeout de seguridad, que la revisión puede alargar.
      const armarSeguro = (ms) => {
        clearTimeout(seguro);
        seguro = setTimeout(() => terminar({ success: false, expirada: false }), ms);
      };
      const onUpdated = (tabId, info) => {
        if (tabId !== id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        setTimeout(() => {
          chrome.tabs.sendMessage(id, { type: 'DO_APPLY', decisionId, url: urlOferta || url, revisar: !!revisar }, res => {
            if (chrome.runtime.lastError) { /* tab cerrada o sin content script */ }
            setTimeout(() => terminar(res || { success: false, expirada: false }), 3500);
          });
        }, 3000);
      };
      pestanasDeAprobadas.set(id, { alargar: armarSeguro });
      chrome.tabs.onUpdated.addListener(onUpdated);
      armarSeguro(TOPE_APROBADA_MS);
    });
  });
}

// ── El panel de revisión en una pestaña de fondo (docs/revision-2026-09-28.md §5) ──
//
// Las pestañas que abre la extensión (el paso de una ráfaga, una aprobada de
// "Por decidir") se abren de fondo. Con "Revisar antes de enviar", el panel
// aparecía ahí sin que nadie lo viera: la ráfaga lo saltaba a los 3 minutos y
// la aprobada se cerraba antes. Cuando el panel se abre, la pestaña pasa al
// frente (y la ventana avisa en la barra de tareas, sin robar el foco de otra
// aplicación); cuando se cierra, vuelve la pestaña que la persona estaba
// mirando. Mientras está abierto, los seguros de tiempo se alargan.
// Las pestañas que abrió la persona no se tocan: ya las está mirando.
const pestanaAnteriorPorRevision = new Map();

async function atenderRevision(sender, enCurso) {
  const tab = sender && sender.tab;
  if (!tab || tab.id == null) return;
  const { rafaga } = await chrome.storage.local.get('rafaga');
  const esDeRafaga = !!(rafaga && rafaga.estado === 'en_curso' && rafaga.tabActual === tab.id);
  const aprobada = pestanasDeAprobadas.get(tab.id);
  if (!esDeRafaga && !aprobada) return;

  if (enCurso) {
    if (aprobada) aprobada.alargar(TOPE_EN_REVISION_MS);
    if (esDeRafaga) {
      const alarma = await chrome.alarms.get(NOMBRE_ALARMA_SEGURO_RAFAGA);
      if (!alarma || !alarma.scheduledTime || alarma.scheduledTime - Date.now() < TOPE_EN_REVISION_MS) {
        chrome.alarms.create(NOMBRE_ALARMA_SEGURO_RAFAGA, { delayInMinutes: TOPE_EN_REVISION_MS / 60000 });
      }
      rafaga.latido = Date.now();
      await chrome.storage.local.set({ rafaga });
    }
    if (!tab.active && !pestanaAnteriorPorRevision.has(tab.id)) {
      try {
        const [activa] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
        pestanaAnteriorPorRevision.set(tab.id, activa ? activa.id : null);
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { drawAttention: true });
      } catch (e) {
        console.warn('[AP] No se pudo traer al frente la pestaña con la revisión:', e);
      }
    }
    return;
  }

  if (aprobada) aprobada.alargar(TOPE_TRAS_REVISION_MS);
  if (esDeRafaga) chrome.alarms.create(NOMBRE_ALARMA_SEGURO_RAFAGA, { delayInMinutes: SEGURO_MINUTOS_POR_PASO });
  const anterior = pestanaAnteriorPorRevision.get(tab.id);
  pestanaAnteriorPorRevision.delete(tab.id);
  if (anterior != null) {
    try {
      await chrome.tabs.update(anterior, { active: true });
    } catch (e) { /* la persona ya la cerró */ }
  }
}

// ── Latido mientras se postula (docs/extension-trabajando-2026-09-30.md) ──
// Una postulación con preguntas (abrir el formulario, la IA, rellenar,
// enviar) en una pestaña de fondo puede pasar del minuto y medio, y los
// seguros de tiempo cerraban la pestaña a la mitad: 90 s la de una aprobada de
// "Por decidir", 8 min el paso de una ráfaga (que ahora encuentra cientos de
// ofertas y postula a varias). El content script avisa en cada etapa
// (AP.latido, core.js) y acá el seguro vuelve a contar desde cero. Si la
// pestaña se cuelga, deja de avisar y el seguro la cierra igual.
async function atenderLatido(sender) {
  const tab = sender && sender.tab;
  if (!tab || tab.id == null) return;
  const aprobada = pestanasDeAprobadas.get(tab.id);
  if (aprobada) aprobada.alargar(TOPE_APROBADA_MS);
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!(rafaga && rafaga.estado === 'en_curso' && rafaga.tabActual === tab.id)) return;
  // Nunca acorta un seguro más largo (el de una revisión abierta, 4 min).
  const alarma = await chrome.alarms.get(NOMBRE_ALARMA_SEGURO_RAFAGA);
  if (!alarma || !alarma.scheduledTime || alarma.scheduledTime - Date.now() < SEGURO_MINUTOS_POR_PASO * 60000) {
    chrome.alarms.create(NOMBRE_ALARMA_SEGURO_RAFAGA, { delayInMinutes: SEGURO_MINUTOS_POR_PASO });
  }
  rafaga.latido = Date.now();
  await chrome.storage.local.set({ rafaga });
}

// ── Llamadas a la IA del backend (con nuestra key, no la del usuario) ──
// Mismo motivo que reportarPostulacionBackend: corre acá porque el background
// tiene privilegios de extensión y no lo bloquea CORS.
const RUTA_POR_TIPO = {
  clasificar_ofertas: '/api/ai/clasificar-ofertas',
  analizar_oferta: '/api/ai/analizar-oferta',
  responder_pregunta: '/api/ai/responder-pregunta',
  procesar_postulacion: '/api/ai/procesar-postulacion'
};

async function llamarIABackend(tipo, payload) {
  const ruta = RUTA_POR_TIPO[tipo];
  if (!ruta) return null;

  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — la IA no está disponible');
    return null;
  }

  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), 25000);

  try {
    const res = await fetch(BACKEND_URL + ruta, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controlador.signal
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn('[AP] IA rechazada por el backend (' + tipo + '):', data.error || res.status);
      return { error: data.error || ('Error ' + res.status) };
    }

    return data;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.warn('[AP] Timeout de 25s llamando a la IA del backend (' + tipo + ') — el service worker probablemente se durmió o la petición nunca llegó al servidor.');
      return { error: 'La IA no respondió a tiempo (timeout)' };
    }
    console.warn('[AP] Error de red llamando a la IA del backend (' + tipo + '):', e);
    return { error: 'Error de red: ' + e.message };
  }
}

// ── ¿Se puede postular ahora? (límites y portal conectado) ─────
// docs/revision-2026-09-16.md §1.3: se consulta ANTES de cada "Postulando:"
// en los tres adaptadores -- antes solo se sabía que el tope o el portal no
// calzaban DESPUÉS de haber postulado de verdad en el sitio externo (el 403/400
// de /api/applications llega recién ahí). Si esto falla (sin token, sin red,
// backend caído) se responde permitido:true -- /api/applications sigue
// validando lo mismo después, como defensa en profundidad; esta consulta solo
// evita el intento inútil, no es la única barrera.
//
// `origen` = 'rafaga' cuando la pestaña que va a postular la abrió una ráfaga
// (esPestanaDeRafaga): el servidor suma el motivo 'prueba_terminada' (docs/
// rafagas-y-ponerse-al-dia.md §4.1). Sin `origen` (la persona entrando a mano a
// un portal) el chequeo es el de siempre.
async function puedePostularBackend(plataforma, origen) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { permitido: true, motivo: null, restantes: null };

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/puede-postular?plataforma=' + encodeURIComponent(plataforma) + (origen ? '&origen=' + encodeURIComponent(origen) : ''), {
      headers: { 'Authorization': 'Bearer ' + autopostulaToken }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[AP] puede-postular rechazado por el backend:', data.error || res.status);
      return { permitido: true, motivo: null, restantes: null };
    }
    return data;
  } catch (e) {
    console.warn('[AP] Error de red consultando puede-postular:', e);
    return { permitido: true, motivo: null, restantes: null };
  }
}

// ── ¿Ya postulé a esto? (docs/revision-2026-09-16.md §2.8) ─────
// Devuelve { duplicados: [{ indice, fecha }] } para las ofertas que ya se
// postularon en los últimos 30 días con otro id. Cualquier falla responde sin
// duplicados: el filtro local del mismo escaneo sigue rigiendo.
async function duplicadosBackend(plataforma, ofertas) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken || !Array.isArray(ofertas) || !ofertas.length) return { duplicados: [] };

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/duplicados', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plataforma, ofertas }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[AP] duplicados rechazado por el backend:', data.error || res.status);
      return { duplicados: [] };
    }
    return data;
  } catch (e) {
    console.warn('[AP] Error de red consultando duplicados:', e);
    return { duplicados: [] };
  }
}

// ── Actualizar estado de postulación (visto/en proceso/etc) ────
async function actualizarEstadoBackend(datos) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — no se actualizó el estado');
    return { error: 'Sin token' };
  }

  try {
    const res = await fetch(BACKEND_URL + '/api/applications/status', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(datos)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn('[AP] Backend rechazó actualización de estado:', data.error || res.status);
      return { error: data.error || ('Error ' + res.status) };
    }

    return data;
  } catch (e) {
    console.warn('[AP] Error de red actualizando estado:', e);
    return null;
  }
}

// docs/revision-2026-09-16.md §2.9: un "Sí" en "Por decidir" se enviaba solo
// dentro de escanearAutomatico(), que termina de entrada si el plan no permite
// búsqueda automática (plan gratis, o Premium en pausa): la aprobación no se
// enviaba nunca y nadie se enteraba. Esto la saca de ahí -- el panel avisa por
// bridge.js y se postula lo aprobado, con o sin búsqueda automática. Solo
// depende de tener la extensión conectada y de que la cuenta pueda postular.
//
// Las URLs no viajan en el evento del panel: la extensión pide sus aprobadas al
// backend con su propio token, así que la página no puede mandarle ninguna
// dirección para que la abra.
async function procesarAprobadas() {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { ok: false, motivo: 'sin_token' };

  const { bandaGrisAprobadas } = await actualizarFiltrosDesdeBackend(autopostulaToken);
  if (!bandaGrisAprobadas.length) return { ok: true, encoladas: 0 };

  // "Solo observar" (o cuenta en modo prueba, §1.2): la aprobación no se
  // envía todavía -- DO_APPLY se niega por dentro. Se avisa ahora en vez de
  // abrir pestañas para nada.
  const { config } = await chrome.storage.local.get('config');
  if (config && (config.soloObservar || config.postulacionHabilitada === false)) {
    return { ok: false, motivo: 'solo_observar' };
  }

  const nuevas = encolarAprobadas(bandaGrisAprobadas);
  processQueue();
  return { ok: true, encoladas: nuevas, pendientes: bandaGrisAprobadas.length };
}

// ── Búsqueda automática en background (premium) ─────────────────
// Requiere el permiso "alarms" en manifest.json.
const NOMBRE_ALARMA_AUTOMATICA = 'autopostula-scan';
// docs/rafagas-y-ponerse-al-dia.md §3.1: ya no es "el" disparador -- ahora es
// la red de seguridad detrás de abrir Chrome (onStartup) y de que el
// computador despierte (que Chrome ya resuelve solo, disparando la alarma
// perdida). 60 min en vez de 120: si los otros dos disparadores fallan por
// lo que sea, la espera máxima se reduce a la mitad.
const INTERVALO_MINUTOS = 60;

// docs/rafagas-y-ponerse-al-dia.md §2.1: el código de nivel superior de un
// service worker MV3 vuelve a correr CADA VEZ que Chrome lo despierta -- un
// mensaje, una pestaña abierta, el popup -- no solo al instalar la extensión
// o al abrir el navegador. Como chrome.alarms.create() con el mismo nombre
// REEMPLAZA la alarma existente, crearla acá sin condición reiniciaba el
// reloj a 120 minutos en cada despertar: mientras la persona usa los
// portales (que despierta el worker seguido), la alarma nunca llegaba a
// dispararse -- justo cuando más sentido tendría que corriera.
// chrome.alarms.get() primero hace que esto sea idempotente: si la alarma ya
// existe, no se la toca, así que un despertar de más no le resetea el reloj.
async function asegurarAlarma() {
  try {
    const existente = await chrome.alarms.get(NOMBRE_ALARMA_AUTOMATICA);
    if (!existente) {
      await chrome.alarms.create(NOMBRE_ALARMA_AUTOMATICA, { periodInMinutes: INTERVALO_MINUTOS });
    }
  } catch (e) {
    console.error('[AP] No se pudo asegurar la alarma de búsqueda automática (¿falta el permiso "alarms"?):', e);
  }
}
chrome.runtime.onInstalled.addListener(asegurarAlarma);
chrome.runtime.onStartup.addListener(asegurarAlarma);
// Además de los dos eventos de arriba: cubre el caso en que el worker
// despierta por cualquier otro motivo (mensaje, pestaña) sin que ninguno de
// los dos haya disparado antes -- es seguro llamarla siempre, es idempotente.
asegurarAlarma();

// ── Monedas por hora de uso (backend/lib/monedas.ts) ────────────
// 1 moneda por cada hora de reloj con la extensión encendida (no en pausa) y
// conectada a una cuenta. Se revisa cada 15 minutos y cada vez que el worker
// despierta, pero solo se avisa una vez por hora: el resto de las revisiones
// no salen de chrome.storage. La hora que vale la decide el servidor, y si el
// panel ya ganó la moneda de esa hora, este aviso no suma otra.
const NOMBRE_ALARMA_USO = 'autopostula-uso';
const MINUTOS_ENTRE_REVISIONES_USO = 15;

async function avisarHoraDeUso() {
  try {
    const hora = new Date().toISOString().slice(0, 13);
    const { active, ultimaHoraUso } = await chrome.storage.local.get(['active', 'ultimaHoraUso']);
    if (ultimaHoraUso === hora || active !== true) return;
    const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
    if (!autopostulaToken) return;
    const res = await fetch(BACKEND_URL + '/api/extension/latido', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken },
    });
    if (res.ok) await chrome.storage.local.set({ ultimaHoraUso: hora });
  } catch (e) {
    // Sin red: se reintenta en la próxima revisión.
  }
}

async function asegurarAlarmaUso() {
  try {
    const existente = await chrome.alarms.get(NOMBRE_ALARMA_USO);
    if (!existente) await chrome.alarms.create(NOMBRE_ALARMA_USO, { periodInMinutes: MINUTOS_ENTRE_REVISIONES_USO });
  } catch (e) {
    console.error('[AP] No se pudo asegurar la alarma de horas de uso:', e);
  }
}
// Idempotente, como asegurarAlarma(): crearla sin mirar reiniciaría su reloj
// en cada despertar del worker.
asegurarAlarmaUso();
avisarHoraDeUso();

// docs/rafagas-y-ponerse-al-dia.md §3.2, punto 5: si el worker se reinicia a
// mitad de una ráfaga (Chrome lo mata por memoria, un crash), retomarORafagaInterrumpida
// evita que quede "en_curso" para siempre -- eso bloquearía cualquier ráfaga
// futura (iniciarRafaga se niega a pisar una que ya está en_curso) y dejaría
// la pestaña huérfana abierta. Mismos disparadores que asegurarAlarma: es
// igual de seguro llamarla en cada despertar, no hace nada si no hay ráfaga
// en curso o si su latido es reciente.
chrome.runtime.onInstalled.addListener(retomarORafagaInterrumpida);
chrome.runtime.onStartup.addListener(retomarORafagaInterrumpida);
retomarORafagaInterrumpida();

// docs/rafagas-y-ponerse-al-dia.md §3.1, disparador "se abre Chrome" -- antes
// no existía nada acá. A diferencia de asegurarAlarma/retomarORafagaInterrumpida
// (que sí se llaman en cada despertar del worker porque son inofensivas si no
// corresponde), esto SOLO va colgado de onStartup: onStartup dispara de
// verdad cuando arranca el navegador, no en cualquier despertar del worker
// (un mensaje de un content script, una pestaña) -- colgarlo de más lados
// abriría una ráfaga cada vez que la persona simplemente navega un portal.
chrome.runtime.onStartup.addListener(() => quizasRafaga('inicio_chrome'));

// §2.9: lo que se aprobó en el panel desde un celular, o con la extensión
// apagada, se envía la próxima vez que Chrome abre -- no depende del plan ni
// de la ráfaga. Es la respuesta a "se enviará cuando abras AutoPostula en tu
// computador".
chrome.runtime.onStartup.addListener(() => { procesarAprobadas().catch(() => {}); });

function normalizarParaUrl(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Comunas de la Región Metropolitana (verificado en vivo el 2026-09-04 contra
// Laborum). Computrabajo acepta el slug de cualquier comuna directo, sin
// necesitar la región (probado con nunoa, chillan y providencia). Laborum en
// cambio SÍ exige el prefijo de región para poder filtrar por comuna, y el
// único prefijo verificado es el de la RM -- por eso esta lista solo cubre RM
// (la región de cada comuna sí está en la tabla de data/comunas-cl.js, que
// usa ubicacionDeBusqueda más abajo).
const COMUNAS_RM = new Set([
  'santiago centro', 'las condes', 'providencia', 'maipu', 'quilicura',
  'huechuraba', 'la florida', 'pudahuel', 'san bernardo', 'nunoa', 'colina',
  'puente alto', 'estacion central', 'cerrillos', 'lo barnechea', 'macul',
  'la reina', 'vitacura', 'lampa', 'san miguel', 'independencia', 'renca',
  'recoleta', 'quinta normal', 'penalolen', 'conchali', 'el bosque',
  'la cisterna', 'san joaquin', 'pedro aguirre cerda', 'talagante',
  'penaflor', 'lo espejo', 'melipilla', 'la granja', 'cerro navia', 'buin',
  'la pintana', 'padre hurtado', 'san ramon', 'calera de tango', 'el monte',
  'lo prado', 'pirque', 'isla de maipo', 'paine', 'curacavi', 'maria pinto',
  'san jose de maipo', 'alhue',
]);

function comunaParaUrl(comuna) {
  return comuna.trim().replace(/\s+/g, '-');
}

function sinTildes(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ── Dónde buscar en cada portal (verificado en vivo el 2026-09-30) ──────────
// Antes los tres portales buscaban en filtros.comunas[0] y nada más. Con
// "toda la región", el perfil compilado trae todas las comunas de la región
// (más sus variantes sin tilde y abreviaturas) en orden alfabético, así que
// la búsqueda automática pedía, por ejemplo, "vendedor en Alhué": 0 ofertas en
// los tres portales, contra 431 (Trabajando), 1.274 (Computrabajo, part time)
// y 328 (Laborum, part time) en toda la Región Metropolitana. Y con varias
// comunas elegidas a mano, solo se buscaba en la primera. Ahora:
//   una sola comuna              -> esa comuna, como antes
//   varias comunas de una región -> la región, en el portal que la tiene
//   comunas de varias regiones   -> sin ubicación (el scorer igual descarta
//                                   las comunas que no se pidieron)
// Las variantes de una misma comuna cuentan como una: sin tilde ("estación
// central"/"estacion central") y las abreviaturas que la tabla trae como
// entradas propias ("e. central", "pac", "stgo"; ver esAbreviaturaDe). Remoto
// no tiene comuna: sin ubicación, como antes.
// Devuelve { comuna, region } (comuna sin tildes), { region } o null.
function ubicacionDeBusqueda(filtros) {
  if (!filtros || filtros.modalidad === 'remoto') return null;
  const tabla = (self.AP && self.AP.COMUNAS_CL) || [];
  // Un mismo nombre puede estar en dos regiones ("pinto": O'Higgins y Ñuble).
  const regionesDe = new Map();
  for (const c of tabla) {
    const clave = sinTildes(c.nombre);
    if (!regionesDe.has(clave)) regionesDe.set(clave, new Set());
    regionesDe.get(clave).add(c.region);
  }
  const claves = new Set();
  for (const nombre of filtros.comunas || []) {
    const clave = sinTildes(nombre);
    if (regionesDe.has(clave)) claves.add(clave);
  }
  const comunas = [...claves].filter(c => ![...claves].some(otra => otra !== c && esAbreviaturaDe(c, otra)));
  if (!comunas.length) return null;
  // La región que tienen todas en común (si hay una sola).
  const comunes = [...regionesDe.get(comunas[0])].filter(r => comunas.every(c => regionesDe.get(c).has(r)));
  const region = comunes.length === 1 ? comunes[0] : null;
  if (comunas.length === 1) return { comuna: comunas[0], region };
  return region ? { region } : null;
}

// La tabla de comunas trae abreviaturas como entradas propias, sin decir de
// cuál son ("stgo" es santiago, "pac" pedro aguirre cerda, "e. central"
// estación central, "pto montt" puerto montt). Una abreviatura tiene un punto
// o una palabra corta (hasta 4 letras) que el nombre completo no tiene, empieza
// con la misma letra que él y todas sus letras aparecen, en orden, dentro de
// él. Sin la primera condición, "lanco" pasaba por abreviatura de "lago ranco"
// (son dos comunas de Los Ríos); y el comienzo palabra por palabra tampoco es
// abreviatura: "chillan" y "chillan viejo" son comunas distintas.
function esAbreviaturaDe(corta, larga) {
  if (larga.startsWith(corta + ' ')) return false;
  const palabrasLarga = larga.split(/\s+/);
  const pareceAbreviatura = corta.includes('.') ||
    corta.split(/[\s.]+/).some(p => p && p.length <= 4 && !palabrasLarga.includes(p));
  if (!pareceAbreviatura) return false;
  const a = corta.replace(/[^a-z]/g, '');
  const b = larga.replace(/[^a-z]/g, '');
  if (!a || a.length >= b.length || a[0] !== b[0]) return false;
  let i = 0;
  for (const letra of b) if (letra === a[i]) i++;
  return i === a.length;
}

// La región como la escribe cada portal, sacada de sus propios filtros.
// Trabajando: el parámetro ?region= usa su id interno (API de ubicaciones
// del sitio; RM = 1 da las mismas 431 ofertas que "Metropolitana de
// Santiago", Valparaíso = 6 da 81).
const REGION_TRABAJANDO = {
  AP: 473, TA: 2, AN: 3, AT: 4, CO: 5, VA: 6, RM: 1, OH: 7,
  ML: 8, NB: 556, BI: 9, AR: 10, LR: 472, LL: 11, AI: 12, MA: 13,
};
// Computrabajo: los enlaces de su filtro "Región". No tiene Ñuble: las
// ofertas de Chillán las pone en Bíobío.
const REGION_COMPUTRABAJO = {
  AP: 'arica-y-parinacota', TA: 'tarapaca', AN: 'antofagasta', AT: 'atacama',
  CO: 'coquimbo', VA: 'valparaiso', RM: 'rmetropolitana', OH: 'libertador-b-o-higgins',
  ML: 'maule', NB: 'biobio', BI: 'biobio', AR: 'araucania', LR: 'los-rios',
  LL: 'los-lagos', AI: 'aisen-del-gral-c-ibanez-del-campo', MA: 'magallanes-y-antartica-chilena',
};
// Laborum: solo la RM está verificada (en-region-metropolitana/). Los nombres
// simples de las demás ("en-valparaiso", "en-araucania", "en-nuble") dan 0
// ofertas, así que fuera de la RM se busca sin ubicación.

// Un builder de URL por portal — mismo cargoObjetivo, distinta forma de armar
// la búsqueda en cada sitio. Si sumas un portal nuevo más adelante, agrégalo
// acá (y agrega su adaptador correspondiente en extension/adapters/).
//
// Facets del portal (docs/rediseno-filtrado-ofertas.md, §4, Capa 0): cada oferta
// que el propio portal filtra es una que nunca se scrapea ni se puntúa. Verificado
// a mano contra los sitios reales el 2026-09-04 (reemplaza una verificación
// anterior del 2026-09-03 que había quedado incompleta -- Computrabajo SÍ
// tiene facet de modalidad, y Laborum SÍ tiene URLs navegables para sus
// filtros; solo tardan ~1-2s en reflejarse tras un click en la UI porque la
// SPA le pega primero a su API interna y recién después actualiza la URL):
// - Computrabajo: comuna va directa como slug (-en-{comuna}), sin necesitar
//   región. Modalidad: -en-remoto / -hibrido (presencial = sin sufijo).
//   Jornada part time: -jornada-part-time. Se combinan agregándolo todo al
//   final, en cualquier orden.
// - Laborum: comuna SÍ necesita el prefijo de región (en-{región}/{comuna}/),
//   por eso acá el facet de comuna solo cubre RM (ver COMUNAS_RM). Modalidad:
//   segmento -modalidad-{remoto|hibrido}- antes de -busqueda-. Jornada:
//   segmento -{full-time|part-time}- antes de -busqueda-. Si van los dos
//   juntos el ORDEN IMPORTA -- jornada primero, modalidad después
//   (empleos-part-time-modalidad-remoto-busqueda-{slug}.html); al revés el
//   sitio no reconoce la URL y hasta pierde el término de búsqueda.
const URL_BUSQUEDA_POR_PORTAL = {
  'Computrabajo': (slug, filtros) => {
    let url = 'https://cl.computrabajo.com/trabajo-de-' + slug;
    // Remoto no tiene una comuna real asociada -- ubicacionDeBusqueda no
    // devuelve ninguna y no se combinan ambos facets.
    const donde = ubicacionDeBusqueda(filtros);
    if (donde && donde.comuna) url += '-en-' + comunaParaUrl(donde.comuna);
    else if (donde && REGION_COMPUTRABAJO[donde.region]) url += '-en-' + REGION_COMPUTRABAJO[donde.region];
    if (filtros) {
      if (filtros.modalidad === 'remoto') url += '-en-remoto';
      else if (filtros.modalidad === 'hibrido') url += '-hibrido';
      if (filtros.jornada === 'part_time') url += '-jornada-part-time';
    }
    return url;
  },
  'Laborum': (slug, filtros) => {
    let prefijo = '';
    const donde = ubicacionDeBusqueda(filtros);
    if (donde && donde.comuna && COMUNAS_RM.has(donde.comuna)) {
      prefijo = 'en-region-metropolitana/' + comunaParaUrl(donde.comuna) + '/';
    } else if (donde && donde.region === 'RM') {
      prefijo = 'en-region-metropolitana/';
    }
    let archivo = 'empleos-';
    if (filtros && filtros.jornada === 'part_time') archivo += 'part-time-';
    else if (filtros && filtros.jornada === 'full_time') archivo += 'full-time-';
    if (filtros && filtros.modalidad === 'remoto') archivo += 'modalidad-remoto-';
    else if (filtros && filtros.modalidad === 'hibrido') archivo += 'modalidad-hibrido-';
    archivo += 'busqueda-' + slug + '.html';
    return 'https://www.laborum.cl/' + prefijo + archivo;
  },
  // Verificado en vivo el 2026-09-08: la comuna va como ?ubicacion={slug}
  // (funciona igual para cualquier comuna de Chile, no solo RM), y el
  // 2026-09-30: la región como ?region={id} (ver REGION_TRABAJANDO). El filtro
  // de "Jornadas" del sitio (que ahí mezcla jornada y modalidad en una sola
  // lista) corre contra su propia API interna sin reflejarse en la URL --
  // no se inventa un parámetro que no existe, se deja sin ese facet acá.
  'Trabajando': (slug, filtros) => {
    let url = 'https://www.trabajando.cl/trabajo-empleo/' + slug;
    const donde = ubicacionDeBusqueda(filtros);
    if (donde && donde.comuna) url += '?ubicacion=' + comunaParaUrl(donde.comuna);
    else if (donde && REGION_TRABAJANDO[donde.region]) url += '?region=' + REGION_TRABAJANDO[donde.region];
    return url;
  },
};

// ── Un solo estado, el de la cuenta (docs/estrategia-y-rediseno.md §6) ──
//
// Hasta esta versión, "activo", "solo observar" y "revisar antes de enviar"
// vivían solo en el chrome.storage de este navegador. Al pasar a la cuenta hay
// que subir una vez lo que la persona ya tenía puesto acá: si no, alguien que
// dejó su extensión en "solo observar" se la encontraría postulando sola
// después de actualizar. Se hace una sola vez por navegador, y el servidor
// solo llena lo que la cuenta todavía no tiene dicho -- dos computadores con
// configuraciones distintas no se pisan, gana el primero que sube.
const CLAVE_MIGRACION_ESTADO = 'estadoMigradoV1';

async function migrarEstadoLocalAlServidor(token) {
  const guardado = await chrome.storage.local.get([CLAVE_MIGRACION_ESTADO, 'config', 'active']);
  if (guardado[CLAVE_MIGRACION_ESTADO]) return;
  const cfg = guardado.config || {};
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/estado', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        migrar: {
          // Solo cuenta el apagado explícito: que este navegador diga "activo"
          // no puede reanudar lo que la persona pausó desde el panel.
          pausada: guardado.active === false,
          soloObservar: !!cfg.soloObservar,
          revisarAntes: !!cfg.modoRevision,
          info: Array.isArray(cfg.info) ? cfg.info : [],
        },
      }),
    });
    // Un 404 (backend viejo) también cierra la migración: no hay a dónde
    // subirlo y reintentarlo en cada ráfaga solo gasta red.
    if (res.ok || res.status === 404) await chrome.storage.local.set({ [CLAVE_MIGRACION_ESTADO]: true });
  } catch (e) {
    // Sin conexión: se reintenta la próxima vez que se sincronice el perfil.
    console.warn('[AP] No se pudo subir el estado guardado en este navegador:', e);
  }
}

// Cambia el estado en la cuenta (lo usa el popup: pausar, reanudar, solo
// observar). Devuelve el estado nuevo, o null si no se pudo.
async function cambiarEstadoBackend(cambio) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return null;
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/estado', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(cambio),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.estado) await aplicarEstadoLocal(data.estado);
    return data.estado || null;
  } catch (e) {
    console.warn('[AP] No se pudo cambiar el estado en la cuenta:', e);
    return null;
  }
}

// "Empezar a postular", en la tarjeta del final de la página
// (docs/primera-busqueda-guiada.md §11): activa la postulación en la cuenta, con
// las mismas reglas que el panel (objetivo confirmado y perfil compilado), y
// deja la config local y las pestañas de los portales con el estado nuevo. Si
// la cuenta no cumple, devuelve el motivo para mostrarlo en la tarjeta.
async function empezarAPostularBackend() {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { ok: false, error: 'Conecta la extensión con tu cuenta desde tu panel.' };
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/estado', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ empezarAPostular: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.estado) {
      return { ok: false, error: data.error || 'No se pudo activar ahora. Puedes hacerlo desde tu panel.' };
    }
    await aplicarEstadoLocal(data.estado);
    const { config } = await chrome.storage.local.get('config');
    return { ok: true, config: config || null, recienActivada: !!data.recienActivada };
  } catch (e) {
    console.warn('[AP] No se pudo activar la postulación desde el portal:', e);
    return { ok: false, error: 'No pudimos conectar con AutoPostula. Revisa tu conexión e inténtalo de nuevo.' };
  }
}

// ── El panel de revisión del portal (docs/panel-de-revision-en-el-portal.md §2.2) ──
// La persona marcó en el panel a cuáles postular y apretó el botón. Si la
// cuenta solo miraba, apretar es "Empezar a postular": se activa con las mismas
// reglas que el panel web, y la primera se muestra antes de enviarla. Las
// decisiones quedan en el servidor con su puntaje y sus razones, y lo marcado
// entra a la misma cola que las aprobadas de "Por decidir": revisa el cupo
// antes de cada una, la abre en otra pestaña y le cuenta el avance al panel.
async function postularElegidas(msg, sender) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { ok: false, error: 'Conecta la extensión con tu cuenta desde tu panel.' };
  const ofertas = Array.isArray(msg && msg.ofertas) ? msg.ofertas.slice(0, 300) : [];
  if (!ofertas.some((o) => o && o.elegida)) return { ok: false, error: 'Marca al menos una oferta.' };

  const { config } = await chrome.storage.local.get('config');
  const soloMiraba = !!(config && (config.soloObservar || config.postulacionHabilitada === false));
  let configNueva = null;
  if (soloMiraba) {
    const activacion = await empezarAPostularBackend();
    if (!activacion.ok) return { ok: false, error: activacion.error };
    configNueva = activacion.config;
  }

  let registro;
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/revision', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plataforma: msg.plataforma, ofertas }),
    });
    registro = await res.json().catch(() => ({}));
    if (!res.ok || !registro.ok) {
      return { ok: false, error: registro.error || 'No se pudo guardar lo que elegiste. Inténtalo de nuevo.', config: configNueva };
    }
  } catch (e) {
    console.warn('[AP] No se pudo registrar el panel de revisión:', e);
    return { ok: false, error: 'No pudimos conectar con AutoPostula. Revisa tu conexión e inténtalo de nuevo.', config: configNueva };
  }

  const origenTab = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
  const aEnviar = (registro.aEnviar || []).filter((d) => d && d.decisionId && d.url);
  encolarAprobadas(aEnviar.map((d, i) => ({
    id: d.decisionId, url: d.url, titulo: d.titulo, plataforma: d.plataforma,
    origenTab, revisar: soloMiraba && i === 0,
  })));
  processQueue();
  return {
    ok: true,
    encoladas: aEnviar.map((d) => ({ decisionId: d.decisionId, externalId: d.externalId })),
    pesoReducido: !!registro.pesoReducido,
    primeraConRevision: soloMiraba && aEnviar.length > 0,
    config: configNueva,
  };
}

// Arregla una respuesta desde el panel de revisión (más corta / más formal /
// más cercana). El content script no puede llamar al backend con el token: lo
// guarda el service worker.
async function reescribirRespuestaBackend(datos) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { error: 'Conecta tu cuenta para usar esto' };
  try {
    const res = await fetch(BACKEND_URL + '/api/ai/reescribir-respuesta', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(datos || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'No se pudo arreglar ahora' };
    return { texto: data.texto };
  } catch (e) {
    return { error: 'Sin conexión: puedes editarla tú' };
  }
}

// Guarda en la cuenta un dato que la IA dijo que faltaba (§6): la próxima vez
// ya lo tiene y no vuelve a dejar la respuesta a medias.
async function guardarDatoBackend(texto) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { ok: false };
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/estado', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agregarInfo: texto }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    // Que quede también en la config local: el próximo formulario de esta
    // misma sesión ya responde con el dato, sin esperar la próxima sincronización.
    if (Array.isArray(data.infoAdicional)) {
      const { config } = await chrome.storage.local.get('config');
      await chrome.storage.local.set({ config: { ...(config || {}), info: data.infoAdicional } });
    }
    // Y a la pestaña que lo guardó: su copia de la config se cargó al abrir y
    // no se entera sola. Así la próxima oferta de la misma página ya lo usa.
    return { ok: true, infoAdicional: Array.isArray(data.infoAdicional) ? data.infoAdicional : null };
  } catch (e) {
    return { ok: false };
  }
}

// "Agregar a mi perfil" desde el aviso del escaneo: suma la comuna a la
// búsqueda en la cuenta (/api/extension/ubicacion) y baja el perfil de nuevo,
// así el scorer de esta misma sesión ya no descarta esa comuna. La config
// fresca vuelve en la respuesta para la pestaña que lo pidió.
async function agregarComunaBackend(comuna) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { ok: false, error: 'Conecta la extensión con tu cuenta para guardar esto.' };
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/ubicacion', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + autopostulaToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agregarComuna: comuna }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false };
    await actualizarFiltrosDesdeBackend(autopostulaToken);
    const { config } = await chrome.storage.local.get('config');
    return { ok: true, comuna: data.comuna, yaEstaba: !!data.yaEstaba, config: config || null };
  } catch (e) {
    return { ok: false };
  }
}

// Deja la config local igual a lo que dice la cuenta y avisa a las pestañas de
// los portales que estén abiertas, para que el cambio se note sin recargar.
async function aplicarEstadoLocal(estado) {
  const { config } = await chrome.storage.local.get('config');
  const nueva = {
    ...(config || {}),
    active: !estado.pausada,
    soloObservar: !!estado.soloObservar,
    modoRevision: !!estado.revisarAntes,
    postulacionHabilitada: estado.postulacionHabilitada !== false,
  };
  await chrome.storage.local.set({ config: nueva, active: !estado.pausada });
  const tabs = await chrome.tabs.query({
    url: [
      '*://*.computrabajo.com/*', '*://*.computrabajo.cl/*',
      '*://*.laborum.cl/*', '*://*.trabajando.cl/*',
    ],
  });
  tabs.forEach((t) => chrome.tabs.sendMessage(t.id, { type: 'CONFIG_UPDATED', config: nueva }).catch(() => {}));
}

// Trae los filtros de búsqueda (palabras, modalidad, jornada) del dashboard y
// los guarda en la config local, para que la búsqueda automática los use aunque
// el popup nunca se haya abierto para refrescarlos.
async function actualizarFiltrosDesdeBackend(token) {
  // Antes de leer el estado de la cuenta, subir una sola vez lo que este
  // navegador tenía guardado (§6): si no, lo que la persona puso en el popup
  // se perdería en silencio en la primera sincronización.
  await migrarEstadoLocalAlServidor(token);
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/perfil', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return { filtros: null, bandaGrisAprobadas: [] };
    const data = await res.json();
    if (!data.filtrosBusqueda) return { filtros: null, bandaGrisAprobadas: [] };

    // El perfil compilado (§5 del rediseño) es más rico que los filtros viejos
    // -- si ya existe, sus modalidad/jornada/comunas mandan sobre los viejos.
    // Si el usuario todavía no compiló un perfil, se sigue usando lo de
    // siempre para no dejar la búsqueda automática sin facets.
    const perfilCompilado = data.scorer && data.scorer.perfilCompilado;
    const filtros = {
      modalidad: (perfilCompilado && perfilCompilado.modalidad) || data.filtrosBusqueda.modalidad || 'cualquiera',
      jornada: (perfilCompilado && perfilCompilado.jornada) || data.filtrosBusqueda.jornada || 'cualquiera',
      // Facets de portal (§4, Capa 0): solo se usa la primera comuna
      // configurada -- pedirle al portal varias comunas a la vez no es un
      // facet real en ninguno de los dos sitios: el scorer (§6) sigue
      // evaluando las demás client-side de todas formas.
      comunas: (perfilCompilado && perfilCompilado.ubicacion && perfilCompilado.ubicacion.comunas) || [],
    };

    const { config } = await chrome.storage.local.get('config');
    await chrome.storage.local.set({
      config: {
        ...(config || {}),
        incTags: data.filtrosBusqueda.palabrasIncluir || [],
        excTags: data.filtrosBusqueda.palabrasExcluir || [],
        filtrosBusqueda: filtros,
        // Scorer local (§6) -- se refresca acá también (no solo al abrir el
        // popup) para que la búsqueda automática use el perfil compilado más
        // reciente sin depender de que alguien haya abierto el popup antes.
        scorer: data.scorer || (config && config.scorer) || null,
        // §1.2: el interruptor de la cuenta se activa desde el panel web. Si
        // acá no se refrescara, la extensión seguiría en modo prueba hasta que
        // alguien abriera el popup -- justo lo que nunca pasa en una ráfaga.
        // `!== false`, como en el popup: un backend viejo que no lo manda no
        // debe dejar a nadie en modo prueba.
        postulacionHabilitada: data.postulacionHabilitada !== false,
        // docs/estrategia-y-rediseno.md §6: el estado manda desde la cuenta.
        // Hasta acá, "solo observar" y "revisar antes de enviar" vivían en el
        // chrome.storage de este navegador y nadie más los conocía: la misma
        // persona veía una cosa en el popup y otra en el panel. Un backend que
        // todavía no manda `estado` deja lo que ya había guardado.
        ...(data.estado ? {
          soloObservar: !!data.estado.soloObservar,
          modoRevision: !!data.estado.revisarAntes,
          active: !data.estado.pausada,
        } : {}),
        ...(Array.isArray(data.infoAdicional) ? { info: data.infoAdicional } : {}),
        // El perfil con el que la IA responde los formularios. Lo guardaba el
        // popup (construirConfig, `perfil: perfilRemoto || {}`); 9896a68 movio
        // el estado a la cuenta y le quito esa tarea al popup, pero nadie se
        // la dio a esta funcion. Desde entonces config.perfil quedo congelado
        // en la ultima foto que alcanzo a tomar el popup: lo que la persona
        // completara despues en el panel -- su pretension de renta, por
        // ejemplo -- no lo veia nunca, y la IA lo reportaba como dato
        // faltante dejando la postulacion a medias.
        //
        // Las claves son las de PerfilIA (backend/lib/contexto-ia.ts), que no
        // se llaman igual que las del endpoint: mapearlas mal deja el campo
        // vacio en el prompt sin ningun error visible.
        perfilActualizadoEn: Date.now(),
        perfil: {
          bio: data.resumenProfesional || '',
          nombre: data.nombre || '',
          email: data.email || '',
          tel: data.telefono || '',
          comuna: data.comuna || '',
          cargo: data.cargoObjetivo || '',
          renta: data.expectativaRenta || '',
          disp: data.disponibilidad || '',
        },
      }
    });
    // `active` vive suelto además de dentro de config (así lo lee core.js al
    // arrancar y el popup al abrirse): pausar desde el panel tiene que apagar
    // la extensión aunque nadie abra el popup.
    if (data.estado) await chrome.storage.local.set({ active: !data.estado.pausada });
    // Se devuelve directo (no solo se guarda en storage) para que
    // escanearAutomatico lo pueda pasar de una al builder de URL sin tener que
    // releer el storage que se acaba de escribir acá mismo. bandaGrisAprobadas
    // (§8.6) viaja junto porque sale de la misma llamada a /api/extension/perfil.
    return { filtros, bandaGrisAprobadas: data.bandaGrisAprobadas || [] };
  } catch (e) {
    console.warn('[AP] No se pudieron actualizar los filtros antes de la búsqueda automática:', e);
    return { filtros: null, bandaGrisAprobadas: [] };
  }
}

// docs/rafagas-y-ponerse-al-dia.md §3.1: los tres disparadores automáticos
// (se abre Chrome, despierta, chequeo periódico) pasan todos por acá antes
// de arrancar una ráfaga -- el umbral evita que abrir y cerrar la tapa diez
// veces seguidas dispare diez ráfagas. El botón manual (§3.6, ponerseAlDia
// más abajo) es el único que llama a escanearAutomatico() directo, ignorando
// este umbral a propósito -- por eso el umbral vive acá y no adentro.
const UMBRAL_HORAS_ENTRE_RAFAGAS = 3;

// Cada cuanto, como mucho, se vuelve a bajar el perfil al abrir una pagina de
// un portal. Corto a proposito: la gracia es que un cambio recien hecho en el
// panel se note enseguida, sin convertir cada carga de pagina en una peticion.
const MINUTOS_ENTRE_SINCRONIZACIONES = 5;

async function quizasRafaga(disparador) {
  const { rafaga, ultimaRafagaFin } = await chrome.storage.local.get(['rafaga', 'ultimaRafagaFin']);
  if (rafaga && rafaga.estado === 'en_curso') return; // ya hay una corriendo
  if (ultimaRafagaFin && Date.now() - ultimaRafagaFin < UMBRAL_HORAS_ENTRE_RAFAGAS * 3600e3) return;
  await escanearAutomatico(disparador);
}

async function pedirEstadoAutomatico(token) {
  try {
    // `?prueba=1`: esta extensión sabe marcar qué postulaciones salieron de una
    // ráfaga (desdeRafaga), que es lo que gasta la prueba gratis de §4.1. El
    // servidor solo dice "busca sola" a una cuenta gratis con prueba si el
    // cliente lo pide así -- una versión vieja postularía sin descontar nada.
    const res = await fetch(BACKEND_URL + '/api/account/estado-automatico?prueba=1', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[AP] No se pudo consultar estado automático:', e);
    return null;
  }
}

// docs/objetivo-laboral.md §8: uno o más objetivos, cada uno con su propia
// búsqueda -- no solo el cargoObjetivo del CV. Si el backend todavía no
// manda "objetivos" (versión vieja) o el usuario nunca confirmó ninguno,
// cargoObjetivo sigue funcionando como único objetivo, igual que siempre.
function objetivosDeEstado(estado) {
  return (estado.objetivos && estado.objetivos.length)
    ? estado.objetivos
    : (estado.cargoObjetivo ? [{ etiqueta: estado.cargoObjetivo, peso: 1 }] : []);
}

// El servidor dice POR QUÉ no corre (lib/estado-automatico.ts, con guiones);
// acá se pasa a las claves que usan los textos del popup y del panel. Un
// backend viejo que no manda `motivo` cae a "no_disponible" (texto genérico).
// ('sin-plan' es de un servidor anterior a la prueba de §4.1; ya no lo manda.)
const MOTIVO_DE_SERVIDOR = { 'sin-plan': 'sin_plan', 'prueba-terminada': 'prueba_terminada', 'pausada': 'pausada', 'sin-cupo': 'sin_cupo', 'sin-portales': 'sin_portales' };
function motivoDeEstado(estado) {
  return MOTIVO_DE_SERVIDOR[estado.motivo] || 'no_disponible';
}

// Devuelve { ok: true } si arrancó una ráfaga, o { ok: false, motivo } con la
// razón por la que no -- los disparadores automáticos lo ignoran, pero el
// botón "Ponerme al día ahora" (§3.6) necesita decirle a la persona qué pasó
// en vez de quedarse mudo.
async function escanearAutomatico(disparador) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { ok: false, motivo: 'sin_token' };

  const estado = await pedirEstadoAutomatico(autopostulaToken);
  if (!estado) return { ok: false, motivo: 'sin_conexion' };

  // "Ponerme al día ahora" es de Premium (§4): en el plan gratis no existe, ni
  // siquiera durante la prueba. El botón ya no se ofrece ahí, pero el pedido
  // también llega desde el panel por bridge.js -- la regla se hace cumplir acá.
  if (disparador === 'manual' && !estado.disponibleEnPlan) return { ok: false, motivo: 'sin_plan' };

  // Sin el beneficio del plan (ni prueba por gastar) no hay nada automático que
  // hacer -- ni buscar ofertas nuevas ni postular a lo ya aprobado en banda gris.
  if (!estado.busquedaAutomatica) return { ok: false, motivo: motivoDeEstado(estado) };

  // La búsqueda automática corre en background sin que nadie haya abierto el
  // popup — si no se refresca acá, usaría los filtros de búsqueda que haya
  // cacheados de la última vez (quizás desactualizados). Se actualiza antes
  // de escanear para que siempre respete lo último guardado en la web.
  const { filtros, bandaGrisAprobadas } = await actualizarFiltrosDesdeBackend(autopostulaToken);

  // §8.6: postular lo ya aprobado en banda gris no depende de tener un
  // cargoObjetivo configurado -- cada item ya trae su propia URL concreta,
  // no hace falta armar ninguna búsqueda para llegar a ella.
  //
  // docs/rafagas-y-ponerse-al-dia.md §3.7: lo aprobado en "Por decidir" (sobre todo
  // desde el celular) va PRIMERO -- son decisiones ya tomadas, no se dejan
  // esperando detrás de la búsqueda de ofertas nuevas. Antes se lanzaba a la vez
  // que la primera búsqueda (dos pestañas del mismo portal al mismo tiempo, y lo
  // enviado no contaba en el resumen); ahora es el primer PASO de la ráfaga.
  //
  // En solo observar (o con la cuenta en modo prueba) no se encola: DO_APPLY se
  // niega por dentro, y abrir una pestaña por oferta para que la rechace no sirve
  // de nada.
  const { config: configActual } = await chrome.storage.local.get('config');
  if (!(configActual && (configActual.soloObservar || configActual.postulacionHabilitada === false))) {
    encolarAprobadas(bandaGrisAprobadas);
  }
  // Sin búsqueda que hacer (sin objetivo, sin portales) igual se envía lo
  // aprobado, como siempre: no depende de tener nada configurado.
  const sinBusqueda = (motivo) => { processQueue(); return { ok: false, motivo }; };

  const objetivos = objetivosDeEstado(estado);
  if (!objetivos.length) return sinBusqueda('sin_objetivo');

  const plataformas = estado.plataformasConectadas || [];
  if (!plataformas.length) return sinBusqueda('sin_portales');

  // Con más de un objetivo, el secundario se visita con menos frecuencia que
  // el principal -- "uno de cada dos ciclos" (§8). Sin esto, alguien con 2
  // objetivos × 2 portales pasaría de 2 a 4 pestañas cada 2 horas.
  //
  // "Ponerme al día ahora" es la excepción: la persona pidió ponerse al día
  // con TODO, así que visita todos los objetivos -- si no, la mitad de las
  // veces se saltaría el secundario justo cuando lo pidió a propósito. Y no
  // consume el contador, para no descuadrar la alternancia de las automáticas.
  //
  // La activación (§4.1) hace lo mismo: es el momento en que la persona acaba de
  // decir "sí, actúa", y se le muestra todo lo que busca, no la mitad.
  let objetivosDeEsteCiclo;
  if (disparador === 'manual' || disparador === 'activacion') {
    objetivosDeEsteCiclo = objetivos;
  } else {
    const { cicloBusquedaAutomatica } = await chrome.storage.local.get('cicloBusquedaAutomatica');
    const ciclo = (cicloBusquedaAutomatica || 0) + 1;
    await chrome.storage.local.set({ cicloBusquedaAutomatica: ciclo });
    objetivosDeEsteCiclo = objetivos.filter((_, i) => i === 0 || ciclo % 2 === 0);
  }

  // Se recorren en serie -- una pestaña a la vez -- en vez de abrirlas todas
  // juntas (§8: "cuidado con el volumen... recorrerlas en serie") -- menos
  // carga simultánea sobre el mismo portal, más parecido a como navegaría
  // alguien. Antes esto se espaciaba con setTimeout(45s) encadenados; ahora
  // es la ráfaga (más abajo) la que hace avanzar un paso recién cuando el
  // anterior terminó de verdad, por evento, no por tiempo (§3.2).
  const pasos = [];
  for (const objetivo of objetivosDeEsteCiclo) {
    const slug = normalizarParaUrl(objetivo.etiqueta);
    if (!slug) continue;
    for (const nombre of plataformas) {
      const construirUrl = URL_BUSQUEDA_POR_PORTAL[nombre];
      if (!construirUrl) continue; // portal conectado pero sin adaptador de búsqueda automática todavía
      pasos.push({ tipo: 'busqueda', portal: nombre, url: construirUrl(slug, filtros) });
    }
  }

  // Además de buscar ofertas nuevas, hay que revisar cómo van las que ya se
  // enviaron -- sin esto, "Mis postulaciones" de Computrabajo (Vista, En
  // proceso, Finalista, ...) solo se refrescaba si la persona entraba ahí ella
  // misma con la extensión activa, y las analíticas del dashboard se quedaban
  // pegadas para siempre en ENVIADO. escanearMisPostulaciones() (ver
  // adapters/computrabajo.js) se autodispara sola al cargar esta página.
  if (plataformas.includes('Computrabajo')) {
    // §8.2 (docs/revision-2026-09-16.md): la página real vive en el subdominio
    // "candidato." -- la de cl.computrabajo.com/candidate/match da 404.
    pasos.push({ tipo: 'estados', portal: 'Computrabajo', url: 'https://candidato.cl.computrabajo.com/candidate/match/' });
  }
  // docs/estado-real-de-postulaciones.md §5, paso 5 (ver adapters/laborum.js).
  if (plataformas.includes('Laborum')) {
    pasos.push({ tipo: 'estados', portal: 'Laborum', url: 'https://www.laborum.cl/postulantes/postulaciones' });
  }
  // §5, paso 6 (ver adapters/trabajando.js).
  if (plataformas.includes('Trabajando')) {
    pasos.push({ tipo: 'estados', portal: 'Trabajando', url: 'https://www.trabajando.cl/mis-postulaciones' });
  }

  // Portales conectados pero ninguno con adaptador de búsqueda automática.
  if (!pasos.length) return sinBusqueda('sin_portales');

  // §3.7: lo aprobado, primero. Si ya había una cola en proceso (la arrancó abrir
  // Chrome o el panel), el paso espera a esa misma.
  if (queue.length || drenando) pasos.unshift({ tipo: 'aprobadas' });

  const arranco = await iniciarRafaga(disparador || 'chequeo', pasos);
  return arranco ? { ok: true } : { ok: false, motivo: 'en_curso' };
}

// ── Ráfaga: máquina de estados persistida ────────────────────────
// docs/rafagas-y-ponerse-al-dia.md §2.2/§3.2: encadenar setTimeout para
// espaciar pestañas y otro setTimeout para cerrarlas no sobrevive a que
// Chrome apague el service worker por inactividad entre medio -- ningún
// timer de MV3 tiene esa garantía, y con el worker se pierden los timers
// pendientes sin avisar. Acá el estado vive en chrome.storage.local (sí
// sobrevive un restart del worker) y el avance es por EVENTOS: el content
// script avisa con ESCANEO_TERMINADO cuando de verdad terminó -- escaneó,
// postuló, agotó las páginas --, y chrome.alarms (no setTimeout) es el
// seguro de tiempo por si ese aviso nunca llega, porque las alarmas sí
// sobreviven un restart del worker.
const NOMBRE_ALARMA_SEGURO_RAFAGA = 'autopostula-rafaga-seguro';
const SEGURO_MINUTOS_POR_PASO = 8;

// docs/rafagas-y-ponerse-al-dia.md §3.3: mientras dura la ráfaga, el equipo no
// se suspende por INACTIVIDAD (la persona abre el notebook, se va a hacer otra
// cosa, y la ráfaga termina igual). No evita que se suspenda al cerrar la tapa
// ni al apretar el botón de apagado -- eso lo decide la persona. La pantalla sí
// se apaga: se pide nivel 'system', no 'display'. Requiere el permiso "power".
//
// Tope duro de 25 min con su propia alarma: si la ráfaga se cuelga por un bug,
// la persona no puede quedar con el computador sin poder suspenderse. Al
// vencer el tope se suelta el bloqueo AUNQUE la ráfaga siga.
const NOMBRE_ALARMA_TOPE_RAFAGA = 'autopostula-rafaga-tope';
const TOPE_MINUTOS_RAFAGA = 25;

// Envueltos en try/catch, igual que la alarma: si el permiso "power" llegara
// a faltar en el manifest, chrome.power es undefined y llamarlo tiraría un
// TypeError que tumbaría la ráfaga entera -- que no se suspenda el equipo es
// un extra, no puede impedir que la ráfaga corra.
function mantenerDespierto() {
  try {
    chrome.power.requestKeepAwake('system');
  } catch (e) {
    console.warn('[AP] No se pudo pedir que el equipo no se suspenda (¿falta el permiso "power"?):', e);
  }
}

function soltarDespierto() {
  try {
    chrome.power.releaseKeepAwake();
  } catch (e) {
    console.warn('[AP] No se pudo soltar el bloqueo de suspensión:', e);
  }
}

// Fin de la ráfaga (terminó o quedó interrumpida): soltar el bloqueo y
// desarmar el tope, que ya no tiene nada que vigilar.
function terminarKeepAwake() {
  soltarDespierto();
  chrome.alarms.clear(NOMBRE_ALARMA_TOPE_RAFAGA);
}

// docs/rafagas-y-ponerse-al-dia.md §3.5: si la extensión se puso al día
// mientras la persona hacía otra cosa, tiene que enterarse. El número en el
// ícono es lo único que se ve sin abrir nada (chrome.notifications sumaría un
// permiso, y el ícono con número alcanza). Cuenta las postulaciones de la
// ÚLTIMA ráfaga -- o las que habría hecho, en modo solo observar, en gris para
// que no se confunda con un envío de verdad -- y se limpia al abrir el popup
// (popup.js). Una ráfaga sin novedades limpia el número en vez de dejar
// pegado el de la anterior: el ícono siempre cuenta lo último que pasó.
const COLOR_INSIGNIA_POSTULADAS = '#17784F';
const COLOR_INSIGNIA_OBSERVADAS = '#5D6468';

function mostrarInsigniaRafaga(conteos) {
  const c = conteos || {};
  const postuladas = c.postuladas || 0;
  const observadas = c.observadas || 0;
  const n = postuladas > 0 ? postuladas : observadas;
  try {
    chrome.action.setBadgeText({ text: n > 0 ? (n > 999 ? '999+' : String(n)) : '' });
    if (n > 0) {
      chrome.action.setBadgeBackgroundColor({ color: postuladas > 0 ? COLOR_INSIGNIA_POSTULADAS : COLOR_INSIGNIA_OBSERVADAS });
    }
  } catch (e) {
    // El número es un aviso, no puede tumbar el cierre de la ráfaga.
    console.warn('[AP] No se pudo poner el número en el ícono:', e);
  }
}

// Devuelve true si arrancó, false si no (no hay pasos, o ya hay una corriendo).
async function iniciarRafaga(disparador, pasos) {
  if (!pasos.length) return false;
  const { rafaga: existente } = await chrome.storage.local.get('rafaga');
  if (existente && existente.estado === 'en_curso') return false; // ya hay una corriendo

  const rafaga = {
    id: 'r_' + Date.now(),
    disparador,
    inicio: Date.now(),
    latido: Date.now(),
    pasos,
    pasoActual: 0,
    tabActual: null,
    conteos: { postuladas: 0, descartadas: 0, gris: 0, observadas: 0, errores: 0 },
    estado: 'en_curso',
  };
  await chrome.storage.local.set({ rafaga });
  mantenerDespierto();
  chrome.alarms.create(NOMBRE_ALARMA_TOPE_RAFAGA, { delayInMinutes: TOPE_MINUTOS_RAFAGA });
  // Sin await a propósito: registrar el inicio no debe demorar el primer paso.
  reportarRafagaBackend(rafaga);
  avanzarRafaga();
  return true;
}

// docs/rafagas-y-ponerse-al-dia.md §3.6: cuánto suele tardar una ráfaga, para
// decírselo a la persona antes de que apriete "Ponerme al día ahora". Las
// últimas 5 que TERMINARON (una interrumpida no dice cuánto tarda una
// completa), en este mismo equipo: el tiempo lo manda la velocidad de los
// portales desde acá, no una cifra global.
const DURACIONES_PARA_ESTIMAR = 5;

// Mediana, no promedio: una ráfaga que se colgó hasta el seguro de 8 min por
// paso no debe correr la estimación de todas las demás.
function mediana(valores) {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2);
}

async function estimadoRafagaMs() {
  const { duracionesRafaga } = await chrome.storage.local.get('duracionesRafaga');
  return mediana(duracionesRafaga || []);
}

async function avanzarRafaga() {
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!rafaga || rafaga.estado !== 'en_curso') return;

  if (rafaga.pasoActual >= rafaga.pasos.length) {
    rafaga.estado = 'terminada';
    rafaga.fin = Date.now();
    const { duracionesRafaga } = await chrome.storage.local.get('duracionesRafaga');
    const duraciones = [...(duracionesRafaga || []), rafaga.fin - rafaga.inicio].slice(-DURACIONES_PARA_ESTIMAR);
    await chrome.storage.local.set({ rafaga, ultimaRafagaFin: Date.now(), duracionesRafaga: duraciones });
    // Soltar el bloqueo va ANTES del reporte: un backend lento o caído nunca
    // debe alargar el tiempo que el equipo queda sin poder suspenderse. Lo
    // mismo el número del ícono: es local e instantáneo, no espera a la red.
    terminarKeepAwake();
    mostrarInsigniaRafaga(rafaga.conteos);
    await reportarRafagaBackend(rafaga);
    console.log('[AP] Ráfaga terminada:', rafaga.conteos);
    return;
  }

  const paso = rafaga.pasos[rafaga.pasoActual];
  if (paso.tipo === 'aprobadas') {
    pasoAprobadas().catch((e) => console.warn('[AP] Falló el paso de las aprobadas:', e));
    return;
  }
  chrome.tabs.create({ url: paso.url, active: false }, tab => {
    if (chrome.runtime.lastError || !tab) {
      // Ni se pudo abrir la pestaña -- se salta este paso igual, no se
      // cuelga la ráfaga entera por un portal que falló al abrir.
      pasoTerminado(null);
      return;
    }
    rafaga.tabActual = tab.id;
    rafaga.latido = Date.now();
    chrome.storage.local.set({ rafaga });
    // El seguro de tiempo se re-crea en cada paso -- si ESCANEO_TERMINADO
    // nunca llega (portal caído, error inesperado), esto avanza igual.
    chrome.alarms.create(NOMBRE_ALARMA_SEGURO_RAFAGA, { delayInMinutes: SEGURO_MINUTOS_POR_PASO });

    const onUpdated = (tabId, info) => {
      if (tabId !== tab.id || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'AUTO_SCAN' }, () => {
          if (chrome.runtime.lastError) { /* pestaña cerrada, o el content script no llegó a cargar */ }
        });
      }, 2000);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// Llega desde ESCANEO_TERMINADO (conteos reales) o desde el seguro de tiempo
// (conteos null) -- en ambos casos: sumar lo que haya, cerrar la pestaña del
// paso actual, avanzar al siguiente.
async function pasoTerminado(conteos) {
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!rafaga || rafaga.estado !== 'en_curso') return;

  if (conteos) {
    rafaga.conteos.postuladas += conteos.postular || 0;
    rafaga.conteos.observadas += conteos.observado || 0;
    rafaga.conteos.descartadas += conteos.descartar || 0;
    rafaga.conteos.gris += conteos.gris || 0;
  } else {
    rafaga.conteos.errores += 1;
  }
  const tabId = rafaga.tabActual;
  rafaga.tabActual = null;
  // §4.1: si la prueba llegó a 5, no quedan ráfagas que correr: se salta lo que
  // falte -- abrir el resto de los portales solo serviría para que cada uno se
  // cortara en su primera oferta. Termina como una ráfaga normal.
  rafaga.pasoActual = rafaga.cortadaPorPrueba ? rafaga.pasos.length : rafaga.pasoActual + 1;
  rafaga.latido = Date.now();
  await chrome.storage.local.set({ rafaga });
  chrome.alarms.clear(NOMBRE_ALARMA_SEGURO_RAFAGA);
  if (tabId != null) chrome.tabs.remove(tabId, () => { if (chrome.runtime.lastError) {} });
  avanzarRafaga();
}

// §3.7: el primer paso de la ráfaga cuando hay ofertas aprobadas por enviar. No
// abre una pestaña de búsqueda: espera a que la cola de aprobadas se vacíe (cada
// oferta, una a la vez, en su propia pestaña) y suma lo que se envió al resumen.
// Corre DENTRO de la ráfaga, así que la cubren el bloqueo de suspensión y el tope
// de 25 min, y el paso siguiente no abre otra pestaña mientras esta cola sigue.
async function pasoAprobadas() {
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!rafaga || rafaga.estado !== 'en_curso') return;
  const indice = rafaga.pasoActual;
  rafaga.latido = Date.now();
  await chrome.storage.local.set({ rafaga });
  // Seguro de tiempo: cada oferta de la cola puede tardar hasta ~1 min (35 s de
  // tope de la pestaña, más la pausa entre una y otra), así que se suma un minuto
  // por oferta a los 8 de siempre.
  chrome.alarms.create(NOMBRE_ALARMA_SEGURO_RAFAGA, { delayInMinutes: SEGURO_MINUTOS_POR_PASO + queue.length });

  let enviadas = null; // null = falló: cuenta como error del paso, como un portal que no contestó
  try { enviadas = await processQueue(); } catch (e) { console.warn('[AP] Falló la cola de aprobadas:', e); }

  // Si el seguro de tiempo ya siguió adelante (la cola se demoró más de la cuenta),
  // este paso ya no es el actual: no se avanza dos veces.
  const { rafaga: actual } = await chrome.storage.local.get('rafaga');
  if (!actual || actual.estado !== 'en_curso' || actual.pasoActual !== indice) return;
  await pasoTerminado(enviadas === null ? null : { postular: enviadas });
}

// ── ¿Esta postulación la hizo una ráfaga, o la persona? (§4.1) ─────────────
// La prueba gratis se gasta solo con lo que envía una ráfaga: entrar a un portal
// a mano y postular es el plan gratis de siempre. Quien lo sabe es el background,
// no el adaptador: la pestaña de la ráfaga es la que él mismo abrió y tiene
// guardada como tabActual -- el mismo criterio con que atiende ESCANEO_TERMINADO.
// Así no hay carrera entre "el adaptador se enteró de que es automático" y "ya
// empezó a postular", y una pestaña que la persona abrió a mano nunca cuenta.
async function esPestanaDeRafaga(sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId == null) return false;
  const { rafaga } = await chrome.storage.local.get('rafaga');
  return !!(rafaga && rafaga.estado === 'en_curso' && rafaga.tabActual === tabId);
}

// La prueba llegó a 5: pasoTerminado salta lo que falte de la ráfaga.
async function marcarCorteDePrueba() {
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!rafaga || rafaga.estado !== 'en_curso') return;
  rafaga.cortadaPorPrueba = true;
  await chrome.storage.local.set({ rafaga });
}

// El seguro de tiempo por paso (chrome.alarms, 8 min) ya cubre casi todos los
// casos de que algo se cuelgue -- las alarmas sobreviven un restart del
// worker. Esto es el respaldo para el caso más raro: que hasta esa alarma se
// haya perdido (ej. la extensión se deshabilitó y volvió a habilitar a
// mitad de una ráfaga). Sin latido reciente, se asume perdida.
const RETOMAR_LATIDO_MAX_MIN = 10;

async function retomarORafagaInterrumpida() {
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!rafaga || rafaga.estado !== 'en_curso') {
    // §3.3: si el worker murió a mitad de una ráfaga, el bloqueo de suspensión
    // pudo quedar pedido aunque ya no haya nada en curso (el pedido vive en el
    // navegador, no en el worker). Soltarlo cuando no hay ráfaga es inofensivo
    // si no había ninguno, y evita dejar el equipo sin poder suspenderse.
    terminarKeepAwake();
    return;
  }

  const minutosDesdeLatido = (Date.now() - rafaga.latido) / 60000;
  if (minutosDesdeLatido < RETOMAR_LATIDO_MAX_MIN) return; // pudo seguir en curso de verdad -- no tocar

  if (rafaga.tabActual != null) {
    chrome.tabs.remove(rafaga.tabActual, () => { if (chrome.runtime.lastError) {} });
  }
  rafaga.estado = 'interrumpida';
  rafaga.fin = Date.now();
  await chrome.storage.local.set({ rafaga });
  terminarKeepAwake();
  // Lo que alcanzó a hacer antes de cortarse también es una novedad real.
  mostrarInsigniaRafaga(rafaga.conteos);
  await reportarRafagaBackend(rafaga);
  console.warn('[AP] Ráfaga marcada interrumpida -- sin señales de vida por más de ' + RETOMAR_LATIDO_MAX_MIN + ' min.');
}

// ── "Ponerme al día ahora" (docs/rafagas-y-ponerse-al-dia.md §3.6) ─────────
// Solo Premium (la extensión no lo decide: lo dice el plan, vía estado-automatico)
// y sin el umbral de 3 h de §3.1 -- la persona lo pidió a propósito.
//
// Sí tiene un enfriamiento corto, que el documento no menciona: apretarlo diez
// veces seguidas abriría diez rondas de pestañas sobre los portales, y
// Computrabajo ya respondió 403 a tráfico de servidor; un bloqueo sería de la
// cuenta de la persona. Cinco minutos después de terminar una, otra no tiene
// nada nuevo que encontrar.
const ENFRIAMIENTO_MANUAL_MIN = 5;

// Lo que se puede saber sin salir a la red: ¿ya está corriendo una, o
// terminó hace nada?
async function bloqueoLocalManual() {
  // Una ráfaga "en_curso" que el worker perdió (latido viejo) no puede dejar
  // el botón bloqueado para siempre: se reconcilia antes de mirar.
  await retomarORafagaInterrumpida();
  const { rafaga, ultimaRafagaFin } = await chrome.storage.local.get(['rafaga', 'ultimaRafagaFin']);
  if (rafaga && rafaga.estado === 'en_curso') return 'en_curso';
  if (ultimaRafagaFin && Date.now() - ultimaRafagaFin < ENFRIAMIENTO_MANUAL_MIN * 60000) return 'reciente';
  return null;
}

// Apretar el botón. { ok: true, estimadoMs } si arrancó, o { ok: false, motivo }
// -- el motivo es una clave que los textos del popup y del panel saben explicar.
async function ponerseAlDia() {
  const bloqueo = await bloqueoLocalManual();
  if (bloqueo) return { ok: false, motivo: bloqueo };

  const resultado = await escanearAutomatico('manual');
  if (!resultado.ok) return { ok: false, motivo: resultado.motivo };
  return { ok: true, estimadoMs: await estimadoRafagaMs() };
}

// ── Activar la postulación desde el panel (docs/rafagas-y-ponerse-al-dia.md §4.1) ──
// El panel avisa (por bridge.js) que la persona acaba de decir "sí, actúa": se
// corre una ráfaga de inmediato, con disparador 'activacion' -- esperar al siguiente
// chequeo (hasta 60 min) mataría justo el momento en que más interesada está.
// Ignora el umbral de 3 h y el enfriamiento de 5 min a propósito: la ráfaga
// anterior, si hubo una, fue en solo observar y no envió nada.
//
// Ocurre una vez -- el panel solo lo pide en la llamada que de verdad cambió el
// estado -- y solo si hay algo automático que arrancar: eso lo decide el servidor
// dentro de escanearAutomatico (plan o prueba por gastar, sin pausa, con cupo y
// portales), no el panel. La página no puede hacer que la extensión postule algo
// que el servidor no le haya dicho que puede.
async function activacionPostulacion() {
  await retomarORafagaInterrumpida(); // una "en_curso" perdida no debe bloquearla
  return escanearAutomatico('activacion');
}

// Qué le muestra el popup de la prueba de §4.1: null si no aplica (Premium, o un
// servidor anterior que no manda `modo`), en curso con cuántas lleva, o terminada.
function pruebaDeEstado(estado) {
  const total = estado.pruebaTotal || 5;
  if (estado.modo === 'prueba') return { estado: 'en_curso', restantes: estado.pruebaRestantes, total };
  if (estado.modo === 'manual') return { estado: 'terminada', total };
  return null;
}

// Para dibujar el botón sin apretarlo: { mostrar, bloqueo, estimadoMs, prueba, automatica }.
// "Gratis: el botón no aparece" (§3.6) -- se decide por disponibleEnPlan, que
// es del plan, no de si hoy está corriendo. Sin respuesta del servidor no se
// sabe si el plan lo permite, y es mejor no ofrecer un botón que quizás no
// corresponde que ofrecérselo a una cuenta gratis.
async function estadoPonerseAlDia() {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { mostrar: false };

  const estado = await pedirEstadoAutomatico(autopostulaToken);
  if (!estado) return { mostrar: false };
  // La prueba (§4.1) se muestra aunque el botón no: es lo único automático que
  // tiene una cuenta gratis, y el botón es de Premium.
  const prueba = pruebaDeEstado(estado);
  // Si hoy se pone al día sola (plan o prueba, sin pausa y con cupo): el popup
  // solo dice "se pone al día sola cuando abres Chrome" si es verdad
  // (docs/primera-busqueda-guiada.md §12).
  const automatica = estado.busquedaAutomatica === true;
  if (!estado.disponibleEnPlan) return { mostrar: false, prueba, automatica };

  let bloqueo;
  if (!estado.busquedaAutomatica) bloqueo = motivoDeEstado(estado);
  else if (!objetivosDeEstado(estado).length) bloqueo = 'sin_objetivo';
  else if (!(estado.plataformasConectadas || []).length) bloqueo = 'sin_portales';
  else bloqueo = await bloqueoLocalManual();

  return { mostrar: true, bloqueo, estimadoMs: await estimadoRafagaMs(), prueba, automatica };
}

// docs/rafagas-y-ponerse-al-dia.md §3.1, disparador "el computador despierta":
// Chrome ya lo resuelve solo -- una alarma periódica que estaba vencida
// mientras el equipo estaba suspendido se dispara sola al despertar, sin
// código extra de nuestra parte. Lo único que se agrega acá es distinguir
// ESE caso del chequeo normal, para que quede bien registrado como
// disparador cuando exista el modelo Rafaga del backend (§3.4, pendiente):
// si la alarma se disparó bastante después de su hora programada, es señal
// de que el equipo no estuvo disponible a tiempo -- estaba suspendido, no
// que Chrome se demoró unos segundos.
const RETRASO_DESPERTAR_MIN = 5;

try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === NOMBRE_ALARMA_AUTOMATICA) {
      const retrasoMin = alarm.scheduledTime ? (Date.now() - alarm.scheduledTime) / 60000 : 0;
      quizasRafaga(retrasoMin >= RETRASO_DESPERTAR_MIN ? 'despertar' : 'chequeo');
      // §2.9: además de la ráfaga, revisa lo aprobado en el panel que aún no
      // salió -- una ráfaga que no corre (plan gratis) no puede dejarlo varado.
      procesarAprobadas().catch(() => {});
    } else if (alarm.name === NOMBRE_ALARMA_USO) {
      avisarHoraDeUso();
    } else if (alarm.name === NOMBRE_ALARMA_SEGURO_RAFAGA) {
      pasoTerminado(null);
    } else if (alarm.name === NOMBRE_ALARMA_TOPE_RAFAGA) {
      // Tope duro (§3.3): solo se suelta el bloqueo de suspensión -- la ráfaga
      // puede seguir, pero no a costa de dejar el equipo sin poder suspenderse.
      soltarDespierto();
      console.warn('[AP] Tope de ' + TOPE_MINUTOS_RAFAGA + ' min de la ráfaga alcanzado -- se libera el bloqueo de suspensión.');
    }
  });
} catch (e) {
  console.error('[AP] No se pudo registrar el listener de alarmas:', e);
}

// ── Reportar postulación al backend de AutoPostula (web) ───────
// Corre en el background porque acá sí hay privilegios de extensión —
// un fetch hecho desde content.js (contexto de la página) lo bloquea CORS.
async function reportarPostulacionBackend(oferta, desdeRafaga) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');

  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — no se reportó al backend');
    return { ok: false, error: 'Sin token de AutoPostula configurado' };
  }

  try {
    const res = await fetch(BACKEND_URL + '/api/applications', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platformNombre: oferta.plataforma || 'Computrabajo',
        externalId: oferta.id,
        titulo: oferta.titulo,
        empresa: oferta.empresa || null,
        url: oferta.url || null,
        origen: 'MANUAL',
        respuestas: oferta.respuestas || [],
        incompleta: !!oferta.incompleta,
        nota: oferta.nota || null,
        matchScore: typeof oferta.matchScore === 'number' ? oferta.matchScore : null,
        // §8.6: si esta postulación viene de una aprobación de banda gris,
        // enlaza esa decisión con la postulación resultante.
        decisionOfertaId: oferta.decisionOfertaId || null,
        // §4.1: la envió una ráfaga (no la persona): en una cuenta gratis eso
        // gasta una de las 5 de la prueba. Lo decide esPestanaDeRafaga, no el
        // portal ni el adaptador.
        desdeRafaga: !!desdeRafaga
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó la postulación:', data.error || res.status);
      return { ok: false, error: data.error || ('Error ' + res.status) };
    }
    // §4.1: si esta postulación gastó una de la prueba, el servidor dice cuántas
    // quedan (`prueba: { restantes, total }`); si no, no manda nada.
    const data = await res.json().catch(() => ({}));
    return { ok: true, prueba: data.prueba || null };
  } catch (e) {
    console.warn('[AP] Error de red reportando al backend:', e);
    return { ok: false, error: 'Error de red: ' + e.message };
  }
}

// ── Reportar títulos vistos al backend (cosecha pasiva del corpus) ──────
// Best-effort, no crítico: si falla o no hay token, no vale la pena ensuciar la
// consola por esto (a diferencia de reportarPostulacionBackend, que sí importa).
// Ver docs/rediseno-filtrado-ofertas.md, §7.2.
async function reportarTitulosVistosBackend(titulos, plataforma) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/titulos-vistos', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ platformNombre: plataforma || 'Computrabajo', titulos: titulos })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó títulos vistos:', data.error || res.status);
    } else {
      console.log('[AP] Títulos vistos reportados: ' + titulos.length);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando títulos vistos:', e);
  }
}

// ── Reportar avistamientos (corpus de JobOffer, §9.3) ────────────────────
// Best-effort, mismo criterio que reportarTitulosVistosBackend: alimenta un
// corpus global, no bloquea nada de la extensión si falla.
async function reportarAvistamientosBackend(avistamientos, plataforma) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/avistamientos', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ platformNombre: plataforma || 'Computrabajo', avistamientos: avistamientos })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó avistamientos:', data.error || res.status);
    } else {
      const data = await res.json().catch(() => ({}));
      console.log('[AP] Avistamientos guardados: ' + (data.guardados ?? '?') + '/' + avistamientos.length);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando avistamientos:', e);
  }
}

// ── Reportar descartes con su razón (docs/estrategia-y-rediseno.md §5.2) ──
// Best-effort, mismo criterio que los avistamientos: si falla, el escaneo
// sigue igual; solo se pierde el detalle de esa pasada en el panel.
// Las que habría postulado en modo "solo mirar" (docs/primera-busqueda-guiada.md
// §11), para que el panel diga cuáles y cuántas. Fire-and-forget como los descartes.
async function reportarObservadasBackend(ofertas, plataforma) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/observadas', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plataforma: plataforma || 'Computrabajo', ofertas: ofertas })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó las observadas:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando las observadas:', e);
  }
}

async function reportarDescartesBackend(descartes, plataforma) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/descartes', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plataforma: plataforma || 'Computrabajo', descartes: descartes })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó descartes:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando descartes:', e);
  }
}

// ── Reportar oferta en banda gris (scorer local, §6) ─────────────────────
// A diferencia de reportarTitulosVistosBackend (best-effort), acá sí importa
// que llegue: es lo que arma la cola de decisión del usuario (§8). Si falla,
// se avisa por consola pero no se bloquea el escaneo por esto.
async function reportarBandaGrisBackend(oferta) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/banda-gris', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(oferta)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó la oferta en banda gris:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando banda gris:', e);
  }
}

// ── Reportar la ráfaga al backend (docs/rafagas-y-ponerse-al-dia.md §3.4) ──
// Se llama dos veces por ráfaga: al empezar (estado "en_curso") y al terminar
// ("terminada" o "interrumpida", ya con los conteos) -- las dos caen en la
// misma fila del backend, por el id de la ráfaga. Best-effort, como los otros
// reportes de solo lectura: el estado real vive en chrome.storage, esto es el
// registro que alimenta la tarjeta del panel; una ráfaga que corrió no deja
// de haber corrido porque el backend no contestó, así que no se reintenta ni
// se bloquea nada por esto.
async function reportarRafagaBackend(rafaga) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  const payload = {
    id: rafaga.id,
    disparador: rafaga.disparador,
    inicio: rafaga.inicio,
    estado: rafaga.estado,
    conteos: rafaga.conteos,
  };
  if (rafaga.fin) {
    payload.fin = rafaga.fin;
    payload.duracionMs = rafaga.fin - rafaga.inicio;
  }

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/rafaga', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + autopostulaToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó el registro de la ráfaga:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando la ráfaga:', e);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // §3.6: el popup los manda directo; el panel, por bridge.js. Si algo revienta
  // por dentro, igual se responde -- un sendResponse que nunca llega deja a la
  // persona mirando un botón que dice "Empezando…" para siempre.
  if (msg.type === 'PONERSE_AL_DIA') {
    ponerseAlDia().then(sendResponse).catch((e) => {
      console.warn('[AP] Falló "Ponerme al día ahora":', e);
      sendResponse({ ok: false, motivo: 'sin_conexion' });
    });
    return true;
  }
  // §4.1: el panel avisa que la persona acaba de activar la postulación.
  if (msg.type === 'ACTIVACION_POSTULACION') {
    activacionPostulacion().then(sendResponse).catch((e) => {
      console.warn('[AP] Falló la ráfaga de activación:', e);
      sendResponse({ ok: false, motivo: 'sin_conexion' });
    });
    return true;
  }
  // docs/primera-busqueda-guiada.md §13: «Probémosla ahora» (onboarding) o
  // «Buscar en…» (Hoy) piden el recorrido para la búsqueda que se va a abrir.
  if (msg.type === 'RECORRIDO_PENDIENTE') {
    recorridoPendiente('web').then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'APROBAR_PENDIENTES') {
    procesarAprobadas().then(sendResponse).catch((e) => {
      console.warn('[AP] Falló procesar las aprobadas de "Por decidir":', e);
      sendResponse({ ok: false, motivo: 'sin_conexion' });
    });
    return true;
  }
  if (msg.type === 'ESTADO_PONERSE_AL_DIA') {
    estadoPonerseAlDia().then(sendResponse).catch((e) => {
      console.warn('[AP] No se pudo calcular el estado del botón "Ponerme al día ahora":', e);
      sendResponse({ mostrar: false });
    });
    return true;
  }
  if (msg.type === 'ESCANEO_TERMINADO') {
    // Solo se atiende si viene de la pestaña que la ráfaga tiene abierta
    // AHORA MISMO -- una pestaña vieja (de un paso anterior, ya cerrada, o
    // abierta a mano por la persona) no debe poder avanzar el paso actual
    // por una carrera de mensajes.
    chrome.storage.local.get('rafaga', ({ rafaga }) => {
      if (rafaga && rafaga.estado === 'en_curso' && sender.tab && sender.tab.id === rafaga.tabActual) {
        pasoTerminado(msg.conteos);
      }
      sendResponse({ ok: true });
    });
    return true;
  }
  // docs/revision-2026-09-28.md §5: el panel de revisión se abrió (o sigue
  // abierto) / se cerró en una pestaña.
  if (msg.type === 'REVISION_EN_CURSO' || msg.type === 'REVISION_TERMINADA') {
    atenderRevision(sender, msg.type === 'REVISION_EN_CURSO')
      .then(() => sendResponse({ ok: true }))
      .catch((e) => { console.warn('[AP] Falló atender la revisión:', e); sendResponse({ ok: false }); });
    return true;
  }
  if (msg.type === 'POSTULANDO') {
    atenderLatido(sender)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => { console.warn('[AP] Falló atender el latido:', e); sendResponse({ ok: false }); });
    return true;
  }
  // Las 4 de acá abajo hacían fire-and-forget (sin return true) -- en MV3 eso
  // le dice a Chrome "esta llamada ya terminó", y el service worker se puede
  // suspender a mitad del fetch() sin avisar: ni el .then ni el .catch llegan
  // a correr, así que no queda ni un log de error. Nada se reportaba y no
  // había ninguna señal de que algo estuviera mal (ver docs/rediseno-filtrado-ofertas.md,
  // §9.3 -- "el corpus se llena sola" solo si esto de verdad corre hasta el final).
  // El return true mantiene vivo el listener (y con él, el service worker)
  // hasta que el fetch realmente termine.
  if (msg.type === 'REPORTAR_POSTULACION') {
    // §1.3 (docs/revision-2026-09-16.md): el sendResponse ya no está
    // hardcodeado a ok:true -- antes eso escondía cualquier 403/400 real de
    // /api/applications (tope mensual, portal desconectado) detrás de un
    // "éxito" falso, y la postulación quedaba enviada al portal externo pero
    // invisible en AutoPostula sin que nada lo dijera.
    //
    // §4.1: se marca si la envió una ráfaga (gasta la prueba gratis) y, si la
    // prueba llegó a 5, la ráfaga se corta -- antes de contestar, para que el
    // adaptador no alcance a abrir la oferta siguiente.
    esPestanaDeRafaga(sender).catch(() => false)
      .then(async (deRafaga) => {
        const respuesta = await reportarPostulacionBackend(msg.oferta, deRafaga);
        if (deRafaga && respuesta.prueba && respuesta.prueba.restantes === 0) await marcarCorteDePrueba().catch(() => {});
        return respuesta;
      })
      .then(sendResponse);
    return true;
  }
  if (msg.type === 'REPORTAR_TITULOS_VISTOS') {
    reportarTitulosVistosBackend(msg.titulos, msg.plataforma).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'REPORTAR_BANDA_GRIS') {
    reportarBandaGrisBackend(msg.oferta).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'REESCRIBIR_RESPUESTA') {
    reescribirRespuestaBackend(msg.datos).then(sendResponse);
    return true;
  }
  if (msg.type === 'GUARDAR_DATO') {
    guardarDatoBackend(msg.texto).then(sendResponse);
    return true;
  }
  if (msg.type === 'AGREGAR_COMUNA') {
    agregarComunaBackend(String(msg.comuna || '')).then(sendResponse);
    return true;
  }
  if (msg.type === 'SESION_PORTAL') {
    // Lo reporta core.js al cargar una página de portal (§6). Se guarda tal
    // cual, con la fecha: el popup muestra "Activa" o "Inicia sesión ahí" sin
    // tener que abrir el portal para averiguarlo.
    chrome.storage.local.get('sesionesPortales').then(({ sesionesPortales }) => {
      const sesiones = sesionesPortales || {};
      sesiones[msg.portal] = { hay: !!msg.hay, en: Date.now() };
      return chrome.storage.local.set({ sesionesPortales: sesiones });
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'CAMBIAR_ESTADO') {
    // El popup ya no guarda interruptores propios (§6): pide el cambio, el
    // servidor manda y acá se refleja en la config local y en las pestañas.
    cambiarEstadoBackend(msg.cambio || {}).then((estado) => sendResponse({ ok: !!estado, estado }));
    return true;
  }
  if (msg.type === 'REPORTAR_DESCARTES') {
    reportarDescartesBackend(msg.descartes, msg.plataforma).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'REPORTAR_OBSERVADAS') {
    reportarObservadasBackend(msg.ofertas, msg.plataforma).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'EMPEZAR_A_POSTULAR') {
    empezarAPostularBackend().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'POSTULAR_ELEGIDAS') {
    postularElegidas(msg, sender).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'REPORTAR_AVISTAMIENTOS') {
    reportarAvistamientosBackend(msg.avistamientos, msg.plataforma).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'ACTUALIZAR_ESTADO') {
    actualizarEstadoBackend(msg.datos).then(sendResponse);
    return true;
  }
  // El content script lo pide al cargar en un portal. Sin esto, el perfil solo
  // se refrescaba en las rafagas automaticas: quien completa su perfil en el
  // panel y se va a postular a mano en ese momento seguia con la foto vieja.
  // El guardian de tiempo evita una peticion por cada pagina del portal que
  // abra -- navegar un listado son decenas de cargas.
  if (msg.type === 'SINCRONIZAR_PERFIL') {
    (async () => {
      const { config } = await chrome.storage.local.get('config');
      const ultima = (config && config.perfilActualizadoEn) || 0;
      if (Date.now() - ultima < MINUTOS_ENTRE_SINCRONIZACIONES * 60e3) return { ok: true, omitido: true };
      const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
      if (!autopostulaToken) return { ok: false };
      await actualizarFiltrosDesdeBackend(autopostulaToken);
      // Se devuelve la config recien escrita: la pestaña que pregunto ya tiene
      // su AP.cfg cargado de antes y no se entera sola de que cambio. Mandarla
      // en la respuesta evita tener que avisarle a TODAS las pestañas
      // (CONFIG_UPDATED) por algo que pidio una sola.
      const { config: fresca } = await chrome.storage.local.get('config');
      return { ok: true, omitido: false, config: fresca || null };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'PUEDE_POSTULAR') {
    // §4.1: si la pregunta viene de una pestaña de ráfaga, el servidor también
    // dice si a esta cuenta gratis todavía le queda prueba. Si no (ya la gastó),
    // la ráfaga entera se corta, no solo este portal.
    esPestanaDeRafaga(sender).catch(() => false)
      .then(async (deRafaga) => {
        const respuesta = await puedePostularBackend(msg.plataforma, deRafaga ? 'rafaga' : null);
        if (deRafaga && respuesta.motivo === 'prueba_terminada') await marcarCorteDePrueba().catch(() => {});
        return respuesta;
      })
      .then(sendResponse)
      .catch(() => sendResponse({ permitido: true, motivo: null, restantes: null }));
    return true;
  }
  if (msg.type === 'DUPLICADOS') {
    duplicadosBackend(msg.plataforma, msg.ofertas).then(sendResponse);
    return true;
  }
  if (msg.type === 'AI_CALL') {
    llamarIABackend(msg.tipo, msg.payload).then(sendResponse);
    return true; // mantiene el canal abierto — la respuesta llega async
  }
  if (msg.type === 'GUARDAR_TOKEN') {
    // Llega desde bridge.js, inyectado solo en la pestaña de la propia web de
    // AutoPostula — es el handshake de "conectar extensión automáticamente".
    if (!msg.token) {
      sendResponse({ ok: false, error: 'Token vacío' });
      return false;
    }
    chrome.storage.sync.set({ autopostulaToken: msg.token }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[AP] Token conectado automáticamente desde la web.');
        sendResponse({ ok: true });
      }
    });
    return true; // async
  }
  return false;
});

chrome.runtime.onInstalled.addListener((detalle) => {
  console.log('AutoPostula v2 instalado.');
  if (detalle && detalle.reason === 'install') recorridoPendiente('instalacion').catch(() => {});
});

// ── El recorrido de la primera vez (docs/primera-busqueda-guiada.md §13) ──
// Queda pendiente al instalar (una actualización no lo trae: quien ya usaba la
// extensión no lo necesita) y cuando la persona lo pide desde su panel. Lo
// muestra core.js en la primera búsqueda que mira en "solo mirar". Si ya lo
// hizo o lo saltó, no se repite.
async function recorridoPendiente(origen) {
  const { recorrido } = await chrome.storage.local.get('recorrido');
  if (recorrido && recorrido.estado === 'hecho') return { ok: true, yaLoHizo: true };
  await chrome.storage.local.set({ recorrido: { estado: 'pendiente', origen, desde: Date.now() } });
  return { ok: true };
}
