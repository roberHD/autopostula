// ═══════════════════════════════════════════════════════════════
//  AutoPostula — popup.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// Mismo dominio que host_permissions/content_scripts en manifest.json.
// Cuando se compre el dominio propio, actualizar ambos archivos junto con background.js.
const BACKEND_URL = 'https://autopostula.cl';

// ── Qué es este popup ──────────────────────────────────────────
// docs/estrategia-y-rediseno.md §6. Antes era un formulario: filtros, datos
// para la IA, tres interruptores y un botón de guardar, todo guardado en ESTE
// navegador. La misma persona podía ver "Activo" acá y "Pausada" en el panel,
// y ninguna de las dos pantallas mentía: miraban cosas distintas.
//
// Ahora el popup no decide nada por su cuenta. Dice en qué está la máquina
// (postulando, solo mirando, en pausa), qué lleva hecho hoy y qué falta de tu
// parte. Lo único que se cambia acá —pausar y reanudar— se guarda en la
// cuenta, así que el panel muestra lo mismo. El resto se edita en la web.

// ── Estado ─────────────────────────────────────────────────────
let tokenActual = null;
let tokenRechazado = false; // el servidor respondió 401 con este token (§16)
let estadoActual = null;   // { modo, pausada, soloObservar, revisarAntes, ... }
let resumen = null;        // lo que devuelve /api/extension/resumen

// Las mismas palabras que el panel (backend/lib/estado-extension.ts). Se
// copian porque la extensión no comparte build con el backend:
// verificar-estado-extension.js compara los dos archivos y falla si se separan.
const TEXTO_MODO = {
  postulando: {
    titulo: 'Postulando por ti',
    detalle: 'Revisa las ofertas nuevas de tus portales y envía las que calzan.',
  },
  observando: {
    titulo: 'Solo mirando',
    detalle: 'Revisa y puntúa las ofertas, pero no envía ninguna.',
  },
  pausada: {
    titulo: 'En pausa',
    detalle: 'No revisa ni envía nada, ni siquiera cuando entras a un portal.',
  },
};
const TEXTO_MODO_PRUEBA =
  'Todavía no activas la postulación: mira y puntúa, pero no envía. Actívala en el panel cuando veas que acierta.';
const TEXTO_SIN_CUENTA = 'Conecta tu cuenta para que empiece a trabajar por ti.';
// docs/revision-2026-09-28.md §16: un token que el servidor ya no acepta (se
// cambió la contraseña, se generó uno nuevo en otro computador) se mostraba
// como "revisa tu conexión", y no había nada que revisar en la conexión.
const TEXTO_TOKEN_VENCIDO =
  'La conexión con tu cuenta dejó de valer (por ejemplo, porque cambiaste tu contraseña). Entra al panel, Portales, y toca "Conectar esta extensión".';

// ── DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const headerSub       = $('header-sub');
const pulse           = $('pulse');
const pulseLabel      = $('pulse-label');
const estadoLuz       = $('estado-luz');
const estadoTitulo    = $('estado-titulo');
const estadoDetalle   = $('estado-detalle');
const statEnviadas    = $('stat-enviadas');
const statDescartadas = $('stat-descartadas');
const statDisponibles = $('stat-disponibles');
const decidirRow      = $('decidir-row');
const portalesSec     = $('portales-sec');
const portalesLista   = $('portales-lista');
const cuentaSec       = $('cuenta-sec');
const pausarBtn       = $('pausar-btn');
const toastEl         = $('toast');

$('portales-link').href = BACKEND_URL + '/dashboard/portales';
$('nota-link').href = BACKEND_URL + '/dashboard';
decidirRow.href = BACKEND_URL + '/dashboard/por-decidir';

