// ═══════════════════════════════════════════════════════════════
//  AutoPostula — adaptador de Trabajando.com
//  Todo lo específico del DOM/flujo de Trabajando.com. El estado
//  compartido y las utilidades genéricas viven en core.js (cargado
//  antes que este archivo — ver manifest.json) bajo el objeto AP.
//
//  Estructura verificada a mano contra el sitio real el 2026-09-08
//  (sin sesión iniciada -- ver más abajo la nota sobre el formulario
//  de postulación, que es lo único que NO se pudo verificar en vivo).
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const DELAY = 3000;
const { msg, sleep, n, addLog, reportarPostulacion, reportarTitulosVistos, llamarBackendIA,
        cargarCV, construirMensajesCV, cargarEstiloProfesional,
        obtenerObjetivoLaboral, clasificarOfertasIA,
        actualizarEstadoPostulacion, analizarYResponder,
        mostrarRevision, setVal, limitarTexto, esVisible, seleccionarOpcion,
        siguientePaginaClick } = window.AP;

// El panel de detalle es un <article id="detalleOferta"> que reemplaza su
// contenido con SPA routing (pushState) al hacer clic en una tarjeta -- el
// mismo patrón de "panel lateral que se reescribe" que Computrabajo, no el
// de "una página por aviso" de Laborum.
const SELECTOR_PANEL = '#detalleOferta';

