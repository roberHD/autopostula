// ═══════════════════════════════════════════════════════════════
//  AutoPostula — core.js
//  Todo lo que NO depende del sitio en el que estemos parados.
//  Se carga ANTES que el adaptador de cada portal (ver manifest.json);
//  ambos scripts comparten el mismo scope global de la página, así que
//  todo cuelga de "window.AP" para no ensuciar el global namespace ni
//  chocar con el JS del propio sitio.
// ═══════════════════════════════════════════════════════════════
(function () {
'use strict';

const AP = window.AP = window.AP || {};

// ── Estado compartido ────────────────────────────────────────────
AP.cfg = null;
AP.iaDisponible = false; // true si hay token de AutoPostula configurado
AP.activo = false;
AP.procesando = false;
AP.vistos = new Set();
AP.log = [];

// AP.escanear y AP.onInit los define cada adaptador (computrabajo.js /
// laborum.js) antes de que corran los callbacks async de abajo — el
// orden de carga en manifest.json garantiza que el adaptador ya terminó
// de ejecutarse cuando estos callbacks disparan.
AP.escanear = null;
AP.onInit = null;

// ── Overlay (igual en cualquier sitio) ───────────────────────────
let ov = null;
AP.msg = function (texto, color) {
  color = color || '#16A34A';
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ap-ov';
    Object.assign(ov.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647',
      background: '#fff', border: '1px solid #ddd', borderRadius: '10px',
      padding: '10px 14px', fontFamily: 'system-ui,sans-serif', fontSize: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,.15)', minWidth: '200px'
    });
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<b style="color:' + color + '">● AutoPostula</b><br><span style="color:#666">' + texto + '</span>';
};
AP.limpiarOverlay = function () { if (ov) { ov.remove(); ov = null; } };

// ── Helpers básicos ───────────────────────────────────────────────
AP.sleep = function (ms) { return new Promise(r => setTimeout(r, ms)); };
AP.n = function (s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); };
AP.safeSet = function (data) { try { chrome.storage.local.set(data); } catch (e) {} };
AP.safeSend = function (m) { try { chrome.runtime.sendMessage(m).catch(() => {}); } catch (e) {} };

AP.addLog = function (entry) {
  AP.log.push(entry);
  if (AP.log.length > 200) AP.log = AP.log.slice(-200);
  AP.safeSet({ log: AP.log });
  AP.safeSend({ type: 'LOG_UPDATED', log: AP.log });
  // Antes esto quedaba solo guardado en storage, sin avisar en ninguna consola —
  // así que un error o un salto pasaban totalmente desapercibidos al depurar.
  if (entry.status === 'err') console.warn('[AP] postulación con error:', entry.title, '—', entry.reason, entry);
  else if (entry.status === 'skip') console.log('[AP] postulación saltada:', entry.title, '—', entry.reason);
};

// ── Reportar postulación al backend de AutoPostula (web) ─────────
// El fetch NO se hace aquí: content scripts corren en el contexto de la
// página del portal, así que CORS lo bloquea igual que si fuera la propia
// página quien llamara. Se le avisa al background, que sí tiene privilegios
// de extensión para hacer la llamada sin que CORS se meta.
// "plataforma" identifica el JobPlatform en el backend (ver background.js) —
// si se omite, background.js asume "Computrabajo" por compatibilidad.
AP.reportarPostulacion = function (oferta) {
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_POSTULACION', oferta: oferta });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background:', e);
  }
};

// ── Reportar títulos vistos al backend (cosecha pasiva del corpus de títulos) ──
// Fire-and-forget, igual que reportarPostulacion: no bloquea el escaneo ni espera
// respuesta, y si falla no es grave (best-effort). Ver docs/rediseno-filtrado-ofertas.md, §7.2.
AP.reportarTitulosVistos = function (titulos, plataforma) {
  if (!titulos || !titulos.length) return;
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_TITULOS_VISTOS', titulos: titulos, plataforma: plataforma });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background (títulos vistos):', e);
  }
};

