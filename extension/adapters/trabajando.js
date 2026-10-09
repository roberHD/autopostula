// ═══════════════════════════════════════════════════════════════
//  AutoPostula — adaptador de Trabajando.com
//  Todo lo específico del DOM/flujo de Trabajando.com. El estado
//  compartido y las utilidades genéricas viven en core.js (cargado
//  antes que este archivo — ver manifest.json) bajo el objeto AP.
//
//  Estructura verificada a mano contra el sitio real el 2026-09-08 (sin
//  sesión iniciada), y el flujo de postulación completo el 2026-09-30, con
//  sesión y sin enviar nada: ver "Pantallas de la postulación", más abajo.
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

// Una pestaña que se ABRE en una oferta puntual (/trabajo/{id}-…, o la
// dirección de una tarjeta, /trabajo-empleo/…/trabajo/{id}-…) no se escanea
// sola (2026-09-30). Así se abren las aprobadas de "Por decidir"
// (background.js, applyInTab), y esa página también trae el listado: el
// escaneo automático arrancaba ~1 s antes que la orden de postular a la
// aprobada, abría otras tarjetas (y podía postular a ellas), y la aprobada
// terminaba enviándose a la oferta que hubiera quedado abierta. Las búsquedas
// (/trabajo-empleo/{cargo}…) no traen /trabajo/{id}- y se escanean como
// siempre; un escaneo pedido (AP.escaneoPedido, ver core.js) también.
const CARGADA_EN_OFERTA = /\/trabajo\/\d+-/.test(location.pathname);

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

// El de una tarjeta del listado: el de su enlace, o su posición si no tiene.
function idDeTarjeta(tarjeta, idx) {
  const a = tarjeta.querySelector('h2 a') || tarjeta.querySelector('a');
  return getId(a ? a.href.split('#')[0] : '') || ('idx-' + idx);
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

// La misma, como la muestra la tarjeta y sin el respaldo de todo su texto,
// para el panel de revisión (docs/panel-de-revision-en-el-portal.md §2.1).
function ubicacionVisible(tarjeta) {
  const el = tarjeta.querySelector('.location');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
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

// ── Pantallas de la postulación (verificado en vivo el 2026-09-30) ──────
// Se recorrió el flujo real con sesión iniciada, sin enviar nada, y se leyó el
// código del propio sitio (su controladorPostulacion). Después de "Postula
// fácil":
//   - oferta SIN preguntas: el sitio la envía en ese mismo clic y cambia el
//     panel por la pantalla "¡Has postulado al empleo!" (SELECTOR_EXITO). No
//     hay confirmación intermedia: el modal "Confirma tu postulación"
//     (#modalConfirmarPostulacion) sigue en la página, pero el sitio ya no lo
//     abre.
//   - CON preguntas: abre #modalConfirmarPreguntas ("Responde las preguntas
//     del reclutador…"), que trae DOS botones "Comenzar", uno para celular
//     (d-md-none) y otro para computador (d-none d-md-block). El primero del
//     documento es el de celular, oculto en un computador: la versión anterior
//     tomaba ese, nunca lo apretaba y la postulación quedaba ahí detenida.
//     "Comenzar" cambia el panel por la pantalla de preguntas, "Estás
//     postulando a…" (ver responderPreguntas).
//   - CV incompleto, estudios de una institución, CV en archivo: otro modal
//     que le pide algo a la persona.
// Si la oferta se termina en el sitio de la empresa (linkPostulacionExterno),
// la pantalla de éxito dice "Has iniciado tu inscripción al empleo".
const SELECTOR_EXITO = '.seccion-postulacion-ok';
const SELECTOR_FORM_PREGUNTAS = '#formularioPreguntasOferta';
const SELECTOR_ENVIAR_PREGUNTAS = '#cabeceraPreguntasEscritorio button';
// El sitio arma su panel de preguntas para celular (aunque se esté en un
// computador) solo cuando la oferta tiene preguntas: así se sabe ANTES del
// clic si "Postula fácil" va a enviar de una vez. Verificado contra los datos
// del propio sitio en ofertas con 7, 6 y 0 preguntas.
const SELECTOR_HAY_PREGUNTAS = '#offCanvasPreguntasMobile';
const YA_POSTULADO = /ya (te )?postulaste|postulacion (ya )?enviada/;
// Se pidió lo que faltaba en un formulario y el panel se cerró solo, por
// tiempo: no hay nadie mirando esta pestaña, así que no se vuelve a preguntar
// (ver postular()).
let nadieContestoEnEstaPestana = false;

// Espera a que condicion() devuelva algo y lo devuelve; null si vence el plazo.
async function esperarA(condicion, ms) {
  const hasta = Date.now() + ms;
  for (;;) {
    const r = condicion();
    if (r) return r;
    if (Date.now() >= hasta) return null;
    await sleep(250);
  }
}

// El título del aviso: <h3> en el panel del listado, <h1> en la página propia
// de la oferta (/trabajo/{id}-…, así se abren las aprobadas de "Por decidir";
// antes se buscaba solo el <h3> y esas quedaban registradas como "Oferta").
function tituloDelPanel() {
  const panel = document.querySelector(SELECTOR_PANEL);
  const h = panel && panel.querySelector('#offerHeader h3, #offerHeader h1, h3');
  return (h && h.textContent.trim()) || '';
}

function panelDiceYaPostulado() {
  const panel = document.querySelector(SELECTOR_PANEL);
  return !!panel && YA_POSTULADO.test(n(panel.innerText || ''));
}

// ── Preguntas del reclutador (verificado en vivo el 2026-09-30) ─────────
// La pantalla "Estás postulando a…" (componente PreguntasEscritorio del sitio)
// reemplaza al panel de la oferta: #detalleOferta deja de existir y las
// preguntas quedan en #formularioPreguntasOferta, cada una en un
// div#pregunta_N con dos <label> (.type1 "Pregunta N", .type2 el texto real)
// y un solo campo según su tipo:
//   TEXTO    -> <textarea maxlength="3000">
//   MULTIPLE -> <select>, con una primera opción "Selecciona" (value "")
//   NUMERO   -> <input type="text"> que solo acepta un número (dígitos, con o
//               sin puntos de miles) de hasta 11 caracteres
// No hay radios ni casillas. El "Postular" de arriba
// (#cabeceraPreguntasEscritorio) sigue deshabilitado hasta que todas las
// respuestas son válidas, y ese clic ya envía.
//
// Se busca SOLO dentro de #formularioPreguntasOferta, a propósito. El sitio
// dibuja otra copia de cada pregunta, con los mismos ids, en su panel para
// celular (#offCanvasPreguntasMobile: escondido con visibility:hidden pero con
// offsetParent, así que "parece" visible), y el buscador de arriba ("¿Qué
// trabajo buscas?", "Región / Comuna") son inputs de texto visibles. La versión
// anterior recorría todo el documento: le pedía a la IA el doble de respuestas
// y le "respondía" también al buscador.

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

// La opción que calza con la respuesta de la IA: igual, después "empieza con",
// y recién al final "contiene", que era lo único que se miraba antes: "No, sin
// licencia" caía en "Si" por el "si" de "sin".
function opcionQueCalza(respuesta, opciones) {
  const r = n(respuesta || '');
  if (!r) return null;
  const conTexto = opciones.filter(o => n(o.texto));
  return conTexto.find(o => n(o.texto) === r)
    || conTexto.find(o => r.startsWith(n(o.texto)) && !/[a-z0-9]/.test(r.charAt(n(o.texto).length)))
    || conTexto.find(o => r.includes(n(o.texto)))
    || null;
}

// NUMERO: el sitio acepta solo un número de hasta 11 caracteres; con otra cosa
// no deja enviar. Se toma el primero de la respuesta, con "mil" y "millones"
// ("$800.000 líquidos" -> 800000, "800 mil" -> 800000, "1,2 millones" ->
// 1200000). Sin número queda vacía.
function soloNumero(respuesta) {
  const m = n(String(respuesta || '')).match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d+))?(?:\s*(millones|millon|mil)\b)?/);
  if (!m) return '';
  const entero = Number(m[1].replace(/\./g, ''));
  const escala = !m[3] ? 1 : m[3] === 'mil' ? 1e3 : 1e6;
  const valor = escala === 1 ? entero : Math.round(Number(entero + '.' + (m[2] || '0')) * escala);
  const texto = String(valor);
  return texto.length <= 11 ? texto : '';
}