// ── Texto visible real (protección contra contenido "trampa") ──────────
// Hallazgo en vivo el 2026-09-08: el panel de detalle trae texto oculto con
// display:none mezclado en su HTML (parece un honeypot anti-scraping --
// cadenas sin sentido tipo "omtf stg mmbzfvmem cyvqwg zhjv yrhuuf" en medio
// de la descripción real). panel.innerText normal SÍ lo incluye en este
// sitio (a diferencia de lo esperable), y clonar el panel para sacarlo tampoco
// sirve: un nodo clonado/desconectado del documento no tiene layout real, así
// que innerText sobre el clon se comporta todavía peor. La única forma
// confiable de armar "el texto que una persona vería" es recorrer los nodos
// de texto a mano y descartar los que cuelgan de un elemento oculto de
// verdad (display:none o visibility:hidden en cualquier ancestro) -- por
// eso esta función existe en vez de usar innerText directo.
function elementoOculto(el, limite) {
  let cur = el;
  while (cur && cur !== limite) {
    const cs = getComputedStyle(cur);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    cur = cur.parentElement;
  }
  return false;
}
function textoVisibleDe(raiz) {
  if (!raiz) return '';
  let out = '';
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode(nodo) {
      const p = nodo.parentElement;
      if (!p || elementoOculto(p, raiz)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let nodo;
  while ((nodo = walker.nextNode())) out += nodo.textContent + ' ';
  return out;
}

// ── Texto completo del aviso (para el análisis de la IA) ────────
// El panel trae al principio un nav de "Regresa a tu búsqueda" pensado para
// mobile (".go-back") -- se recorta nomás ese prefijo fijo si aparece (no es
// grepear la descripción libre: es un string de navegación del propio
// sitio, no el aviso).
function extraerTextoAviso() {
  const panel = document.querySelector(SELECTOR_PANEL);
  let texto = panel ? textoVisibleDe(panel) : (document.body.innerText || '');
  texto = texto.replace(/\s+/g, ' ').trim();
  texto = texto.replace(/^Regresa a tu búsqueda\s*/i, '');
  return texto.slice(0, 4000);
}

// ── Facetas estructuradas del aviso (docs/visibilidad-y-etapa2.md §B) ──────
// Verificado a mano contra el sitio real el 2026-09-08 (varias ofertas, con
// y sin sueldo declarado, jornada completa/part time/remoto).
//
// A diferencia de Computrabajo (íconos por tipo de faceta), Trabajando lista
// jornada + rubro + región + comuna como <li> sin marcar en un
// "#detalleOferta ul.badges" -- sin ícono ni atributo que diga cuál es cuál.
// Se identifica el de jornada por su propio vocabulario cerrado (los 7
// valores que el propio filtro "Jornadas" del sitio ofrece), y de ahí se
// infiere la modalidad (Teletrabajo=remoto, Mixta=híbrido, el resto=
// presencial) -- no hay una faceta de modalidad separada.
//
// No hay campo estructurado de "contrato" (Indefinido/Plazo fijo) en ningún
// lado del sitio -- ni en el panel de detalle ni en el filtro. No se
// inventa: esa faceta queda ausente para este portal (la tarjeta degrada
// bien, per §H criterio 4).
//
// Tampoco hay rating/evaluaciones de empresa visibles en el aviso -- a
// diferencia de Computrabajo, Trabajando no muestra esa información acá.
const JORNADAS_CONOCIDAS = [
  { patron: /^jornada completa$/i, jornada: 'Jornada Completa', modalidad: 'presencial' },
  { patron: /^part time$/i, jornada: 'Part Time', modalidad: 'presencial' },
  { patron: /^en terreno$/i, jornada: 'En terreno', modalidad: 'presencial' },
  { patron: /^por turnos$/i, jornada: 'Por turnos', modalidad: 'presencial' },
  { patron: /^mixta/i, jornada: 'Mixta', modalidad: 'hibrido' },
  { patron: /^pr[aá]ctica$/i, jornada: 'Práctica', modalidad: 'presencial' },
  { patron: /^teletrabajo$/i, jornada: 'Teletrabajo', modalidad: 'remoto' },
];

function extraerFacetasAviso() {
  const panel = document.querySelector(SELECTOR_PANEL);
  if (!panel) return {};
  const facetas = {};

  const ul = panel.querySelector('ul.badges');
  if (ul) {
    for (const li of ul.querySelectorAll('li')) {
      const texto = li.textContent.trim();
      if (!texto) continue;
      const match = JORNADAS_CONOCIDAS.find(j => j.patron.test(texto));
      if (match) { facetas.jornada = match.jornada; facetas.modalidad = match.modalidad; }
    }
  }

  // Extracto: no hay un contenedor propio para la descripción (clases
  // hasheadas por build, igual problema que Laborum) -- se toma el texto
  // completo del panel, que ya excluye menús/nav por estar acotado a
  // #detalleOferta.
  const texto = extraerTextoAviso();
  if (texto) facetas.extracto = texto.split(/\s+/).slice(0, 300).join(' ');

  return facetas;
}

// ── ID único de tarjeta/aviso ────────────────────────────────────
// La URL siempre trae /trabajo/{id numérico}-{slug} -- verificado contra
// más de 10 avisos reales. El id="0","1"... de la propia tarjeta es solo su
// posición en el listado (se reordena entre escaneos), no sirve para dedup.
function getId(urlOHref) {
  const m = (urlOHref || '').match(/\/trabajo\/(\d+)-/);
  return m ? m[1] : null;
}

// ── Título de una tarjeta ───────────────────────────────────────
function tituloDeTarjeta(tarjeta) {
  const h2 = tarjeta.querySelector('h2 a, h2');
  return (h2 && h2.textContent.trim()) || 'Oferta';
}

// ── Ubicación de una tarjeta (comuna/región) ───────────────────
function extraerUbicacion(tarjeta) {
  const el = tarjeta.querySelector('.location');
  return (el && n(el.textContent)) || n(tarjeta.innerText || '');
}

// ── Empresa de una tarjeta ──────────────────────────────────────
// "Empresa Confidencial" es un valor real y frecuente acá (no un error) --
// el scorer y el corpus de solapamiento ya saben tratarlo como genérico.
function extraerEmpresa(tarjeta) {
  const el = tarjeta.querySelector('.type');
  return (el && el.textContent.trim()) || '';
}

// ── Evaluar tarjeta (scorer local si está activo, si no el filtro viejo) ──
function evaluarTarjeta(tarjeta) {
  if (!AP.cfg) return { banda: 'descartar', score: null, razones: ['extensión sin configurar'] };
  const campos = {
    titulo: tituloDeTarjeta(tarjeta),
    empresa: extraerEmpresa(tarjeta),
    cuerpo: '',
    ubicacion: extraerUbicacion(tarjeta),
  };
  return AP.evaluarOferta(campos);
}

// ── Label de un campo (mismo módulo genérico que los otros adaptadores) ──
function getLabel(el) {
  if (el.id) {
    const lf = document.querySelector('label[for="' + el.id + '"]');
    if (lf) return lf.textContent.trim();
  }
  let prev = el.previousElementSibling;
  while (prev) {
    const t = prev.textContent && prev.textContent.trim();
    if (t && t.length > 3) return t;
    prev = prev.previousElementSibling;
  }
  const wrap = el.closest('div,li,section');
  if (wrap) {
    const cl = wrap.cloneNode(true);
    cl.querySelectorAll('input,textarea,select,button').forEach(e => e.remove());
    const t = cl.textContent && cl.textContent.trim();
    if (t && t.length > 3 && t.length < 300) return t;
  }
  return el.placeholder || el.name || el.id || '';
}

// ── Módulo opciones (compartido en espíritu con computrabajo.js -- ver ahí
//    el porqué de cada pieza; acá solo cambia el selector del panel) ──────
const SELECTOR_OPCIONES = ['input[type=radio]','input[type=checkbox]','[role="radio"]','[role="option"]','[aria-checked]'].join(',');

function esperarOpciones(selector, opts) {
  const timeout = (opts && opts.timeout) || 2500;
  return new Promise(resolve => {
    const yaHay = document.querySelectorAll(selector);
    if (yaHay.length) return resolve([...yaHay]);
    const obs = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length) { obs.disconnect(); clearTimeout(t); resolve([...els]); }
    });
    obs.observe(document.body, { childList:true, subtree:true });
    const t = setTimeout(() => { obs.disconnect(); resolve([...document.querySelectorAll(selector)]); }, timeout);
  });
}