// ── Reportar oferta en banda gris al backend (scorer local, §6) ──────────
AP.reportarBandaGris = function (oferta) {
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_BANDA_GRIS', oferta: oferta });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background (banda gris):', e);
  }
};

AP.actualizarEstadoPostulacion = function (datos) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'ACTUALIZAR_ESTADO', datos: datos }, (respuesta) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(respuesta || null);
      });
    } catch (e) { resolve(null); }
  });
};

// Palabras que delatan modalidad/jornada en el texto de la oferta -- estas
// dos solo se filtran "en positivo" (exigiendo que el aviso mencione alguna)
// cuando el criterio es remoto/hibrido o full_time/part_time. "presencial" y
// "cualquiera" no filtran nada: la mayoria de los avisos presenciales no se
// molestan en decirlo explicitamente, y rechazarlos por la sola ausencia de
// la palabra dejaria fuera ofertas validas.
const AP_KEYWORDS_MODALIDAD = {
  remoto: ['remoto', 'teletrabajo', 'home office', 'trabajo a distancia'],
  hibrido: ['hibrido', 'semipresencial', 'semi presencial'],
};
const AP_KEYWORDS_JORNADA = {
  full_time: ['full time', 'jornada completa', 'tiempo completo'],
  part_time: ['part time', 'media jornada', 'jornada parcial', 'medio tiempo'],
};

// ── Filtro de palabras clave / exclusión / ubicación / modalidad / jornada ──
// Portal-agnóstico a propósito: cada adaptador extrae su propio texto y
// ubicación (la estructura del DOM cambia por sitio) y le pasa strings
// planos acá. Devuelve true si la oferta pasa todos los filtros configurados.
AP.coincideFiltros = function (textoCompleto, ubicacion) {
  const cfg = AP.cfg;
  if (!cfg) return false;
  const t = AP.n(textoCompleto || '');

  if (cfg.excTags && cfg.excTags.length) {
    if (cfg.excTags.some(tag => t.includes(AP.n(tag)))) return false;
  }
  if (cfg.incTags && cfg.incTags.length) {
    const expandido = t.replace(/\bpt\b/g, 'part time').replace(/\(a\)/g, 'a').replace(/\/a\b/g, 'a');
    if (!cfg.incTags.some(tag => expandido.includes(AP.n(tag)))) return false;
  }
  if (cfg.locTags && cfg.locTags.length) {
    const ubic = AP.n(ubicacion || textoCompleto || '');
    if (!cfg.locTags.some(tag => ubic.includes(AP.n(tag)))) return false;
  }

  const filtros = cfg.filtrosBusqueda;
  if (filtros) {
    const keywordsModalidad = AP_KEYWORDS_MODALIDAD[filtros.modalidad];
    if (keywordsModalidad && !keywordsModalidad.some(k => t.includes(AP.n(k)))) return false;

    const keywordsJornada = AP_KEYWORDS_JORNADA[filtros.jornada];
    if (keywordsJornada && !keywordsJornada.some(k => t.includes(AP.n(k)))) return false;
  }

  return true;
};

// ── Scorer local (docs/rediseno-filtrado-ofertas.md §6) ──────────────────
// Reemplaza a AP.coincideFiltros -- pero por ahora CONVIVEN detrás de
// AP.cfg.usarScorerLocal (ver §13: "no borrar coincideFiltros hasta que el
// scorer esté validado"). Puro JS, determinista, sin IA en runtime: evalúa
// una oferta contra el Perfil de Búsqueda compilado (§5) y devuelve
// {score, banda, razones[]} -- nunca un booleano pelado. banda es
// 'postular' | 'gris' | 'descartar'.

function apEscaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sufijador simple de género/plural (§6: "cubre casi toda la varianza de
// títulos chilenos, no hace falta una librería") -- solo se aplica a palabras
// que terminan en los sufijos típicos de ocupación en masculino/neutro
// singular (vendedor, cocinero, recepcionista), para no inflar de más
// palabras que no varían así.
function apPatronPalabra(palabra) {
  const escapada = apEscaparRegex(palabra);
  if (/^[a-z]+(o|or|ista)$/.test(palabra)) {
    return escapada + '(?:a|as|es|os)?';
  }
  return escapada;
}

// Frase completa con límites de palabra, nunca subcadena (§6, mismo bug que
// tenía coincideFiltros con "aseo"/"paseo"). El texto de entrada ya debe venir
// normalizado con AP.n antes de construir/usar este patrón.
function apConstruirPatron(patronNormalizado) {
  const palabras = patronNormalizado.split(/\s+/).filter(Boolean).map(apPatronPalabra);
  if (!palabras.length) return null;
  return new RegExp('\\b' + palabras.join('\\s+') + '\\b');
}

AP.puntuarOferta = function (campos, perfil) {
  const titulo = AP.n((campos && campos.titulo) || '');
  const empresa = AP.n((campos && campos.empresa) || '');
  const cuerpo = AP.n((campos && campos.cuerpo) || '');
  const ubicacion = AP.n((campos && campos.ubicacion) || '');
  const razones = [];

  function buscar(patronTexto) {
    const rx = apConstruirPatron(AP.n(patronTexto || ''));
    if (!rx) return { coincide: false };
    const enTitulo = rx.test(titulo);
    const enEmpresa = rx.test(empresa);
    const enCuerpo = rx.test(cuerpo);
    return { coincide: enTitulo || enEmpresa || enCuerpo, enTitulo, enEmpresa, enCuerpo };
  }

  perfil = perfil || {};

  // 1. Vetos -- si matchea alguno, corta acá. Sin IA, la razón sale del
  // propio perfil (compilada una vez, mostrable siempre).
  const vetos = perfil.vetos || [];
  for (const veto of vetos) {
    if (buscar(veto.patron).coincide) {
      return { score: 0, banda: 'descartar', razones: [veto.razon || ('no cumple: ' + veto.patron)] };
    }
  }

  // 2. Roles -- puntaje del mejor match (canónico o sinónimo) × peso del rol,
  // con el campo donde matcheó pesando más (título ×3, empresa ×1, cuerpo
  // ×0.5 -- ver §6). Se acota a 100 antes de aplicar señales para que estas
  // mantengan un efecto proporcional, no se pierdan en el redondeo.
  const roles = perfil.roles || [];
  let score = 0;
  let mejorRol = null;
  for (const rol of roles) {
    const terminos = [rol.canonico].concat(rol.sinonimos || []).filter(Boolean);
    const peso = rol.peso != null ? rol.peso : 1;
    for (const termino of terminos) {
      const resultado = buscar(termino);
      if (!resultado.coincide) continue;
      const multiplicadorCampo = resultado.enTitulo ? 3 : resultado.enEmpresa ? 1 : 0.5;
      const puntaje = peso * 100 * multiplicadorCampo;
      if (puntaje > score) {
        score = puntaje;
        mejorRol = { rol: rol.canonico, termino: termino };
      }
    }
  }
  score = Math.min(100, score);
  if (mejorRol) {
    razones.push('calza con "' + mejorRol.rol + '" (' + mejorRol.termino + ')');
  } else if (roles.length) {
    razones.push('no se encontró ninguno de los roles buscados');
  }

  // 3. Ubicación -- penalización fuerte si hay comunas configuradas, ninguna
  // matchea, y no acepta remoto (o el aviso no parece remoto).
  const ubicacionCfg = perfil.ubicacion || {};
  const comunas = ubicacionCfg.comunas || [];
  if (comunas.length) {
    const matcheaComuna = comunas.some((c) => {
      const rx = apConstruirPatron(AP.n(c));
      return rx && (rx.test(ubicacion) || rx.test(titulo) || rx.test(cuerpo));
    });
    const pareceRemoto = /\bremot[oa]\b/.test(cuerpo) || /\bremot[oa]\b/.test(titulo);
    if (!matcheaComuna && !(ubicacionCfg.aceptaRemoto && pareceRemoto)) {
      score = Math.max(0, score - 40);
      razones.push('fuera de las comunas que buscas');
    }
  }

  // 4. Señales -- ajustes graduales, no descartan.
  const senales = perfil.senales || [];
  for (const senal of senales) {
    if (buscar(senal.patron).coincide) {
      const delta = senal.delta || 0;
      score += delta;
      razones.push((delta >= 0 ? '+' : '') + delta + ' por "' + senal.patron + '"');
    }
  }

  // 5. Clamp y banda.
  score = Math.max(0, Math.min(100, Math.round(score)));
  const umbralPostular = perfil.umbralPostular != null ? perfil.umbralPostular : 65;
  const umbralGris = perfil.umbralGris != null ? perfil.umbralGris : 45;
  let banda;
  if (score >= umbralPostular) banda = 'postular';
  else if (score <= umbralGris) banda = 'descartar';
  else banda = 'gris';

  if (!razones.length) razones.push('sin señales claras');

  return { score: score, banda: banda, razones: razones };
};

// Portal-agnóstico: cada adaptador arma sus propios "campos" (título, empresa,
// cuerpo, ubicación -- lo que pueda leer sin abrir el aviso) y llama acá. Si
// el scorer local está activo (AP.cfg.scorer.usarScorerLocal) y hay perfil
// compilado, puntúa con AP.puntuarOferta; si no, cae al filtro viejo
// (coincideFiltros) tratando cualquier "pasa" como banda 'postular' -- así
// las dos rutas conviven detrás del flag sin que el adaptador tenga que saber
// cuál está activa (§13: "no borrar coincideFiltros hasta que el scorer esté
// validado").
AP.evaluarOferta = function (campos) {
  const scorerCfg = AP.cfg && AP.cfg.scorer;
  if (scorerCfg && scorerCfg.usarScorerLocal && scorerCfg.perfilCompilado) {
    const resultado = AP.puntuarOferta(campos, scorerCfg.perfilCompilado);
    return { banda: resultado.banda, score: resultado.score, razones: resultado.razones, usoScorer: true };
  }
  const textoCompleto = [campos.titulo, campos.empresa, campos.cuerpo].filter(Boolean).join(' ');
  const pasaFiltroViejo = AP.coincideFiltros(textoCompleto, campos.ubicacion);
  return {
    banda: pasaFiltroViejo ? 'postular' : 'descartar',
    score: null,
    razones: pasaFiltroViejo ? [] : ['no calza con tus filtros de búsqueda'],
    usoScorer: false,
  };
};

// ── CV / estilo / objetivo laboral (para el filtro inteligente y los
//    prompts de IA — usado por cualquier adaptador que llame a la IA) ──
AP.cargarCV = function () {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['cvTexto', 'cvBase64'], d => {
        resolve({ texto: d.cvTexto || null, base64: d.cvBase64 || null });
      });
    } catch (e) { resolve({ texto: null, base64: null }); }
  });
};