// ── Utilidades ─────────────────────────────────────────────────
function toast(msg, duration = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ── El semáforo ────────────────────────────────────────────────
function renderEstado() {
  if (!tokenActual) {
    estadoLuz.className = 'luz';
    estadoTitulo.textContent = 'Sin conectar';
    estadoDetalle.textContent = TEXTO_SIN_CUENTA;
    pausarBtn.disabled = true;
    return;
  }
  if (tokenRechazado) {
    estadoLuz.className = 'luz';
    estadoTitulo.textContent = 'Reconecta tu cuenta';
    estadoDetalle.textContent = TEXTO_TOKEN_VENCIDO;
    pausarBtn.disabled = true;
    return;
  }
  if (!estadoActual) {
    estadoLuz.className = 'luz';
    estadoTitulo.textContent = 'Cargando…';
    estadoDetalle.textContent = 'Consultando tu cuenta.';
    pausarBtn.disabled = true;
    return;
  }
  const t = TEXTO_MODO[estadoActual.modo] || TEXTO_MODO.pausada;
  estadoLuz.className = 'luz ' + estadoActual.modo;
  estadoTitulo.textContent = t.titulo;
  // Cuando la frena el modo prueba se dice por qué: si no, "solo mirando"
  // parece algo que la persona eligió y no encuentra dónde apagar.
  estadoDetalle.textContent = estadoActual.porModoPrueba ? TEXTO_MODO_PRUEBA : t.detalle;
  pausarBtn.disabled = false;
  pausarBtn.textContent = estadoActual.pausada ? 'Reanudar' : 'Pausar';
  // El pulso del encabezado dice lo mismo en chico.
  const postulando = estadoActual.modo === 'postulando';
  pulse.className = 'pulse' + (postulando ? ' active' : '');
  pulseLabel.className = 'pulse-label' + (postulando ? ' active' : '');
  pulseLabel.textContent = estadoActual.modo === 'pausada' ? 'En pausa' : t.titulo;
}

// ── Cifras, por decidir y portales ─────────────────────────────
function renderResumen() {
  if (!resumen) return;
  if (resumen.nombre) headerSub.textContent = resumen.nombre;

  const c = resumen.cifras || {};
  statEnviadas.textContent = c.enviadasHoy ?? 0;
  statDescartadas.textContent = c.descartadasHoy ?? 0;
  // null = plan sin tope (una cuenta admin): un número inventado mentiría.
  statDisponibles.textContent = c.disponibles === null || c.disponibles === undefined ? '∞' : c.disponibles;

  const d = resumen.porDecidir || {};
  const hayQueDecidir = (d.total || 0) > 0;
  decidirRow.classList.toggle('hidden', !hayQueDecidir);
  if (hayQueDecidir) {
    $('decidir-titulo').textContent =
      d.total === 1 ? '1 oferta por decidir' : d.total + ' ofertas por decidir';
    const sub = $('decidir-sub');
    sub.textContent = d.vencenManana ? d.vencenManana + ' vencen mañana' : '';
    sub.classList.toggle('hidden', !d.vencenManana);
  }

  actualizarAviso({ pausada: !!(estadoActual && estadoActual.pausada) });
  renderPortales();
}

// Sesión en cada portal. El servidor sabe cuáles conectó la persona; si ese
// portal estuvo abierto en alguna pestaña, la extensión ya reportó si había
// sesión iniciada (core.js → background.js, SESION_PORTAL). Sin ese dato no se
// inventa nada: el portal se muestra sin veredicto.
function renderPortales(sesiones) {
  const portales = (resumen && resumen.portales) || [];
  // Se guarda antes de mirar si hay portales: lo que llega con el popup
  // abierto y la cuenta todavía sin contestar no se pierde.
  const s = sesiones || renderPortales._sesiones || {};
  renderPortales._sesiones = s;
  // Si a un portal conectado le falta la sesión, el semáforo lo dice.
  actualizarAviso({ portales: resumen ? portales : null, sesiones: s });
  portalesSec.classList.toggle('hidden', !portales.length);
  if (!portales.length) return;
  portalesLista.innerHTML = '';
  portales.forEach((p) => {
    const fila = document.createElement('div');
    fila.className = 'portal-fila';
    const sesion = s[p.nombre];
    let clase = '';
    let texto = 'Sin revisar';
    if (!p.conectado) { clase = 'falta'; texto = 'Sin conectar'; }
    else if (sesion && sesion.hay === true) { clase = 'ok'; texto = 'Activa'; }
    else if (sesion && sesion.hay === false) { clase = 'falta'; texto = 'Inicia sesión ahí'; }
    fila.innerHTML =
      '<span class="portal-nombre"></span>' +
      '<span class="portal-estado ' + clase + '"><span class="dot"></span><span class="txt"></span></span>';
    fila.querySelector('.portal-nombre').textContent = p.nombre;
    fila.querySelector('.txt').textContent = texto;
    portalesLista.appendChild(fila);
  });
}

// Lo que se muestra si no hay red: lo último que la cuenta dejó guardado en
// este navegador. Mismo criterio que AP.soloObservarEfectivo en core.js.
function estadoDesdeConfig(config) {
  if (!config) return null;
  const pausada = config.active === false;
  const soloObservar = !!config.soloObservar;
  const enPrueba = config.postulacionHabilitada === false;
  return {
    modo: pausada ? 'pausada' : soloObservar || enPrueba ? 'observando' : 'postulando',
    pausada,
    soloObservar,
    revisarAntes: !!config.modoRevision,
    postulacionHabilitada: !enPrueba,
    porModoPrueba: enPrueba && !soloObservar && !pausada,
  };
}

async function cargarResumen(mostrarToast) {
  if (!tokenActual) { renderEstado(); return; }
  try {
    const res = await fetch(BACKEND_URL + '/api/extension/resumen', {
      headers: { 'Authorization': 'Bearer ' + tokenActual },
    });
    tokenRechazado = res.status === 401;
    if (tokenRechazado) {
      renderEstado();
      cuentaSec.classList.remove('hidden');
      if (mostrarToast) toast('⚠ Tu cuenta pide volver a conectar la extensión');
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    resumen = await res.json();
    estadoActual = resumen.estado || null;
    renderEstado();
    renderResumen();
    if (mostrarToast) toast('✓ Actualizado');
  } catch (e) {
    // Sin conexión, o un backend viejo que todavía no tiene /resumen: se
    // muestra lo último guardado en vez de dejar el popup en "Cargando…".
    const { config } = await chrome.storage.local.get('config');
    if (!estadoActual) {
      estadoActual = estadoDesdeConfig(config);
      renderEstado();
    }
    if (mostrarToast) toast('⚠ No se pudo actualizar — revisa tu conexión');
  }
}

// ── Pausar / reanudar ──────────────────────────────────────────
// El cambio se guarda en la cuenta (background.js → /api/extension/estado):
// pausar acá también pausa lo que muestra el panel, y al revés.
pausarBtn.addEventListener('click', () => {
  if (!estadoActual) return;
  const pausada = !estadoActual.pausada;
  pausarBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'CAMBIAR_ESTADO', cambio: { pausada } }, (r) => {
    if (chrome.runtime.lastError || !r || !r.ok) {
      pausarBtn.disabled = false;
      toast('⚠ No se pudo guardar — revisa tu conexión');
      return;
    }
    estadoActual = r.estado;
    renderEstado();
    actualizarAviso({ pausada: !!estadoActual.pausada });
    toast(pausada ? '⏸ En pausa' : '▶ Reanudada');
  });
});

