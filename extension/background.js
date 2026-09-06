// ═══════════════════════════════════════════════════════════════
//  AutoPostula — background.js v2
// ═══════════════════════════════════════════════════════════════
'use strict';

console.log('[AP] background.js cargado', new Date().toLocaleTimeString());

// Mismo dominio que host_permissions/content_scripts en manifest.json --
// si cambia, actualizar ambos archivos juntos.
const BACKEND_URL = 'https://autopostula.cl';

let queue = [];
let busy  = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function processQueue() {
  if (busy || !queue.length) return;
  busy = true;
  while (queue.length) {
    const item = queue.shift();
    const resultado = await applyInTab(item.url, item.titulo, item.decisionId);
    // §8.4/§8.6: si la oferta aprobada en banda gris ya no existe o no tiene
    // botón de postular, se marca EXPIRADA en vez de reintentarla para
    // siempre en cada ciclo -- "silencio ahí sería peor que el error".
    if (item.decisionId && resultado && resultado.expirada) {
      marcarBandaGrisExpirada(item.decisionId);
    }
    await sleep(5000);
  }
  busy = false;
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

// decisionId presente = viene de una aprobación de banda gris (§8.6): se le
// pasa al content script en el mensaje DO_APPLY para que la postulación
// resultante quede enlazada a esa decisión (ver reportarPostulacionBackend).
// Devuelve { success, expirada } -- si la pestaña nunca contestó (cerrada,
// sin content script, o timeout de seguridad) no se marca nada, queda
// pendiente para el siguiente ciclo en vez de asumir que expiró.
function applyInTab(url, titulo, decisionId) {
  return new Promise(resolve => {
    chrome.tabs.create({ url, active: false }, tab => {
      const id = tab.id;
      const onUpdated = (tabId, info) => {
        if (tabId !== id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        setTimeout(() => {
          chrome.tabs.sendMessage(id, { type: 'DO_APPLY', decisionId }, res => {
            if (chrome.runtime.lastError) { /* tab cerrada o sin content script */ }
            setTimeout(() => {
              chrome.tabs.remove(id, () => { if(chrome.runtime.lastError){} });
              resolve(res || { success: false, expirada: false });
            }, 3500);
          });
        }, 3000);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      // Timeout de seguridad
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(id, () => {});
        resolve({ success: false, expirada: false });
      }, 35000);
    });
  });
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

// ── Búsqueda automática en background (premium) ─────────────────
// Requiere el permiso "alarms" en manifest.json.
const NOMBRE_ALARMA_AUTOMATICA = 'autopostula-scan';
const INTERVALO_MINUTOS = 120; // cada 2 horas

// Envuelto en try/catch: si el permiso "alarms" llegara a faltar en el manifest,
// esto no debe tumbar el resto del script (y con eso, dejar de registrar los
// listeners de mensajes más abajo, como AI_CALL).
try {
  chrome.alarms.create(NOMBRE_ALARMA_AUTOMATICA, { periodInMinutes: INTERVALO_MINUTOS });
} catch (e) {
  console.error('[AP] No se pudo crear la alarma de búsqueda automática (¿falta el permiso "alarms"?):', e);
}

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
// cambio SÍ exige el prefijo de región para poder filtrar por comuna -- por
// eso esta lista solo cubre RM: fuera de ella no hay una tabla comuna→región
// disponible del lado de la extensión (el backend sí la tiene, en
// scripts/limpieza/cl.ts). Si el uso real pide más regiones, conviene que el
// backend resuelva la región y la mande ya lista en el perfil compilado, en
// vez de duplicar las 346 comunas de Chile acá.
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
    const comuna = filtros && filtros.comunas && filtros.comunas[0];
    // Remoto no tiene una comuna real asociada -- no combinar ambos facets.
    if (comuna && (!filtros || filtros.modalidad !== 'remoto')) url += '-en-' + comunaParaUrl(comuna);
    if (filtros) {
      if (filtros.modalidad === 'remoto') url += '-en-remoto';
      else if (filtros.modalidad === 'hibrido') url += '-hibrido';
      if (filtros.jornada === 'part_time') url += '-jornada-part-time';
    }
    return url;
  },
  'Laborum': (slug, filtros) => {
    let prefijo = '';
    const comuna = filtros && filtros.comunas && filtros.comunas[0];
    if (comuna && (!filtros || filtros.modalidad !== 'remoto') && COMUNAS_RM.has(comuna)) {
      prefijo = 'en-region-metropolitana/' + comunaParaUrl(comuna) + '/';
    }
    let archivo = 'empleos-';
    if (filtros && filtros.jornada === 'part_time') archivo += 'part-time-';
    else if (filtros && filtros.jornada === 'full_time') archivo += 'full-time-';
    if (filtros && filtros.modalidad === 'remoto') archivo += 'modalidad-remoto-';
    else if (filtros && filtros.modalidad === 'hibrido') archivo += 'modalidad-hibrido-';
    archivo += 'busqueda-' + slug + '.html';
    return 'https://www.laborum.cl/' + prefijo + archivo;
  },
};