AP.construirMensajesCV = function (instruccion, cv) {
  if (cv && cv.texto) {
    return [{ role: 'user', content: 'CV del candidato (texto extraido previamente):\n' + cv.texto + '\n\n' + instruccion }];
  }
  if (cv && cv.base64) {
    return [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: cv.base64 } },
      { type: 'text', text: instruccion }
    ]}];
  }
  return [{ role: 'user', content: instruccion }];
};

AP.cargarEstiloProfesional = function () {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['estiloProfesional'], d => resolve(d.estiloProfesional || null));
    } catch (e) { resolve(null); }
  });
};

AP.obtenerObjetivoLaboral = async function () {
  const estilo = await AP.cargarEstiloProfesional();
  if (estilo && estilo.objetivos) return estilo.objetivos;
  if (AP.cfg && AP.cfg.perfil && AP.cfg.perfil.cargo) return AP.cfg.perfil.cargo;
  return null;
};

// ── Llamadas a la IA — van al backend vía background.js, nunca directo ──
AP.llamarBackendIA = function (tipo, payload) {
  return new Promise(resolve => {
    let resuelto = false;
    const terminar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };

    const timeoutId = setTimeout(() => {
      console.warn('[AP] Timeout de 30s esperando al background (' + tipo + ')');
      AP.msg('⚠ IA sin respuesta (timeout) — ' + tipo, '#DC2626');
      terminar({ error: 'Sin respuesta del background (timeout)' });
    }, 30000);

    try {
      chrome.runtime.sendMessage({ type: 'AI_CALL', tipo, payload }, (respuesta) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          console.warn('[AP] runtime.lastError en AI_CALL (' + tipo + '):', chrome.runtime.lastError.message);
          AP.msg('⚠ Error de conexión con la extensión: ' + chrome.runtime.lastError.message, '#DC2626');
          terminar(null);
          return;
        }
        if (respuesta && respuesta.error) {
          AP.msg('⚠ IA: ' + respuesta.error, '#DC2626');
        }
        terminar(respuesta || null);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('[AP] Excepción llamando a AI_CALL (' + tipo + '):', e);
      AP.msg('⚠ Excepción llamando a la extensión: ' + e.message, '#DC2626');
      terminar(null);
    }
  });
};