// Responde el formulario y devuelve { n2, respuestasLog, analisis }. Una sola
// llamada a la IA para todas las preguntas: antes eran dos (una para las de
// opciones y otra para las de texto), y cada una remandaba el CV y el aviso
// completos.
async function responderPreguntas(form, contexto) {
  // El sitio arma las respuestas vacías al montar la pantalla: se le da un
  // momento antes de escribir.
  await sleep(1000);
  if (!AP.activo) return { n2: 0, respuestasLog: [], analisis: null };
  const perfil = (AP.cfg && AP.cfg.perfil) || {};
  const respuestasLog = [];
  const pendientes = [];
  let n2 = 0;

  // div, no [id^="pregunta_"] a secas: el campo de adentro repite el id.
  for (const caja of form.querySelectorAll('div[id^="pregunta_"]')) {
    const campo = caja.querySelector('textarea, select, input[type="text"]');
    const etiqueta = caja.querySelector('label.type2');
    const pregunta = ((etiqueta && etiqueta.textContent) || '').trim();
    if (!campo || !pregunta) continue;
    if (campo.tagName === 'SELECT') {
      const opciones = [...campo.options].filter(o => o.value !== '').map(o => ({ el: o, texto: o.textContent.trim() }));
      if (!opciones.length) continue;
      const elegida = calcularRespuesta(pregunta, opciones, perfil);
      if (elegida) {
        AP.elegirOpcion(elegida.el);
        n2++;
        respuestasLog.push({ pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, tipo: 'opcion', opciones, elegidoEl: elegida.el });
      } else {
        pendientes.push({ campo, pregunta, opciones });
      }
    } else {
      pendientes.push({ campo, pregunta, numero: campo.tagName === 'INPUT' });
    }
  }

  let resultado = { analisis: null, respuestas: {}, datosFaltantes: {}, error: null };
  if (AP.iaDisponible) {
    if (pendientes.length) msg('IA respondiendo ' + pendientes.length + ' pregunta(s)…', 'trabajando');
    // Sin pendientes igual se llama: trae el análisis del aviso (matchScore).
    resultado = await analizarYResponder(contexto, pendientes.map((p, i) => ({
      id: 'p' + i,
      pregunta: p.numero ? p.pregunta + ' (Responde solo con el número.)' : p.pregunta,
      opciones: p.opciones ? p.opciones.map(o => o.texto) : null,
    })));
  }

  for (let i = 0; i < pendientes.length; i++) {
    const p = pendientes[i];
    // §8.4 (docs/revision-2026-09-16.md): la IA puede decir que la pregunta
    // pide un hecho verificable (licencia, renta...) que no está en el perfil,
    // en vez de inventarlo -- ver la regla 1b de procesar-postulacion/route.ts.
    const datoFaltante = (resultado.datosFaltantes && resultado.datosFaltantes['p' + i]) || null;
    const respuestaIa = datoFaltante ? null : resultado.respuestas['p' + i];
    if (p.opciones) {
      const elegida = respuestaIa ? opcionQueCalza(respuestaIa, p.opciones) : null;
      if (elegida) {
        AP.elegirOpcion(elegida.el);
        n2++;
        respuestasLog.push({ pregunta: p.pregunta, respuesta: elegida.texto, respuestaIa: elegida.texto, tipo: 'opcion', opciones: p.opciones, elegidoEl: elegida.el });
      } else {
        respuestasLog.push({ pregunta: p.pregunta, respuesta: '', respuestaIa: '', vacia: true, datoFaltante, tipo: 'opcion', opciones: p.opciones, elegidoEl: null, errorIA: resultado.error });
      }
    } else {
      let valor = respuestaIa ? (p.numero ? soloNumero(respuestaIa) : limitarTexto(respuestaIa, p.campo)) : '';
      const fueIA = !!valor;
      // Como antes: una pregunta de discapacidad sin respuesta de la IA va con "No".
      if (!valor && !datoFaltante && !p.numero && /\bdiscapacidad/.test(n(p.pregunta))) valor = 'No';
      if (valor) {
        p.campo.scrollIntoView({ block: 'nearest' });
        setVal(p.campo, valor);
        n2++;
        respuestasLog.push({ pregunta: p.pregunta, respuesta: valor, respuestaIa: valor, fueIA, tipo: 'texto', el: p.campo, numero: p.numero });
      } else {
        respuestasLog.push({ pregunta: p.pregunta, respuesta: '', respuestaIa: '', vacia: true, datoFaltante, tipo: 'texto', el: p.campo, numero: p.numero, errorIA: resultado.error });
      }
    }
    // Sin pausa entre una y otra: en una pestaña de fondo (las de las ráfagas)
    // Chrome estira cada setTimeout a un segundo o más, y la pausa no le
    // servía al sitio (valida en cada "input").
  }

  return { n2, respuestasLog, analisis: resultado.analisis };
}