// Trae los filtros de búsqueda (palabras, modalidad, jornada) del dashboard y
// los guarda en la config local, para que la búsqueda automática los use aunque
// el popup nunca se haya abierto para refrescarlos.
async function actualizarFiltrosDesdeBackend(token) {
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
      }
    });
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

async function escanearAutomatico() {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return;

  let estado;
  try {
    const res = await fetch(BACKEND_URL + '/api/account/estado-automatico', {
      headers: { 'Authorization': 'Bearer ' + autopostulaToken }
    });
    if (!res.ok) return;
    estado = await res.json();
  } catch (e) {
    console.warn('[AP] No se pudo consultar estado automático:', e);
    return;
  }

  // Sin el beneficio del plan no hay nada automático que hacer -- ni buscar
  // ofertas nuevas ni postular a lo ya aprobado en banda gris.
  if (!estado.busquedaAutomatica) return;

  // La búsqueda automática corre en background sin que nadie haya abierto el
  // popup — si no se refresca acá, usaría los filtros de búsqueda que haya
  // cacheados de la última vez (quizás desactualizados). Se actualiza antes
  // de escanear para que siempre respete lo último guardado en la web.
  const { filtros, bandaGrisAprobadas } = await actualizarFiltrosDesdeBackend(autopostulaToken);

  // §8.6: postular lo ya aprobado en banda gris no depende de tener un
  // cargoObjetivo configurado -- cada item ya trae su propia URL concreta,
  // no hace falta armar ninguna búsqueda para llegar a ella.
  for (const item of bandaGrisAprobadas || []) {
    queue.push({ url: item.url, titulo: item.titulo, decisionId: item.id });
  }
  processQueue();

  // docs/objetivo-laboral.md §8: uno o más objetivos, cada uno con su propia
  // búsqueda -- no solo el cargoObjetivo del CV. Si el backend todavía no
  // manda "objetivos" (versión vieja) o el usuario nunca confirmó ninguno,
  // cargoObjetivo sigue funcionando como único objetivo, igual que siempre.
  const objetivos = (estado.objetivos && estado.objetivos.length)
    ? estado.objetivos
    : (estado.cargoObjetivo ? [{ etiqueta: estado.cargoObjetivo, peso: 1 }] : []);
  if (!objetivos.length) return;

  const plataformas = estado.plataformasConectadas || [];
  if (!plataformas.length) return;

  // Con más de un objetivo, el secundario se visita con menos frecuencia que
  // el principal -- "uno de cada dos ciclos" (§8). Sin esto, alguien con 2
  // objetivos × 2 portales pasaría de 2 a 4 pestañas cada 2 horas.
  const { cicloBusquedaAutomatica } = await chrome.storage.local.get('cicloBusquedaAutomatica');
  const ciclo = (cicloBusquedaAutomatica || 0) + 1;
  await chrome.storage.local.set({ cicloBusquedaAutomatica: ciclo });
  const objetivosDeEsteCiclo = objetivos.filter((_, i) => i === 0 || ciclo % 2 === 0);

  // Se recorren en serie, espaciadas, en vez de abrirlas todas a la vez
  // (§8: "cuidado con el volumen... recorrerlas en serie") -- menos carga
  // simultánea sobre el mismo portal, más parecido a como navegaría alguien.
  const ESPACIO_MS = 45 * 1000;
  let demora = 0;
  for (const objetivo of objetivosDeEsteCiclo) {
    const slug = normalizarParaUrl(objetivo.etiqueta);
    if (!slug) continue;
    for (const nombre of plataformas) {
      const construirUrl = URL_BUSQUEDA_POR_PORTAL[nombre];
      if (!construirUrl) continue; // portal conectado pero sin adaptador de búsqueda automática todavía
      const url = construirUrl(slug, filtros);
      setTimeout(() => abrirYEscanear(url), demora);
      demora += ESPACIO_MS;
    }
  }
}

