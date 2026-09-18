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

// ── ¿Se puede postular ahora? (límites y portal conectado) ─────
// docs/revision-2026-09-16.md §1.3: se consulta ANTES de cada "Postulando:"
// en los tres adaptadores -- antes solo se sabía que el tope o el portal no
// calzaban DESPUÉS de haber postulado de verdad en el sitio externo (el 403/400
// de /api/applications llega recién ahí). Si esto falla (sin token, sin red,
// backend caído) se responde permitido:true -- /api/applications sigue
// validando lo mismo después, como defensa en profundidad; esta consulta solo
// evita el intento inútil, no es la única barrera.
async function puedePostularBackend(plataforma) {
  const { autopostulaToken } = await chrome.storage.sync.get('autopostulaToken');
  if (!autopostulaToken) return { permitido: true, motivo: null, restantes: null };

  try {
    const res = await fetch(BACKEND_URL + '/api/extension/puede-postular?plataforma=' + encodeURIComponent(plataforma), {
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
  // Verificado en vivo el 2026-09-08: el único facet de portal que Trabajando
  // expone como parámetro de URL navegable es la comuna (?ubicacion={slug},
  // funciona igual para cualquier comuna de Chile, no solo RM). El filtro de
  // "Jornadas" del sitio (que ahí mezcla jornada y modalidad en una sola
  // lista) corre contra su propia API interna sin reflejarse en la URL --
  // no se inventa un parámetro que no existe, se deja sin ese facet acá.
  'Trabajando': (slug, filtros) => {
    let url = 'https://www.trabajando.cl/trabajo-empleo/' + slug;
    const comuna = filtros && filtros.comunas && filtros.comunas[0];
    if (comuna && (!filtros || filtros.modalidad !== 'remoto')) {
      url += '?ubicacion=' + comunaParaUrl(comuna);
    }
    return url;
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

// docs/rafagas-y-ponerse-al-dia.md §3.1: los tres disparadores automáticos
// (se abre Chrome, despierta, chequeo periódico) pasan todos por acá antes
// de arrancar una ráfaga -- el umbral evita que abrir y cerrar la tapa diez
// veces seguidas dispare diez ráfagas. El botón manual (§3.6, todavía sin
// construir) va a ser el único que llame a escanearAutomatico() directo,
// ignorando el umbral a propósito -- por eso el umbral vive acá y no adentro.
const UMBRAL_HORAS_ENTRE_RAFAGAS = 3;

async function quizasRafaga(disparador) {
  const { rafaga, ultimaRafagaFin } = await chrome.storage.local.get(['rafaga', 'ultimaRafagaFin']);
  if (rafaga && rafaga.estado === 'en_curso') return; // ya hay una corriendo
  if (ultimaRafagaFin && Date.now() - ultimaRafagaFin < UMBRAL_HORAS_ENTRE_RAFAGAS * 3600e3) return;
  await escanearAutomatico(disparador);
}

async function escanearAutomatico(disparador) {
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
    pasos.push({ tipo: 'estados', portal: 'Computrabajo', url: 'https://cl.computrabajo.com/candidate/match' });
  }

  await iniciarRafaga(disparador || 'chequeo', pasos);
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

async function iniciarRafaga(disparador, pasos) {
  if (!pasos.length) return;
  const { rafaga: existente } = await chrome.storage.local.get('rafaga');
  if (existente && existente.estado === 'en_curso') return; // ya hay una corriendo

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
}

async function avanzarRafaga() {
  const { rafaga } = await chrome.storage.local.get('rafaga');
  if (!rafaga || rafaga.estado !== 'en_curso') return;

  if (rafaga.pasoActual >= rafaga.pasos.length) {
    rafaga.estado = 'terminada';
    rafaga.fin = Date.now();
    await chrome.storage.local.set({ rafaga, ultimaRafagaFin: Date.now() });
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
  rafaga.pasoActual += 1;
  rafaga.latido = Date.now();
  await chrome.storage.local.set({ rafaga });
  chrome.alarms.clear(NOMBRE_ALARMA_SEGURO_RAFAGA);
  if (tabId != null) chrome.tabs.remove(tabId, () => { if (chrome.runtime.lastError) {} });
  avanzarRafaga();
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
async function reportarPostulacionBackend(oferta) {
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
        decisionOfertaId: oferta.decisionOfertaId || null
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('[AP] Backend rechazó la postulación:', data.error || res.status);
      return { ok: false, error: data.error || ('Error ' + res.status) };
    }
    return { ok: true };
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
  if (msg.type === 'OPEN_AND_APPLY') {
    queue.push({ url: msg.url, titulo: msg.titulo });
    processQueue();
    sendResponse({ queued: true });
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
    reportarPostulacionBackend(msg.oferta).then(sendResponse);
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
  if (msg.type === 'REPORTAR_AVISTAMIENTOS') {
    reportarAvistamientosBackend(msg.avistamientos, msg.plataforma).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'ACTUALIZAR_ESTADO') {
    actualizarEstadoBackend(msg.datos).then(sendResponse);
    return true;
  }
  if (msg.type === 'PUEDE_POSTULAR') {
    puedePostularBackend(msg.plataforma).then(sendResponse);
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

chrome.runtime.onInstalled.addListener(() => {
  console.log('AutoPostula v2 instalado.');
});