// ── Abrir el panel ─────────────────────────────────────────────
$('panel-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: BACKEND_URL + '/dashboard' });
});

// ── Escanear la página abierta ─────────────────────────────────
$('scan-now-btn').addEventListener('click', () => {
  if (estadoActual && estadoActual.pausada) {
    toast('Está en pausa — reanúdala primero');
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    // Se avisa por chrome.runtime (canal privado de la extensión) y no con un
    // CustomEvent de DOM: un evento de DOM lo puede disparar cualquier script
    // de la propia página (un aviso comprometido, un XSS del portal).
    // Reportado en vivo el 2026-09-29: si la pestaña quedó "huérfana" (se
    // recargó la extensión pero no esa pestaña -- pasa siempre que se recarga
    // desde chrome://extensions dejando abierta una pestaña vieja) o el
    // content script simplemente no llegó a inyectarse, este mensaje nunca
    // llega -- chrome.runtime.lastError lo dice, pero antes se ignoraba y el
    // toast igual mentía "Escaneando…" aunque en la página no pasara nada.
    chrome.tabs.sendMessage(tabs[0].id, { type: 'FORCE_SCAN' }, () => {
      if (chrome.runtime.lastError) {
        toast('⚠ No se pudo conectar con la pestaña — recárgala (F5) e intenta de nuevo');
        return;
      }
      toast('🔍 Escaneando…');
    });
  });
});

// ── Revisar las ofertas de la página abierta ──────────────────
// docs/panel-de-revision-en-el-portal.md §2.1: si la pestaña que la persona
// está mirando es un listado que la extensión ya revisó, el popup ofrece el
// panel de revisión, que se abre ahí mismo (core.js, ESTADO_REVISION y
// ABRIR_REVISION). En cualquier otra página la fila no aparece.
function textoFilaRevision(estado) {
  if (!estado || !estado.total) return null;
  if (estado.enCurso) return { titulo: 'Ver cómo van las postulaciones de esta página', sub: 'Se envían de a una, en otra pestaña' };
  return {
    titulo: estado.total === 1 ? 'Revisar la oferta de esta página' : 'Revisar las ' + estado.total + ' ofertas de esta página',
    sub: 'Elige a cuáles postular, con lo que haría con cada una',
  };
}

function cargarFilaRevision() {
  const fila = document.getElementById('revision-row');
  if (!fila) return;
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { type: 'ESTADO_REVISION' }, (estado) => {
        if (chrome.runtime.lastError) return; // no es un portal, o la pestaña no tiene la extensión
        const texto = textoFilaRevision(estado);
        fila.classList.toggle('hidden', !texto);
        if (!texto) return;
        document.getElementById('revision-titulo').textContent = texto.titulo;
        document.getElementById('revision-sub').textContent = texto.sub;
        fila.onclick = () => {
          chrome.tabs.sendMessage(tab.id, { type: 'ABRIR_REVISION' }, () => {
            void chrome.runtime.lastError;
            window.close();
          });
        };
      });
    });
  } catch (e) { /* popup sin chrome.tabs (no debería pasar) */ }
}