// Las preguntas que el sitio todavía no da por buenas: sin responder, o con su
// aviso rojo ("Campo requerido", "Esta pregunta solo acepta números"...).
function preguntasSinRespuestaValida(form) {
  const malas = [];
  for (const caja of form.querySelectorAll('div[id^="pregunta_"]')) {
    const campo = caja.querySelector('textarea, select, input[type="text"]');
    if (!campo) continue;
    const aviso = [...caja.querySelectorAll('.text-primary-red')].find(el => el.offsetParent);
    if (campo.value && !aviso) continue;
    const etiqueta = caja.querySelector('label.type2');
    malas.push('"' + ((etiqueta && etiqueta.textContent) || '').trim().slice(0, 60) + '"' + (aviso ? ' (' + aviso.textContent.trim() + ')' : ''));
  }
  return malas;
}

// ── Botón de postular ────────────────────────────────────────────
// #applyOfferSticky NO sirve como selector: es un botón "sticky" (header
// que se fija al hacer scroll) que el propio sitio deja con
// display:none en un ancestro (.stickyOfferHeader) hasta que el usuario
// scrollea el panel -- verificado en vivo el 2026-09-11, nunca se vuelve
// visible en una pestaña que no scrollea (el caso normal de un escaneo
// automático). Hay un segundo botón "Postula fácil" (sin id, dentro de
// #columnaPostular) que hace lo mismo y SÍ está visible desde que carga
// el panel -- confirmado en vivo que al hacerle clic sin sesión redirige
// a /ingresa-a-tu-cuenta, el mismo comportamiento esperado del botón real
// de postular. Por eso se busca por texto + visibilidad en vez de por id.
//
// Y solo dentro del panel de la oferta (2026-09-30): en la pantalla de
// preguntas y en la de éxito el panel ya no existe, y buscar en todo el
// documento encontraba "Mis postulaciones" (el menú de arriba y la pantalla
// de éxito), que también dice "postul".
function obtenerBotonPostular() {
  const panel = document.querySelector(SELECTOR_PANEL);
  if (!panel) return null;
  return [...panel.querySelectorAll('button, a')]
    .find(el => n(el.textContent || '').includes('postul') && el.offsetParent && !el.disabled) || null;
}

// ── ¿Quedó postulada? (docs/revision-2026-09-16.md §8.1) ──────────────────
// "El ✓ solo se muestra con evidencia del portal": un clic sin errores no
// alcanza. La evidencia real es la pantalla de éxito del sitio
// (SELECTOR_EXITO, "¡Has postulado al empleo!", verificada en su código el
// 2026-09-30), y como respaldo su texto o el "Ya postulaste" del panel.
//
// Historia: la primera versión buscaba solo frases que el sitio no usa ("ya
// postulaste", "postulación enviada"...) en todo el documento, o daba por
// buena la postulación si ya no se veía un botón de postular. Lo primero
// encontraba "Ya postulaste" en otras partes de la página (reportado en vivo
// el 2026-09-30); lo segundo ya no sirve: en la pantalla de preguntas tampoco
// hay panel ni botón, y eso NO es una postulación hecha. Por eso se descarta
// el texto del listado y ya no se usa la ausencia del botón.
function huboEvidenciaDeExito() {
  if (document.querySelector(SELECTOR_EXITO)) return true;
  const listado = document.querySelector('#listadoOfertas');
  let texto = n(document.body.innerText || '');
  if (listado) {
    const textoListado = n(listado.innerText || '');
    if (textoListado) texto = texto.split(textoListado).join(' ');
  }
  return /has postulado|has iniciado tu inscripcion|ya (te )?postulaste|postulaci[oó]n (ya )?enviada|postulaci[oó]n (recibida|exitosa|realizada)|gracias por postular/.test(texto);
}