function textoDeOpcion(el) {
  try {
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    if (el.id) {
      const lf = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lf && lf.textContent.trim()) return lf.textContent.trim();
    }
    const lp = el.closest && el.closest('label');
    if (lp && lp.textContent.trim()) return lp.textContent.trim();
    if (el.tagName === 'INPUT') {
      const sigu = el.nextElementSibling;
      if (sigu && sigu.textContent && sigu.textContent.trim()) return sigu.textContent.trim();
      const prev = el.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim()) return prev.textContent.trim();
      return el.value || el.getAttribute('data-value') || '';
    }
    const propio = (el.textContent || '').trim().replace(/\s+/g,' ');
    if (propio) return propio;
    return el.getAttribute('title') || el.getAttribute('data-value') || '';
  } catch(e) { return ''; }
}

function hallarContenedorPregunta(el) {
  let nodo = el.parentElement, profundidad = 0;
  while (nodo && profundidad < 6) {
    if (nodo.querySelectorAll(SELECTOR_OPCIONES).length > 1) return nodo;
    nodo = nodo.parentElement; profundidad++;
  }
  return el.parentElement || el;
}

function textoPreguntaContenedor(contenedor) {
  try {
    const clon = contenedor.cloneNode(true);
    clon.querySelectorAll(SELECTOR_OPCIONES).forEach(e => {
      const lbl = e.closest('label');
      if (lbl) { lbl.remove(); return; }
      if (e.id) {
        const lf = clon.querySelector('label[for="' + CSS.escape(e.id) + '"]');
        if (lf) { lf.remove(); }
      }
      e.remove();
    });
    const t = (clon.textContent || '').trim().replace(/\s+/g,' ');
    if (t && t.length > 3 && t.length < 300) return t;
  } catch(e) {}
  let prev = contenedor.previousElementSibling, intentos = 0;
  while (prev && intentos < 4) {
    const t = (prev.textContent || '').trim();
    if (t && t.length > 3 && t.length < 300) return t;
    prev = prev.previousElementSibling; intentos++;
  }
  return '';
}

function calcularRespuesta(preguntaTexto, opciones, perfil) {
  const p = n(preguntaTexto);
  const textos = opciones.map(o => ({ ...o, t: n(o.texto) }));
  const esSi = t => /^(si|sí|yes|verdadero|true|acepto)\b/.test(t);
  const esNo = t => /^(no|not|false|falso)\b/.test(t);
  const opSi = textos.find(o => esSi(o.t));
  const opNo = textos.find(o => esNo(o.t));
  if (opSi || opNo) {
    if (p.includes('mayor') && p.includes('18')) return opSi || null;
    if (p.includes('acepto') || p.includes('termin') || p.includes('politica') || p.includes('autoriz') || p.includes('privacidad')) return opSi || null;
    return null;
  }
  const camposPerfil = [perfil.disp, perfil.nivelEducacion, perfil.modalidad, perfil.jornada].filter(Boolean).map(n);
  for (const campo of camposPerfil) {
    const match = textos.find(o => o.t && (campo.includes(o.t) || o.t.includes(campo)));
    if (match) return match;
  }
  return null;
}