// ── Token de la cuenta web ────────────────────────────────────
const apTokenInput      = $('ap-token');
const apTokenEye        = $('ap-token-eye');
const apTokenSaveBtn    = $('ap-token-save');
const apTokenDot        = $('ap-token-dot');
const apTokenStatusText = $('ap-token-status-text');
const apTokenMostrarManualBtn = $('ap-token-mostrar-manual');
const apTokenManualBox  = $('ap-token-manual');

function actualizarEstadoToken(hayToken) {
  apTokenDot.className = 'dot' + (hayToken ? ' ok' : '');
  apTokenStatusText.textContent = hayToken
    ? 'Conectada — tus postulaciones se guardan en la web'
    : 'Sin conectar — conéctala desde el onboarding de la web';
  // Con la cuenta conectada esto ya no es algo que haya que mirar: la sección
  // se pliega y el popup queda solo con lo que importa.
  cuentaSec.classList.toggle('hidden', hayToken);
}

apTokenMostrarManualBtn.addEventListener('click', () => {
  apTokenManualBox.classList.toggle('hidden');
});

apTokenEye.addEventListener('click', () => {
  apTokenInput.type = apTokenInput.type === 'password' ? 'text' : 'password';
});

apTokenSaveBtn.addEventListener('click', async () => {
  const valor = apTokenInput.value.trim();
  // docs/revision-2026-09-28.md §16: antes se guardaba sin probarlo, y un token
  // mal copiado se veía como "conectado" hasta que algo fallaba en silencio.
  // Si el servidor dice que no sirve, no se guarda. Sin red no se puede saber:
  // se guarda igual y el resumen lo vuelve a revisar al abrir el popup.
  if (valor) {
    try {
      const res = await fetch(BACKEND_URL + '/api/extension/resumen', { headers: { 'Authorization': 'Bearer ' + valor } });
      if (res.status === 401) {
        toast('⚠ Ese token no sirve: cópialo de nuevo desde Portales');
        return;
      }
    } catch (e) { /* sin red: se guarda igual */ }
  }
  chrome.storage.sync.set({ autopostulaToken: valor || null }, () => {
    tokenActual = valor || null;
    tokenRechazado = false;
    actualizarEstadoToken(!!tokenActual);
    if (tokenActual) {
      cargarResumen(true);
      apTokenManualBox.classList.add('hidden');
      apTokenInput.value = '';
    }
  });
});

// Si bridge.js conecta el token mientras el popup está abierto (pasa si la
// persona tiene la pestaña de onboarding y el popup a la vez), se refleja sin
// tener que cerrar y volver a abrir.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.autopostulaToken) {
    tokenActual = changes.autopostulaToken.newValue || null;
    tokenRechazado = false;
    actualizarEstadoToken(!!tokenActual);
    if (tokenActual) cargarResumen(false);
  }
  // La sesión en cada portal la reporta el content script cuando la persona
  // entra a uno; background.js la guarda acá.
  if (area === 'local' && changes.sesionesPortales) renderPortales(changes.sesionesPortales.newValue || {});
});

// ── Escuchar al content script ─────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  // Postuló algo con el popup abierto: las cifras salen de la cuenta, así que
  // se vuelven a pedir en vez de sumar de a uno acá.
  if (msg.type === 'LOG_UPDATED') cargarResumen(false);
  if (msg.type === 'STATUS' && msg.status === 'working') {
    pulse.className = 'pulse working';
    pulseLabel.className = 'pulse-label working';
    pulseLabel.textContent = 'Postulando…';
  }
});

// ── Última puesta al día (docs/rafagas-y-ponerse-al-dia.md §3.5) ────────
// textoRafaga y haceCuanto son puras a propósito (sin DOM ni chrome.*):
// verificar-rafagas.js las extrae de este archivo y las prueba tal cual.
function haceCuanto(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace unos segundos';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : 'hace ' + d + ' días';
}