// Espera lo que haga el sitio después de "Postula fácil" (ver "Pantallas de la
// postulación", arriba) y aprieta el "Comenzar" que se ve. Devuelve
// 'enviada' | 'preguntas' | 'login' | { modal: texto } | null (no pasó nada).
async function esperarTrasPostular() {
  let modalVistoEn = 0, comenzarEn = 0;
  return esperarA(() => {
    if (huboEvidenciaDeExito()) return 'enviada';
    if (document.querySelector(SELECTOR_FORM_PREGUNTAS)) return 'preguntas';
    if (document.querySelector('input[type=password]') || /ingresa-a-tu-cuenta/.test(location.pathname)) return 'login';
    const modal = document.querySelector('.modal.show');
    if (!modal) return null;
    if (modal.id !== 'modalConfirmarPreguntas') {
      return { modal: (modal.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140) };
    }
    // Se espera a que el modal termine de abrirse: con un clic durante la
    // animación, Bootstrap no lo cierra (el sitio igual cambia de pantalla, pero
    // el modal queda encima). Si el clic no hizo nada, se reintenta a los 2,5 s.
    const ahora = Date.now();
    if (!modalVistoEn) modalVistoEn = ahora;
    if (ahora - modalVistoEn < 600 || ahora - comenzarEn < 2500) return null;
    const comenzar = [...modal.querySelectorAll('button')]
      .find(b => n(b.textContent || '') === 'comenzar' && b.offsetParent && !b.disabled);
    if (comenzar) { comenzarEn = ahora; comenzar.click(); }
    return null;
  }, 15000);
}

// Deja constancia de una postulación que el sitio confirmó y la guarda en
// AutoPostula. §1.3 (docs/revision-2026-09-16.md): ver el razonamiento
// completo en computrabajo.js, es el mismo acá.
async function registrarEnviada({ id, titulo, empresa, url, decisionOfertaId, reason, respuestas, analisis }) {
  // Con linkPostulacionExterno el sitio solo registra una "inscripción": la
  // postulación se termina en el sitio de la empresa, y hay que decirlo.
  const exito = document.querySelector(SELECTOR_EXITO);
  const externa = !!exito && /has iniciado tu inscripcion/.test(n(exito.innerText || ''));
  addLog({ts:Date.now(), status:'ok', title:titulo, url, uid:id,
    reason: externa ? reason + ' — la empresa pide terminarla en su sitio' : reason,
    respuestas});
  const reportado = await reportarPostulacion({ id, titulo, empresa, plataforma: 'Trabajando', url, matchScore: analisis && analisis.matchScore, respuestas, decisionOfertaId });
  if (!reportado || !reportado.ok) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Se envió en el portal, pero no se guardó en AutoPostula: ' + ((reportado && reportado.error) || 'error desconocido')});
    msg('⚠ Enviado, no se guardó: ' + titulo.slice(0,30), '#DC2626');
  } else {
    msg('✓ ' + titulo.slice(0,40), '#16A34A');
  }
  return { ok: true, expirada: false };
}