async function manejarGruposDeOpciones(perfil, respuestasLog, contexto) {
  let interacciones = 0;
  await esperarOpciones(SELECTOR_OPCIONES, { timeout:2500 });
  const panelForm = document.querySelector(SELECTOR_PANEL) || document;
  const pendientesIA = [];

  const gruposRadioVistos = new Set();
  for (const radio of panelForm.querySelectorAll('input[type=radio]')) {
    if (!esVisible(radio)) continue;
    const nombre = radio.name || '';
    const clave = nombre || radio;
    if (gruposRadioVistos.has(clave)) continue;
    gruposRadioVistos.add(clave);
    const grupo = nombre
      ? [...panelForm.querySelectorAll('input[type=radio][name="' + CSS.escape(nombre) + '"]')].filter(esVisible)
      : [radio];
    if (!grupo.length) continue;
    const opciones = grupo.map(r => ({ el:r, texto:textoDeOpcion(r) }));
    const pregunta = textoPreguntaContenedor(hallarContenedorPregunta(radio)) || getLabel(radio);
    const elegida = calcularRespuesta(pregunta, opciones, perfil);
    if (elegida) {
      if (seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
      }
    } else if (AP.iaDisponible && pregunta.length > 5) {
      pendientesIA.push({ pregunta, opciones });
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', respuestaIa: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null, errorIA: null });
    }
  }

  const gruposCbVistos = new Set();
  for (const cb of panelForm.querySelectorAll('input[type=checkbox]')) {
    if (!esVisible(cb)) continue;
    const textoCb = n(textoDeOpcion(cb) || (cb.closest('label,div') && cb.closest('label,div').textContent) || '');
    if (textoCb.includes('acepto') || textoCb.includes('terminos') || textoCb.includes('politica') || textoCb.includes('autorizo')) {
      if (!cb.checked && seleccionarOpcion(cb)) interacciones++;
      continue;
    }
    const nombre = cb.name || '';
    if (nombre && !gruposCbVistos.has(nombre)) {
      gruposCbVistos.add(nombre);
      const grupo = [...panelForm.querySelectorAll('input[type=checkbox][name="' + CSS.escape(nombre) + '"]')].filter(esVisible);
      const opciones = grupo.map(c => ({ el:c, texto:textoDeOpcion(c) }));
      const pregunta = textoPreguntaContenedor(hallarContenedorPregunta(cb)) || getLabel(cb);
      const elegida = calcularRespuesta(pregunta, opciones, perfil);
      if (elegida) {
        if (!elegida.el.checked && seleccionarOpcion(elegida.el)) {
          interacciones++;
          respuestasLog.push({ pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
        }
      } else if (AP.iaDisponible && pregunta.length > 5) {
        pendientesIA.push({ pregunta, opciones });
      } else if (pregunta) {
        respuestasLog.push({ pregunta, respuesta: '', respuestaIa: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null, errorIA: null });
      }
    }
  }

  const widgets = [...panelForm.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')]
    .filter(el => el.tagName !== 'INPUT' && esVisible(el));
  const gruposWidgetVistos = new Set();
  for (const widget of widgets) {
    const contenedor = hallarContenedorPregunta(widget);
    if (gruposWidgetVistos.has(contenedor)) continue;
    gruposWidgetVistos.add(contenedor);
    const grupo = [...contenedor.querySelectorAll('[role="radio"],[role="option"],[aria-checked]:not(input)')].filter(esVisible);
    if (!grupo.length) continue;
    const opciones = grupo.map(el => ({ el, texto:textoDeOpcion(el) }));
    const pregunta = textoPreguntaContenedor(contenedor);
    const elegida = calcularRespuesta(pregunta, opciones, perfil);
    if (elegida) {
      if (seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, tipo:'opcion', opciones, elegidoEl: elegida.el });
      }
    } else if (AP.iaDisponible && pregunta.length > 5) {
      pendientesIA.push({ pregunta, opciones });
    } else if (pregunta) {
      respuestasLog.push({ pregunta, respuesta: '', respuestaIa: '', vacia: true, tipo:'opcion', opciones, elegidoEl: null, errorIA: null });
    }
  }

  let analisis = null;
  if (pendientesIA.length) {
    const preguntasParaIA = pendientesIA.map((pd, i) => ({ id: 'o' + i, pregunta: pd.pregunta, opciones: pd.opciones.map(o => o.texto) }));
    msg('IA respondiendo ' + pendientesIA.length + ' pregunta(s)…', '#7C3AED');
    const resultado = await analizarYResponder(contexto, preguntasParaIA);
    analisis = resultado.analisis;
    for (let i = 0; i < pendientesIA.length; i++) {
      const pd = pendientesIA[i];
      const respIA = resultado.respuestas['o' + i];
      let elegida = null;
      if (respIA) {
        const rNorm = n(respIA);
        elegida = pd.opciones.find(o => rNorm.includes(n(o.texto)) || (n(o.texto).length < 4 && rNorm.startsWith(n(o.texto))));
      }
      if (elegida && seleccionarOpcion(elegida.el)) {
        interacciones++;
        respuestasLog.push({ pregunta: pd.pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, tipo:'opcion', opciones: pd.opciones, elegidoEl: elegida.el });
      } else {
        respuestasLog.push({ pregunta: pd.pregunta, respuesta: '', respuestaIa: '', vacia: true, tipo:'opcion', opciones: pd.opciones, elegidoEl: null, errorIA: resultado.error });
      }
      await sleep(250);
    }
  }

  return { interacciones, analisis };
}

function aplicarValorTexto(el, val, labelRaw, fueIA, respuestasLog) {
  val = limitarTexto(val, el);
  el.scrollIntoView({ block:'nearest' });
  setVal(el, val);
  respuestasLog.push({ pregunta: labelRaw, respuesta: val, respuestaIa: val, fueIA, tipo:'texto', el });
}

async function rellenar(contexto) {
  await sleep(1000);
  if (!AP.activo) return { n2:0, respuestasLog:[], analisis:null };
  const p = (AP.cfg && AP.cfg.perfil) || {};
  let n2 = 0;
  const respuestasLog = [];

  const { interacciones, analisis: analisisDeOpciones } = await manejarGruposDeOpciones(p, respuestasLog, contexto);
  n2 += interacciones;

  const panelForm = document.querySelector(SELECTOR_PANEL) || document;
  const pendientesTexto = [];
  for (const el of panelForm.querySelectorAll('textarea:not([style*="display:none"]),input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=radio]):not([type=checkbox]):not([type=password])')) {
    if (!el.offsetParent) continue;
    const labelRaw = getLabel(el);
    const lbl = n(labelRaw);
    const clave = (...terms) => terms.some(t => new RegExp('\\b' + t).test(lbl));

    if (el.type === 'email' && p.email) {
      aplicarValorTexto(el, p.email, labelRaw, false, respuestasLog);
      n2++;
    } else if (el.type === 'tel' && p.tel) {
      aplicarValorTexto(el, p.tel, labelRaw, false, respuestasLog);
      n2++;
    } else if (clave('discapacidad') || (clave('identifica') && clave('discapacidad'))) {
      if (AP.iaDisponible) {
        pendientesTexto.push({ el, labelRaw, fallback: 'No' });
      } else {
        aplicarValorTexto(el, 'No', labelRaw, false, respuestasLog);
        n2++;
      }
    } else if (AP.iaDisponible && labelRaw.length > 5) {
      pendientesTexto.push({ el, labelRaw });
    } else if (labelRaw.length > 5) {
      respuestasLog.push({ pregunta: labelRaw, respuesta: '', respuestaIa: '', vacia: true, tipo:'texto', el, errorIA: null });
    }
  }

  let analisis = analisisDeOpciones;
  if (pendientesTexto.length) {
    const preguntasParaIA = pendientesTexto.map((pd, i) => ({ id: 't' + i, pregunta: pd.labelRaw, opciones: null }));
    msg('IA respondiendo ' + pendientesTexto.length + ' pregunta(s)…', '#7C3AED');
    const resultado = await analizarYResponder(contexto, preguntasParaIA);
    if (resultado.analisis) analisis = resultado.analisis;
    for (let i = 0; i < pendientesTexto.length; i++) {
      const pd = pendientesTexto[i];
      const valIA = resultado.respuestas['t' + i];
      if (valIA) {
        n2++;
        aplicarValorTexto(pd.el, valIA, pd.labelRaw, true, respuestasLog);
      } else if (pd.fallback) {
        n2++;
        aplicarValorTexto(pd.el, pd.fallback, pd.labelRaw, false, respuestasLog);
      } else {
        respuestasLog.push({ pregunta: pd.labelRaw, respuesta: '', respuestaIa: '', vacia: true, tipo:'texto', el: pd.el, errorIA: resultado.error });
      }
      await sleep(250);
    }
  } else if (!analisis) {
    const resultado = await analizarYResponder(contexto, []);
    analisis = resultado.analisis;
  }

  return { n2, respuestasLog, analisis };
}

// ── Postular ──────────────────────────────────────────────────
// Devuelve { ok, expirada } -- expirada=true SOLO cuando no hay ningún botón
// de postular (la oferta ya no existe o no acepta postulantes).
//
// ⚠️ SIN VERIFICAR EN VIVO más allá del clic en "Postular": Trabajando exige
// sesión iniciada para postular (probado: sin sesión, redirige a una
// pantalla de login de página completa con campos de email/contraseña), así
// que no se pudo observar el formulario real que aparece después de iniciar
// sesión -- ni si es un modal de preguntas como Computrabajo, ni si es
// postulación directa de un clic como Laborum a veces. El código de acá
// reutiliza el mismo módulo genérico de detección de preguntas que ya usan
// los otros dos adaptadores (radios/checkboxes/texto dentro del panel), que
// no depende de las clases particulares del sitio -- pero conviene probar
// las primeras postulaciones reales con "Revisar antes de enviar" activado
// en el popup, para confirmar que lee bien el formulario real antes de
// confiarle el envío automático.
//
// Salvaguarda que SÍ es explícita a propósito: si después de hacer clic en
// "Postular" aparece un input[type=password] en la página, es la pantalla
// de login (la sesión se cerró, o nunca se inició) -- no el formulario de la
// oferta. Cortar ahí en vez de intentar "rellenar" una pantalla de login es
// la diferencia entre un log de error claro y escribirle datos del CV a un
// campo de contraseña.
async function postular(url, id, titulo, decisionOfertaId) {
  if (AP.vistos.has(id)) return { ok: false, expirada: false };
  AP.vistos.add(id);

  msg('Postulando: ' + titulo.slice(0,35) + '…', '#D97706');

  const panelDetalle = document.querySelector(SELECTOR_PANEL);
  if (panelDetalle && /ya (te )?postulaste|postulaci[oó]n (ya )?enviada/i.test(n(panelDetalle.innerText || ''))) {
    addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Ya postulado'});
    return { ok: false, expirada: false };
  }

  const btn = document.getElementById('applyOfferSticky');
  if (!btn || !btn.offsetParent) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'No se encontró botón Postular'});
    return { ok: false, expirada: true };
  }

  if (!AP.activo) return { ok: false, expirada: false };

  const contexto = extraerTextoAviso();

  btn.scrollIntoView({behavior:'smooth', block:'center'});
  await sleep(400);
  btn.click();
  await sleep(2000);

  if (document.querySelector('input[type=password]')) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Pide iniciar sesión en Trabajando.com -- revisa que la cuenta siga conectada'});
    return { ok: false, expirada: false };
  }

  const panelPostForm = document.querySelector(SELECTOR_PANEL) || document;
  const hayForm = [...panelPostForm.querySelectorAll('textarea,input[type=radio]')].some(el => el.offsetParent && !el.closest('.hide'));

  if (hayForm) {
    msg('Rellenando formulario…', '#D97706');
    const { n2, respuestasLog, analisis } = await rellenar(contexto);
    await sleep(1000);

    if (AP.cfg && AP.cfg.modoRevision) {
      msg('⏸ Revisión pendiente…', '#2563EB');
      const decision = await mostrarRevision(titulo, respuestasLog, contexto);
      if (decision === 'skip') {
        addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Saltada en revisión manual'});
        return { ok: false, expirada: false };
      }
    }

    const btnEnviar = [...document.querySelectorAll('button, a, input[type=submit]')]
      .find(el => {
        const t = n(el.textContent || el.value || '');
        return (t.includes('enviar') || t.includes('postular') || t.includes('confirmar')) && !el.disabled && el.offsetParent;
      });

    if (btnEnviar) {
      btnEnviar.scrollIntoView({block:'center'});
      await sleep(300);
      btnEnviar.click();
      await sleep(2000);
      const respuestasParaLog = respuestasLog.map(r => ({ pregunta:r.pregunta, respuestaIa:r.respuestaIa, respuesta:r.respuesta, fueEditada: r.respuestaIa !== r.respuesta, vacia:r.vacia, fueIA:r.fueIA }));
      addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id,
        reason:'Enviado (' + n2 + ' campos)',
        respuestas: respuestasParaLog
      });
      reportarPostulacion({ id, titulo, plataforma: 'Trabajando', url, matchScore: analisis && analisis.matchScore, respuestas: respuestasParaLog, decisionOfertaId });
      msg('✓ ' + titulo.slice(0,40), '#16A34A');
      return { ok: true, expirada: false };
    } else {
      addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Formulario detectado pero sin botón de enviar reconocible'});
      return { ok: false, expirada: false };
    }
  } else {
    addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id, reason:'Postulación directa'});
    reportarPostulacion({ id, titulo, plataforma: 'Trabajando', url, decisionOfertaId });
    msg('✓ ' + titulo.slice(0,40), '#2563EB');
    return { ok: true, expirada: false };
  }
}