// Devuelve { titulo, detalle } o null si no hay nada que mostrar. "Te pusimos
// al día hace 12 min" + "7 postulaciones · 14 descartadas". En modo solo
// observar nada se postuló, y decir "0 postulaciones" sería mentir por
// omisión: se cuenta lo que HABRÍA postulado.
function textoRafaga(rafaga, ahora) {
  if (!rafaga || !rafaga.estado) return null;

  // Mismo umbral que retomarORafagaInterrumpida (background.js): un "en_curso"
  // sin latido reciente es una ráfaga que el service worker perdió sin llegar
  // a marcarla -- decir que se está poniendo al día sería mentira, así que se
  // muestra como lo que va a terminar siendo: interrumpida.
  const LATIDO_MAX_MS = 10 * 60000;
  const viva = rafaga.estado === 'en_curso' && ahora - (rafaga.latido || rafaga.inicio) < LATIDO_MAX_MS;
  if (viva) {
    const total = (rafaga.pasos || []).length;
    const paso = Math.min((rafaga.pasoActual || 0) + 1, total);
    return { titulo: 'Poniéndose al día ahora…', detalle: total ? 'Paso ' + paso + ' de ' + total : '' };
  }
  const estado = rafaga.estado === 'en_curso' ? 'interrumpida' : rafaga.estado;

  const c = rafaga.conteos || {};
  const postuladas = c.postuladas || 0;
  const observadas = c.observadas || 0;
  const partes = [];
  if (postuladas === 0 && observadas > 0) partes.push('habría postulado a ' + observadas);
  else partes.push(postuladas + (postuladas === 1 ? ' postulación' : ' postulaciones'));
  if (c.gris > 0) partes.push(c.gris + ' por decidir');
  if (c.descartadas > 0) partes.push(c.descartadas + (c.descartadas === 1 ? ' descartada' : ' descartadas'));
  // Una búsqueda que no terminó (venció el seguro de tiempo) se dice, no se
  // esconde: si no, "0 postulaciones" parece "no había nada" y era "no llegó".
  if (c.errores > 0) partes.push(c.errores + (c.errores === 1 ? ' búsqueda no terminó' : ' búsquedas no terminaron'));

  const cuando = haceCuanto(ahora - (rafaga.fin || rafaga.latido || rafaga.inicio));
  const titulo = estado === 'interrumpida'
    ? 'La última puesta al día se cortó ' + cuando
    : 'Te pusimos al día ' + cuando;
  return { titulo, detalle: partes.join(' · ') };
}

function renderRafaga(rafaga) {
  actualizarAviso({ rafaga: rafaga || null });
  const fila = document.getElementById('rafaga-row');
  if (!fila) return;
  const texto = textoRafaga(rafaga, Date.now());
  fila.classList.toggle('hidden', !texto);
  if (!texto) return;
  document.getElementById('rafaga-titulo').textContent = texto.titulo;
  const detalle = document.getElementById('rafaga-detalle');
  detalle.textContent = texto.detalle;
  detalle.classList.toggle('hidden', !texto.detalle);
}

// ── "Ponerme al día ahora" (docs/rafagas-y-ponerse-al-dia.md §3.6) ─────────
// Los textos son los mismos que en el panel (backend/lib/texto-rafaga.ts): la
// persona ve el botón en los dos lados y tienen que explicar lo mismo.
// verificar-rafagas.js compara este archivo contra ese.

// "unos 8 minutos". No promete un número de ofertas: no se sabe cuántas hay
// hasta escanear -- solo cuánto suele tardar, que sí se sabe.
function duracionAproximada(ms) {
  if (!ms || ms <= 0) return 'unos minutos';
  if (ms < 60000) return 'menos de un minuto';
  const min = Math.round(ms / 60000);
  if (min === 1) return 'un minuto';
  if (min >= 60) return 'más de una hora';
  return 'unos ' + min + ' minutos';
}

function textoEstimadoPonerse(ms) {
  return ms ? 'Suele tardar ' + duracionAproximada(ms) + '.' : 'Puede tardar unos minutos.';
}

// Por qué no arrancó. Las claves son las que devuelve background.js.
const MOTIVOS_PONERSE_AL_DIA = {
  en_curso: 'Ya se está poniendo al día. Te avisamos en el ícono de la extensión.',
  reciente: 'Te pusimos al día hace muy poco. Vuelve a intentarlo en unos minutos.',
  sin_plan: 'Ponerte al día ahora es parte de Premium.',
  pausada: 'La búsqueda automática está en pausa. Reanúdala desde tu panel.',
  sin_cupo: 'Ya usaste tus postulaciones de este mes. Se reinicia el día 1.',
  sin_portales: 'Conecta un portal para empezar.',
  sin_objetivo: 'Cuéntanos qué buscas, en tu panel, para poder empezar.',
  sin_token: 'Conecta la extensión con tu cuenta desde tu panel.',
  sin_conexion: 'No pudimos consultar tu cuenta. Revisa tu conexión e inténtalo de nuevo.',
  extension_no_responde: 'La extensión no respondió. Recarga esta página e inténtalo de nuevo.',
};
const MOTIVO_GENERICO_PONERSE = 'No se pudo poner al día ahora. Inténtalo de nuevo en unos minutos.';
const TEXTO_EMPEZO_PONERSE = 'Empezó. Puedes cerrar esto: te avisamos en el ícono de la extensión.';

// Estos motivos pueden pasar (mala conexión, un worker que se reinició): tiene
// sentido dejar volver a apretar. Los demás no cambian por apretar de nuevo.
const MOTIVOS_REINTENTABLES_PONERSE = ['sin_conexion', 'extension_no_responde'];

function textoMotivoPonerse(motivo) {
  return (motivo && MOTIVOS_PONERSE_AL_DIA[motivo]) || MOTIVO_GENERICO_PONERSE;
}