// ── Postular ──────────────────────────────────────────────────
// Devuelve { ok, expirada } -- expirada=true SOLO cuando ya no se puede enviar
// nunca (no hay botón de postular, o ya se había postulado).
//
// Salvaguarda que SÍ es explícita a propósito: si después de "Postula fácil"
// aparece un input[type=password] (o la página de ingreso), la sesión se cerró
// o nunca se inició -- no se intenta "rellenar" una pantalla de login.
async function postular(url, id, titulo, decisionOfertaId, empresa) {
  // docs/revision-2026-09-28.md §1: la empresa viaja con la postulación (se
  // guarda en la postulación misma, no se toma de la oferta compartida).
  if (AP.vistos.has(id)) return { ok: false, expirada: false };
  AP.vistos.add(id);

  msg('Postulando: ' + titulo.slice(0,35) + '…', '#D97706');
  AP.latido();

  if (panelDiceYaPostulado()) {
    addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Ya postulado'});
    // docs/revision-2026-09-28.md §6: ya no se puede enviar nunca -- una
    // aprobada de "Por decidir" en este estado se cierra en vez de reintentarse.
    return { ok: false, expirada: true };
  }

  const btn = obtenerBotonPostular();
  if (!btn) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'No se encontró botón Postular'});
    return { ok: false, expirada: true };
  }

  if (!AP.activo) return { ok: false, expirada: false };

  const contexto = extraerTextoAviso();

  // §2.10 (docs/revision-2026-09-16.md): sin preguntas, "Postula fácil" ya es
  // el clic que envía -- con "Revisar antes de enviar" el visto bueno se pide
  // ANTES. Con preguntas, lo que se revisa son las respuestas, antes del
  // "Postular" final.
  if (!document.querySelector(SELECTOR_HAY_PREGUNTAS) && AP.conRevision()) {
    msg('⏸ Revisión pendiente…', '#2563EB');
    const decision = await AP.confirmarAntesDeEnviar(titulo, contexto,
      'Esta oferta se postula sin preguntas: al confirmar se envía tu CV. ¿Enviar?');
    if (decision === 'skip') {
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Saltada en revisión manual'});
      return { ok: false, expirada: false };
    }
  }

  btn.scrollIntoView({behavior:'smooth', block:'center'});
  await sleep(400);
  btn.click();

  const paso = await esperarTrasPostular();

  if (paso === 'enviada') {
    return registrarEnviada({ id, titulo, empresa, url, decisionOfertaId, reason: 'Postulación directa' });
  }
  if (paso === 'login') {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Pide iniciar sesión en Trabajando.com -- revisa que la cuenta siga conectada'});
    return { ok: false, expirada: false };
  }
  if (paso && paso.modal) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id, reason:'Trabajando.com pide algo antes de postular: "' + paso.modal + '"'});
    msg('⚠ No se postuló: ' + titulo.slice(0,30), '#DC2626');
    return { ok: false, expirada: false };
  }
  if (paso !== 'preguntas') {
    // Documentos requeridos: el sitio no abre ningún modal, solo avisa.
    const pideDocumentos = /adjuntar los documentos|documento requerido/.test(n(document.body.innerText || ''));
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id,
      reason: pideDocumentos ? 'La oferta pide adjuntar documentos: hay que postular a mano' : 'Se apretó "' + btn.textContent.trim() + '" pero trabajando.com no avanzó'});
    msg('⚠ No se postuló: ' + titulo.slice(0,30), '#DC2626');
    return { ok: false, expirada: false };
  }

  AP.latido();
  const form = document.querySelector(SELECTOR_FORM_PREGUNTAS);
  msg('Rellenando formulario…', '#D97706');
  const { n2, respuestasLog, analisis } = await responderPreguntas(form, contexto);
  const paraLog = () => respuestasLog.map(r => ({ pregunta:r.pregunta, respuestaIa:r.respuestaIa, respuesta:r.respuesta, fueEditada: r.respuestaIa !== r.respuesta, vacia:r.vacia, fueIA:r.fueIA }));

  const conRevision = AP.conRevision();
  const sinResponder = respuestasLog.filter(r => r.vacia);
  const faltan = sinResponder.map(r => r.datoFaltante || '"' + (r.pregunta || '').slice(0, 50) + '"').slice(0, 3).join(', ');
  const errorIA = (sinResponder.find(r => r.errorIA) || {}).errorIA;

  if (!conRevision && errorIA) {
    // La IA no respondió (cupo del mes, red): no hay un dato puntual que
    // pedirle a la persona. Se dice y se sigue con la próxima.
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id,
      reason:'La IA no pudo responder el formulario (' + errorIA + ')', respuestas: paraLog()});
    msg('⚠ No se postuló: ' + titulo.slice(0,30), '#DC2626');
    return { ok: false, expirada: false };
  }

  // Con "Revisar antes de enviar" se revisa todo, como siempre. Sin él, una
  // sola pregunta sin respuesta (la licencia, la renta, un Sí/No que la IA no
  // podía saber: §8.4, docs/revision-2026-09-16.md, nada se inventa) dejaba
  // la postulación sin enviar, sin preguntarle nada a nadie. Ahora se pide
  // solo lo que falta, con el mismo panel y un plazo más corto, y lo que la
  // persona conteste lo puede guardar en su perfil para no volver a
  // encontrárselo (docs/extension-trabajando-2026-09-30.md). Si nadie
  // contesta a tiempo, en esta pestaña no se vuelve a preguntar: las demás
  // ofertas con datos faltantes se saltan directo, con el dato en el historial.
  if (conRevision || (sinResponder.length && !nadieContestoEnEstaPestana)) {
    msg(conRevision ? '⏸ Revisión pendiente…' : '⏸ Falta información para postular…', '#2563EB');
    const decision = await mostrarRevision(titulo, respuestasLog, contexto,
      conRevision ? undefined : { titulo: 'Falta información para postular', limiteMs: 120000 });
    if (decision === 'skip') {
      if (!conRevision && AP.revisionVencida) nadieContestoEnEstaPestana = true;
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id,
        reason: conRevision ? 'Saltada en revisión manual'
          : AP.revisionVencida ? 'Faltaban respuestas (' + faltan + ') y nadie contestó a tiempo'
          : 'Saltada: faltaban respuestas (' + faltan + ')',
        respuestas: paraLog()});
      return { ok: false, expirada: false };
    }
    // Lo editado en el panel tiene que seguir siendo un número donde el sitio
    // pide uno (ver soloNumero).
    for (const r of respuestasLog) {
      if (!r.numero || !r.el) continue;
      const valor = soloNumero(r.el.value);
      if (valor !== r.el.value) setVal(r.el, valor);
      r.respuesta = valor;
      r.vacia = !valor;
    }
  } else if (sinResponder.length) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id,
      reason:'Faltan datos para responder (' + faltan + '): guárdalos en tu perfil o activa "Revisar antes de enviar"',
      respuestas: paraLog()});
    msg('⚠ No se postuló: ' + titulo.slice(0,30), '#DC2626');
    return { ok: false, expirada: false };
  }

  const respuestasParaLog = paraLog();
  AP.latido();

  // El "Postular" de la pantalla de preguntas se habilita recién cuando todas
  // las respuestas son válidas.
  const btnEnviar = await esperarA(() => {
    const b = [...document.querySelectorAll(SELECTOR_ENVIAR_PREGUNTAS)].find(el => el.offsetParent);
    return b && !b.disabled ? b : null;
  }, 4000);
  if (!btnEnviar) {
    const malas = preguntasSinRespuestaValida(form);
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id,
      reason: 'Trabajando.com no deja enviar: ' + (malas.length
        ? malas.length + ' pregunta(s) sin una respuesta válida, como ' + malas[0]
        : 'su botón Postular sigue deshabilitado'),
      respuestas: respuestasParaLog});
    msg('⚠ No se postuló: ' + titulo.slice(0,30), '#DC2626');
    return { ok: false, expirada: false };
  }

  btnEnviar.scrollIntoView({block:'center'});
  await sleep(300);
  btnEnviar.click();

  if (!await esperarA(huboEvidenciaDeExito, 15000)) {
    addLog({ts:Date.now(), status:'err', title:titulo, url, uid:id,
      reason:'Se apretó Postular pero trabajando.com nunca confirmó la postulación',
      respuestas: respuestasParaLog});
    msg('⚠ No se confirmó: ' + titulo.slice(0,30), '#DC2626');
    return { ok: false, expirada: false };
  }
  return registrarEnviada({ id, titulo, empresa, url, decisionOfertaId, reason: 'Enviado (' + n2 + ' campos)', respuestas: respuestasParaLog, analisis });
}