// Filtro inteligente de ofertas — genérico: cualquier adaptador que tenga
// una lista de títulos puede usarlo, no depende de la estructura del sitio.
AP.clasificarOfertasIA = async function (titulos, objetivo) {
  if (!titulos.length) return null;
  const data = await AP.llamarBackendIA('clasificar_ofertas', { titulos, objetivo });
  if (!data || !data.relevantes) return null;
  return new Set(data.relevantes);
};

// ── Utilidades de formulario (genéricas — no dependen del sitio) ──
AP.setVal = function (el, val) {
  try {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, val);
  } catch (e) { el.value = val; }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

// Muchos portales limitan respuestas largas (Computrabajo suele usar 500). Si el campo
// trae su propio maxlength lo respetamos; si no, usamos 500 por defecto. Cortamos en el
// último espacio para no partir una palabra a la mitad.
AP.limitarTexto = function (val, el) {
  if (!val) return val;
  let max = 500;
  if (el && el.maxLength && el.maxLength > 0 && el.maxLength < 10000) max = el.maxLength;
  if (val.length <= max) return val;
  const cortado = val.slice(0, max);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  const final = (ultimoEspacio > max * 0.6 ? cortado.slice(0, ultimoEspacio) : cortado).trim();
  return final;
};

AP.esVisible = function (el) {
  if (!el) return false;
  if (el.offsetParent !== null) return true;
  try {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  } catch (e) { return false; }
};

AP.seleccionarOpcion = function (el) {
  try {
    if (!el || !AP.esVisible(el)) return false;
    el.scrollIntoView({ block: 'nearest' });
    if (el.tagName === 'INPUT') {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.click();
    } else {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(tipo => {
        try { el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true })); } catch (e) {}
      });
      el.click();
      if (el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', 'true');
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  } catch (e) { return false; }
};

// -- IA: analiza la oferta y responde varias preguntas del formulario EN UNA SOLA
// llamada al backend. Reemplaza a los antiguos AP.aiResponde (una llamada por
// pregunta) + AP.analizarOferta (otra llamada aparte) -- cada llamada por separado
// remandaba el CV, el estilo y el aviso completos de nuevo, así que juntarlas en
// una es lo que más ahorra de todo el rediseño de filtrado (ver docs/rediseno-filtrado-ofertas.md, §10).
//
// preguntas: [{ id, pregunta, opciones: string[]|null }] -- puede venir vacío si
// solo se quiere el análisis (matchScore) sin preguntas de formulario que responder.
// Devuelve { analisis, respuestas: {[id]: string|null}, error }.
AP.analizarYResponder = async function (contexto, preguntas) {
  if (!contexto) return { analisis: null, respuestas: {}, error: null };
  const p = (AP.cfg && AP.cfg.perfil) || {};
  const info = (AP.cfg && AP.cfg.info || []).map(it => it.texto);
  const data = await AP.llamarBackendIA('procesar_postulacion', {
    contexto, perfil: p, info, preguntas: preguntas || []
  });
  if (!data || data.error) return { analisis: null, respuestas: {}, error: data && data.error };
  const respuestas = {};
  (data.respuestas || []).forEach(r => { if (r && r.id) respuestas[r.id] = r.respuesta; });
  return { analisis: data.analisis || null, respuestas, error: null };
};