// { deshabilitado, hint } o null si la fila no se muestra: en una cuenta
// gratis el botón ni aparece (§3.6). Bloqueado se ve, deshabilitado, con la
// razón debajo -- más útil que esconderlo y dejar a la persona sin saber qué
// hacer. Habilitado dice cuánto suele tardar.
function estadoBotonPonerse(estado) {
  if (!estado || !estado.mostrar) return null;
  if (estado.bloqueo) return { deshabilitado: true, hint: textoMotivoPonerse(estado.bloqueo) };
  return { deshabilitado: false, hint: textoEstimadoPonerse(estado.estimadoMs) };
}

// ── La prueba de 5 postulaciones automáticas (docs/rafagas-y-ponerse-al-dia.md §4.1) ──
// Las mismas palabras que el panel y el correo de fin de prueba
// (backend/lib/texto-rafaga.ts): es la misma promesa dicha en tres lugares.
// verificar-rafagas.js compara este bloque contra ese archivo.

// Cuántas lleva, no cuántas quedan: "3 de 5". Ancla `restantes` a [0, total]
// para que un dato raro nunca dibuje "7 de 5".
function textoPruebaEnCurso(restantes, total) {
  const enviadas = Math.max(0, Math.min(total, total - restantes));
  return 'Prueba automática: ' + enviadas + ' de ' + total + ' postulaciones';
}

function textoPruebaTerminada(total) {
  return 'Tu prueba terminó: AutoPostula envió ' + total + ' postulaciones sin que entraras a ningún portal.';
}

const TEXTO_DESPUES_DE_LA_PRUEBA =
  'Con Premium sigue así, cada vez que abres tu computador. Con el plan gratis, entra a Computrabajo, Laborum o Trabajando y la extensión postula por ti.';
const TEXTO_PASAR_A_PREMIUM = 'Pasar a Premium';
const RUTA_VER_LAS_DE_PRUEBA = '/dashboard/historial?filtro=prueba';

function textoVerLasDePrueba(total) {
  return 'Ver las ' + total;
}

// `prueba` es lo que arma background.js (pruebaDeEstado): null si no aplica
// (Premium, o un servidor anterior a la prueba), { estado: 'en_curso', restantes,
// total } mientras dura, o { estado: 'terminada', total }.
function textoPrueba(prueba) {
  if (!prueba) return null;
  if (prueba.estado === 'en_curso') {
    return { titulo: textoPruebaEnCurso(prueba.restantes, prueba.total), detalle: '', enlaces: null };
  }
  if (prueba.estado === 'terminada') {
    return {
      titulo: textoPruebaTerminada(prueba.total),
      detalle: TEXTO_DESPUES_DE_LA_PRUEBA,
      enlaces: [
        { texto: textoVerLasDePrueba(prueba.total), ruta: RUTA_VER_LAS_DE_PRUEBA },
        { texto: TEXTO_PASAR_A_PREMIUM, ruta: '/dashboard/premium' },
      ],
    };
  }
  return null;
}

function renderPrueba(prueba) {
  const fila = document.getElementById('prueba-row');
  if (!fila) return;
  const t = textoPrueba(prueba);
  fila.classList.toggle('hidden', !t);
  if (!t) return;
  document.getElementById('prueba-titulo').textContent = t.titulo;
  const detalle = document.getElementById('prueba-detalle');
  detalle.textContent = t.detalle;
  detalle.classList.toggle('hidden', !t.detalle);
  const enlaces = document.getElementById('prueba-links');
  enlaces.classList.toggle('hidden', !t.enlaces);
  if (!t.enlaces) return;
  [['prueba-ver', t.enlaces[0]], ['prueba-premium', t.enlaces[1]]].forEach(([id, e]) => {
    const a = document.getElementById(id);
    a.textContent = e.texto;
    a.href = BACKEND_URL + e.ruta;
  });
}

function renderPonerse(estado) {
  // La prueba viene en la misma respuesta (una sola consulta al servidor) y se
  // muestra aunque el botón no: es lo único automático de una cuenta gratis.
  renderPrueba(estado && estado.prueba);
  // Y si hoy se pone al día sola: el semáforo solo dice "se pone al día sola
  // cuando lo abres" si es verdad.
  actualizarAviso({ automatica: !!(estado && estado.automatica) });
  const fila = document.getElementById('ponerse-row');
  if (!fila) return;
  const e = estadoBotonPonerse(estado);
  fila.classList.toggle('hidden', !e);
  if (!e) return;
  document.getElementById('ponerse-btn').disabled = e.deshabilitado;
  document.getElementById('ponerse-hint').textContent = e.hint;
}