// ── Activar tarjeta ───────────────────────────────────────────
// Trabajando reemplaza el nodo del botón "Postular" (id="applyOfferSticky")
// cada vez que se selecciona una oferta distinta -- verificado en vivo
// comparando identidad de nodo antes/después de un clic. Mismo patrón que
// Computrabajo: esperar a que el nodo cambie es la señal de "ya cargó".
async function activar(tarjeta) {
  const btnAntes = document.getElementById('applyOfferSticky');
  const a = tarjeta.querySelector('h2 a') || tarjeta.querySelector('a');
  if (!a) return null;
  a.click();
  for (let i = 0; i < 25; i++) {
    await sleep(350);
    const btnDespues = document.getElementById('applyOfferSticky');
    if (btnDespues && btnDespues !== btnAntes && btnDespues.offsetParent) return btnDespues;
  }
  return null;
}

// ── Escanear ──────────────────────────────────────────────────
async function escanear() {
  if (!AP.activo || AP.procesando || !AP.cfg) return;
  const tarjetas = [...document.querySelectorAll('div.result-box')];
  if (!tarjetas.length) { msg('Sin tarjetas — busca ofertas en Trabajando', '#9CA3AF'); return; }

  let pendientes = [];
  const titulosVistos = [];
  const avistamientos = [];
  const conteos = { postular: 0, gris: 0, descartar: 0 };
  const razonesDescartadas = [];
  const candidatosGris = [];

  tarjetas.forEach((t, idx) => {
    const a = t.querySelector('h2 a') || t.querySelector('a');
    const url = a ? a.href.split('#')[0] : '';
    const id = getId(url) || ('idx-' + idx);
    if (AP.vistos.has(id)) return;

    const titulo = tituloDeTarjeta(t);
    titulosVistos.push(titulo);

    const empresa = extraerEmpresa(t) || null;
    avistamientos.push({ externalId: id, titulo, empresa, url });

    const resultado = evaluarTarjeta(t);
    if (resultado.banda === 'postular') {
      pendientes.push({t, id, idx, titulo});
    } else if (resultado.banda === 'gris') {
      AP.vistos.add(id);
      candidatosGris.push({t, id, idx, titulo, url, empresa, resultado});
    } else {
      conteos.descartar++;
      const razon = (resultado.razones && resultado.razones[0]) || 'No calza con tus filtros';
      razonesDescartadas.push(razon);
      AP.vistos.add(id);
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:AP.formatearRazonCorta(razon)});
    }
  });
  reportarTitulosVistos(titulosVistos, 'Trabajando');
  AP.reportarAvistamientos(avistamientos, 'Trabajando');

  // Etapa 2 (docs/visibilidad-y-etapa2.md §B): solo las grises -- ver el
  // razonamiento completo en computrabajo.js, es el mismo acá.
  for (const cand of candidatosGris) {
    if (!AP.activo) break;
    msg('Revisando oferta ambigua: ' + cand.titulo.slice(0, 30) + '…', '#7C3AED');
    const btn = await activar(cand.t);
    let resultadoFinal = null;
    let detalleAviso = null;
    if (btn) {
      detalleAviso = extraerFacetasAviso();
      const camposCompletos = {
        titulo: cand.titulo, empresa: cand.empresa,
        cuerpo: extraerTextoAviso(), ubicacion: extraerUbicacion(cand.t),
      };
      resultadoFinal = AP.evaluarOferta(camposCompletos);
    }
    const resultado = resultadoFinal || cand.resultado;

    if (resultadoFinal && resultadoFinal.banda === 'postular') {
      pendientes.push({t: cand.t, id: cand.id, idx: cand.idx, titulo: cand.titulo});
    } else if (resultadoFinal && resultadoFinal.banda === 'descartar') {
      conteos.descartar++;
      const razon = (resultado.razones && resultado.razones[0]) || 'No calza con tus filtros';
      razonesDescartadas.push(razon);
      addLog({ts:Date.now(), status:'skip', title:cand.titulo, url:cand.url, uid:cand.id, reason:AP.formatearRazonCorta(razon)});
    } else {
      conteos.gris++;
      addLog({ts:Date.now(), status:'skip', title:cand.titulo, url:cand.url, uid:cand.id, reason:'En banda gris — revisar en el dashboard'});
      AP.reportarBandaGris({
        titulo: cand.titulo, url: cand.url, plataforma: 'Trabajando', empresa: cand.empresa,
        scoreLocal: resultado.score, razones: resultado.razones, detalleAviso,
      });
    }
  }

  // docs/modo-solo-observar.md §3.2: ver el razonamiento completo en
  // computrabajo.js, es el mismo acá.
  const soloObservar = !!(AP.cfg && AP.cfg.soloObservar);
  {
    if (soloObservar) conteos.observado = pendientes.length;
    else conteos.postular = pendientes.length;
    const resumen = AP.mensajeEscaneo(conteos, AP.razonMasFrecuente(razonesDescartadas), soloObservar);
    msg(resumen.texto, resumen.estado);
  }

  const botonVerMas = [...document.querySelectorAll('#listadoOfertas button, #listadoOfertas a')]
    .find(el => /ver m[aá]s empleos/i.test(el.textContent || ''));

  if (!pendientes.length) {
    if (siguientePaginaClick(tarjetas.length, botonVerMas)) return; // el MutationObserver retoma solo cuando lleguen las tarjetas nuevas
    return;
  }

  AP.procesando = true;
  for (const {t, id, titulo} of pendientes) {
    if (!AP.activo) break;
    const a = t.querySelector('h2 a') || t.querySelector('a');
    const url = a ? a.href.split('#')[0] : '';
    if (soloObservar) {
      AP.vistos.add(id);
      addLog({ts:Date.now(), status:'observado', title:titulo, url, uid:id, reason:'Habría postulado — modo solo observar'});
      continue;
    }
    msg('Abriendo: ' + titulo.slice(0,35) + '…', '#D97706');
    const btn = await activar(t);
    if (btn) await postular(url, id, titulo);
    else {
      AP.vistos.add(id);
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Panel no cargó'});
    }
    await sleep(DELAY);
  }
  AP.procesando = false;

  if (siguientePaginaClick(tarjetas.length, botonVerMas)) return;
  msg('Escaneo completo', '#16A34A');
}