// ── Panel de revisión antes de enviar (editable) — genérico, cualquier
//    adaptador puede mostrarlo pasándole su propio respuestasLog ──────
AP.mostrarRevision = function (titulo, respuestasLog, contexto) {
  return new Promise(resolve => {
    document.getElementById('ap-revision-panel')?.remove();
    const div = document.createElement('div');
    div.id = 'ap-revision-panel';
    Object.assign(div.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: '2147483648', background: '#fff', border: '1px solid #e4e7ef',
      borderRadius: '12px', padding: '0', width: '640px', maxWidth: '94vw',
      maxHeight: '86vh', display: 'flex', flexDirection: 'column',
      boxShadow: '0 20px 60px rgba(0,0,0,.25)', fontFamily: 'system-ui,sans-serif'
    });

    const filas = respuestasLog.map((r, idx) => {
      // r.errorIA solo viene seteado cuando la llamada a la IA falló (límite del plan,
      // timeout, red, etc.) -- se distingue de r.vacia sin errorIA, que es cuando la IA
      // sí respondió pero no tenía el dato pedido.
      const esLimite = r.errorIA && /l[ií]mite/i.test(r.errorIA);
      const color = esLimite ? '#D97706' : (r.vacia ? '#DC2626' : '#16A34A');
      const icon = esLimite ? 'LÍMITE' : (r.vacia ? 'ADVERTENCIA' : 'OK');
      let leyenda = '';
      if (esLimite) leyenda = ' Límite mensual de IA alcanzado — complétala manualmente';
      else if (r.errorIA) leyenda = ' Error de IA (' + r.errorIA + ') - puedes completarla';
      else if (r.vacia) leyenda = ' Sin respuesta - puedes completarla';
      else if (r.fueIA) leyenda = ' Generada por IA - puedes editarla';
      const cabecera =
        '<div style="font-size:11px;font-weight:700;color:#4b5563;margin-bottom:5px">' + (r.pregunta || '').slice(0, 90) + '</div>' +
        '<div style="font-size:10px;color:' + color + ';margin-bottom:5px">' + icon + leyenda + '</div>';

      if (r.tipo === 'opcion') {
        const opts = (r.opciones || []).map((o, oi) => {
          const sel = r.elegidoEl && o.el === r.elegidoEl ? ' selected' : '';
          return '<option value="' + oi + '"' + sel + '>' + (o.texto || '(opcion sin texto)').slice(0, 80) + '</option>';
        }).join('');
        return '<div class="ap-rev-item" data-idx="' + idx + '" data-tipo="opcion" style="margin-bottom:12px;padding:8px 10px;background:#f8f9fc;border-radius:8px;border:1px solid #e4e7ef">' +
          cabecera +
          '<select class="ap-rev-select" data-idx="' + idx + '" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit">' +
            '<option value="-1"' + (r.elegidoEl ? '' : ' selected') + '>-- Sin seleccion --</option>' + opts +
          '</select>' +
        '</div>';
      }

      // tipo texto (o sin tipo, por compatibilidad)
      const max = (r.el && r.el.maxLength && r.el.maxLength > 0 && r.el.maxLength < 10000) ? r.el.maxLength : 500;
      const valorEsc = (r.respuesta || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<div class="ap-rev-item" data-idx="' + idx + '" data-tipo="texto" style="margin-bottom:12px;padding:8px 10px;background:#f8f9fc;border-radius:8px;border:1px solid #e4e7ef">' +
        cabecera +
        '<textarea class="ap-rev-textarea" data-idx="' + idx + '" maxlength="' + max + '" rows="3" ' +
          'style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;resize:vertical">' + valorEsc + '</textarea>' +
        '<div class="ap-rev-counter" data-idx="' + idx + '" style="font-size:10px;color:#9ca3af;text-align:right;margin-top:2px">' + (r.respuesta || '').length + ' / ' + max + '</div>' +
      '</div>';
    }).join('');

    const avisoEsc = (contexto || 'Sin texto del aviso disponible.').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    div.innerHTML =
      // Cabecera arrastrable
      '<div id="ap-rev-header" style="cursor:move;user-select:none;display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #e4e7ef">' +
        '<span style="font-size:20px">*</span>' +
        '<div style="flex:1"><div style="font-weight:700;font-size:14px">Revisar antes de enviar</div>' +
        '<div style="font-size:11px;color:#6b7280">' + titulo.slice(0, 60) + ' - arrastra desde aqui para mover</div></div>' +
      '</div>' +
      // Pestanas
      '<div style="display:flex;gap:4px;padding:10px 20px 0">' +
        '<button class="ap-tab-btn" data-tab="aviso" style="padding:8px 14px;border:none;border-radius:8px 8px 0 0;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Aviso completo</button>' +
        '<button class="ap-tab-btn" data-tab="respuestas" style="padding:8px 14px;border:none;border-radius:8px 8px 0 0;background:#f3f4f6;color:#4b5563;font-size:12px;font-weight:700;cursor:pointer">Preguntas y respuestas (' + respuestasLog.length + ')</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:16px 20px">' +
        '<div class="ap-tab-content" data-tab-content="aviso" style="white-space:pre-wrap;font-size:12px;line-height:1.6;color:#374151">' + avisoEsc + '</div>' +
        '<div class="ap-tab-content" data-tab-content="respuestas" style="display:none">' +
          (filas || '<div style="color:#9ca3af;font-style:italic;text-align:center;padding:12px">Sin campos que mostrar</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;padding:16px 20px;border-top:1px solid #e4e7ef">' +
        '<button id="ap-rev-confirm" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer">Confirmar y enviar</button>' +
        '<button id="ap-rev-skip" style="background:#f3f4f6;color:#4b5563;border:1px solid #e4e7ef;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer">Saltar</button>' +
      '</div>';

    document.body.appendChild(div);

    // -- Pestanas: alternar entre "Aviso completo" y "Preguntas y respuestas" --
    div.querySelectorAll('.ap-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        div.querySelectorAll('.ap-tab-btn').forEach(b => {
          b.style.background = '#f3f4f6'; b.style.color = '#4b5563';
        });
        btn.style.background = '#2563eb'; btn.style.color = '#fff';
        div.querySelectorAll('.ap-tab-content').forEach(c => {
          c.style.display = (c.dataset.tabContent === btn.dataset.tab) ? '' : 'none';
        });
      });
    });

    // -- Arrastrar el panel desde la cabecera --
    const header = div.querySelector('#ap-rev-header');
    let arrastrando = false, offX = 0, offY = 0;
    const onMouseMove = e => {
      if (!arrastrando) return;
      div.style.left = (e.clientX - offX) + 'px';
      div.style.top = (e.clientY - offY) + 'px';
    };
    const onMouseUp = () => { arrastrando = false; };
    header.addEventListener('mousedown', e => {
      arrastrando = true;
      const rect = div.getBoundingClientRect();
      div.style.transform = 'none';
      div.style.left = rect.left + 'px';
      div.style.top = rect.top + 'px';
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    function limpiarListeners() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    // Contador de caracteres en vivo
    div.querySelectorAll('.ap-rev-textarea').forEach(ta => {
      ta.addEventListener('input', () => {
        const counter = div.querySelector('.ap-rev-counter[data-idx="' + ta.dataset.idx + '"]');
        if (counter) counter.textContent = ta.value.length + ' / ' + ta.maxLength;
      });
    });

    function aplicarEdiciones() {
      div.querySelectorAll('.ap-rev-textarea').forEach(ta => {
        const idx = +ta.dataset.idx;
        const entry = respuestasLog[idx];
        if (!entry) return;
        const val = AP.limitarTexto(ta.value, entry.el);
        if (entry.el) AP.setVal(entry.el, val);
        entry.respuesta = val;
        entry.vacia = !val;
      });
      div.querySelectorAll('.ap-rev-select').forEach(sel => {
        const idx = +sel.dataset.idx;
        const entry = respuestasLog[idx];
        if (!entry) return;
        const oi = +sel.value;
        if (oi >= 0 && entry.opciones && entry.opciones[oi]) {
          const nueva = entry.opciones[oi];
          if (nueva.el !== entry.elegidoEl) AP.seleccionarOpcion(nueva.el);
          entry.elegidoEl = nueva.el;
          entry.respuesta = nueva.texto;
          entry.vacia = false;
        } else {
          entry.vacia = true;
          entry.respuesta = '';
        }
      });
    }

    document.getElementById('ap-rev-confirm').onclick = () => { limpiarListeners(); aplicarEdiciones(); div.remove(); resolve('confirm'); };
    document.getElementById('ap-rev-skip').onclick = () => { limpiarListeners(); div.remove(); resolve('skip'); };
    // Auto-confirmar tras 3 minutos (aplicando lo que se haya editado hasta ese momento) --
    // se amplio el tiempo porque ahora tambien hay que leer el aviso completo antes de decidir.
    setTimeout(() => { if (document.getElementById('ap-revision-panel')) { limpiarListeners(); aplicarEdiciones(); div.remove(); resolve('confirm'); } }, 180000);
  });
};