function cargarEstadoPonerse() {
  try {
    chrome.runtime.sendMessage({ type: 'ESTADO_PONERSE_AL_DIA' }, (estado) => {
      if (chrome.runtime.lastError) return; // el worker no contestó: la fila queda como estaba
      renderPonerse(estado);
    });
  } catch (e) { /* popup sin runtime (no debería pasar) */ }
}

function apretarPonerse() {
  const boton = document.getElementById('ponerse-btn');
  const hint = document.getElementById('ponerse-hint');
  if (!boton || !hint) return;
  boton.disabled = true;
  hint.textContent = 'Empezando…';
  chrome.runtime.sendMessage({ type: 'PONERSE_AL_DIA' }, (respuesta) => {
    if (chrome.runtime.lastError || !respuesta) {
      hint.textContent = textoMotivoPonerse('extension_no_responde');
      boton.disabled = false;
      return;
    }
    if (respuesta.ok) {
      hint.textContent = TEXTO_EMPEZO_PONERSE;
      return; // queda deshabilitado: ya está corriendo
    }
    hint.textContent = textoMotivoPonerse(respuesta.motivo);
    boton.disabled = !MOTIVOS_REINTENTABLES_PONERSE.includes(respuesta.motivo);
  });
}

// El número del ícono (background.js) dice "pasó algo"; abrir el popup es
// verlo, así que se limpia. La línea de arriba sigue contando la última
// ráfaga aunque el número ya no esté.
function limpiarInsigniaRafaga() {
  try { chrome.action.setBadgeText({ text: '' }); } catch (e) { /* sin chrome.action (no debería pasar) */ }
}

// Si una ráfaga termina con el popup abierto, se actualiza sola la línea y
// el número que acaba de aparecer se limpia: la persona ya lo está mirando.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rafaga) {
    renderRafaga(changes.rafaga.newValue);
    limpiarInsigniaRafaga();
    // Cada paso de una ráfaga en curso también cambia `rafaga`, pero el botón
    // solo tiene algo nuevo que decir cuando terminó (vuelve el enfriamiento).
    const nueva = changes.rafaga.newValue;
    if (nueva && nueva.estado !== 'en_curso') cargarEstadoPonerse();
  }
});

// ── Qué necesita de ti (docs/primera-busqueda-guiada.md §4 y §12) ─────────
// Tres cosas que no se deducen mirando y sin las cuales parece rota. Van en
// el semáforo, de a una, cada una cuando aplica y mientras aplique:
//   1. La sesión en el portal: cuando un portal conectado avisó que no la
//      hay (core.js, SESION_PORTAL). Sin ella no postula ahí: va primero.
//   2. Que trabaja con Chrome abierto: la primera vez que una puesta al día
//      quedó cortada (se cerró Chrome o se suspendió el computador a la
//      mitad), mientras esa siga siendo la última. Solo si hoy de verdad se
//      pone al día sola: Premium o la prueba, sin pausa y con cupo.
//   3. Lo del plan gratis: lo dice la fila de la prueba cuando se acaba
//      (textoPrueba, con las palabras del panel y del correo), así que acá
//      no se repite. Con la prueba terminada la 2 no aplica: las tres nunca
//      salen juntas.
// avisoParaTi es pura (sin DOM ni chrome.*): verificar-primera-busqueda.js
// la extrae de este archivo y la prueba tal cual.

// Dónde se entra a cada portal. Copia de SESION_POR_PORTAL (core.js):
// verificar-estado-extension.js compara las dos.
const INGRESO_POR_PORTAL = {
  Computrabajo: 'https://candidato.cl.computrabajo.com/acceso/',
  Laborum: 'https://www.laborum.cl/login',
  Trabajando: 'https://www.trabajando.cl/ingresa-a-tu-cuenta',
};

const TEXTO_CHROME_ABIERTO =
  'La extensión trabaja mientras Chrome está abierto, y se pone al día sola cuando lo abres.';