// Abre una pestaña oculta en la URL de búsqueda, dispara el escaneo cuando
// carga, y la cierra sola — mismo flujo sin importar el portal.
function abrirYEscanear(url) {
  chrome.tabs.create({ url, active: false }, tab => {
    const id = tab.id;
    // El flujo normal cierra la pestaña a los ~5 min, y aparte hay un timeout
    // de seguridad a los 6 min por si nunca terminó de cargar. Sin este guard,
    // si el primero ya la cerró, el segundo igual intenta cerrarla de nuevo un
    // minuto después — y como el tab ya no existe, Chrome tira "No tab with id".
    let manejado = false;
    function cerrarTab() {
      if (manejado) return;
      manejado = true;
      chrome.tabs.remove(id, () => { if (chrome.runtime.lastError) {} });
    }

    const onUpdated = (tabId, info) => {
      if (tabId !== id || info.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setTimeout(() => {
        if (manejado) return; // la pestaña ya se cerró (ej. por el timeout de seguridad)
        chrome.tabs.sendMessage(id, { type: 'AUTO_SCAN' }, () => {
          if (chrome.runtime.lastError) { /* pestaña cerrada o sin content script */ }
        });
        // El escaneo puede postular a varias ofertas seguidas — le damos tiempo
        // antes de cerrar la pestaña sola. Ajusta si ves que corta muy justo.
        setTimeout(cerrarTab, 5 * 60 * 1000);
      }, 2000);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Timeout de seguridad, por si el tab nunca termina de cargar
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      cerrarTab();
    }, 6 * 60 * 1000);
  });
}

try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === NOMBRE_ALARMA_AUTOMATICA) {
      escanearAutomatico();
    }
  });
} catch (e) {
  console.error('[AP] No se pudo registrar el listener de alarmas:', e);
}

// ── Reportar postulación al backend de AutoPostula (web) ───────
// Corre en el background porque acá sí hay privilegios de extensión —
// un fetch hecho desde content.js (contexto de la página) lo bloquea CORS.
async function reportarPostulacionBackend(oferta) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');

  if (!autopostulaToken) {
    console.warn('[AP] Sin token de AutoPostula configurado — no se reportó al backend');
    return;
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
        decisionOfertaId: oferta.decisionOfertaId || null
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó la postulación:', data.error || res.status);
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando al backend:', e);
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
    }
  } catch (e) {
    console.warn('[AP] Error de red reportando avistamientos:', e);
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

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'OPEN_AND_APPLY') {
    queue.push({ url: msg.url, titulo: msg.titulo });
    processQueue();
    sendResponse({ queued: true });
  }
  if (msg.type === 'REPORTAR_POSTULACION') {
    reportarPostulacionBackend(msg.oferta);
  }
  if (msg.type === 'REPORTAR_TITULOS_VISTOS') {
    reportarTitulosVistosBackend(msg.titulos, msg.plataforma);
  }
  if (msg.type === 'REPORTAR_BANDA_GRIS') {
    reportarBandaGrisBackend(msg.oferta);
  }
  if (msg.type === 'REPORTAR_AVISTAMIENTOS') {
    reportarAvistamientosBackend(msg.avistamientos, msg.plataforma);
  }
  if (msg.type === 'ACTUALIZAR_ESTADO') {
    actualizarEstadoBackend(msg.datos).then(sendResponse);
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

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoPostula v2 instalado.');
});