// ── Mensajería compartida ──────────────────────────────────────────
// El escaneo disparado por la búsqueda automática (background) y el
// toggle/config no dependen del portal — solo necesitan que el adaptador
// ya haya definido AP.escanear.
chrome.runtime.onMessage.addListener((m, _sender, sendResponse) => {
  if (m.type === 'AUTO_SCAN') {
    if (AP.escanear) AP.escanear();
    sendResponse({ ok: true });
  }
  if (m.type === 'TOGGLE') {
    AP.activo = m.active;
    if (AP.activo) { AP.msg('Activado…', '#16A34A'); setTimeout(() => AP.escanear && AP.escanear(), 800); }
    else { AP.procesando = false; AP.limpiarOverlay(); }
  }
  if (m.type === 'CONFIG_UPDATED') { AP.cfg = m.config; AP.activo = m.config.active; }
  if (m.type === 'FORCE_SCAN') {
    // Recarga la config guardada (por si el popup la cambió justo antes de forzar
    // el escaneo) y arranca — este es el ÚNICO camino para forzar un escaneo desde
    // el popup. Antes existía también un CustomEvent de DOM ('autopostula-scan')
    // para lo mismo, pero un evento de DOM es visible y disparable por CUALQUIER
    // script corriendo en la página (un aviso comprometido, un XSS del propio
    // portal) — eso dejaba que un tercero activara el escaneo/postulación real
    // sin que la persona lo pidiera. chrome.runtime.onMessage, en cambio, solo lo
    // puede usar la propia extensión.
    chrome.storage.local.get(['config'], function (data) {
      if (data.config) AP.cfg = data.config;
      AP.activo = true;
      AP.procesando = false;
      AP.msg('Escaneando…', '#16A34A');
      if (AP.escanear) AP.escanear();
    });
    sendResponse({ ok: true });
  }
});