// "Laborum", "Laborum y Trabajando", "Computrabajo, Laborum y Trabajando".
function enumerarPortales(nombres) {
  if (nombres.length < 2) return nombres.join('');
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

function textoSinSesion(nombres) {
  return 'Necesitas tener tu sesión iniciada en ' + enumerarPortales(nombres) +
    '. Sin ella, la extensión no puede postular ahí.';
}

// Mismo criterio que textoRafaga: "interrumpida", o "en_curso" sin latido en
// 10 minutos (el service worker la perdió sin alcanzar a marcarla).
function rafagaCortada(rafaga, ahora) {
  if (!rafaga) return false;
  if (rafaga.estado === 'interrumpida') return true;
  return rafaga.estado === 'en_curso' && ahora - (rafaga.latido || rafaga.inicio) >= 10 * 60000;
}

// null, o { tipo: 'sesion' | 'chrome', texto, enlaces: [{ texto, url }], rafagaId? }.
// `d` junta lo que llega de a poco:
//   portales     lo que la cuenta tiene conectado ([{ nombre, conectado }]); null si no contestó
//   sesiones     lo último que avisó cada portal ({ Laborum: { hay: false } })
//   rafaga       la última puesta al día (chrome.storage.local)
//   automatica   el servidor dice que hoy se pone al día sola (busquedaAutomatica)
//   pausada      la persona la pausó desde el popup
//   chromeVisto  la puesta al día con la que ya se mostró la 2
function avisoParaTi(d, ahora) {
  const sesiones = d.sesiones || {};
  const sinSesion = (d.portales || [])
    .filter((p) => p.conectado && sesiones[p.nombre] && sesiones[p.nombre].hay === false)
    .map((p) => p.nombre);
  if (sinSesion.length) {
    return {
      tipo: 'sesion',
      texto: textoSinSesion(sinSesion),
      enlaces: sinSesion
        .filter((n) => INGRESO_POR_PORTAL[n])
        .map((n) => ({ texto: 'Iniciar sesión en ' + n, url: INGRESO_POR_PORTAL[n] })),
    };
  }
  const r = d.rafaga;
  const id = r ? r.id || String(r.inicio || '') : '';
  if (d.automatica === true && !d.pausada && rafagaCortada(r, ahora) && id && (!d.chromeVisto || d.chromeVisto === id)) {
    return { tipo: 'chrome', texto: TEXTO_CHROME_ABIERTO, enlaces: [], rafagaId: id };
  }
  return null;
}

const avisoDatos = { portales: null, sesiones: {}, rafaga: null, automatica: null, pausada: false, chromeVisto: null };

function pintarAviso(aviso) {
  const caja = document.getElementById('aviso');
  if (!caja) return;
  caja.classList.toggle('hidden', !aviso);
  if (!aviso) return;
  caja.classList.toggle('falta', aviso.tipo === 'sesion');
  document.getElementById('aviso-texto').textContent = aviso.texto;
  const enlaces = document.getElementById('aviso-links');
  enlaces.textContent = '';
  aviso.enlaces.forEach((e) => {
    const a = document.createElement('a');
    a.href = e.url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = e.texto + ' ↗';
    enlaces.appendChild(a);
  });
  enlaces.classList.toggle('hidden', !aviso.enlaces.length);
}

// Cada fuente avisa lo suyo (la cuenta, storage, el service worker) y se
// vuelve a pintar. La 2 se anota la primera vez que se muestra: con la
// próxima puesta al día cortada ya no sale.
function actualizarAviso(cambios) {
  Object.assign(avisoDatos, cambios);
  const aviso = avisoParaTi(avisoDatos, Date.now());
  pintarAviso(aviso);
  if (aviso && aviso.tipo === 'chrome' && avisoDatos.chromeVisto !== aviso.rafagaId) {
    avisoDatos.chromeVisto = aviso.rafagaId;
    try { chrome.storage.local.set({ avisoChromeVisto: aviso.rafagaId }); } catch (e) { /* sin storage: sale otra vez la próxima */ }
  }
}

// ── Cargar estado ──────────────────────────────────────────────
document.getElementById('ponerse-btn')?.addEventListener('click', apretarPonerse);

function loadState() {
  cargarFilaRevision();
  chrome.storage.local.get(['config', 'rafaga', 'sesionesPortales', 'avisoChromeVisto'], data => {
    // Antes que la ráfaga: con qué puesta al día ya se dijo lo de Chrome abierto.
    avisoDatos.chromeVisto = data.avisoChromeVisto || null;
    renderRafaga(data.rafaga);
    limpiarInsigniaRafaga();
    cargarEstadoPonerse();
    // Lo guardado se dibuja de inmediato y cargarResumen() lo corrige apenas
    // conteste el servidor: abrir el popup no debería mostrar un vacío.
    estadoActual = estadoDesdeConfig(data.config);
    avisoDatos.pausada = !!(estadoActual && estadoActual.pausada);
    if (data.config && data.config.perfil && data.config.perfil.nombre) {
      headerSub.textContent = data.config.perfil.nombre;
    }
    renderPortales._sesiones = data.sesionesPortales || {};
    renderEstado();

    chrome.storage.sync.get('autopostulaToken', (d) => {
      tokenActual = d.autopostulaToken || null;
      actualizarEstadoToken(!!tokenActual);
      // renderEstado() de la línea de arriba corrió con tokenActual todavía en
      // null (esto recién contesta después, es async) -- sin repetirlo acá, una
      // cuenta conectada de verdad se quedaba pegada en "Sin conectar" para
      // siempre: cargarResumen() no lo corrige si el fetch falla, porque para
      // ese entonces estadoActual ya no es null (viene del config cacheado) y
      // su rama de respaldo no vuelve a pintar.
      renderEstado();
      cargarResumen(false);
    });
  });
}

loadState();