// ── Activar tarjeta ───────────────────────────────────────────
async function activar(tarjeta) {
  // El título del panel es la señal de "cambió de oferta" -- ver
  // obtenerBotonPostular() más arriba para por qué el botón ya no se
  // identifica por id. También la dirección: dos avisos seguidos pueden
  // llamarse igual, y el sitio pone el id de la oferta en la URL al abrirla.
  const tituloAntes = tituloDelPanel();
  const a = tarjeta.querySelector('h2 a') || tarjeta.querySelector('a');
  if (!a) return null;
  const idTarjeta = getId(a.href);
  a.click();
  for (let i = 0; i < 25; i++) {
    await sleep(350);
    const tituloAhora = tituloDelPanel();
    const esEsta = tituloAhora && (tituloAhora !== tituloAntes || (idTarjeta && getId(location.href) === idTarjeta));
    if (!esEsta) continue;
    const btn = obtenerBotonPostular();
    if (btn) return btn;
    // Ya postulada: el sitio muestra "Ya postulaste" en vez del botón. No hay
    // nada que esperar; quien llama lo distingue con panelDiceYaPostulado().
    if (panelDiceYaPostulado()) return null;
  }
  return null;
}

// ── Escanear ──────────────────────────────────────────────────
async function escanear() {
  // Una pestaña abierta en una oferta puntual no se escanea sola (ver
  // CARGADA_EN_OFERTA): espera la orden de postular a esa oferta.
  if (CARGADA_EN_OFERTA && !AP.escaneoPedido) return;
  if (!AP.activo || AP.procesando || !AP.cfg) { AP.reportarEscaneoTerminado(); return; }
  const tarjetas = [...document.querySelectorAll('div.result-box')];
  if (!tarjetas.length) { msg('Sin tarjetas — busca ofertas en Trabajando', '#9CA3AF'); AP.reportarEscaneoTerminado(); return; }

  let pendientes = [];
  const titulosVistos = [];
  const avistamientos = [];
  const conteos = { postular: 0, gris: 0, descartar: 0 };
  const razonesDescartadas = [];
  // Cada descarte con su razón va al panel (docs/estrategia-y-rediseno.md
  // §5.2): "Lo último que hizo" dice cuál y por qué, y se puede corregir.
  const descartes = [];
  const candidatosGris = [];

  tarjetas.forEach((t, idx) => {
    const a = t.querySelector('h2 a') || t.querySelector('a');
    const url = a ? a.href.split('#')[0] : '';
    const id = idDeTarjeta(t, idx);
    // Lo que la persona decidió en el panel de revisión no se vuelve a decidir
    // solo (docs/panel-de-revision-en-el-portal.md §2.2).
    if (AP.vistos.has(id) || AP.decididaEnPanel(id)) return;

    const titulo = tituloDeTarjeta(t);
    titulosVistos.push(titulo);

    const empresa = extraerEmpresa(t) || null;
    avistamientos.push({ externalId: id, titulo, empresa, url });

    const resultado = evaluarTarjeta(t);
    // Cada decisión queda marcada en su tarjeta, con su razón
    // (docs/primera-busqueda-guiada.md §11), y con lo que muestra el panel de
    // revisión (docs/panel-de-revision-en-el-portal.md §2).
    const datos = { titulo, empresa, url, ubicacion: ubicacionVisible(t), score: resultado.score };
    if (resultado.banda !== 'descartar') AP.marcar(id, resultado.banda, resultado.razones, datos);
    if (resultado.banda === 'postular') {
      pendientes.push({t, id, idx, titulo, empresa, razones: resultado.razones, score: resultado.score});
    } else if (resultado.banda === 'gris') {
      AP.vistos.add(id);
      candidatosGris.push({t, id, idx, titulo, url, empresa, resultado});
    } else {
      conteos.descartar++;
      const razon = (resultado.razones && resultado.razones[0]) || 'No calza con tus filtros';
      razonesDescartadas.push(razon);
      descartes.push({ externalId: id, titulo, empresa, url, razon });
      AP.marcar(id, 'descartar', [razon], datos);
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
    msg('Revisando oferta ambigua: ' + cand.titulo.slice(0, 30) + '…', 'trabajando');
    const btn = await activar(cand.t);
    // Ya postulada (a mano o antes): no es una duda para "Por decidir".
    if (!btn && panelDiceYaPostulado()) {
      addLog({ts:Date.now(), status:'skip', title:cand.titulo, url:cand.url, uid:cand.id, reason:'Ya postulado'});
      continue;
    }
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
    // Con el aviso abierto, el puntaje que vale es el de esta segunda pasada.
    const datosCand = { titulo: cand.titulo, empresa: cand.empresa, url: cand.url, ubicacion: ubicacionVisible(cand.t), score: resultado.score };

    if (resultadoFinal && resultadoFinal.banda === 'postular') {
      AP.marcar(cand.id, 'postular', resultadoFinal.razones, datosCand);
      pendientes.push({t: cand.t, id: cand.id, idx: cand.idx, titulo: cand.titulo, empresa: cand.empresa, razones: resultadoFinal.razones, score: resultadoFinal.score});
    } else if (resultadoFinal && resultadoFinal.banda === 'descartar') {
      conteos.descartar++;
      const razon = (resultado.razones && resultado.razones[0]) || 'No calza con tus filtros';
      razonesDescartadas.push(razon);
      descartes.push({ externalId: cand.id, titulo: cand.titulo, empresa: cand.empresa, url: cand.url, razon });
      AP.marcar(cand.id, 'descartar', [razon], datosCand);
      addLog({ts:Date.now(), status:'skip', title:cand.titulo, url:cand.url, uid:cand.id, reason:AP.formatearRazonCorta(razon)});
    } else {
      conteos.gris++;
      AP.marcar(cand.id, 'gris', resultado.razones, datosCand);
      addLog({ts:Date.now(), status:'skip', title:cand.titulo, url:cand.url, uid:cand.id, reason:'En banda gris — revisar en el dashboard'});
      AP.reportarBandaGris({
        titulo: cand.titulo, url: cand.url, plataforma: 'Trabajando', empresa: cand.empresa,
        scoreLocal: resultado.score, razones: resultado.razones, detalleAviso,
      });
    }
  }

  // §2.8 (docs/revision-2026-09-16.md): ver computrabajo.js, es lo mismo acá.
  pendientes = await AP.quitarDuplicados('Trabajando', pendientes, (p, razon) => {
    conteos.descartar++;
    razonesDescartadas.push(razon);
    descartes.push({ externalId: p.id, titulo: p.titulo, empresa: p.empresa, url: null, razon });
    AP.marcar(p.id, 'descartar', [razon]);
    AP.vistos.add(p.id);
    addLog({ts:Date.now(), status:'skip', title:p.titulo, url:'', uid:p.id, reason:AP.formatearRazonCorta(razon)});
  });

  // docs/modo-solo-observar.md §3.2: ver el razonamiento completo en
  // computrabajo.js, es el mismo acá.
  const soloObservar = AP.soloObservarEfectivo();
  // docs/panel-de-revision-en-el-portal.md §9.1: con «Revisar antes de enviar»
  // y la persona mirando, las que sirven quedan propuestas, sin enviar.
  const propone = AP.proponeEnVezDeEnviar();
  {
    if (soloObservar) conteos.observado = pendientes.length;
    else if (propone) conteos.propuestas = pendientes.length;
    else conteos.postular = pendientes.length;
    AP.reportarDescartes(descartes, 'Trabajando');
    const resumen = AP.mensajeEscaneo(conteos, razonesDescartadas, soloObservar, propone);
    msg(resumen.texto, resumen.estado, resumen.accion);
  }

  const botonVerMas = [...document.querySelectorAll('#listadoOfertas button, #listadoOfertas a')]
    .find(el => /ver m[aá]s empleos/i.test(el.textContent || ''));

  if (!pendientes.length) {
    if (siguientePaginaClick(tarjetas.length, botonVerMas)) return; // el MutationObserver retoma solo cuando lleguen las tarjetas nuevas
    AP.reportarEscaneoTerminado(conteos);
    AP.cierreDePagina();
    return;
  }

  // §1.3 y docs/rafagas-y-ponerse-al-dia.md §4.1: se pregunta antes de CADA
  // oferta, no una vez por página; ver el razonamiento completo en
  // computrabajo.js, es el mismo acá.
  AP.procesando = true;
  let cortado = false;
  let intentadas = 0;
  // Las que habría postulado, para el panel (docs/primera-busqueda-guiada.md §11).
  const observadas = [];
  for (const {t, id, titulo, empresa, razones, score} of pendientes) {
    if (!AP.activo) break;
    const a = t.querySelector('h2 a') || t.querySelector('a');
    const url = a ? a.href.split('#')[0] : '';
    if (soloObservar) {
      AP.vistos.add(id);
      addLog({ts:Date.now(), status:'observado', title:titulo, url, uid:id, reason:'Habría postulado — modo solo observar'});
      observadas.push({ externalId: id, titulo, empresa, url, razon: AP.razonDeLaMarca('postular', razones), score });
      continue;
    }
    if (propone) {
      AP.vistos.add(id);
      AP.anotarPropuesta(id);
      addLog({ts:Date.now(), status:'observado', title:titulo, url, uid:id, reason:AP.RAZON_PROPUESTA});
      continue;
    }
    const verificacion = await AP.puedePostular('Trabajando');
    if (!verificacion.permitido) {
      msg(AP.motivoPuedePostular(verificacion.motivo), '#DC2626');
      cortado = true;
      break;
    }
    msg('Abriendo: ' + titulo.slice(0,35) + '…', '#D97706');
    const btn = await activar(t);
    if (btn) { intentadas++; await postular(url, id, titulo, undefined, empresa); AP.gastarRevisionPrimera(); }
    else {
      AP.vistos.add(id);
      addLog({ts:Date.now(), status:'skip', title:titulo, url, uid:id, reason:'Panel no cargó'});
    }
    await sleep(DELAY);
  }
  AP.procesando = false;
  AP.reportarObservadas(observadas, 'Trabajando');

  if (cortado) {
    // `conteos.postular` era lo que se iba a postular (lo que dijo el resumen de
    // arriba), no lo que pasó: al cortarse solo cuentan las que se llegaron a postular().
    // Sin esto la ráfaga reportaría -- y el ícono mostraría -- postulaciones que
    // nunca se enviaron. No se pagina ni se pisa el aviso rojo con el resumen.
    conteos.postular = intentadas;
    AP.reportarEscaneoTerminado(conteos);
    return;
  }

  if (siguientePaginaClick(tarjetas.length, botonVerMas)) return;
  AP.reportarEscaneoTerminado(conteos);
  // §5: el aviso final se quedaba en "Escaneo completo" sin el resumen que sí
  // muestran los otros dos portales.
  const resumenFinal = AP.mensajeEscaneo(conteos, razonesDescartadas, soloObservar, propone);
  msg(resumenFinal.texto, resumenFinal.estado, resumenFinal.accion);
  AP.cierreDePagina();
}

// ── Postular directo a UNA oferta ya aprobada en banda gris (§8.6) ──────
// Mismo patrón que computrabajo.js: la pestaña la abrió background.js
// apuntando directo a la URL de la oferta, así que alcanza con extraer
// id/título de la propia página y reutilizar postular().
async function aplicarDirecto(decisionOfertaId) {
  const id = getId(location.href) || location.pathname;
  const titulo = tituloDelPanel() || 'Oferta';
  AP.procesando = true;
  try {
    return await postular(location.href, id, titulo, decisionOfertaId);
  } finally {
    AP.procesando = false;
  }
}

// ── Seguimiento de estados en "Mis postulaciones" ───────────────
// docs/estado-real-de-postulaciones.md §5, paso 6. Verificado contra el sitio
// real el 2026-09-30, con postulaciones de verdad:
//
// En la tabla de trabajando.cl/mis-postulaciones el título enlaza a "#": la
// fila no trae el id de la oferta. La página es Nuxt y llega renderizada
// desde el servidor con sus datos en <script id="__NUXT_DATA__">, bajo la
// clave "mis-postulaciones-combinadas": cada postulación con `linkOferta`
// ("/trabajo/6131422-…", el mismo id que getId() guarda al postular) y
// `etapaCodigo`. Se lee de ahí, sin pedir nada.
//
// Límite: ese bloque trae las 20 más recientes; el resto la página lo pide
// al hacer scroll a api.trabajando.com con la sesión de la persona. Son las
// recientes las que cambian de etapa, así que se empieza por ahí.
//
// Los códigos salen del código de la página (el mapa de etapas de
// "Explicación de cada etapa"), no de suponerlos. AutoPostula no tiene
// "Contratado": queda FINALIZADO, que es el cierre del proceso.
const MAPA_ESTADO_TRABAJANDO = {
  'POSTULACION_ENVIADA': 'ENVIADO',
  'CV_RECIBIDO': 'ENVIADO',
  'CV_VISTO': 'VISTO',
  'CV_EN_PROCESO': 'EN_PROCESO',
  'CV_FINALISTA': 'FINALISTA',
  'CV_CONTRATADO': 'FINALIZADO',
  'CV_DESCARTADO': 'RECHAZADO',
  'PROCESO_FINALIZADO_DESACTIVADO': 'FINALIZADO',
  'PROCESO_FINALIZADO_EXPIRADO': 'FINALIZADO'
  // SIN_INFORMACION: no dice nada, no se manda.
};

function enMisPostulaciones() {
  return location.pathname.replace(/\/+$/, '') === '/mis-postulaciones';
}

// __NUXT_DATA__ es una lista plana donde los objetos guardan índices a sus
// valores. Basta con encontrar los objetos de postulación (los que tienen
// linkOferta y etapaCodigo) y leer esos dos valores, sin decodificar todo.
function postulacionesDelPayload() {
  const nodo = document.getElementById('__NUXT_DATA__');
  if (!nodo) return null;
  let datos;
  try { datos = JSON.parse(nodo.textContent); } catch (e) { return null; }
  if (!Array.isArray(datos)) return null;
  const valor = (i) => (typeof i === 'number' && i >= 0 && i < datos.length ? datos[i] : undefined);
  const vistas = new Map();
  for (const item of datos) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (!('linkOferta' in item) || !('etapaCodigo' in item)) continue;
    const link = valor(item.linkOferta);
    const etapa = valor(item.etapaCodigo);
    const id = typeof link === 'string' ? getId(link) : null;
    if (id && typeof etapa === 'string') vistas.set(id, etapa);
  }
  return [...vistas].map(([externalId, etapa]) => ({ externalId, etapa }));
}

async function escanearMisPostulaciones() {
  const filas = postulacionesDelPayload();
  if (!filas) {
    console.warn('[AP-TJ] "Mis postulaciones" sin __NUXT_DATA__: no se pudieron leer los estados');
    AP.reportarEscaneoTerminado();
    return;
  }
  msg('Revisando estados de postulaciones…', 'trabajando');
  let actualizadas = 0;
  const desconocidos = new Set();
  for (const fila of filas) {
    const estado = MAPA_ESTADO_TRABAJANDO[fila.etapa];
    if (!estado) { if (fila.etapa !== 'SIN_INFORMACION') desconocidos.add(fila.etapa); continue; }
    const resultado = await AP.actualizarEstadoPostulacion({
      platformNombre: 'Trabajando',
      externalId: fila.externalId,
      estado: estado
    });
    if (resultado && !resultado.error && !resultado.sinCambios) actualizadas++;
  }
  // Un código nuevo de Trabajando no se adivina: se deja a la vista para sumarlo al mapa.
  if (desconocidos.size) console.warn('[AP-TJ] etapas sin mapear:', [...desconocidos]);
  msg(actualizadas ? '✓ ' + actualizadas + ' estado(s) actualizado(s)' : 'Estados al día', '#16A34A');
  AP.reportarEscaneoTerminado();
}

// ── Registro en el núcleo compartido (core.js) ──────────────────
// En "Mis postulaciones" no hay tarjetas de ofertas: el escaneo de listados
// diría "Sin tarjetas" y avisaría que terminó antes que el de estados (mismo
// caso que Computrabajo y Laborum).
AP.escanear = AP.sinReentrada(function () {
  if (enMisPostulaciones()) return;
  return escanear();
});
AP.aplicarDirecto = aplicarDirecto;
// Las tarjetas del listado, para pintar la marca de cada una (core.js). La
// tarjeta es una fila (logo | texto) en el computador: la marca va dentro de la
// columna del texto, debajo del título, y no como una tercera columna que la
// angosta (verificado contra el sitio real el 2026-10-02).
AP.tarjetasDeLaPagina = function () {
  return [...document.querySelectorAll('div.result-box')].map((t, idx) => {
    const h2 = t.querySelector('h2');
    const columna = h2 && h2.parentElement && h2.parentElement !== t ? h2.parentElement : t;
    return { el: columna, id: idDeTarjeta(t, idx) };
  });
};
AP.onInit = function() {
  console.log('[AP-TJ] listo — AP.activo:', AP.activo, 'incTags:', AP.cfg && AP.cfg.incTags && AP.cfg.incTags.length, 'modoRevision:', AP.cfg && AP.cfg.modoRevision, 'IA (token):', AP.iaDisponible, 'abierta en una oferta:', CARGADA_EN_OFERTA);
  if (enMisPostulaciones()) {
    setTimeout(escanearMisPostulaciones, 1500);
  } else if (AP.activo && !CARGADA_EN_OFERTA) {
    msg('Activado — escaneando…', '#16A34A');
    setTimeout(() => AP.escanear(), 1800);
  }
};

window._apInjected = true;
})();