new MutationObserver(function () {
  if (AP.activo && !AP.procesando) {
    clearTimeout(window._apT);
    window._apT = setTimeout(() => AP.escanear && AP.escanear(), 2500);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

// ── Init compartido ───────────────────────────────────────────────
// Carga cfg/active/log/token y avisa al adaptador (AP.onInit) para que
// decida qué hacer según la URL en la que esté parado (cada portal tiene
// sus propias páginas de "mis postulaciones", listados, etc.).
try {
  chrome.storage.local.get(['config', 'active', 'log'], function (data) {
    AP.cfg = data.config || null;
    AP.activo = !!(data.active || (AP.cfg && AP.cfg.active));
    AP.log = data.log || [];
    AP.vistos = new Set();
    chrome.storage.sync.get('autopostulaToken', function (d) {
      AP.iaDisponible = !!d.autopostulaToken;
      console.log('[AP] core listo — config:', !!AP.cfg, 'activo:', AP.activo, 'IA (token):', AP.iaDisponible);
      if (AP.onInit) AP.onInit();
    });
  });
} catch (e) { console.error('[AP] init error:', e); }

try {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes.autopostulaToken) {
      AP.iaDisponible = !!changes.autopostulaToken.newValue;
    }
  });
} catch (e) {}

window._apInjected = true;
})();