// ── Postular directo a UNA oferta ya aprobada en banda gris (§8.6) ──────
// Mismo patrón que computrabajo.js: la pestaña la abrió background.js
// apuntando directo a la URL de la oferta, así que alcanza con extraer
// id/título de la propia página y reutilizar postular().
async function aplicarDirecto(decisionOfertaId) {
  const id = getId(location.href) || location.pathname;
  const tituloEl = document.querySelector(SELECTOR_PANEL + ' h3');
  const titulo = (tituloEl && tituloEl.textContent.trim()) || 'Oferta';
  AP.procesando = true;
  try {
    return await postular(location.href, id, titulo, decisionOfertaId);
  } finally {
    AP.procesando = false;
  }
}

// ── Registro en el núcleo compartido (core.js) ──────────────────
AP.escanear = escanear;
AP.aplicarDirecto = aplicarDirecto;
AP.onInit = function() {
  console.log('[AP-TJ] listo — AP.activo:', AP.activo, 'incTags:', AP.cfg && AP.cfg.incTags && AP.cfg.incTags.length, 'modoRevision:', AP.cfg && AP.cfg.modoRevision, 'IA (token):', AP.iaDisponible);
  if (AP.activo) {
    msg('Activado — escaneando…', '#16A34A');
    setTimeout(escanear, 1800);
  }
};

window._apInjected = true;
})();
