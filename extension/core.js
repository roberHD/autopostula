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

// Único punto de verdad para "¿esta oferta se envía de verdad o no?"
// (docs/revision-2026-09-16.md §1.2). Combina el toggle del popup con la red
// de seguridad de la cuenta (User.postulacionHabilitada, expuesta acá como
// AP.cfg.postulacionHabilitada por /api/extension/perfil): una cuenta nueva
// postuló a 55/55 ofertas reales apenas conectó la extensión, con el toggle
// del popup en su valor por defecto -- la cuenta necesita su propio freno,
// que la persona activa desde el panel, no solo el switch local del popup.
// postulacionHabilitada llega `undefined` en extensiones viejas que todavía
// no piden este campo al backend -- ahí no se bloquea nada (`=== false`,
// nunca `!== true`), para no dejar a cuentas existentes en modo prueba por
// error de versión.
AP.soloObservarEfectivo = function () {
  return !!(AP.cfg && AP.cfg.soloObservar) || !!(AP.cfg && AP.cfg.postulacionHabilitada === false);
};

// Las pestañas que abre una ráfaga (background.js, con active:false): nadie las
// está mirando. Se marca en la propia pestaña cuando llega la orden de la
// ráfaga (AUTO_SCAN), y la marca sobrevive a las navegaciones de esa pestaña
// (Laborum va y vuelve entre el listado y los avisos): AUTO_SCAN llega una sola
// vez, en la primera carga.
const AP_CLAVE_PESTANA_RAFAGA = 'ap_pestana_de_rafaga';
AP.esPestanaDeRafaga = function () {
  try { return sessionStorage.getItem(AP_CLAVE_PESTANA_RAFAGA) === '1'; } catch (e) { return false; }
};

// "Revisar antes de enviar" (AP.cfg.modoRevision), o la primera postulación
// después de "Empezar a postular" en la tarjeta del portal
// (docs/primera-busqueda-guiada.md §11): esa se muestra antes de enviarla
// aunque la persona no tenga la revisión puesta -- ver a la IA contestar con su
// propia experiencia es lo que da confianza. Se gasta cuando termina esa
// postulación (AP.gastarRevisionPrimera, que llama cada adaptador), no al
// cerrar la primera revisión: en Computrabajo una misma postulación pide el
// visto bueno antes del clic y después muestra las respuestas.
const AP_CLAVE_REVISAR_PRIMERA = 'ap_revisar_primera';
AP.conRevision = function () {
  if (AP.cfg && AP.cfg.modoRevision) return true;
  try { return sessionStorage.getItem(AP_CLAVE_REVISAR_PRIMERA) === '1'; } catch (e) { return false; }
};
AP.gastarRevisionPrimera = function () {
  try { sessionStorage.removeItem(AP_CLAVE_REVISAR_PRIMERA); } catch (e) {}
};

// docs/panel-de-revision-en-el-portal.md §9.1 (lo decidió Roberto el
// 2026-10-08): con «Revisar antes de enviar» y la persona mirando la pestaña,
// la extensión no envía sola lo que sirve. Lo marca, lo propone en la tarjeta
// del final y espera a que la persona elija en el panel; lo elegido sale por la
// cola, y cada una se muestra antes de enviarla. En las ráfagas y en las
// pestañas de fondo, que nadie está mirando, sigue como siempre.
AP.proponeEnVezDeEnviar = function () {
  if (!(AP.cfg && AP.cfg.modoRevision) || AP.soloObservarEfectivo() || AP.esPestanaDeRafaga()) return false;
  try { return !document.hidden; } catch (e) { return false; }
};
AP.RAZON_PROPUESTA = 'Te la propuse: espera a que la elijas (Revisar antes de enviar)';

// Un conjunto de ids de esta pestaña (sessionStorage), con tope.
function apIdsDeLaPestana(clave) {
  const leer = () => { try { return JSON.parse(sessionStorage.getItem(clave) || '{}') || {}; } catch (e) { return {}; } };
  return {
    tiene: (id) => !!id && !!leer()[id],
    agregar: (ids) => {
      const todos = leer();
      for (const id of ids) if (id) { delete todos[id]; todos[id] = 1; }
      const lista = Object.keys(todos);
      if (lista.length > 300) for (const viejo of lista.slice(0, lista.length - 300)) delete todos[viejo];
      try { sessionStorage.setItem(clave, JSON.stringify(todos)); } catch (e) {}
    },
  };
}
// Las que se propusieron en esta pestaña sin enviarlas (en el panel salen con
// casilla aunque la cuenta postule), y las que la persona ya vio en una tarjeta
// del final y dejó para después («Ahora no»).
const apPropuestas = apIdsDeLaPestana('ap_propuestas');
const apPropuestasVistas = apIdsDeLaPestana('ap_propuestas_vistas');
AP.anotarPropuesta = function (id) { apPropuestas.agregar([id]); };
AP.esPropuesta = function (id) { return apPropuestas.tiene(id); };

// ── Overlay: la máquina hablando dentro del portal ────────────────
//
// Vive dentro del sitio de Computrabajo/Laborum, así que tiene dos
// trabajos: leerse como AutoPostula y NO confundirse con el portal. Por
// eso va sobre tinta (el portal es blanco) y con la marca al lado.
//
// Va en un shadow root: antes eran estilos en línea sobre el DOM del
// portal, y cualquier regla suya (un `* { font-size }`, un reset) podía
// deformarlo. Adentro del shadow, su CSS no nos llega.
let ov = null, ovRaiz = null;

const AP_ESTADOS = {
  ok:         { punto: '#5BD59B', late: true },
  trabajando: { punto: '#D6F24B', late: true },
  error:      { punto: '#FF8A9B', late: false },
  // docs/visibilidad-y-etapa2.md §A: el resumen de un escaneo necesita un
  // tercer y cuarto matiz que 'ok'/'trabajando'/'error' no cubrían -- "hay
  // banda gris pendiente" no es ni éxito ni error, y "todo se descartó" no
  // es un error tampoco, solo no hubo nada que hacer.
  pendiente:  { punto: '#C7CBCC', late: false },
  neutral:    { punto: '#8E9599', late: false },
};

// Los colores viejos se siguen aceptando: hay llamadas con hex por todo
// el archivo y no vale la pena tocarlas todas.
const AP_HEX_A_ESTADO = { '#16A34A': 'ok', '#DC2626': 'error', '#D97706': 'trabajando', '#7C3AED': 'trabajando', '#9CA3AF': 'neutral' };

let ovAccion = null;

// La tarjeta del final de la página (AP.cierreDePagina): mismo lenguaje que el
// aviso, más ancha, con dos botones.
const AP_ESTILO_CIERRE =
  '.pila{display:flex;flex-direction:column;align-items:flex-end;gap:8px}' +
  '.cierre{box-sizing:border-box;width:356px;max-width:calc(100vw - 32px);padding:14px 16px 16px;border-radius:12px;' +
    'background:#16181A;color:#E9EBEA;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;line-height:1.5;' +
    'box-shadow:0 12px 30px -10px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.1);animation:entra .28s cubic-bezier(.2,.8,.3,1)}' +
  '.cierre[hidden]{display:none}' +
  '.cierre .quien{display:flex;align-items:center;gap:7px;font-size:11px;color:#8E9599;margin-bottom:8px}' +
  '.cierre .marca{width:18px;height:18px;border-radius:5px;border-width:1px}' +
  '.cierre .marca svg{width:11px;height:11px}' +
  '.cierre p{margin:0}' +
  '.cierre .principal{font-size:14px;font-weight:600;line-height:1.45}' +
  '.cierre .razon,.cierre .sesion{margin-top:6px;color:#C9CDCF;font-size:12.5px}' +
  '.cierre .razon:empty,.cierre .sesion:empty{display:none}' +
  '.cierre .botones{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}' +
  '.cierre .botones[hidden]{display:none}' +
  '.cierre button{all:unset;box-sizing:border-box;cursor:pointer;border-radius:8px;font-size:13px;line-height:1.2;padding:8px 13px;transition:filter .15s,background .15s,color .15s}' +
  '.cierre .si{background:#D6F24B;color:#16181A;font-weight:700}' +
  '.cierre .si:hover{filter:brightness(1.07)}' +
  '.cierre .si[disabled]{cursor:default;opacity:.6}' +
  '.cierre .no{color:#C9CDCF;border:1px solid #3C4145}' +
  '.cierre .no:hover{background:#26292D;color:#E9EBEA}' +
  '.cierre button:focus-visible{outline:2px solid #E9EBEA;outline-offset:2px}' +
  '.cierre .resultado{margin-top:10px;font-size:12.5px;line-height:1.45}' +
  '.cierre .resultado:empty{display:none}' +
  '.cierre .resultado.ok{color:#5BD59B}' +
  '.cierre .resultado.error{color:#FF8A9B}' +
  '.cierre .ver-todas{display:inline-block;margin-top:12px;padding:0;border-radius:0;color:#D6F24B;font-size:12.5px;font-weight:600}' +
  '.cierre .ver-todas:hover{text-decoration:underline}' +
  '.cierre .ver-todas[hidden]{display:none}';

// El panel de revisión (docs/panel-de-revision-en-el-portal.md §2): la tarjeta
// del final, abierta. Mismo lenguaje, más alto, con la lista entera.
const AP_ESTILO_PANEL =
  '.pila.con-panel>.chip,.pila.con-panel>.cierre{display:none}' +
  '.panel{box-sizing:border-box;width:420px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;' +
    'border-radius:12px;background:#16181A;color:#E9EBEA;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;line-height:1.5;' +
    'box-shadow:0 12px 30px -10px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.1);animation:entra .28s cubic-bezier(.2,.8,.3,1)}' +
  '.panel[hidden]{display:none}' +
  '.panel p{margin:0}' +
  '.panel .cabeza{position:relative;padding:14px 48px 12px 16px;border-bottom:1px solid #2A2E31}' +
  '.panel .quien{display:flex;align-items:center;gap:7px;font-size:11px;color:#8E9599;margin-bottom:6px}' +
  '.panel .marca{width:18px;height:18px;border-radius:5px;border-width:1px}' +
  '.panel .marca svg{width:11px;height:11px}' +
  '.panel .titulo{font-size:14px;font-weight:600;line-height:1.4}' +
  '.panel .ayuda{margin-top:4px;color:#C9CDCF;font-size:12.5px}' +
  '.panel .ayuda:empty{display:none}' +
  '.panel .cerrar{all:unset;box-sizing:border-box;position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:7px;' +
    'display:grid;place-items:center;cursor:pointer;color:#8E9599;transition:background .15s,color .15s}' +
  '.panel .cerrar:hover{background:#26292D;color:#E9EBEA}' +
  '.panel .cerrar svg{width:14px;height:14px;display:block}' +
  '.panel .cerrar path{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}' +
  '.panel .lista{flex:1;min-height:0;overflow-y:auto;padding:4px 8px 10px;scrollbar-width:thin;scrollbar-color:#3C4145 transparent}' +
  '.panel .grupo{margin-top:10px}' +
  '.panel .grupo-cabeza{display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8E9599}' +
  '.panel .grupo-cabeza .punto{width:7px;height:7px}' +
  '.panel .grupo-cabeza.postular .punto{background:#5BD59B}' +
  '.panel .grupo-cabeza.gris .punto{background:#F3D27A}' +
  '.panel .grupo-cabeza.descartar .punto{background:#8E9599}' +
  '.panel .ver{all:unset;cursor:pointer;margin-left:auto;font-size:11.5px;font-weight:600;letter-spacing:0;text-transform:none;color:#D6F24B}' +
  '.panel .ver:hover{text-decoration:underline}' +
  '.panel ul{list-style:none;margin:0;padding:0}' +
  '.panel .item{display:flex;align-items:flex-start;gap:10px;padding:8px;border-radius:8px;cursor:pointer}' +
  '.panel .item:hover{background:#1F2225}' +
  '.panel .item input{flex:none;width:16px;height:16px;margin:2px 0 0;accent-color:#D6F24B;cursor:pointer}' +
  '.panel .item.fija{cursor:default}' +
  '.panel .item.fija:hover{background:transparent}' +
  '.panel .item.fija .txt{opacity:.72}' +
  '.panel .item.fija input{cursor:default}' +
  '.panel .txt{flex:1;min-width:0}' +
  '.panel .t{display:block;font-weight:600;line-height:1.35;overflow-wrap:anywhere}' +
  '.panel .m{display:block;margin-top:1px;color:#8E9599;font-size:11.5px}' +
  '.panel .r{display:block;margin-top:2px;color:#C9CDCF;font-size:12px}' +
  '.panel .m:empty,.panel .r:empty{display:none}' +
  '.panel .estado{flex:none;margin-top:1px;padding:2px 8px;border-radius:999px;background:#26292D;color:#C9CDCF;font-size:11px;font-weight:600;white-space:nowrap}' +
  '.panel .estado:empty{display:none}' +
  '.panel .estado.ok{background:#173726;color:#5BD59B}' +
  '.panel .estado.error{background:#3A1E23;color:#FF8A9B}' +
  '.panel .estado.activo{background:#33300F;color:#D6F24B}' +
  '.panel .mas{all:unset;box-sizing:border-box;cursor:pointer;display:block;margin:2px 8px 0;padding:6px 0;font-size:12px;font-weight:600;color:#D6F24B}' +
  '.panel .mas:hover{text-decoration:underline}' +
  '.panel .pie{padding:12px 16px 14px;border-top:1px solid #2A2E31}' +
  '.panel .cupo{margin-bottom:10px;color:#F3D27A;font-size:12.5px}' +
  '.panel .cupo:empty{display:none}' +
  '.panel .fila-pie{display:flex;align-items:center;justify-content:space-between;gap:12px}' +
  '.panel .cuenta{color:#C9CDCF;font-size:12.5px}' +
  '.panel .si{all:unset;box-sizing:border-box;flex:none;cursor:pointer;border-radius:8px;padding:8px 13px;background:#D6F24B;color:#16181A;' +
    'font-size:13px;font-weight:700;line-height:1.2;transition:filter .15s,opacity .15s}' +
  '.panel .si:hover{filter:brightness(1.07)}' +
  '.panel .si[disabled]{cursor:default;opacity:.5;filter:none}' +
  '.panel .si[hidden]{display:none}' +
  '.panel button:focus-visible,.panel input:focus-visible{outline:2px solid #E9EBEA;outline-offset:2px}' +
  '.panel .resultado{margin-top:10px;font-size:12.5px;line-height:1.45}' +
  '.panel .resultado:empty{display:none}' +
  '.panel .resultado.error{color:#FF8A9B}';

const AP_HTML_PANEL =
  '<div class="panel" id="ap-ov-panel" hidden role="dialog" aria-labelledby="ap-ov-panel-t">' +
    '<div class="cabeza">' +
      '<span class="quien"><span class="marca"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg></span><span id="ap-ov-panel-quien"></span></span>' +
      '<p class="titulo" id="ap-ov-panel-t"></p>' +
      '<p class="ayuda" id="ap-ov-panel-ayuda"></p>' +
      '<button class="cerrar" id="ap-ov-panel-cerrar" type="button"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '</div>' +
    '<div class="lista" id="ap-ov-panel-lista"></div>' +
    '<div class="pie">' +
      '<p class="cupo" id="ap-ov-panel-cupo"></p>' +
      '<div class="fila-pie">' +
        '<p class="cuenta" id="ap-ov-panel-cuenta" role="status"></p>' +
        '<button class="si" id="ap-ov-panel-si" type="button"></button>' +
      '</div>' +
      '<p class="resultado" id="ap-ov-panel-resultado" role="alert"></p>' +
    '</div>' +
  '</div>';

const AP_HTML_CIERRE =
  '<div class="cierre" id="ap-ov-cierre" hidden role="dialog" aria-labelledby="ap-ov-cierre-t">' +
    '<span class="quien"><span class="marca"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg></span>AutoPostula · todavía no envió nada</span>' +
    '<p class="principal" id="ap-ov-cierre-t"></p>' +
    '<p class="razon" id="ap-ov-cierre-razon"></p>' +
    '<p class="sesion" id="ap-ov-cierre-sesion"></p>' +
    '<div class="botones" id="ap-ov-cierre-botones">' +
      '<button class="si" id="ap-ov-cierre-si" type="button"></button>' +
      '<button class="no" id="ap-ov-cierre-no" type="button">Todavía no, quiero mirar</button>' +
    '</div>' +
    '<button class="ver-todas" id="ap-ov-cierre-ver" type="button" hidden></button>' +
    '<p class="resultado" id="ap-ov-cierre-resultado" role="status"></p>' +
  '</div>';

function apAsegurarOverlay() {
  if (ov) return;
  ov = document.createElement('div');
  ov.id = 'ap-ov';
  // Reset propio: que el portal no nos empuje ni nos herede nada.
  ov.style.cssText = 'all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647';
  ovRaiz = ov.attachShadow({ mode: 'open' });
  ovRaiz.innerHTML =
    '<style>' +
    ':host,*{box-sizing:border-box}' +
    '.chip{display:flex;align-items:center;gap:10px;min-width:216px;max-width:320px;' +
      'padding:10px 14px 10px 11px;border-radius:12px;background:#16181A;color:#E9EBEA;' +
      'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12.5px;line-height:1.4;' +
      'box-shadow:0 12px 30px -10px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.1);' +
      'animation:entra .28s cubic-bezier(.2,.8,.3,1)}' +
    '@keyframes entra{from{opacity:0;transform:translateY(8px)}}' +
    '.marca{width:26px;height:26px;flex:none;border-radius:7px;background:#26292D;border:1.5px solid #3C4145;display:grid;place-items:center}' +
    '.marca svg{width:15px;height:15px;display:block}' +
    '.marca path{fill:none;stroke:#D6F24B;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.cuerpo{min-width:0;flex:1}' +
    '.quien{display:flex;align-items:center;gap:6px;font-size:10.5px;color:#8E9599;margin-bottom:1px}' +
    '.punto{width:6px;height:6px;border-radius:50%;flex:none}' +
    '.punto.late{animation:late 1.6s ease-out infinite}' +
    '@keyframes late{0%{box-shadow:0 0 0 0 currentColor}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}' +
    '.texto{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    // Un resumen largo ("15 descartadas — la mayoría: …") quedaba cortado
    // con "…" sin forma de leerlo. El botón solo aparece cuando el texto no
    // cabe; abierto, el aviso crece hacia arriba y a la izquierda (está
    // anclado abajo a la derecha) y el texto pasa a varias líneas.
    '.chip{overflow:hidden}' +
    '.chip.abierto{align-items:flex-start;width:400px;max-width:calc(100vw - 32px);min-height:104px;padding:14px 14px 16px 14px;gap:12px}' +
    '.chip.abierto .quien{margin-bottom:6px}' +
    '.chip.abierto .texto{white-space:normal;overflow:visible;font-size:13.5px;line-height:1.55;font-weight:500;overflow-wrap:anywhere}' +
    '.ampliar{all:unset;box-sizing:border-box;flex:none;width:26px;height:26px;margin-left:2px;border-radius:7px;display:grid;place-items:center;cursor:pointer;color:#8E9599;transition:background .15s,color .15s}' +
    '.ampliar:hover{background:#26292D;color:#E9EBEA}' +
    '.ampliar:focus-visible{outline:2px solid #D6F24B;outline-offset:1px}' +
    '.ampliar[hidden]{display:none}' +
    '.ampliar svg{width:14px;height:14px;display:block;transition:transform .3s cubic-bezier(.2,.8,.3,1)}' +
    '.ampliar path{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}' +
    '.chip.abierto .ampliar svg{transform:rotate(180deg)}' +
    // "Agregar a mi perfil": solo con el aviso abierto y cuando el resumen
    // trae algo que se puede sumar a la búsqueda (AP.accionDeRazon).
    '.accion{display:none;margin-top:12px}' +
    '.chip.abierto .accion.hay{display:flex;flex-direction:column;align-items:flex-start;gap:6px}' +
    '.agregar{all:unset;box-sizing:border-box;cursor:pointer;padding:7px 12px;border-radius:8px;background:#D6F24B;color:#16181A;font-size:12.5px;font-weight:700;line-height:1.2;transition:filter .15s,opacity .15s}' +
    '.agregar:hover{filter:brightness(1.07)}' +
    '.agregar:focus-visible{outline:2px solid #E9EBEA;outline-offset:2px}' +
    '.agregar[disabled]{cursor:default;opacity:.6}' +
    '.agregar[hidden]{display:none}' +
    '.resultado{font-size:12px;line-height:1.45;color:#C9CDCF}' +
    '.resultado.ok{color:#5BD59B}' +
    '.resultado.error{color:#FF8A9B}' +
    '.resultado:empty{display:none}' +
    AP_ESTILO_CIERRE + AP_ESTILO_PANEL +
    '@media (prefers-reduced-motion:reduce){.chip,.cierre,.panel,.punto.late{animation:none}.ampliar svg{transition:none}}' +
    '</style>' +
    // La tarjeta del final va arriba del aviso de siempre (ver AP.cierreDePagina),
    // y el panel de revisión, en el lugar de los dos mientras está abierto.
    '<div class="pila">' + AP_HTML_PANEL + AP_HTML_CIERRE +
    '<div class="chip" id="ap-ov-chip">' +
      '<span class="marca"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg></span>' +
      '<span class="cuerpo">' +
        '<span class="quien"><i class="punto" id="ap-ov-punto"></i>AutoPostula</span>' +
        '<span class="texto" id="ap-ov-texto"></span>' +
        '<span class="accion" id="ap-ov-accion">' +
          '<button class="agregar" id="ap-ov-agregar" type="button"></button>' +
          '<span class="resultado" id="ap-ov-resultado" role="status"></span>' +
        '</span>' +
      '</span>' +
      '<button class="ampliar" id="ap-ov-ampliar" type="button" hidden aria-expanded="false" aria-label="Ver el mensaje completo" title="Ver el mensaje completo">' +
        '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>' +
      '</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ovRaiz.getElementById('ap-ov-ampliar').addEventListener('click', alternarOverlayAbierto);
  ovRaiz.getElementById('ap-ov-agregar').addEventListener('click', ejecutarAccionOverlay);
  ovRaiz.getElementById('ap-ov-panel-cerrar').addEventListener('click', apCerrarPanel);
  ovRaiz.getElementById('ap-ov-panel-si').addEventListener('click', apAccionPanel);
  ovRaiz.getElementById('ap-ov-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') apCerrarPanel();
  });
}

AP.msg = function (texto, estado, accion) {
  const clave = AP_ESTADOS[estado] ? estado : (AP_HEX_A_ESTADO[estado] || 'ok');
  const cfg = AP_ESTADOS[clave];

  apAsegurarOverlay();

  const punto = ovRaiz.getElementById('ap-ov-punto');
  punto.style.color = cfg.punto;
  punto.style.background = cfg.punto;
  punto.className = 'punto' + (cfg.late ? ' late' : '');

  const nodo = ovRaiz.getElementById('ap-ov-texto');
  nodo.textContent = texto;
  nodo.title = texto;

  // Cada mensaje trae (o no) su propia acción: "Revisando…" después de un
  // resumen no debe dejar colgado el botón del resumen anterior.
  ovAccion = accion && accion.tipo === 'agregar_comuna' && accion.comuna ? accion : null;
  const cajaAccion = ovRaiz.getElementById('ap-ov-accion');
  const agregar = ovRaiz.getElementById('ap-ov-agregar');
  cajaAccion.classList.toggle('hay', !!ovAccion);
  agregar.hidden = false;
  agregar.disabled = false;
  agregar.textContent = ovAccion ? 'Agregar ' + nombreComuna(ovAccion.comuna) + ' a mi perfil' : '';
  ovRaiz.getElementById('ap-ov-resultado').textContent = '';
  ovRaiz.getElementById('ap-ov-resultado').className = 'resultado';
  actualizarBotonAmpliar();
};

// Las comunas del scorer vienen normalizadas ("estacion central"): para el
// botón alcanza con mayúscula inicial; el nombre con tildes lo devuelve el
// servidor al confirmar.
const AP_PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y']);
function nombreComuna(c) {
  return String(c).split(' ')
    .map((p, i) => (i > 0 && AP_PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

function ejecutarAccionOverlay() {
  if (!ovAccion || !ovRaiz) return;
  const accion = ovAccion;
  const agregar = ovRaiz.getElementById('ap-ov-agregar');
  const resultado = ovRaiz.getElementById('ap-ov-resultado');
  agregar.disabled = true;
  agregar.textContent = 'Agregando…';
  resultado.textContent = '';
  resultado.className = 'resultado';
  const terminar = (r) => {
    if (!ovRaiz || ovAccion !== accion) return; // llegó otro mensaje mientras tanto
    if (r && r.ok) {
      agregar.hidden = true;
      resultado.className = 'resultado ok';
      resultado.textContent = '✓ ' + (r.comuna || nombreComuna(accion.comuna)) +
        (r.yaEstaba ? ' ya estaba en tu búsqueda.' : ' quedó en tu búsqueda. Desde la próxima búsqueda, sus ofertas ya no se descartan por la comuna.');
      if (r.config) { AP.cfg = r.config; }
    } else {
      agregar.disabled = false;
      agregar.textContent = 'Agregar ' + nombreComuna(accion.comuna) + ' a mi perfil';
      resultado.className = 'resultado error';
      resultado.textContent = (r && r.error) || 'No se pudo agregar. Puedes hacerlo en Filtros, en el panel.';
    }
  };
  try {
    chrome.runtime.sendMessage({ type: 'AGREGAR_COMUNA', comuna: accion.comuna }, (r) => {
      void chrome.runtime.lastError;
      terminar(r);
    });
  } catch (e) {
    terminar(null);
  }
}

// El botón se muestra si el texto, en el aviso cerrado, no cabe. Abierto se
// queda visible para poder cerrarlo; si el texto nuevo ya cabe, se cierra solo.
function actualizarBotonAmpliar() {
  const chip = ovRaiz.getElementById('ap-ov-chip');
  const boton = ovRaiz.getElementById('ap-ov-ampliar');
  const nodo = ovRaiz.getElementById('ap-ov-texto');
  const abierto = chip.classList.contains('abierto');
  if (abierto) chip.classList.remove('abierto');
  boton.hidden = false; // el botón ocupa lugar: se mide con él puesto
  // Con una acción para ofrecer también hay que poder abrirlo, aunque el texto quepa.
  const noCabe = nodo.scrollWidth > nodo.clientWidth + 1 || !!ovAccion;
  if (abierto && noCabe) chip.classList.add('abierto');
  boton.hidden = !noCabe;
  boton.setAttribute('aria-expanded', abierto && noCabe ? 'true' : 'false');
  boton.setAttribute('aria-label', abierto && noCabe ? 'Achicar el mensaje' : 'Ver el mensaje completo');
  boton.title = boton.getAttribute('aria-label');
}

// Crece de su tamaño actual al nuevo (y al revés) midiendo antes y después:
// width/height "auto" no se pueden animar con CSS.
function alternarOverlayAbierto() {
  const chip = ovRaiz.getElementById('ap-ov-chip');
  const boton = ovRaiz.getElementById('ap-ov-ampliar');
  const antes = chip.getBoundingClientRect();
  const abrir = !chip.classList.contains('abierto');
  chip.classList.toggle('abierto', abrir);
  boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  boton.setAttribute('aria-label', abrir ? 'Achicar el mensaje' : 'Ver el mensaje completo');
  boton.title = boton.getAttribute('aria-label');
  const despues = chip.getBoundingClientRect();
  if (!chip.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  chip.animate(
    [{ width: antes.width + 'px', height: antes.height + 'px' }, { width: despues.width + 'px', height: despues.height + 'px' }],
    { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' }
  );
  ovRaiz.getElementById('ap-ov-texto').animate(
    [{ opacity: 0.35 }, { opacity: 1 }],
    { duration: 260, delay: 60, easing: 'ease-out', fill: 'backwards' }
  );
}

AP.limpiarOverlay = function () { if (ov) { ov.remove(); ov = null; ovRaiz = null; } };

// ── La tarjeta del final de la página (docs/primera-busqueda-guiada.md §3.3 y §11) ──
//
// En modo "solo mirar", cuando la extensión termina de revisar las ofertas de la
// página que la persona está mirando, el aviso deja de ser una línea: dice qué
// haría con ellas, con dos botones, "Empezar a postular" y "Todavía no, quiero
// mirar". Es el único lugar donde la persona da permiso mirando el resultado
// concreto. No sale en las pestañas de las ráfagas (nadie las mira) ni otra vez
// en esta pestaña después de que la persona contestó.
const AP_CLAVE_CIERRE_LISTO = 'ap_cierre_listo';
let apCierreEstado = null; // null | 'inicial' | 'activando' | 'listo'

function apUnir(partes) {
  return partes.length < 2 ? (partes[0] || '') : partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
}
function apMinuscula(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

// Lo que dice la tarjeta, con las cifras de las marcas de esta página
// (AP.resumenDeMarcas): { total, postular, gris, descartar, razonTop }.
// `propone`: la cuenta postula con «Revisar antes de enviar» y no se envió nada.
AP.textoCierre = function (c, propone) {
  const razon = c.descartar && c.razonTop
    ? (c.descartar === 1 ? 'Por qué se descarta: ' : 'La razón más repetida para descartar: ') + apMinuscula(AP.razonComoEnElPanel(c.razonTop)) + '.'
    : '';
  if (propone) {
    // Habla solo de lo que espera a la persona: lo dudoso ya quedó en "Por
    // decidir", y lo que dejó para después en otra tarjeta no se vuelve a contar.
    return {
      principal: c.postular === 1
        ? 'En esta página hay una oferta que te sirve. No la envío hasta que me digas.'
        : 'En esta página hay ' + c.postular + ' ofertas que te sirven. No envío ninguna hasta que me digas.',
      razon: c.gris ? (c.gris === 1 ? 'La dudosa la dejé en «Por decidir».' : 'Las ' + c.gris + ' dudosas las dejé en «Por decidir».') : '',
      boton: c.postular === 1 ? 'Verla y decidir' : 'Elegir a cuáles postular',
      listo: '',
    };
  }
  const resto = [];
  if (c.gris) resto.push('te dejaría ' + c.gris + ' para que decidas');
  if (c.descartar) resto.push('descartaría ' + c.descartar);
  let principal;
  if (c.total === 1) {
    principal = c.postular ? 'En esta página hay una sola oferta, y te sirve: postularía a esa.'
      : c.gris ? 'En esta página hay una sola oferta, y queda para que decidas.'
      : 'En esta página hay una sola oferta, y no calza.';
  } else if (c.postular) {
    principal = 'De las ' + c.total + ' ofertas de esta página: ' + apUnir(['postularía a ' + c.postular].concat(resto)) + '.';
  } else {
    principal = 'De las ' + c.total + ' ofertas de esta página no postularía a ninguna' + (resto.length ? ': ' + apUnir(resto) : '') + '.';
  }
  const listo = c.postular === 1
    ? 'Listo: empieza por la que te sirve. Te la muestra antes de enviarla.'
    : c.postular
      ? 'Listo: empieza por las ' + c.postular + ' que te sirven. La primera te la muestra antes de enviarla.'
      : 'Listo: desde ahora postula a las que calcen contigo.';
  return { principal: principal, razon: razon, boton: c.postular ? 'Empezar a postular' : 'Activar la postulación', listo: listo };
};

// Cuenta las marcas de las ofertas que hay en esta página (una vez cada una).
// `cuentaLaQueSirve(id)`, si viene, deja fuera las que sirven que ya no esperan
// a la persona (con «Revisar antes de enviar»: las elegidas o dejadas para después).
AP.resumenDeMarcas = function (ids, marcas, cuentaLaQueSirve) {
  const c = { total: 0, postular: 0, gris: 0, descartar: 0, razonTop: null };
  const razones = [];
  const contadas = new Set();
  for (const id of ids) {
    if (contadas.has(id)) continue;
    contadas.add(id);
    const m = marcas[id];
    if (!m || (m.b !== 'postular' && m.b !== 'gris' && m.b !== 'descartar')) continue;
    if (m.b === 'postular' && cuentaLaQueSirve && !cuentaLaQueSirve(id)) continue;
    c.total++;
    c[m.b]++;
    if (m.b === 'descartar' && m.r) razones.push(m.r);
  }
  if (razones.length) c.razonTop = AP.razonPrincipal(razones);
  return c;
};

// Lo llama cada adaptador cuando termina de revisar una página del listado. En
// "solo mirar" pregunta si empieza a postular; con «Revisar antes de enviar»
// (AP.proponeEnVezDeEnviar), propone lo que sirve y lleva al panel.
AP.cierreDePagina = function () {
  if (AP.esPestanaDeRafaga() || typeof AP.tarjetasDeLaPagina !== 'function') return false;
  apRecorridoNoAplica();
  const propone = AP.proponeEnVezDeEnviar();
  if (!AP.soloObservarEfectivo() && !propone) return false;
  if (apCierreEstado === 'activando') return false;
  const ids = AP.tarjetasDeLaPagina().map(t => t.id);
  if (propone) {
    // Sale mientras quede algo propuesto que la persona no eligió ni dejó para
    // después: también en la página siguiente, o con las que trae "ver más".
    const resumen = AP.resumenDeMarcas(ids, apLeerMarcas(), (id) => AP.esPropuesta(id) && !AP.decididaEnPanel(id) && !apPropuestasVistas.tiene(id));
    if (!resumen.postular) return false;
    apMostrarCierre(resumen, true);
    return true;
  }
  try { if (sessionStorage.getItem(AP_CLAVE_CIERRE_LISTO)) return false; } catch (e) { return false; }
  if (apCierreEstado === 'listo') return false;
  const resumen = AP.resumenDeMarcas(ids, apLeerMarcas());
  if (!resumen.total) return false;
  // La primera vez, el recorrido la muestra cuando le toca (su paso 3).
  if (apRecorridoRetieneCierre(resumen)) return true;
  apMostrarCierre(resumen, false);
  return true;
};

function apResultadoCierre(texto, clase) {
  if (!ovRaiz) return;
  const r = ovRaiz.getElementById('ap-ov-cierre-resultado');
  r.textContent = texto;
  r.className = 'resultado' + (clase ? ' ' + clase : '');
}

function apMostrarCierre(resumen, propone) {
  apAsegurarOverlay();
  const texto = AP.textoCierre(resumen, propone);
  ovRaiz.getElementById('ap-ov-cierre-t').textContent = texto.principal;
  ovRaiz.getElementById('ap-ov-cierre-razon').textContent = texto.razon;
  // §4 y §3.5: sin sesión en el portal no puede postular. Se dice acá, donde se
  // le pide permiso, y el botón lleva a iniciarla.
  const portal = AP.portalDelHost(location.hostname) || 'el portal';
  const sinSesion = AP.mirarSesion(document, portal) === false;
  ovRaiz.getElementById('ap-ov-cierre-sesion').textContent = sinSesion ? 'Para postular necesitas tu sesión iniciada en ' + portal + '.' : '';
  const si = ovRaiz.getElementById('ap-ov-cierre-si');
  si.disabled = false;
  si.textContent = sinSesion ? 'Iniciar sesión en ' + portal : texto.boton;
  si.onclick = sinSesion ? apIrAIniciarSesion : propone ? () => AP.abrirPanel() : () => apEmpezarAPostular(resumen);
  const no = ovRaiz.getElementById('ap-ov-cierre-no');
  no.textContent = propone ? 'Ahora no' : 'Todavía no, quiero mirar';
  no.onclick = propone ? apAhoraNo : apTodaviaNo;
  // docs/panel-de-revision-en-el-portal.md §2.1: la lista entera, para elegir.
  // Con «Revisar antes de enviar» eso ya es el botón principal.
  const ver = ovRaiz.getElementById('ap-ov-cierre-ver');
  ver.hidden = sinSesion || !!propone;
  ver.textContent = resumen.total === 1 ? 'Verla y elegir' : 'Ver las ' + resumen.total + ' y elegir';
  ver.onclick = () => AP.abrirPanel();
  ovRaiz.getElementById('ap-ov-cierre-botones').hidden = false;
  apResultadoCierre('', '');
  ovRaiz.getElementById('ap-ov-cierre').hidden = false;
  apCierreEstado = 'inicial';
}

// La página para entrar al propio portal (SESION_POR_PORTAL), aunque esté en
// otro subdominio. Antes se seguía el enlace de la página, y en Computrabajo el
// botón para entrar no es un enlace: nunca se sigue uno de la página.
function apIrAIniciarSesion() {
  const destino = AP.ingresoDelPortal(AP.portalDelHost(location.hostname));
  if (destino) {
    location.href = destino;
    return;
  }
  apResultadoCierre('Inicia sesión en el portal y vuelve a esta página.', 'error');
}

// ── El panel de revisión (docs/panel-de-revision-en-el-portal.md §2) ──────
// La tarjeta del final, abierta: todo lo que se revisó en esta página,
// agrupado por lo que decidió el motor, con una casilla por oferta. Lo de "te
// sirve" viene marcado y lo demás no: marcar o desmarcar es la corrección
// (§3.1). Lo marcado se postula por la cola de aprobadas de background.js
// (POSTULAR_ELEGIDAS): de a una, en otra pestaña y revisando el cupo antes de
// cada una, mientras el listado y el panel se quedan donde están, con el
// avance. Cerrar sin apretar no envía ni registra nada (§2.2).
//
// Con la cuenta postulando, lo que servía ya lo envió el escaneo: esas salen
// con lo que pasó, sin casilla, y se puede sumar lo demás.

// Mismo dominio que manifest.json (host_permissions).
const AP_PANEL_WEB = 'https://autopostula.cl';
// §4: de a 20 por grupo, con "ver más". Un panel de 60 casillas no lo lee nadie.
const AP_POR_GRUPO = 20;
// Si la cola deja de contar (el service worker se reinició), el panel no se
// queda para siempre en "Enviando…": lo aprobado se reintenta más tarde.
const AP_VIGIA_PANEL_MS = 4 * 60 * 1000;
const AP_GRUPOS_PANEL = [
  { banda: 'postular', nombre: 'Te sirven' },
  { banda: 'gris', nombre: 'Para que decidas' },
  { banda: 'descartar', nombre: 'No calzan' },
];
// Lo que cuenta la cola de cada una (background.js, avisarPanel).
const AP_ESTADOS_COLA = {
  encolada: { clase: '', texto: 'En cola' },
  enviando: { clase: 'activo', texto: 'Enviando…' },
  enviada: { clase: 'ok', texto: 'Enviada' },
  no_enviada: { clase: 'error', texto: 'No se pudo' },
  expirada: { clase: 'error', texto: 'Ya no está disponible' },
  sin_cupo: { clase: 'error', texto: 'Sin cupo' },
  sin_enlace: { clase: 'error', texto: 'Sin enlace' },
  sigue: { clase: '', texto: 'Sigue en cola' },
};
const AP_COLA_PENDIENTE = new Set(['encolada', 'enviando']);
let apPanel = null;
let apVigiaPanel = null;

// Lo que se decidió en el panel, en esta pestaña: si la página se vuelve a
// revisar (al recargar, o al volver al listado), el escaneo no postula por su
// cuenta lo que la persona quitó ni repite lo que ya va por la cola.
const AP_CLAVE_DECIDIDAS = 'ap_decididas_panel';
function apLeerDecididas() {
  try { return JSON.parse(sessionStorage.getItem(AP_CLAVE_DECIDIDAS) || '{}') || {}; } catch (e) { return {}; }
}
AP.decididaEnPanel = function (id) { return !!id && !!apLeerDecididas()[id]; };
function apGuardarDecididas(ofertas) {
  const decididas = apLeerDecididas();
  for (const o of ofertas) if (o.banda === 'postular' || o.elegida) decididas[o.externalId] = o.elegida ? 'si' : 'no';
  try { sessionStorage.setItem(AP_CLAVE_DECIDIDAS, JSON.stringify(decididas)); } catch (e) {}
}

// Las ofertas que se revisaron en esta página, en el orden del panel (te
// sirven, para que decidas, no calzan; dentro de cada grupo, el del listado),
// con lo que decidió el motor y lo que se guardó de cada una (AP.marcar). Si
// la banda cambió después (una que resultó repetida), vale la razón de la
// marca. Es también el orden en que se envían: si el cupo no alcanza, "las
// primeras" son las de arriba del panel.
AP.ofertasDelPanel = function () {
  if (typeof AP.tarjetasDeLaPagina !== 'function') return [];
  const marcas = apLeerMarcas();
  const datos = apLeerOfertas();
  const vistas = new Set();
  const lista = [];
  for (const { id } of AP.tarjetasDeLaPagina()) {
    const m = id && marcas[id];
    if (!m || vistas.has(id)) continue;
    vistas.add(id);
    const d = datos[id] || {};
    const razones = d.b === m.b && Array.isArray(d.rz) && d.rz.length ? d.rz : (m.r ? [m.r] : []);
    lista.push({
      id, banda: m.b, razon: m.r || null, razones,
      titulo: d.t || '', empresa: d.e || null, ubicacion: d.l || null, url: d.u || null,
      score: typeof d.s === 'number' ? d.s : null,
      repetida: razones.some(r => r && r.tipo === 'duplicado'),
    });
  }
  const orden = (o) => AP_GRUPOS_PANEL.findIndex(g => g.banda === o.banda);
  return lista.map((o, i) => [o, i]).sort((a, b) => orden(a[0]) - orden(b[0]) || a[1] - b[1]).map(par => par[0]);
};

// Por qué una oferta va sin casilla, o null si se puede marcar. Con la cuenta
// postulando, lo que servía ya lo envió el escaneo, salvo que haya quedado
// propuesto («Revisar antes de enviar», AP.esPropuesta).
function apPorQueFija(o, observando) {
  if (o.banda === 'postular' && !observando && !AP.esPropuesta(o.id)) return 'ya_la_vio_el_escaneo';
  if (o.repetida) return 'repetida';
  if (!o.url || !o.titulo) return 'sin_enlace';
  return null;
}

// El pie del panel: cuántas, el botón y, si el cupo no alcanza, qué hacer
// (§2.3: nunca se envía de más ni se corta a la mitad en silencio). `cupo` es
// lo que devuelve AP.puedePostular, o null si no se sabe (se deja postular: la
// cola lo revisa igual antes de cada una).
AP.textoPiePanel = function (n, cupo, portal, sinSesion) {
  const nombre = portal || 'este portal';
  if (sinSesion) {
    return { cuenta: '', cupo: 'Para postular necesitas tu sesión iniciada en ' + nombre + '.', boton: 'Iniciar sesión en ' + nombre, accion: 'sesion', enviar: 0 };
  }
  if (cupo && cupo.permitido === false && cupo.motivo === 'portal') {
    return { cuenta: '', cupo: 'Para postular aquí, conecta ' + nombre + ' en tu panel.', boton: 'Conectar ' + nombre, accion: 'conectar', enviar: 0 };
  }
  const limite = cupo && cupo.permitido === false ? 0 : (cupo && typeof cupo.restantes === 'number' ? Math.max(0, cupo.restantes) : null);
  if (limite === 0) {
    return { cuenta: '', cupo: 'Ya usaste las postulaciones de este mes.', boton: 'Conseguir más postulaciones', accion: 'comprar', enviar: 0 };
  }
  if (!n) return { cuenta: 'No marcaste ninguna.', cupo: '', boton: 'Postular', accion: null, enviar: 0 };
  if (limite !== null && n > limite) {
    const quedan = limite === 1 ? 'te queda 1 postulación' : 'te quedan ' + limite + ' postulaciones';
    return {
      cuenta: '',
      cupo: 'Marcaste ' + n + ' y ' + quedan + ' este mes. Saca ' + (n - limite) + ', o envío ' + (limite === 1 ? 'la primera' : 'las primeras ' + limite) + '.',
      boton: limite === 1 ? 'Postular a la primera' : 'Postular a las primeras ' + limite,
      accion: 'postular',
      enviar: limite,
    };
  }
  return {
    cuenta: n === 1 ? 'Vas a postular a una oferta.' : 'Vas a postular a ' + n + ' ofertas.',
    cupo: '',
    boton: n === 1 ? 'Postular a una' : 'Postular a las ' + n,
    accion: 'postular',
    enviar: n,
  };
};

// La cabeza del panel en cada momento: eligiendo, enviando o terminado.
// `info`: { total, observando, propone, primeraConRevision, cadaUnaConRevision }
// y el avance de la cola ({ enviando, enviadas, sinCupo, enCola, reintentos }).
AP.textoCabezaPanel = function (estado, info) {
  if (estado === 'enviando') {
    return {
      quien: 'AutoPostula',
      titulo: info.enviando === 1 ? 'Postulando a una oferta…' : 'Postulando a ' + info.enviando + ' ofertas…',
      ayuda: 'Las envío de a una, en otra pestaña. Puedes seguir mirando: el avance queda acá.' +
        (info.cadaUnaConRevision ? ' Cada una te la muestro antes de enviarla.'
          : info.primeraConRevision ? ' La primera te la muestro antes de enviarla.' : ''),
    };
  }
  if (estado === 'listo') {
    const total = info.enviando;
    let titulo;
    if (total && info.enviadas === total) titulo = total === 1 ? 'Listo: postulaste a una oferta.' : 'Listo: postulaste a ' + total + ' ofertas.';
    else if (info.enviadas) titulo = 'Postulaste a ' + info.enviadas + ' de ' + total + '.';
    else titulo = total === 1 ? 'No se pudo enviar.' : 'No se pudo enviar ninguna.';
    const notas = [];
    if (info.sinCupo) notas.push('Se acabaron las postulaciones del mes.');
    // Una que falló por otra cosa (la página no cargó, faltó un dato) sigue
    // aprobada: la cola la vuelve a intentar en el próximo ciclo, hasta 3 veces.
    if (info.reintentos) notas.push(info.reintentos === 1 ? 'La que no se pudo se vuelve a intentar sola más tarde.' : 'Las que no se pudieron se vuelven a intentar solas más tarde.');
    if (info.enCola) notas.push(info.enCola === 1 ? 'La que quedó en cola se envía sola más tarde.' : 'Las que quedaron en cola se envían solas más tarde.');
    return { quien: 'AutoPostula', titulo, ayuda: notas.join(' ') };
  }
  if (info.propone) {
    return {
      quien: 'AutoPostula · todavía no envió nada',
      titulo: info.total === 1 ? 'Revisé 1 oferta de esta página' : 'Revisé ' + info.total + ' ofertas de esta página',
      ayuda: 'Tienes «Revisar antes de enviar»: no envié ninguna. Las que te sirven vienen marcadas; quita las que no quieras y suma las que te interesen.',
    };
  }
  return {
    quien: info.observando ? 'AutoPostula · todavía no envió nada' : 'AutoPostula',
    titulo: info.total === 1 ? 'Revisé 1 oferta de esta página' : 'Revisé ' + info.total + ' ofertas de esta página',
    ayuda: info.observando
      ? 'Marca a las que quieres postular y desmarca las que no. No se envía nada hasta que aprietes el botón.'
      : 'Las que te sirven ya las envié: abajo ves cómo quedó cada una. Si quieres sumar otra, márcala.',
  };
};

function apResumenCola() {
  const r = { enviando: 0, enviadas: 0, sinCupo: 0, enCola: 0, reintentos: 0 };
  if (!apPanel) return r;
  for (const clave of apPanel.progreso.values()) {
    r.enviando++;
    if (clave === 'enviada') r.enviadas++;
    else if (clave === 'sin_cupo') r.sinCupo++;
    else if (clave === 'no_enviada') r.reintentos++;
    else if (clave === 'sigue' || AP_COLA_PENDIENTE.has(clave)) r.enCola++;
  }
  return r;
}

// Lo que dice el registro de una que el motor iba a postular, con la cuenta
// postulando: enviada, o que no se envió.
function apEstadoDelLog(id) {
  const log = AP.log || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (!e || e.uid !== id) continue;
    if (e.status === 'ok') return AP_ESTADOS_COLA.enviada;
    if (e.status === 'observado') return null;
    return { clase: 'error', texto: 'No se envió' };
  }
  return null;
}

AP.abrirPanel = function () {
  if (AP.esPestanaDeRafaga() || apCierreEstado === 'activando') return false;
  // Mientras se envía (o recién terminó), se vuelve a mostrar con su avance.
  if (apPanel && apPanel.estado !== 'eligiendo') { apMostrarPanel(); return true; }
  const ofertas = AP.ofertasDelPanel();
  if (!ofertas.length) return false;
  const observando = AP.soloObservarEfectivo();
  const portal = AP.portalDelHost(location.hostname);
  apPanel = {
    url: location.href,
    observando,
    propone: !observando && ofertas.some(o => o.banda === 'postular' && AP.esPropuesta(o.id)),
    cadaUnaConRevision: !!(AP.cfg && AP.cfg.modoRevision),
    ofertas,
    elegidas: new Set(ofertas.filter(o => o.banda === 'postular' && !apPorQueFija(o, observando)).map(o => o.id)),
    verDescartadas: false,
    verTodas: new Set(),
    estado: 'eligiendo',
    cupo: null,
    sinSesion: AP.mirarSesion(document, portal) === false,
    progreso: new Map(),
    porDecision: new Map(),
    primeraConRevision: false,
  };
  apMostrarPanel();
  if (portal) {
    const p = apPanel;
    AP.puedePostular(portal).then((cupo) => {
      if (apPanel !== p) return;
      p.cupo = cupo || null;
      apPintarPie();
    });
  }
  return true;
};

function apMostrarPanel() {
  apAsegurarOverlay();
  ovRaiz.querySelector('.pila').classList.add('con-panel');
  ovRaiz.getElementById('ap-ov-panel').hidden = false;
  apPintarPanel();
  apRecorridoEvento('panel');
}

function apCerrarPanel() {
  if (ovRaiz) {
    ovRaiz.getElementById('ap-ov-panel').hidden = true;
    ovRaiz.querySelector('.pila').classList.remove('con-panel');
  }
  apRecorridoEvento('panel_cerrado');
  // Mientras se envía, el avance sigue: se puede volver a abrir desde el ícono.
  if (apPanel && apPanel.estado === 'enviando') return;
  apPanel = null;
  clearTimeout(apVigiaPanel);
}

function apNodo(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto) n.textContent = texto;
  return n;
}

// Las marcadas que de verdad se pueden enviar, en el orden del panel.
function apElegidasDelPanel() {
  const p = apPanel;
  return p ? p.ofertas.filter(o => p.elegidas.has(o.id) && !apPorQueFija(o, p.observando)) : [];
}

function apPintarPanel() {
  const p = apPanel;
  if (!p || !ovRaiz) return;
  const cabeza = AP.textoCabezaPanel(p.estado, Object.assign({
    total: p.ofertas.length, observando: p.observando, propone: p.propone,
    primeraConRevision: p.primeraConRevision, cadaUnaConRevision: p.cadaUnaConRevision,
  }, apResumenCola()));
  ovRaiz.getElementById('ap-ov-panel-quien').textContent = cabeza.quien;
  ovRaiz.getElementById('ap-ov-panel-t').textContent = cabeza.titulo;
  ovRaiz.getElementById('ap-ov-panel-ayuda').textContent = cabeza.ayuda;
  const cerrar = ovRaiz.getElementById('ap-ov-panel-cerrar');
  const etiqueta = p.estado === 'eligiendo' ? 'Cerrar sin postular' : 'Cerrar';
  cerrar.setAttribute('aria-label', etiqueta);
  cerrar.title = etiqueta;

  const lista = ovRaiz.getElementById('ap-ov-panel-lista');
  const scroll = lista.scrollTop;
  lista.textContent = '';
  for (const g of AP_GRUPOS_PANEL) {
    const delGrupo = p.ofertas.filter(o => o.banda === g.banda);
    if (!delGrupo.length) continue;
    const grupo = apNodo('div', 'grupo');
    const cab = apNodo('div', 'grupo-cabeza ' + g.banda);
    cab.appendChild(apNodo('span', 'punto'));
    cab.appendChild(apNodo('span', 'nombre', g.nombre + ' · ' + delGrupo.length));
    // "No calzan" viene plegado (§2.1): son las que menos se revisan y las que
    // más espacio ocupan. Las que la persona marcó se ven igual.
    const plegado = g.banda === 'descartar' && !p.verDescartadas;
    if (g.banda === 'descartar') {
      const ver = apNodo('button', 'ver', plegado ? (delGrupo.length === 1 ? 'Verla' : 'Ver las ' + delGrupo.length) : 'Ocultar');
      ver.type = 'button';
      ver.setAttribute('aria-expanded', String(!plegado));
      ver.onclick = () => { p.verDescartadas = !p.verDescartadas; apPintarPanel(); };
      cab.appendChild(ver);
    }
    grupo.appendChild(cab);
    const visibles = plegado ? delGrupo.filter(o => p.elegidas.has(o.id) || p.progreso.has(o.id)) : delGrupo;
    const tope = p.verTodas.has(g.banda) ? visibles.length : AP_POR_GRUPO;
    const ul = apNodo('ul');
    for (const o of visibles.slice(0, tope)) ul.appendChild(apItemPanel(o));
    grupo.appendChild(ul);
    if (visibles.length > tope) {
      const mas = apNodo('button', 'mas', 'Ver ' + (visibles.length - tope) + ' más');
      mas.type = 'button';
      mas.onclick = () => { p.verTodas.add(g.banda); apPintarPanel(); };
      grupo.appendChild(mas);
    }
    lista.appendChild(grupo);
  }
  lista.scrollTop = scroll;
  apPintarPie();
}

function apItemPanel(o) {
  const p = apPanel;
  const fija = apPorQueFija(o, p.observando);
  const li = apNodo('li');
  const fila = apNodo('label', 'item' + (fija || p.estado !== 'eligiendo' ? ' fija' : ''));
  if (!fija) {
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.checked = p.elegidas.has(o.id);
    casilla.disabled = p.estado !== 'eligiendo';
    casilla.onchange = () => {
      if (!apPanel || apPanel.estado !== 'eligiendo') return;
      if (casilla.checked) apPanel.elegidas.add(o.id); else apPanel.elegidas.delete(o.id);
      apPintarPie();
    };
    fila.appendChild(casilla);
  }
  const txt = apNodo('span', 'txt');
  // textContent siempre: título, empresa y razón vienen del aviso.
  txt.appendChild(apNodo('span', 't', o.titulo || 'Oferta sin título'));
  txt.appendChild(apNodo('span', 'm', [o.empresa, o.ubicacion].filter(Boolean).join(' · ')));
  txt.appendChild(apNodo('span', 'r', fija === 'sin_enlace'
    ? 'No pude leer su enlace: si te interesa, ábrela en el portal.'
    : (o.razon ? AP.razonComoEnElPanel(o.razon) : '')));
  fila.appendChild(txt);
  const estado = p.progreso.has(o.id) ? AP_ESTADOS_COLA[p.progreso.get(o.id)]
    : fija === 'ya_la_vio_el_escaneo' ? apEstadoDelLog(o.id) : null;
  fila.appendChild(apNodo('span', 'estado' + (estado && estado.clase ? ' ' + estado.clase : ''), estado ? estado.texto : ''));
  li.appendChild(fila);
  return li;
}

function apPintarPie() {
  const p = apPanel;
  if (!p || !ovRaiz) return;
  const si = ovRaiz.getElementById('ap-ov-panel-si');
  const cupo = ovRaiz.getElementById('ap-ov-panel-cupo');
  const cuenta = ovRaiz.getElementById('ap-ov-panel-cuenta');
  if (p.estado !== 'eligiendo') {
    const r = apResumenCola();
    cupo.textContent = '';
    cuenta.textContent = r.enviando ? 'Enviadas: ' + r.enviadas + ' de ' + r.enviando + '.' : '';
    si.hidden = true;
    return;
  }
  const pie = AP.textoPiePanel(apElegidasDelPanel().length, p.cupo, AP.portalDelHost(location.hostname), p.sinSesion);
  cupo.textContent = pie.cupo;
  cuenta.textContent = pie.cuenta;
  si.hidden = false;
  si.textContent = pie.boton;
  si.disabled = !pie.accion;
}

function apAccionPanel() {
  const p = apPanel;
  if (!p || p.estado !== 'eligiendo') return;
  const portal = AP.portalDelHost(location.hostname);
  const elegidas = apElegidasDelPanel();
  const pie = AP.textoPiePanel(elegidas.length, p.cupo, portal, p.sinSesion);
  if (pie.accion === 'sesion') {
    const destino = AP.ingresoDelPortal(portal);
    if (destino) location.href = destino;
    return;
  }
  if (pie.accion === 'comprar' || pie.accion === 'conectar') {
    try { window.open(AP_PANEL_WEB + (pie.accion === 'comprar' ? '/dashboard/premium' : '/dashboard/portales'), '_blank', 'noopener'); } catch (e) {}
    return;
  }
  if (pie.accion !== 'postular' || !pie.enviar) return;
  apEnviarPanel(elegidas.slice(0, pie.enviar), elegidas.slice(pie.enviar), portal);
}

// Manda lo elegido a background.js. Las que no alcanzan por el cupo no se
// registran (ni sí ni no): la persona las quería, pero no las está enviando.
// Tampoco las que iban sin casilla porque no se pueden postular (repetidas, sin
// enlace): sobre esas no decidió nada. Antes, una que servía y no tenía enlace
// quedaba registrada como "quitada".
function apEnviarPanel(enviar, fueraDeCupo, portal) {
  const p = apPanel;
  const aEnviar = new Set(enviar.map(o => o.id));
  const fuera = new Set(fueraDeCupo.map(o => o.id));
  const sinDecision = new Set(['repetida', 'sin_enlace']);
  const ofertas = p.ofertas.filter(o => !fuera.has(o.id) && !sinDecision.has(apPorQueFija(o, p.observando))).map((o) => {
    const guardada = apEntradaGuardada(o.titulo, o.empresa);
    return {
      externalId: o.id, titulo: o.titulo, empresa: o.empresa, url: o.url, banda: o.banda,
      elegida: aEnviar.has(o.id),
      yaEnviada: apPorQueFija(o, p.observando) === 'ya_la_vio_el_escaneo',
      scoreLocal: o.score != null ? o.score : (guardada ? guardada.score : null),
      razones: o.razones,
      entrada: guardada ? guardada.entrada : null,
    };
  });
  p.estado = 'enviando';
  for (const id of aEnviar) p.progreso.set(id, 'encolada');
  ovRaiz.getElementById('ap-ov-panel-resultado').textContent = '';
  apPintarPanel();
  const terminar = (r) => {
    if (apPanel !== p) return;
    if (r && r.config) { AP.cfg = r.config; AP.activo = r.config.active !== false; }
    if (r && r.ok) {
      apGuardarDecididas(ofertas);
      // La tarjeta del final ya no tiene nada que preguntar en esta pestaña.
      try { sessionStorage.setItem(AP_CLAVE_CIERRE_LISTO, '1'); } catch (e) {}
      apCierreEstado = 'listo';
      ovRaiz.getElementById('ap-ov-cierre').hidden = true;
      p.porDecision = new Map((r.encoladas || []).map(e => [e.decisionId, e.externalId]));
      const encoladas = new Set(p.porDecision.values());
      for (const id of aEnviar) if (!encoladas.has(id)) p.progreso.set(id, 'sin_enlace');
      p.primeraConRevision = !!r.primeraConRevision;
      if (!encoladas.size) p.estado = 'listo';
      apArmarVigiaPanel();
      apPintarPanel();
      apRecorridoEvento('enviado');
      return;
    }
    p.estado = 'eligiendo';
    p.progreso.clear();
    apPintarPanel();
    const res = ovRaiz.getElementById('ap-ov-panel-resultado');
    res.textContent = (r && r.error) || 'No se pudo enviar ahora. Inténtalo de nuevo.';
    res.className = 'resultado error';
  };
  try {
    chrome.runtime.sendMessage({ type: 'POSTULAR_ELEGIDAS', plataforma: portal, ofertas }, (r) => {
      void chrome.runtime.lastError;
      terminar(r);
    });
  } catch (e) {
    terminar(null);
  }
}

// Lo que cuenta la cola de cada una (background.js, PROGRESO_REVISION).
function apProgresoPanel(m) {
  const p = apPanel;
  if (!p || !m || !p.porDecision.has(m.decisionId)) return;
  p.progreso.set(p.porDecision.get(m.decisionId), AP_ESTADOS_COLA[m.estado] ? m.estado : 'no_enviada');
  const quedan = [...p.porDecision.values()].some(id => AP_COLA_PENDIENTE.has(p.progreso.get(id)));
  if (!quedan) { p.estado = 'listo'; clearTimeout(apVigiaPanel); }
  else apArmarVigiaPanel();
  apPintarPanel();
}

function apArmarVigiaPanel() {
  clearTimeout(apVigiaPanel);
  const p = apPanel;
  if (!p || p.estado !== 'enviando') return;
  apVigiaPanel = setTimeout(() => {
    if (apPanel !== p || p.estado !== 'enviando') return;
    for (const id of p.porDecision.values()) if (AP_COLA_PENDIENTE.has(p.progreso.get(id))) p.progreso.set(id, 'sigue');
    p.estado = 'listo';
    apPintarPanel();
  }, AP_VIGIA_PANEL_MS);
}

function apTodaviaNo() {
  try { sessionStorage.setItem(AP_CLAVE_CIERRE_LISTO, '1'); } catch (e) {}
  apCierreEstado = 'listo';
  if (ovRaiz) ovRaiz.getElementById('ap-ov-cierre').hidden = true;
  apRecorridoEvento('todavia_no');
}

// «Ahora no» con «Revisar antes de enviar»: lo propuesto queda sin enviar (se
// puede elegir después desde el ícono) y la tarjeta no vuelve a salir por esas
// mismas ofertas.
function apAhoraNo() {
  const marcas = apLeerMarcas();
  const ids = typeof AP.tarjetasDeLaPagina === 'function' ? AP.tarjetasDeLaPagina().map(t => t.id) : [];
  apPropuestasVistas.agregar(ids.filter(id => marcas[id] && marcas[id].b === 'postular' && AP.esPropuesta(id)));
  apCierreEstado = 'listo';
  if (ovRaiz) ovRaiz.getElementById('ap-ov-cierre').hidden = true;
}

// Activa la postulación en la cuenta (background.js -> /api/extension/estado,
// con las mismas reglas que el panel) y sigue con esta misma página: las que
// sirven se postulan acá, y la primera se muestra antes de enviarla.
function apEmpezarAPostular(resumen) {
  if (apCierreEstado !== 'inicial' || !ovRaiz) return;
  apCierreEstado = 'activando';
  const texto = AP.textoCierre(resumen);
  const si = ovRaiz.getElementById('ap-ov-cierre-si');
  si.disabled = true;
  si.textContent = 'Activando…';
  apResultadoCierre('', '');
  const terminar = (r) => {
    if (!ovRaiz) return;
    if (r && r.ok) {
      apCierreEstado = 'listo';
      try {
        sessionStorage.setItem(AP_CLAVE_CIERRE_LISTO, '1');
        if (resumen.postular) sessionStorage.setItem(AP_CLAVE_REVISAR_PRIMERA, '1');
      } catch (e) {}
      if (r.config) { AP.cfg = r.config; AP.activo = r.config.active !== false; }
      ovRaiz.getElementById('ap-ov-cierre-botones').hidden = true;
      ovRaiz.getElementById('ap-ov-cierre-ver').hidden = true;
      apResultadoCierre(texto.listo, 'ok');
      AP.liberarObservadas();
      apRecorridoEvento('activada');
      setTimeout(() => {
        if (ovRaiz) ovRaiz.getElementById('ap-ov-cierre').hidden = true;
        if (resumen.postular && AP.escanear) { AP.procesando = false; AP.escanear(); }
      }, 3500);
    } else {
      apCierreEstado = 'inicial';
      si.disabled = false;
      si.textContent = texto.boton;
      apResultadoCierre((r && r.error) || 'No se pudo activar ahora. Puedes hacerlo desde tu panel.', 'error');
    }
  };
  try {
    chrome.runtime.sendMessage({ type: 'EMPEZAR_A_POSTULAR' }, (r) => {
      void chrome.runtime.lastError;
      terminar(r);
    });
  } catch (e) {
    terminar(null);
  }
}

// ── El recorrido de la primera vez (docs/primera-busqueda-guiada.md §13) ──
//
// Cuatro pasos encima de la primera búsqueda de verdad, no una demo: cada uno
// sale cuando pasa lo que explica (las marcas, la tarjeta del final, el panel)
// y se apoya solo en lo que pinta la extensión, nunca en botones del portal,
// para no romperse cuando el portal cambia. Queda pendiente al instalar y
// cuando la persona aprieta «Probémosla ahora» o «Buscar en…» en su panel
// (background.js, recorridoPendiente). Sale en «solo mirar», con la persona
// mirando la pestaña, una sola vez, y se puede saltar en cualquier paso.
// Mientras van los dos primeros pasos la tarjeta del final espera: aparece en
// el tercero, cuando toca explicarla.
const AP_REC_TOTAL = 4;
// Uno que quedó a medias (se cerró la pestaña, fue a iniciar sesión) se retoma
// donde iba; pasado esto, empieza de nuevo.
const AP_REC_RETOMAR_MS = 2 * 60 * 60 * 1000;
let apRecGuardado = null; // chrome.storage.local.recorrido
let apRec = null;         // el que corre en esta pestaña
let apRecHost = null, apRecRaiz = null, apRecCuadro = null, apRecAnima = null;

const AP_ESTILO_RECORRIDO =
  ':host{all:initial}' +
  '*{box-sizing:border-box}' +
  // El foco: un marco sobre lo que se explica, y el resto de la página en penumbra.
  '.foco{position:fixed;left:0;top:0;width:0;height:0;border-radius:12px;border:2px solid #D6F24B;' +
    'box-shadow:0 0 0 9999px rgba(10,12,13,.46);pointer-events:none}' +
  '.foco::after{content:"";position:absolute;inset:-3px;border-radius:14px;border:2px solid #D6F24B;animation:r-late 1.9s ease-out infinite}' +
  '@keyframes r-late{0%{opacity:.8;inset:-3px}100%{opacity:0;inset:-14px}}' +
  '.foco[hidden],.globo[hidden],.saltar[hidden]{display:none}' +
  '.globo{position:fixed;left:0;top:0;width:312px;max-width:calc(100vw - 32px);padding:14px 16px;border-radius:12px;pointer-events:auto;' +
    'background:#16181A;color:#E9EBEA;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 40px -12px rgba(0,0,0,.6);' +
    'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;line-height:1.5;text-align:left}' +
  '.globo.entra{animation:r-entra .34s cubic-bezier(.2,.8,.3,1)}' +
  '@keyframes r-entra{from{opacity:0;transform:translateY(8px) scale(.97)}}' +
  '.globo.cambia .t,.globo.cambia .d{animation:r-texto .35s ease-out}' +
  '@keyframes r-texto{from{opacity:.1}}' +
  // De un paso al otro, el foco y el globo viajan (solo al cambiar de paso: al
  // seguir un scroll, van pegados).
  '.anima{transition:left .48s cubic-bezier(.2,.8,.3,1),top .48s cubic-bezier(.2,.8,.3,1),width .48s cubic-bezier(.2,.8,.3,1),height .48s cubic-bezier(.2,.8,.3,1)}' +
  '.flecha{position:absolute;width:12px;height:12px;background:#16181A;transform:rotate(45deg);border:1px solid rgba(255,255,255,.12)}' +
  '.flecha[data-lado="derecha"]{left:-7px;border-right:0;border-top:0}' +
  '.flecha[data-lado="izquierda"]{right:-7px;border-left:0;border-bottom:0}' +
  '.flecha[data-lado="abajo"]{top:-7px;border-right:0;border-bottom:0}' +
  '.flecha[data-lado="arriba"]{bottom:-7px;border-left:0;border-top:0}' +
  '.flecha[data-lado="centro"]{display:none}' +
  '.cabeza{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:11px;color:#8E9599}' +
  '.marca{width:18px;height:18px;flex:none;border-radius:5px;background:#26292D;border:1px solid #3C4145;display:grid;place-items:center}' +
  '.marca svg{width:11px;height:11px;display:block}' +
  '.marca path{fill:none;stroke:#D6F24B;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round}' +
  '.puntos{display:flex;align-items:center;gap:4px;margin-left:auto}' +
  '.puntos i{display:block;width:6px;height:6px;border-radius:3px;background:#3C4145;transition:width .3s,background .3s}' +
  '.puntos[data-n="2"] i:nth-child(-n+1),.puntos[data-n="3"] i:nth-child(-n+2),.puntos[data-n="4"] i:nth-child(-n+3),.puntos[data-n="5"] i{background:#7E8F2C}' +
  '.puntos[data-n="1"] i:nth-child(1),.puntos[data-n="2"] i:nth-child(2),.puntos[data-n="3"] i:nth-child(3),.puntos[data-n="4"] i:nth-child(4){width:16px;background:#D6F24B}' +
  'p{margin:0}' +
  '.t{font-size:15px;font-weight:700;line-height:1.35;color:#F4F5F4}' +
  '.d{margin-top:5px;color:#C9CDCF}' +
  '.acciones{display:flex;align-items:center;gap:14px;margin-top:14px}' +
  'button{all:unset;box-sizing:border-box;cursor:pointer;font-size:13px;line-height:1.2}' +
  '.si{padding:8px 14px;border-radius:8px;background:#D6F24B;color:#16181A;font-weight:700;transition:filter .15s}' +
  '.si:hover{filter:brightness(1.07)}' +
  '.saltar{color:#8E9599;font-size:12px}' +
  '.saltar:hover{color:#E9EBEA;text-decoration:underline}' +
  'button:focus-visible{outline:2px solid #E9EBEA;outline-offset:2px}' +
  '@media (prefers-reduced-motion:reduce){.foco::after,.globo.entra,.globo.cambia .t,.globo.cambia .d{animation:none}.anima{transition:none}}';

const AP_HTML_RECORRIDO =
  '<div class="foco" id="ap-rec-foco" hidden></div>' +
  '<div class="globo" id="ap-rec-globo" role="dialog" aria-labelledby="ap-rec-t" aria-describedby="ap-rec-d" hidden>' +
    '<span class="flecha" id="ap-rec-flecha"></span>' +
    '<div class="cabeza">' +
      '<span class="marca"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg></span>' +
      '<span id="ap-rec-paso"></span>' +
      '<span class="puntos" id="ap-rec-puntos" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
    '</div>' +
    '<p class="t" id="ap-rec-t"></p>' +
    '<p class="d" id="ap-rec-d" aria-live="polite"></p>' +
    '<div class="acciones">' +
      '<button class="si" id="ap-rec-si" type="button"></button>' +
      '<button class="saltar" id="ap-rec-saltar" type="button">Saltar el recorrido</button>' +
    '</div>' +
  '</div>';

// Lo que dice cada paso. `c`: { total, postular, portal, sinSesion, banda,
// ultima, sub, variante }.
AP.textoRecorrido = function (paso, c) {
  c = c || {};
  const portal = c.portal || 'el portal';
  const numero = (n) => 'Paso ' + n + ' de ' + AP_REC_TOTAL;
  if (paso === 'hola') {
    return {
      paso: numero(1), n: 1,
      titulo: 'Hola, soy AutoPostula',
      texto: (c.total === 1 ? 'Revisé la oferta de esta página y la marqué' : 'Revisé las ' + c.total + ' ofertas de esta página y marqué cada una') +
        ' con lo que haría. Te muestro cómo leer las marcas: no envío nada sin que me digas.',
      boton: 'Muéstrame',
    };
  }
  if (paso === 'marcas') {
    const porBanda = {
      postular: ['Esta te sirve', 'Cada oferta lleva su marca y el porqué. A las que te sirven, postularía.'],
      gris: ['Esta, mejor que la decidas tú', 'Las dudosas no las envío: te las dejo en tu panel, en «Por decidir», para que digas sí o no.'],
      descartar: ['Esta no calza', 'A las que no calzan no postulo. Si me equivoco con alguna, en la lista la puedes rescatar.'],
    };
    const t = porBanda[c.banda] || porBanda.descartar;
    return { paso: numero(2), n: 2, titulo: t[0], texto: t[1], boton: c.ultima ? 'Ver el resumen' : 'Siguiente' };
  }
  if (paso === 'cierre') {
    if (c.sinSesion) {
      // El botón corto: el texto ya dice en qué portal (y largo quedaba en dos
      // líneas, apretado contra "Saltar el recorrido").
      return {
        paso: numero(3), n: 3, titulo: 'Para postular, inicia sesión',
        texto: 'Sin tu sesión en ' + portal + ' no puedo postular por ti. Inicia sesión y vuelve a esta búsqueda: seguimos desde aquí.',
        boton: 'Iniciar sesión',
      };
    }
    if (!c.postular) {
      return {
        paso: numero(3), n: 3, titulo: 'Aquí no hay ninguna que te sirva',
        texto: 'De esta página no postularía a ninguna. En la lista puedes rescatar alguna, o probar con otra página de la búsqueda.',
        boton: 'Ver la lista',
      };
    }
    return {
      paso: numero(3), n: 3, titulo: 'Antes de que salga nada, tú eliges',
      texto: 'Este es el resumen. En la lista ves ' + (c.total === 1 ? 'la oferta' : 'las ' + c.total) + ' y marcas a cuáles postular. ' +
        'También puedes empezar de una vez con ' + (c.postular === 1 ? 'la que te sirve.' : 'las que te sirven.'),
      boton: 'Ver la lista',
    };
  }
  if (paso === 'panel') {
    return c.sub
      ? { paso: numero(4), n: 4, titulo: 'Nada sale sin este botón',
          texto: 'Cuando lo aprietes, las envío de a una en otra pestaña, y la primera te la muestro antes de enviarla.',
          boton: 'Entendido' }
      : { paso: numero(4), n: 4, titulo: 'Marca a cuáles postular',
          texto: 'Las que te sirven ya vienen marcadas. Desmarca las que no quieras y marca las dudosas que te interesen.',
          boton: 'Siguiente' };
  }
  // El final, según cómo terminó.
  const siempre = 'Desde ahora, cada vez que abras ' + portal + ' en Chrome, reviso las ofertas así.';
  const finales = {
    enviado: ['¡Partimos!', 'Aquí ves cómo va cada una. ' + siempre + ' Lo dudoso te lo dejo en «Por decidir».'],
    activada: ['¡Partimos!', 'Postulo a las que te sirven de esta página, y la primera te la muestro antes de enviarla. ' + siempre],
    todavia_no: ['Sigo mirando contigo', 'No envío nada. Cuando quieras empezar, abre la lista desde el ícono de AutoPostula en Chrome, o actívala en tu panel de autopostula.cl.'],
    cerrado: ['No envié nada', 'Cuando quieras, vuelve a la lista con ' + (c.total === 1 ? '«Verla y elegir»' : '«Ver las ' + c.total + ' y elegir»') + ', o aprieta «Empezar a postular».'],
  };
  const f = finales[c.variante] || finales.cerrado;
  return { paso: 'Listo', n: AP_REC_TOTAL + 1, titulo: f[0], texto: f[1], boton: 'Entendido' };
};

// Dónde va el globo junto a `r` (el rectángulo de lo que se explica): el primer
// lado de `lados` donde cabe entero; si no cabe en ninguno, abajo al centro.
AP.lugarDelGlobo = function (r, w, h, lados, vw, vh) {
  const m = 14, b = 16;
  const caben = {
    derecha: r.right + m + w <= vw - b,
    izquierda: r.left - m - w >= b,
    abajo: r.bottom + m + h <= vh - b,
    arriba: r.top - m - h >= b,
  };
  const lado = (lados || []).find(l => caben[l]) || 'centro';
  const entre = (v, min, max) => Math.max(min, Math.min(max, v));
  if (lado === 'derecha' || lado === 'izquierda') {
    return { lado, x: lado === 'derecha' ? r.right + m : r.left - m - w, y: entre(r.top + r.height / 2 - h / 2, b, vh - h - b) };
  }
  if (lado === 'abajo' || lado === 'arriba') {
    return { lado, x: entre(r.left + r.width / 2 - w / 2, b, vw - w - b), y: lado === 'abajo' ? r.bottom + m : r.top - m - h };
  }
  return { lado, x: entre(vw / 2 - w / 2, b, vw - w - b), y: Math.max(b, vh - h - b) };
};

function apRecLeido(valor) { apRecGuardado = valor && typeof valor === 'object' ? valor : null; }
function apRecGuardar(valor) { apRecGuardado = valor; AP.safeSet({ recorrido: valor }); }

// Dónde empieza en esta pestaña, o null si no toca.
function apRecPasoInicial() {
  const g = apRecGuardado;
  if (!g || !AP.soloObservarEfectivo() || AP.esPestanaDeRafaga()) return null;
  try { if (document.hidden) return null; } catch (e) { return null; }
  if (g.estado === 'pendiente') return 'hola';
  if (g.estado !== 'en_curso') return null;
  if (!g.desde || Date.now() - g.desde > AP_REC_RETOMAR_MS) return 'hola';
  return g.paso === 'hola' || g.paso === 'marcas' ? g.paso : 'cierre';
}

// Una cuenta que ya postula (se instaló de nuevo en otro computador, o se activó
// desde el panel antes de mirar) no lo necesita: no se le muestra, y queda hecho
// para que no aparezca si algún día vuelve a "solo mirar".
function apRecorridoNoAplica() {
  const g = apRecGuardado;
  if (!g || (g.estado !== 'pendiente' && g.estado !== 'en_curso') || apRec || !AP.cfg) return;
  if (AP.soloObservarEfectivo() || AP.esPestanaDeRafaga()) return;
  apRecGuardar({ estado: 'hecho', como: 'ya_postulaba', en: Date.now() });
}

// La llama AP.cierreDePagina en "solo mirar": true si el recorrido se queda con
// la tarjeta del final (la muestra él, en su paso 3).
function apRecorridoRetieneCierre(resumen) {
  if (apRec) {
    apRec.resumen = resumen;
    return apRec.paso === 'hola' || apRec.paso === 'marcas';
  }
  const paso = apRecPasoInicial();
  if (!paso) return false;
  const g = apRecGuardado;
  apRec = {
    paso: null, sub: 0, resumen, ejemplos: [], variante: null, clave: '',
    desde: g.estado === 'en_curso' && g.desde && Date.now() - g.desde <= AP_REC_RETOMAR_MS ? g.desde : Date.now(),
  };
  apRecIr(paso, 0);
  return true;
}

// Una oferta de cada marca que haya en la página (te sirve, para que decidas,
// no calza): la primera de cada una que se vea.
function apRecEjemplos() {
  if (typeof AP.tarjetasDeLaPagina !== 'function') return [];
  const marcas = apLeerMarcas();
  const tarjetas = AP.tarjetasDeLaPagina();
  const ejemplos = [];
  for (const g of AP_GRUPOS_PANEL) {
    const t = tarjetas.find(x => x.el && marcas[x.id] && marcas[x.id].b === g.banda && apRecSeVe(x.el));
    if (t) ejemplos.push({ id: t.id, banda: g.banda });
  }
  return ejemplos;
}
function apRecSeVe(el) {
  try { return !el.getClientRects || el.getClientRects().length > 0; } catch (e) { return true; }
}

function apRecIr(paso, sub) {
  const p = apRec;
  if (!p) return;
  p.paso = paso;
  p.sub = sub || 0;
  if (paso === 'marcas' && !p.sub) {
    p.ejemplos = apRecEjemplos();
    if (!p.ejemplos.length) { apRecIr('cierre', 0); return; }
  }
  if (paso === 'cierre' && p.resumen && apCierreEstado === null) apMostrarCierre(p.resumen, false);
  apRecGuardar({ estado: 'en_curso', paso, desde: p.desde });
  apRecPintar();
}

// Lo que explica el paso actual, y de qué lados prefiere el globo.
function apRecObjetivo() {
  const p = apRec;
  if (!p) return null;
  const delAviso = (id) => (ovRaiz ? ovRaiz.getElementById(id) : null);
  const seVe = (el) => !!el && !el.hidden && apRecSeVe(el);
  if (p.paso === 'hola') return { el: delAviso('ap-ov-chip'), lados: ['arriba', 'izquierda'] };
  if (p.paso === 'marcas') {
    const ej = p.ejemplos[p.sub];
    const t = ej && AP.tarjetasDeLaPagina().find(x => x.id === ej.id);
    return { el: t && t.el, lados: ['derecha', 'abajo', 'arriba', 'izquierda'] };
  }
  if (p.paso === 'cierre') return { el: delAviso('ap-ov-cierre'), lados: ['izquierda', 'arriba'] };
  if (p.paso === 'panel') return { el: delAviso(p.sub ? 'ap-ov-panel-si' : 'ap-ov-panel-lista'), lados: ['izquierda', 'arriba', 'abajo'] };
  const panel = delAviso('ap-ov-panel'), cierre = delAviso('ap-ov-cierre');
  const el = p.variante === 'enviado' && seVe(panel) ? panel : seVe(cierre) ? cierre : delAviso('ap-ov-chip');
  return { el, lados: ['izquierda', 'arriba'] };
}

function apRecAsegurarUI() {
  if (!apRecHost) {
    apRecHost = document.createElement('div');
    apRecHost.id = 'ap-recorrido';
    apRecHost.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647';
    apRecRaiz = apRecHost.attachShadow({ mode: 'open' });
    apRecRaiz.innerHTML = '<style>' + AP_ESTILO_RECORRIDO + '</style>' + AP_HTML_RECORRIDO;
    apRecRaiz.getElementById('ap-rec-si').addEventListener('click', apRecAccion);
    apRecRaiz.getElementById('ap-rec-saltar').addEventListener('click', () => apRecTerminar('saltado'));
    apRecRaiz.getElementById('ap-rec-globo').addEventListener('keydown', (e) => { if (e.key === 'Escape') apRecTerminar('saltado'); });
  }
  // Siempre al final del body: encima del aviso, que tiene el mismo z-index.
  if (apRecHost.parentNode !== document.body || document.body.lastElementChild !== apRecHost) document.body.appendChild(apRecHost);
}

function apRecSinMovimiento() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

function apRecPintar() {
  const p = apRec;
  if (!p) return;
  apAsegurarOverlay();
  apRecAsegurarUI();
  const portal = AP.portalDelHost(location.hostname) || 'el portal';
  const resumen = p.resumen || {};
  const ej = p.paso === 'marcas' ? p.ejemplos[p.sub] : null;
  const texto = AP.textoRecorrido(p.paso, {
    total: resumen.total || 0, postular: resumen.postular || 0, portal,
    sinSesion: AP.mirarSesion(document, portal) === false,
    banda: ej && ej.banda, ultima: p.paso === 'marcas' && p.sub >= p.ejemplos.length - 1,
    sub: p.sub, variante: p.variante,
  });
  const globo = apRecRaiz.getElementById('ap-rec-globo');
  const foco = apRecRaiz.getElementById('ap-rec-foco');
  apRecRaiz.getElementById('ap-rec-paso').textContent = texto.paso;
  apRecRaiz.getElementById('ap-rec-puntos').setAttribute('data-n', String(texto.n));
  apRecRaiz.getElementById('ap-rec-t').textContent = texto.titulo;
  apRecRaiz.getElementById('ap-rec-d').textContent = texto.texto;
  const si = apRecRaiz.getElementById('ap-rec-si');
  si.textContent = texto.boton;
  apRecRaiz.getElementById('ap-rec-saltar').hidden = p.paso === 'fin';
  // La primera vez el globo entra; después viaja de un lugar al otro, con el foco.
  const venia = !globo.hidden;
  globo.hidden = false;
  globo.classList.remove('entra', 'cambia');
  void globo.offsetWidth; // para que la animación vuelva a empezar
  globo.classList.add(venia ? 'cambia' : 'entra');
  if (venia) {
    foco.classList.add('anima');
    globo.classList.add('anima');
    clearTimeout(apRecAnima);
    apRecAnima = setTimeout(() => {
      foco.classList.remove('anima');
      globo.classList.remove('anima');
    }, 560);
  }
  p.clave = '';
  const obj = apRecObjetivo();
  if (p.paso === 'marcas' && obj && obj.el && obj.el.scrollIntoView) {
    try { obj.el.scrollIntoView({ behavior: apRecSinMovimiento() ? 'auto' : 'smooth', block: 'center' }); } catch (e) {}
  }
  apRecSeguir();
  try { si.focus({ preventScroll: true }); } catch (e) {}
}

// Pone el foco y el globo donde está lo que se explica. Corre en cada cuadro
// mientras se ve, así sigue a la página cuando se mueve (un scroll, el portal
// que carga algo arriba), pero solo toca el DOM si algo cambió.
function apRecColocar() {
  const p = apRec;
  if (!p || !apRecRaiz) return;
  const globo = apRecRaiz.getElementById('ap-rec-globo');
  if (globo.hidden) return;
  const foco = apRecRaiz.getElementById('ap-rec-foco');
  const flecha = apRecRaiz.getElementById('ap-rec-flecha');
  const obj = apRecObjetivo();
  const el = obj && obj.el;
  const r = el && el.isConnected !== false && !el.hidden && apRecSeVe(el) ? el.getBoundingClientRect() : null;
  const conObjetivo = !!(r && (r.width || r.height));
  const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
  const w = globo.offsetWidth || 312, h = globo.offsetHeight || 170;
  const clave = (conObjetivo ? [r.left, r.top, r.width, r.height] : ['sin']).concat([vw, vh, w, h]).map(v => typeof v === 'number' ? Math.round(v) : v).join(',');
  if (clave === p.clave) return;
  p.clave = clave;
  foco.hidden = !conObjetivo;
  if (conObjetivo) {
    const pad = 6;
    foco.style.left = Math.round(r.left - pad) + 'px';
    foco.style.top = Math.round(r.top - pad) + 'px';
    foco.style.width = Math.round(r.width + pad * 2) + 'px';
    foco.style.height = Math.round(r.height + pad * 2) + 'px';
  }
  const lugar = AP.lugarDelGlobo(conObjetivo ? r : { left: vw, right: vw, top: vh, bottom: vh, width: 0, height: 0 }, w, h, conObjetivo ? obj.lados : [], vw, vh);
  globo.style.left = Math.round(lugar.x) + 'px';
  globo.style.top = Math.round(lugar.y) + 'px';
  flecha.setAttribute('data-lado', lugar.lado);
  if (!conObjetivo) return;
  if (lugar.lado === 'derecha' || lugar.lado === 'izquierda') {
    flecha.style.left = '';
    flecha.style.top = Math.round(Math.max(14, Math.min(h - 26, r.top + r.height / 2 - lugar.y - 6))) + 'px';
  } else {
    flecha.style.top = '';
    flecha.style.left = Math.round(Math.max(14, Math.min(w - 26, r.left + r.width / 2 - lugar.x - 6))) + 'px';
  }
}

function apRecSeguir() {
  if (typeof requestAnimationFrame !== 'function') { apRecColocar(); return; }
  if (apRecCuadro) return;
  const vuelta = () => {
    if (!apRec || !apRecRaiz || apRecRaiz.getElementById('ap-rec-globo').hidden) { apRecCuadro = null; return; }
    apRecColocar();
    apRecCuadro = requestAnimationFrame(vuelta);
  };
  apRecCuadro = requestAnimationFrame(vuelta);
}

function apRecOcultar() {
  if (!apRecRaiz) return;
  apRecRaiz.getElementById('ap-rec-globo').hidden = true;
  apRecRaiz.getElementById('ap-rec-foco').hidden = true;
}

function apRecAccion() {
  const p = apRec;
  if (!p) return;
  if (p.paso === 'hola') { apRecIr('marcas', 0); return; }
  if (p.paso === 'marcas') {
    if (p.sub < p.ejemplos.length - 1) apRecIr('marcas', p.sub + 1);
    else apRecIr('cierre', 0);
    return;
  }
  if (p.paso === 'cierre') {
    const portal = AP.portalDelHost(location.hostname) || '';
    if (AP.mirarSesion(document, portal) === false) { apIrAIniciarSesion(); return; }
    // Abrir el panel lleva al paso 4 (apMostrarPanel avisa).
    if (!AP.abrirPanel()) apRecFin('cerrado');
    return;
  }
  if (p.paso === 'panel') {
    if (!p.sub) { apRecIr('panel', 1); return; }
    // Ahora le toca a la persona: el recorrido espera a que apriete o cierre.
    p.paso = 'esperando';
    apRecOcultar();
    return;
  }
  if (p.paso === 'fin') apRecTerminar(p.variante || 'terminado');
}

// El último globo, según cómo terminó. Desde acá ya cuenta como hecho.
function apRecFin(variante) {
  const p = apRec;
  if (!p || p.paso === 'fin') return;
  p.paso = 'fin';
  p.variante = variante;
  apRecGuardar({ estado: 'hecho', como: variante, en: Date.now() });
  apRecPintar();
}

function apRecTerminar(como) {
  const p = apRec;
  if (!p) return;
  apRec = null;
  if (!apRecGuardado || apRecGuardado.estado !== 'hecho') apRecGuardar({ estado: 'hecho', como: como || 'terminado', en: Date.now() });
  if (apRecCuadro && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(apRecCuadro);
  apRecCuadro = null;
  clearTimeout(apRecAnima);
  if (apRecHost) { apRecHost.remove(); apRecHost = null; apRecRaiz = null; }
  // Si se saltó antes del paso 3, la tarjeta del final sale ahora.
  if ((p.paso === 'hola' || p.paso === 'marcas') && p.resumen && apCierreEstado === null) apMostrarCierre(p.resumen, false);
}

// Lo que pasa en la página y mueve el recorrido.
function apRecorridoEvento(evento) {
  const p = apRec;
  if (!p) return;
  if (evento === 'panel') {
    if (p.paso !== 'panel' && p.paso !== 'esperando' && p.paso !== 'fin') apRecIr('panel', 0);
    return;
  }
  if (evento === 'panel_cerrado') {
    if (p.paso === 'fin') { if (p.variante === 'enviado') apRecTerminar(p.variante); return; }
    if (p.paso === 'panel' || p.paso === 'esperando') apRecFin('cerrado');
    return;
  }
  if (evento === 'enviado' || evento === 'activada' || evento === 'todavia_no') apRecFin(evento);
}

// Para las pruebas: en qué va el recorrido de esta pestaña.
AP.estadoRecorrido = function () {
  return apRec ? { paso: apRec.paso, sub: apRec.sub, variante: apRec.variante, ejemplos: apRec.ejemplos.map(e => e.banda) } : null;
};
AP.accionRecorrido = function () { apRecAccion(); };
AP.saltarRecorrido = function () { apRecTerminar('saltado'); };

// ── Mensaje de resumen al terminar un escaneo (docs/visibilidad-y-etapa2.md §A) ──
// Antes cada adaptador decía "X de 20 coinciden", contando solo la banda
// 'postular' -- "0 de 20" podía ser 20 descartadas, 20 en gris, o cualquier
// mezcla, y la razón real ya se calculaba (iba a addLog por oferta) pero
// nunca se mostraba donde la persona está mirando. Compartido entre los dos
// adaptadores para no duplicar el armado del texto ni los umbrales de color.
// soloObservar (docs/modo-solo-observar.md §3.4): en ese modo nada se
// postula de verdad, así que el mensaje tiene que decirlo explícito -- la
// persona nunca puede quedar en duda sobre si la extensión está enviando
// postulaciones o no. c.observado reemplaza a c.postular en el desglose.
//
// razonTop puede venir ya en texto, o como la lista de razones de descarte:
// con la lista, además del texto, el resumen trae `accion` cuando la razón
// principal se arregla desde el propio aviso ("Agregar Santiago a mi búsqueda").
AP.mensajeEscaneo = function (conteos, razonTop, soloObservar, propone) {
  let accion = null;
  if (Array.isArray(razonTop)) {
    const principal = AP.razonPrincipal(razonTop);
    accion = AP.accionDeRazon(principal);
    razonTop = principal ? AP.formatearRazonCorta(principal) : null;
  }
  const c = conteos || {};
  const partes = [];
  if (soloObservar) {
    if (c.observado) partes.push(c.observado + ' habría postulado');
  } else if (propone) {
    // «Revisar antes de enviar» con la persona mirando: no se envió nada.
    if (c.propuestas) partes.push(c.propuestas + (c.propuestas === 1 ? ' te sirve' : ' te sirven'));
  } else if (c.postular) {
    partes.push(c.postular + (c.postular === 1 ? ' postulada' : ' postuladas'));
  }
  if (c.gris) partes.push(c.gris + ' por decidir');
  if (c.descartar) partes.push(c.descartar + (c.descartar === 1 ? ' descartada' : ' descartadas'));

  // Una pasada que no encontró nada nuevo en la misma página (la dispara
  // cualquier cambio del DOM) dejaba "Sin ofertas nuevas" encima del resumen
  // de lo que ya revisó: se queda el resumen (docs/primera-busqueda-guiada.md §11).
  const url = (typeof location !== 'undefined' && location.href) || '';
  if (!partes.length && url && apUltimoResumen && apUltimoResumen.url === url) return apUltimoResumen.resumen;

  let texto = partes.length ? partes.join(' · ') : 'Sin ofertas nuevas';
  if (soloObservar) texto = '👁 Solo observar · ' + texto;
  else if (propone && c.propuestas) texto = 'Esperando tu visto bueno · ' + texto;
  if (razonTop) texto += ' — la mayoría: ' + razonTop;

  const estado = soloObservar || propone
    ? ((soloObservar ? c.observado : c.propuestas) > 0 || c.gris > 0 ? 'pendiente' : 'neutral')
    : (c.postular > 0 ? 'ok' : c.gris > 0 ? 'pendiente' : 'neutral');
  const resumen = { texto: texto, estado: estado, accion: accion };
  if (partes.length) apUltimoResumen = { url: url, resumen: resumen };
  return resumen;
};
let apUltimoResumen = null;

// Qué se puede arreglar desde el aviso. Hoy, solo la comuna: si lo que más se
// descartó fue "X no está en tus comunas", se ofrece sumar X a la búsqueda.
AP.accionDeRazon = function (r) {
  // Un descarte por región (r.region, docs/revision-scorer-2026-09-30.md §2.5)
  // no es una comuna que se pueda sumar: "Los Lagos" sumaría la comuna de Los
  // Ríos, y "Valparaíso" la comuna, cuando las ofertas eran de toda la región.
  if (r && typeof r === 'object' && r.tipo === 'ubicacion' && r.ofertaEn && !r.region) {
    return { tipo: 'agregar_comuna', comuna: r.ofertaEn };
  }
  return null;
};

// Cuenta la razón más frecuente de una lista (las de descarte, típicamente).
// Toma solo la PRIMERA razón de cada oferta -- razones[] puede traer varias
// (§C), pero para "la razón más frecuente" alcanza con la principal.
AP.razonMasFrecuente = function (razones) {
  const top = AP.razonPrincipal(razones);
  return top ? AP.formatearRazonCorta(top) : null;
};

// La razón más frecuente, sin formatear. En los descartes por ubicación, la
// comuna que muestra es la que más se repite entre ellos -- no la de la
// primera oferta --, porque es la que se ofrece agregar a la búsqueda.
AP.razonPrincipal = function (razones) {
  // §C: las razones ahora son objetos estructurados (`{tipo, ...}`), no
  // strings ya formateados -- agrupar por tipo en vez de por texto exacto es
  // lo que tiene sentido acá (dos descartes por ubicación en comunas
  // distintas siguen siendo "la misma razón" a efectos del resumen). Las
  // filas legacy en string siguen agrupándose por su texto tal cual.
  const conteo = new Map();
  for (const r of razones) {
    if (!r) continue;
    const clave = typeof r === 'string' ? r : (r.tipo || 'otro');
    const actual = conteo.get(clave) || { n: 0, ejemplo: r };
    actual.n++;
    conteo.set(clave, actual);
  }
  let top = null, topN = 0;
  for (const v of conteo.values()) {
    if (v.n > topN) { topN = v.n; top = v.ejemplo; }
  }
  if (top && typeof top === 'object' && top.tipo === 'ubicacion') {
    // Se devuelve la razón entera del lugar que más se repite, no la primera
    // con el lugar cambiado: así una región sigue marcada como región.
    const porLugar = new Map();
    for (const r of razones) {
      if (!r || r.tipo !== 'ubicacion' || !r.ofertaEn) continue;
      const actual = porLugar.get(r.ofertaEn) || { n: 0, razon: r };
      actual.n++;
      porLugar.set(r.ofertaEn, actual);
    }
    let mejor = null;
    for (const v of porLugar.values()) if (!mejor || v.n > mejor.n) mejor = v;
    if (mejor) top = mejor.razon;
  }
  return top;
};

// Formatea una razón (string legacy, u objeto estructurado nuevo del scorer
// -- ver AP.puntuarOferta) en una línea corta, para el log de la extensión y
// para el resumen del overlay. La versión rica para la tarjeta de "Por
// decidir" vive en el dashboard (docs/visibilidad-y-etapa2.md §D), que lee
// los mismos objetos desde `DecisionOferta.razones` (Json, sin migración).
AP.formatearRazonCorta = function (r) {
  if (typeof r === 'string') return r;
  if (!r || !r.tipo) return 'sin razón';
  switch (r.tipo) {
    case 'sin_perfil': return 'Tu perfil de búsqueda todavía no está listo';
    case 'rol': return 'calza con "' + r.rol + '" (' + r.termino + ')';
    case 'sin_rol': return 'no se encontró ninguno de los roles buscados';
    case 'veto': return r.razon + (r.donde === 'cuerpo' ? ' (mención en el cuerpo del aviso, no en título/empresa)' : '');
    case 'ubicacion':
      if (r.ofertaEn && r.region) return 'es en ' + (r.region === 'RM' ? 'la Región Metropolitana' : 'la región de ' + r.ofertaEn) + ', y no buscas ahí';
      return r.ofertaEn ? (nombreComuna(r.ofertaEn) + ' no está en tus comunas') : 'fuera de las comunas que buscas';
    case 'ubicacion_desconocida': return 'no se pudo saber en qué comuna es';
    case 'nivel': return r.certeza === 'desconocida'
      ? 'cargo de jefatura o dirección ("' + r.termino + '"): no está claro si buscas ese nivel'
      : 'cargo de jefatura o dirección ("' + r.termino + '"): buscas otro nivel';
    case 'duplicado': return r.fecha
      ? 'ya postulaste a este mismo cargo en esta empresa el ' + AP.formatearFechaCorta(r.fecha)
      : 'este mismo cargo de esta empresa ya apareció en este escaneo';
    case 'senal': return (r.delta >= 0 ? '+' : '') + r.delta + ' por "' + r.patron + '"';
    case 'sin_senales': return 'sin señales claras';
    // docs/amplitud-de-busqueda.md §5 y §6, con las palabras del panel
    // (backend/lib/formatear-razon.ts). Faltaban acá: el historial y el
    // resumen del escaneo decían "sin razón" en cada descarte por jornada.
    case 'jornada': return r.declarada === 'part_time'
      ? 'es de jornada completa y buscas part time'
      : 'es part time y buscas jornada completa';
    case 'jornada_desconocida': return 'no dice la jornada, y buscas ' + (r.declarada === 'part_time' ? 'part time' : 'jornada completa');
    case 'requisito': return 'pide ' + (r.que === 'titulo' ? 'un título que no está en tu CV'
      : r.que === 'licencia' ? 'una licencia de conducir profesional que no está en tu CV'
      : 'inglés, y tu CV no lo menciona');
    case 'modo_abierto': return 'cumple tus condiciones (buscas cualquier trabajo)';
    // docs/revision-scorer-2026-09-30.md §4.1.
    case 'rol_fuera_del_titulo': return 'el cargo ("' + r.rol + '") no está en el título, solo en ' + (r.campo === 'empresa' ? 'el nombre de la empresa' : 'la descripción');
    default: return 'sin razón';
  }
};

// ── La razón con las palabras del panel (docs/primera-busqueda-guiada.md §11) ──
// La marca de cada oferta (abajo) dice por qué, igual que el panel
// (backend/lib/formatear-razon.ts, formatearRazon): es la misma razón que la
// persona ve después en "Por decidir" o en "Lo último que hizo". Copia, porque
// la extensión no puede importar ese archivo: backend/scripts/verificar-razones-marca.ts
// corre las dos con los mismos casos.
AP.razonComoEnElPanel = function (r) {
  if (typeof r === 'string') return r;
  if (!r || typeof r !== 'object' || !r.tipo) return 'Sin razón registrada';
  switch (r.tipo) {
    case 'rol':
      if (r.campo === 'cuerpo') return 'La descripción habla de ' + r.rol + ', lo que buscas';
      if (r.campo === 'empresa') return 'El nombre de la empresa dice "' + (r.termino || r.rol) + '"';
      return r.termino && r.termino.toLowerCase() !== r.rol.toLowerCase()
        ? 'Es de ' + r.rol + ', lo que buscas (dice "' + r.termino + '")'
        : 'Es de ' + r.rol + ', lo que buscas';
    case 'rol_fuera_del_titulo':
      return 'El título es de otro cargo: ' + r.rol + ' solo aparece en ' + (r.campo === 'empresa' ? 'el nombre de la empresa' : 'la descripción');
    case 'sin_rol': return 'El cargo no se parece a lo que buscas';
    case 'veto': return r.donde === 'cuerpo' ? r.razon + ' (lo dice el aviso)' : r.razon;
    case 'ubicacion':
      if (r.ofertaEn && r.region) return 'Es en ' + (r.region === 'RM' ? 'la Región Metropolitana' : 'la región de ' + r.ofertaEn) + ', y no buscas ahí';
      return r.ofertaEn ? 'Queda en ' + r.ofertaEn + ', fuera de tus comunas' : 'Queda fuera de tus comunas';
    case 'ubicacion_desconocida':
      return r.ofertaEn ? 'Dice "' + r.ofertaEn + '" y no sabemos si queda en tus comunas' : 'No dice en qué comuna es';
    case 'nivel':
      return r.certeza === 'desconocida'
        ? 'Es jefatura ("' + r.termino + '") y no sabemos si buscas ese nivel'
        : 'Es jefatura ("' + r.termino + '") y buscas otro nivel';
    case 'duplicado':
      return r.fecha
        ? 'Ya postulaste a este cargo en esta empresa el ' + new Date(r.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
        : 'Se repite en esta misma búsqueda';
    case 'senal': return 'El aviso dice "' + r.patron + '"';
    case 'sin_senales': return 'El aviso no trae nada claro a favor ni en contra';
    case 'jornada': {
      const buscada = r.declarada === 'part_time' ? 'part time' : 'jornada completa';
      const delAviso = r.declarada === 'part_time' ? 'jornada completa' : 'part time';
      return 'Es de ' + delAviso + ' y buscas ' + buscada;
    }
    case 'jornada_desconocida':
      return 'No dice la jornada, y buscas ' + (r.declarada === 'part_time' ? 'part time' : 'jornada completa');
    case 'requisito':
      return 'Pide ' + (r.que === 'titulo' ? 'un título que no está en tu CV'
        : r.que === 'licencia' ? 'una licencia de conducir profesional que no está en tu CV'
        : 'inglés, y tu CV no lo menciona');
    case 'modo_abierto': return 'Cumple tus condiciones (buscas cualquier trabajo)';
    case 'sin_perfil': return 'Tu perfil de búsqueda todavía no estaba listo';
    default: return 'Sin razón registrada';
  }
};

// Igual que esRazonPositiva en backend/lib/formatear-razon.ts: true a favor,
// false en contra, null si no se sabe (un texto viejo).
AP.esRazonPositiva = function (r) {
  if (!r || typeof r !== 'object' || !r.tipo) return null;
  if (r.tipo === 'rol' || r.tipo === 'modo_abierto') return true;
  if (r.tipo === 'senal') return r.delta >= 0;
  if (['sin_rol', 'veto', 'ubicacion', 'ubicacion_desconocida', 'rol_fuera_del_titulo', 'nivel', 'duplicado',
       'sin_senales', 'jornada', 'jornada_desconocida', 'requisito'].indexOf(r.tipo) !== -1) return false;
  return null;
};

// ── La marca en cada oferta del listado (docs/primera-busqueda-guiada.md §3.2 y §11) ──
//
// Antes la extensión decía solo cuántas ("3 habría postulado · 6 por decidir ·
// 11 descartadas") en un aviso en la esquina, sin decir cuál era cuál. Ahora
// cada oferta del listado lleva su marca -- te sirve, para que decidas o no
// calza -- con su razón, donde la persona está mirando.
//
// Las decisiones se guardan en esta pestaña (sessionStorage), no en memoria:
// Laborum va y vuelve entre el listado y cada aviso, y cada vuelta recarga la
// extensión. Cada adaptador define AP.tarjetasDeLaPagina() -> [{ el, id }]
// para saber dónde pintarlas.
const AP_CLAVE_MARCAS = 'ap_marcas';
const AP_MAX_MARCAS = 300;

function apLeerMarcas() {
  try { return JSON.parse(sessionStorage.getItem(AP_CLAVE_MARCAS) || '{}') || {}; } catch (e) { return {}; }
}

// Cuál de sus razones dice la marca: en una que sirve, la primera a favor; en
// una que queda en duda, la primera en contra (lo que la dejó ahí, igual que
// "Lo último que hizo"); en un descarte, la que lo descartó.
AP.razonDeLaMarca = function (banda, razones) {
  const lista = Array.isArray(razones) ? razones.filter(Boolean) : (razones ? [razones] : []);
  if (banda === 'postular') return lista.find(r => AP.esRazonPositiva(r) === true) || null;
  if (banda === 'gris') return lista.find(r => AP.esRazonPositiva(r) === false) || lista[0] || null;
  return lista[0] || null;
};

// `datos` ({ titulo, empresa, url, ubicacion, score }) es lo que necesita el
// panel de revisión; se manda la primera vez que se marca cada oferta.
AP.marcar = function (id, banda, razones, datos) {
  if (!id || (banda !== 'postular' && banda !== 'gris' && banda !== 'descartar')) return;
  const marcas = apLeerMarcas();
  delete marcas[id]; // que la más nueva quede al final (y sea la última en borrarse)
  marcas[id] = { b: banda, r: AP.razonDeLaMarca(banda, razones) };
  const ids = Object.keys(marcas);
  if (ids.length > AP_MAX_MARCAS) for (const viejo of ids.slice(0, ids.length - AP_MAX_MARCAS)) delete marcas[viejo];
  try { sessionStorage.setItem(AP_CLAVE_MARCAS, JSON.stringify(marcas)); } catch (e) {}
  if (datos) apGuardarDatos(id, banda, razones, datos);
  AP.pintarMarcas();
};

// Lo que se guarda de cada oferta marcada, para el panel de revisión
// (docs/panel-de-revision-en-el-portal.md §2): título, empresa, comuna, enlace,
// puntaje y razones, con la banda que tenía. Aparte de ap_marcas para no
// engordar lo que se lee cada vez que se pintan las marcas; se borran igual,
// las más viejas primero.
const AP_CLAVE_OFERTAS = 'ap_ofertas';
function apLeerOfertas() {
  try { return JSON.parse(sessionStorage.getItem(AP_CLAVE_OFERTAS) || '{}') || {}; } catch (e) { return {}; }
}
function apGuardarDatos(id, banda, razones, datos) {
  const ofertas = apLeerOfertas();
  delete ofertas[id];
  const lista = (Array.isArray(razones) ? razones : [razones]).filter(Boolean).slice(0, 8);
  ofertas[id] = {
    b: banda,
    t: String(datos.titulo || '').slice(0, 200),
    e: datos.empresa ? String(datos.empresa).slice(0, 120) : null,
    l: datos.ubicacion ? String(datos.ubicacion).slice(0, 120) : null,
    u: datos.url ? String(datos.url).slice(0, 600) : null,
    s: typeof datos.score === 'number' && isFinite(datos.score) ? datos.score : null,
    rz: JSON.stringify(lista).length < 4000 ? lista : lista.slice(0, 1),
  };
  const ids = Object.keys(ofertas);
  if (ids.length > AP_MAX_MARCAS) for (const viejo of ids.slice(0, ids.length - AP_MAX_MARCAS)) delete ofertas[viejo];
  try { sessionStorage.setItem(AP_CLAVE_OFERTAS, JSON.stringify(ofertas)); } catch (e) {}
}

// Después de "Empezar a postular", las que solo miró vuelven a estar
// disponibles para postularse en esta misma página.
AP.liberarObservadas = function () {
  const marcas = apLeerMarcas();
  for (const id of Object.keys(marcas)) if (marcas[id].b === 'postular') AP.vistos.delete(id);
};

const AP_TEXTO_MARCA = { postular: 'Te sirve', gris: 'Para que decidas', descartar: 'No calza' };
const AP_ESTILO_MARCA =
  ':host{all:initial}' +
  '.m{display:inline-flex;align-items:flex-start;gap:7px;max-width:100%;box-sizing:border-box;padding:5px 10px 5px 6px;' +
    'border-radius:8px;border:1px solid;font:400 12.5px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}' +
  '.ico{flex:none;width:16px;height:16px;border-radius:4px;background:#16181A;display:grid;place-items:center;margin-top:1px}' +
  '.ico svg{width:10px;height:10px;display:block}' +
  '.ico path{fill:none;stroke:#D6F24B;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}' +
  '.t{font-weight:700}' +
  '.postular{background:#EAF7EF;border-color:#BFE6CD;color:#14633A}' +
  '.gris{background:#FFF5DB;border-color:#F0D995;color:#735000}' +
  '.descartar{background:#F2F3F3;border-color:#DCDFE0;color:#4B5356}';
const AP_HTML_MARCA =
  '<span class="m"><span class="ico"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg></span>' +
  '<span><span class="t"></span><span class="r"></span></span></span>';

let apPintarPendiente = false;
AP.pintarMarcas = function () {
  if (apPintarPendiente) return;
  apPintarPendiente = true;
  setTimeout(() => { apPintarPendiente = false; apPintarAhora(); }, 120);
};

function apPintarAhora() {
  if (typeof AP.tarjetasDeLaPagina !== 'function' || typeof document === 'undefined' || !document.createElement) return;
  const marcas = apLeerMarcas();
  const pintadas = new Set();
  for (const { el, id } of AP.tarjetasDeLaPagina()) {
    if (!el || pintadas.has(id)) continue;
    const m = marcas[id];
    let host = el.querySelector(':scope > [data-ap-marca]');
    if (!m) { if (host) host.remove(); continue; }
    pintadas.add(id);
    const clave = m.b + '|' + JSON.stringify(m.r || null);
    if (host && host.getAttribute('data-ap-marca') === clave) continue;
    if (!host) {
      host = document.createElement('div');
      // all:initial, como el aviso: que el CSS del portal no la deforme.
      host.style.cssText = 'all:initial;display:block;width:100%;margin:8px 0 2px;clear:both';
      host.attachShadow({ mode: 'open' });
      host.addEventListener('click', (e) => e.stopPropagation()); // no abre la oferta
      el.appendChild(host);
    }
    host.setAttribute('data-ap-marca', clave);
    const razon = m.r ? AP.razonComoEnElPanel(m.r) : '';
    host.shadowRoot.innerHTML = '<style>' + AP_ESTILO_MARCA + '</style>' + AP_HTML_MARCA;
    host.shadowRoot.querySelector('.m').classList.add(m.b);
    // textContent, nunca innerHTML: la razón puede traer palabras del aviso.
    host.shadowRoot.querySelector('.t').textContent = AP_TEXTO_MARCA[m.b] + (razon ? ' · ' : '');
    host.shadowRoot.querySelector('.r').textContent = razon;
    host.title = 'AutoPostula: ' + AP_TEXTO_MARCA[m.b] + (razon ? ' — ' + razon : '');
  }
}

// ── Helpers básicos ───────────────────────────────────────────────
AP.sleep = function (ms) { return new Promise(r => setTimeout(r, ms)); };
AP.n = function (s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); };
AP.safeSet = function (data) { try { chrome.storage.local.set(data); } catch (e) {} };
AP.safeSend = function (m) { try { chrome.runtime.sendMessage(m).catch(() => {}); } catch (e) {} };

// Avanza al listado paginado de la siguiente p\u00e1gina, cuando escanear() ya no
// tiene nada m\u00e1s que hacer en la p\u00e1gina actual (\u00a7: los listados de CT/Laborum
// no son infinitos -- ~20 ofertas por p\u00e1gina -- y sin esto la b\u00fasqueda
// autom\u00e1tica se quedaba pegada para siempre en la primera p\u00e1gina).
//
// Solo navega en pesta\u00f1as OCULTAS (document.hidden): la b\u00fasqueda autom\u00e1tica de
// background.js abre la pesta\u00f1a con active:false, as\u00ed que ah\u00ed es seguro. Si en
// cambio la persona est\u00e1 mirando la pesta\u00f1a ella misma (toggle "Activo" manual),
// nunca se le navega la p\u00e1gina sola sin que lo pida -- ser\u00eda muy invasivo.
//
// sessionStorage (no chrome.storage) a prop\u00f3sito: el contador de p\u00e1gina debe
// resetearse solo, una vez por pesta\u00f1a -- no debe sobrevivir a que la pesta\u00f1a
// se cierre y background.js abra una nueva para el siguiente ciclo.
AP.MAX_PAGINAS_AUTOMATICO = 3;
AP.LLAVE_PAGINA = 'ap_pagina_actual';

AP.siguientePagina = function (cantidadEnPagina, construirUrlPagina) {
  if (!document.hidden) return false;
  if (!cantidadEnPagina) return false; // p\u00e1gina vac\u00eda -- ya se pas\u00f3 del final del listado

  const actual = Number(sessionStorage.getItem(AP.LLAVE_PAGINA) || '1');
  if (actual >= AP.MAX_PAGINAS_AUTOMATICO) return false;

  const siguiente = actual + 1;
  sessionStorage.setItem(AP.LLAVE_PAGINA, String(siguiente));
  location.href = construirUrlPagina(siguiente);
  return true;
};

// Igual que AP.siguientePagina, pero para portales que paginan con un botón
// "cargar más" que agrega tarjetas a la misma página (Trabajando) en vez de
// navegar a una URL nueva -- mismo contador y mismo límite, solo cambia
// CÓMO se avanza. No hace falta relanzar el escaneo a mano después del
// click: el MutationObserver de más abajo detecta las tarjetas nuevas en el
// DOM y dispara AP.escanear() solo.
AP.siguientePaginaClick = function (cantidadEnPagina, boton) {
  if (!document.hidden) return false;
  if (!cantidadEnPagina || !boton) return false;

  const actual = Number(sessionStorage.getItem(AP.LLAVE_PAGINA) || '1');
  if (actual >= AP.MAX_PAGINAS_AUTOMATICO) return false;

  sessionStorage.setItem(AP.LLAVE_PAGINA, String(actual + 1));
  boton.click();
  return true;
};

// docs/rafagas-y-ponerse-al-dia.md §3.2: le avisa a background.js que este
// paso de la ráfaga terminó de verdad (nada más por paginar, nada más por
// postular) para que avance al siguiente paso YA en vez de esperar el timeout
// fijo de 5 min -- background.js igual se queda con ese timeout como red de
// seguridad si este mensaje nunca llega (pestaña abierta a mano, error, etc).
AP.reportarEscaneoTerminado = function (conteos) {
  AP.safeSend({ type: 'ESCANEO_TERMINADO', conteos: conteos || {} });
};

AP.addLog = function (entry) {
  AP.log.push(entry);
  if (AP.log.length > 200) AP.log = AP.log.slice(-200);
  AP.safeSet({ log: AP.log });
  AP.safeSend({ type: 'LOG_UPDATED', log: AP.log });
  // Antes esto quedaba solo guardado en storage, sin avisar en ninguna consola —
  // así que un error o un salto pasaban totalmente desapercibidos al depurar.
  if (entry.status === 'err') console.warn('[AP] postulación con error:', entry.title, '—', entry.reason, entry);
  else if (entry.status === 'skip') console.log('[AP] postulación saltada:', entry.title, '—', entry.reason);
  else if (entry.status === 'observado') console.log('[AP] solo observar — habría postulado:', entry.title);
};

// ── Reportar postulación al backend de AutoPostula (web) ─────────
// El fetch NO se hace aquí: content scripts corren en el contexto de la
// página del portal, así que CORS lo bloquea igual que si fuera la propia
// página quien llamara. Se le avisa al background, que sí tiene privilegios
// de extensión para hacer la llamada sin que CORS se meta.
// "plataforma" identifica el JobPlatform en el backend (ver background.js) —
// si se omite, background.js asume "Computrabajo" por compatibilidad.
//
// Ya NO es fire-and-forget (§1.3, docs/revision-2026-09-16.md): devuelve
// {ok, error} de verdad -- antes el background siempre respondía ok:true sin
// importar si el backend había rechazado la postulación (403 por tope
// mensual, 400 por portal desconectado), así que la persona postulaba de
// verdad en el portal externo y esa postulación quedaba invisible, sin que
// nada se lo dijera.
AP.reportarPostulacion = function (oferta) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'REPORTAR_POSTULACION', oferta: oferta }, (respuesta) => {
        if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
        resolve(respuesta || { ok: false, error: 'Sin respuesta del background' });
      });
    } catch (e) {
      console.warn('[AP] No se pudo avisar al background:', e);
      resolve({ ok: false, error: String(e) });
    }
  });
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

// ── Reportar avistamientos al backend (corpus de JobOffer, §9.3) ─────────
// Fire-and-forget igual que reportarTitulosVistos: cada tarjeta vista, se
// postule, quede en gris o se descarte, alimenta el corpus de ofertas.
AP.reportarAvistamientos = function (avistamientos, plataforma) {
  if (!avistamientos || !avistamientos.length) return;
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_AVISTAMIENTOS', avistamientos: avistamientos, plataforma: plataforma });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background (avistamientos):', e);
  }
};

// ── Lo que evaluó el scorer (docs/revision-scorer-2026-09-30.md §6) ──
// Viaja con cada oferta que va a "Por decidir" y con cada descarte, para poder
// volver a correr el scorer sobre lo que la persona decidió
// (backend/scripts/banco-de-casos.ts). Se adjunta acá, sin tocar los
// adaptadores: se guarda la evaluación más reciente de cada título+empresa (la
// de la segunda pasada, con el aviso completo, pisa a la de la tarjeta).
const AP_MAX_ENTRADAS = 400;
const apEntradas = new Map();
function apClaveEntrada(titulo, empresa) { return AP.n(titulo || '') + '|' + AP.n(empresa || ''); }
function apRecordarEntrada(campos, resultado, scorerCfg) {
  const entrada = {
    titulo: String((campos && campos.titulo) || '').slice(0, 300),
    empresa: String((campos && campos.empresa) || '').slice(0, 200),
    ubicacion: String((campos && campos.ubicacion) || '').slice(0, 200),
    cuerpo: String((campos && campos.cuerpo) || '').slice(0, 4000),
    versionPerfil: scorerCfg && scorerCfg.versionPerfil != null ? scorerCfg.versionPerfil : null,
  };
  const clave = apClaveEntrada(entrada.titulo, entrada.empresa);
  apEntradas.delete(clave);
  apEntradas.set(clave, { entrada, score: resultado.score });
  if (apEntradas.size > AP_MAX_ENTRADAS) apEntradas.delete(apEntradas.keys().next().value);
  return entrada;
}
function apEntradaGuardada(titulo, empresa) { return apEntradas.get(apClaveEntrada(titulo, empresa)) || null; }

// ── Reportar descartes con su razón (docs/estrategia-y-rediseno.md §5.2) ──
// Fire-and-forget como los avistamientos: el panel muestra cuáles dejó fuera
// y por qué, y la persona puede corregir un descarte ("No era así"). Un
// duplicado no lo descartó el scorer (la evaluación guardada es la que lo dio
// por bueno), así que viaja sin ella.
AP.reportarDescartes = function (descartes, plataforma) {
  if (!descartes || !descartes.length) return;
  const conEntrada = descartes.map((d) => {
    if (!d || d.entrada || (d.razon && d.razon.tipo === 'duplicado')) return d;
    const guardada = apEntradaGuardada(d.titulo, d.empresa);
    return guardada ? Object.assign({}, d, { entrada: guardada.entrada, score: guardada.score }) : d;
  });
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_DESCARTES', descartes: conEntrada, plataforma: plataforma });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background (descartes):', e);
  }
};

// ── Reportar oferta en banda gris al backend (scorer local, §6) ──────────
AP.reportarBandaGris = function (oferta) {
  const guardada = oferta && !oferta.entrada ? apEntradaGuardada(oferta.titulo, oferta.empresa) : null;
  if (guardada) oferta = Object.assign({}, oferta, { entrada: guardada.entrada });
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_BANDA_GRIS', oferta: oferta });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background (banda gris):', e);
  }
};

// ── Las que habría postulado (docs/primera-busqueda-guiada.md §11) ──────
// En modo "solo mirar", lo que calzaba quedaba solo en el historial de este
// navegador: el panel no podía decir cuáles ni cuántas. Fire-and-forget como
// los descartes. Cada una: { externalId, titulo, empresa, url, razon, score }.
AP.reportarObservadas = function (ofertas, plataforma) {
  if (!ofertas || !ofertas.length) return;
  try {
    chrome.runtime.sendMessage({ type: 'REPORTAR_OBSERVADAS', ofertas: ofertas, plataforma: plataforma });
  } catch (e) {
    console.warn('[AP] No se pudo avisar al background (observadas):', e);
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

// ── ¿Se puede postular ahora? (docs/revision-2026-09-16.md §1.3) ─────────
// Se consulta antes de cada tanda de "Postulando:" -- si el mes ya se acabó
// el cupo, o el portal no está conectado en el plan, corta el escaneo antes
// de hacer un solo clic. Si algo falla en el camino (sin red, sin token),
// resuelve permitido:true: /api/applications valida lo mismo después como
// defensa en profundidad, así que fallar acá no debe trabar el escaneo.
AP.puedePostular = function (plataforma) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'PUEDE_POSTULAR', plataforma: plataforma }, (respuesta) => {
        if (chrome.runtime.lastError || !respuesta) { resolve({ permitido: true, motivo: null, restantes: null }); return; }
        resolve(respuesta);
      });
    } catch (e) { resolve({ permitido: true, motivo: null, restantes: null }); }
  });
};

// ── Duplicados (docs/revision-2026-09-16.md §2.8) ─────────────────────
// El mismo cargo de la misma empresa aparece con ids distintos: repetido en la
// misma página, o republicado días después (Laborum: 3 postulaciones el mismo
// día a "Asesor Comercial Remoto | AVAN-C Chile"). Clave: título + empresa
// normalizados; sin empresa, título + el mismo día (un título solo es
// demasiado poco para llamarlo "el mismo aviso").
AP.claveDuplicado = function (titulo, empresa) {
  const limpiar = (s) => AP.n(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const t = limpiar(String(titulo || '').split('\n')[0]);
  if (!t) return null;
  const e = limpiar(empresa);
  return e ? t + '|' + e : t + '||' + new Date().toDateString();
};

AP.formatearFechaCorta = function (iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

// Quita de `pendientes` (ítems con .titulo y .empresa) lo que ya está
// repetido en este mismo escaneo o ya se postuló en los últimos 30 días según
// el backend. `alDescartar(item, razon)` deja que cada adaptador registre el
// descarte a su manera (log, conteos, vistos). Si el backend no responde, solo
// rige el filtro local: no trabar el escaneo por esto.
AP.quitarDuplicados = async function (plataforma, pendientes, alDescartar) {
  if (!pendientes.length) return pendientes;

  const vistas = new Set();
  const unicas = [];
  for (const p of pendientes) {
    const clave = AP.claveDuplicado(p.titulo, p.empresa);
    if (clave && vistas.has(clave)) { alDescartar(p, { tipo: 'duplicado', fecha: null }); continue; }
    if (clave) vistas.add(clave);
    unicas.push(p);
  }

  const previas = await new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({
        type: 'DUPLICADOS', plataforma: plataforma,
        ofertas: unicas.map(p => ({ titulo: p.titulo, empresa: p.empresa || null })),
      }, (respuesta) => {
        if (chrome.runtime.lastError || !respuesta || !Array.isArray(respuesta.duplicados)) { resolve([]); return; }
        resolve(respuesta.duplicados);
      });
    } catch (e) { resolve([]); }
  });
  const fechas = new Map(previas.map(d => [d.indice, d.fecha]));
  return unicas.filter((p, i) => {
    if (!fechas.has(i)) return true;
    alDescartar(p, { tipo: 'duplicado', fecha: fechas.get(i) });
    return false;
  });
};

// Texto corto y accionable para cada motivo de rechazo -- compartido por los
// tres adaptadores para no repetir el mismo switch tres veces.
AP.motivoPuedePostular = function (motivo) {
  if (motivo === 'limite') return 'Usaste todas tus postulaciones del mes — no se va a postular';
  if (motivo === 'portal') return 'Este portal no está conectado en tu plan — no se va a postular';
  if (motivo === 'prueba_terminada') return 'La prueba de postulaciones automáticas terminó — no se va a postular';
  return 'No se puede postular ahora';
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
  // "pt" a secas: abreviatura real en avisos chilenos ("PT 20 hrs", visto en
  // trabajando.com) -- segura acá porque apConstruirPatron exige límite de
  // palabra completa (\bpt\b), así que no calza dentro de "septiembre" ni
  // "aceptar".
  part_time: ['part time', 'media jornada', 'jornada parcial', 'medio tiempo', 'pt'],
};
// "PT20", "PT 25 hrs", "PT30HRS" (part time de N horas) y "FT42" (full time de
// 42 horas): así titulan sus ofertas Sodimac, Paris y otras en trabajando.com
// (verificado en vivo el 2026-09-30). "pt" con límite de palabra no los calza:
// va pegado al número. Se prueban sobre texto ya normalizado (AP.n).
const AP_JORNADA_CON_HORAS = {
  part_time: /\bpt\s*\d{1,2}(?!\d)/,
  full_time: /\bft\s*\d{2}(?!\d)/,
};
// Las horas a secas, solo en el TÍTULO (2026-10-01): "Vendedor/a 30 hrs
// RayBan", "Vendedor 20 horas - La Dehesa", "Vendedora volante 30hrs pm" y,
// dentro del filtro part time de Computrabajo, "Vendedor/a Dermocosmética 42
// hrs". En Chile la jornada parcial es de hasta 30 horas semanales (Código del
// Trabajo, art. 40 bis) y la completa, de 40 a 45; "3HRS DIARIAS" es parcial y
// "8 horas diarias", completa. En la descripción no: "de 9 a 18 hrs" es un
// horario. Tampoco cuenta 24 ("farmacia 24 horas") ni lo que viene después de
// " a ", " hasta " o un guion ("de 10 a 18 hrs", "10-18 hrs"); la "a" tiene que
// ir suelta, porque "Vendedor/a 30 hrs" sí es una jornada.
const AP_JORNADA_HORAS_TITULO = {
  part_time: /(?<!\sa\s|\shasta\s|[-–]\s?)\b(?:1[5-9]|2[0-35-9]|30)\s*(?:hrs?|horas|hs)\b(?!\.?\s*diari)|\b[1-6]\s*(?:hrs?|horas|hs)\.?\s*diari/,
  full_time: /\b4[0-5]\s*(?:hrs?|horas|hs)\b(?!\.?\s*diari)|\b(?:8|9|10)\s*(?:hrs?|horas|hs)\.?\s*diari/,
};

// ── Modo "cualquier trabajo" (docs/amplitud-de-busqueda.md §5) ──
// Sin rol que filtre, el puntaje partiría en 0 y todo se descartaría. La base
// la da haber pasado vetos, ubicación, jornada y requisitos; un rol que igual
// calce suma por encima de ella.
const AP_BASE_ABIERTO = 60;

// Lo que un aviso EXIGE. Es lo único que reemplaza al rol como protección en
// modo abierto: sin esto, la persona quema su cupo del mes en avisos donde no
// la iban a llamar. Los patrones son estrechos a propósito -- la duda no
// descarta, y un requisito que no se reconoce simplemente no se aplica.
const AP_REQUISITOS = [
  {
    clave: 'titulo',
    patrones: [
      /\btitulo (profesional|universitario|tecnico de nivel superior)\b/,
      /\bprofesional titulad[oa]\b/,
      /\bcarrera (profesional|universitaria)\b/,
    ],
  },
  {
    clave: 'licencia',
    patrones: [
      /\blicencia(?: de conducir)?(?: clase)? a\s*-?\s*[1-5]\b/,
      /\blicencia(?: de conducir)?(?: clase)? d\b/,
    ],
  },
  { clave: 'ingles', patrones: [/\bingles (avanzado|intermedio|fluido)\b/, /\bbilingue\b/] },
];

// Devuelve la clave del requisito excluyente que el aviso pide y la persona no
// acredita, o null. `tiene` viene del backend (lib/requisitos-cv.ts); si no
// viene -- perfil viejo, o CV sin texto -- no se descarta nada.
function apRequisitoFaltante(texto, tiene) {
  if (!tiene) return null;
  for (const requisito of AP_REQUISITOS) {
    if (!requisito.patrones.some((rx) => rx.test(texto))) continue;
    if (requisito.clave === 'titulo' && tiene.titulo) continue;
    if (requisito.clave === 'ingles' && tiene.ingles) continue;
    if (requisito.clave === 'licencia') {
      const clases = tiene.licencias || [];
      // Pide una licencia profesional (A o D): basta con acreditar alguna.
      if (clases.some((c) => c === 'd' || String(c).startsWith('a'))) continue;
    }
    return requisito.clave;
  }
  return null;
}

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
  // §1.1 (docs/revision-2026-09-16.md): sin incTags, esto devolvía `true`
  // para cualquier oferta -- una cuenta nueva sin palabras configuradas
  // "pasaba" el filtro entero y postulaba a todo. Una lista vacía significa
  // "no sé qué buscas", no "acepto todo".
  if (!cfg.incTags || !cfg.incTags.length) return false;
  {
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

// Sufijador de género/plural (§6). Bug real encontrado en revisión el
// 2026-09-04: la versión anterior AGREGABA el sufijo sin sacar la vocal
// final, así que para palabras en -o generaba "cajeroa"/"cajeroes" pero
// nunca "cajera" ni "cajeros" -- 7 de 16 títulos comunes (cajera, cajeros,
// operarios, bodegueros, electricistas...) daban falso negativo silencioso:
// la oferta caía a banda 'descartar' sin que el usuario se enterara de que
// existió. Corregido sacando la vocal final antes de flexionar.
function apPatronPalabra(palabra) {
  const escapada = apEscaparRegex(palabra);
  // Muy corta: no flexionar -- recortarle la vocal final a algo como "pt" o
  // "de" genera un patrón que matchea casi cualquier cosa.
  if (palabra.length < 4) return escapada;
  // -or: vendedor -> vendedor/a/es/as (acá el sufijo sí se agrega, no se
  // saca nada de la raíz).
  if (/^[a-z]+or$/.test(palabra)) return escapada + '(?:a|es|as)?';
  // -ista / -e: electricista -> +s ; jefe -> jefes.
  if (/^[a-z]+(ista|e)$/.test(palabra)) return escapada + 's?';
  // -o: cajero -> "cajer" + o/a/os/as (acá SÍ hay que sacar la "o" final).
  if (/^[a-z]+o$/.test(palabra)) return apEscaparRegex(palabra.slice(0, -1)) + '(?:o|a|os|as)';
  // -a: cajera -> misma raíz que el caso anterior.
  if (/^[a-z]+a$/.test(palabra)) return apEscaparRegex(palabra.slice(0, -1)) + '(?:o|a|os|as)';
  // Termina en consonante (chofer, auxiliar): +es.
  if (/^[a-z]*[bcdfglmnprstvz]$/.test(palabra)) return escapada + '(?:es)?';
  return escapada;
}

// Bug real encontrado en vivo el 2026-09-14: avisos chilenos marcan el género
// pegado a la PRIMERA palabra de una frase de varias ("Ejecutivo(a) de
// Ventas", "Asesor/a de Ventas") -- el "(a)"/"/a" quedaba justo donde este
// patrón exigía "\s+" entre palabras, así que la frase completa nunca
// coincidía aunque el título calzara perfecto (se verificó contra
// Computrabajo real: "Ejecutivo(a) de Ventas Retail" caía a "sin_rol" pese a
// tener "ejecutivo de ventas" como sinónimo exacto configurado). Se permite
// este ruido de género, opcional, entre cada par de palabras.
const AP_RUIDO_GENERO = '(?:\\s*[/(][ao]s?\\)?)?';

// docs/amplitud-de-busqueda.md §2.3: los avisos chilenos meten preposiciones
// cortas entre las palabras de un cargo ("vendedor DE retail", "asesor DE
// ventas") -- un patrón de varias palabras exigía que fueran las únicas,
// pegadas, y "vendedor retail" nunca calzaba con "Vendedor de Retail". Se
// permiten hasta 2 palabras cortas (<=4 letras: de, en, para...) de enlace
// entre cada par, no palabras arbitrarias -- así "vendedor retail" calza con
// "vendedor de retail" pero no con "vendedor de repuestos para retail".
const AP_ENLACE_CORTO = '(?:\\s+\\w{1,4}){0,2}';

// Frase completa con límites de palabra, nunca subcadena (§6, mismo bug que
// tenía coincideFiltros con "aseo"/"paseo"). El texto de entrada ya debe venir
// normalizado con AP.n antes de construir/usar este patrón.
//
// El separador entre palabras es "[\s-]+" y no solo "\s+" -- bug real
// encontrado en vivo el 2026-09-29: avisos de trabajando.com escriben
// "Part-Time" con guion pegado, así que un patrón de dos palabras como
// "part time" nunca calzaba contra el título aunque la oferta SÍ fuera part
// time, y la jornada declarada (§3b, más abajo) quedaba como "no se pudo
// saber" en vez de confirmada -- toda la búsqueda de un rol part time
// terminaba en banda gris.
function apConstruirPatron(patronNormalizado, palabraAPatron) {
  const palabras = patronNormalizado.split(/\s+/).filter(Boolean).map(palabraAPatron || apPatronPalabra);
  if (!palabras.length) return null;
  return new RegExp('\\b' + palabras.join(AP_RUIDO_GENERO + AP_ENLACE_CORTO + '[\\s-]+') + '\\b');
}

// Las señales solo aceptan el plural, no el otro género
// (docs/revision-scorer-2026-09-30.md §2.4). Un cargo cambia de género
// ("cajero"/"cajera") y un rol o un veto lo necesitan; una señal es un
// sustantivo del rubro, y con el otro género pasa a ser otra palabra: "moda"
// calzaba con "modo" ("atiende de modo cordial" sumaba puntos con el perfil
// real de Roberto) y "calzado" con "calzada".
function apPatronPalabraSoloPlural(palabra) {
  const escapada = apEscaparRegex(palabra);
  if (palabra.length < 4) return escapada;
  if (/[aeiou]$/.test(palabra)) return escapada + 's?';
  if (/[bcdfglmnprstvz]$/.test(palabra)) return escapada + '(?:es)?';
  return escapada;
}

// ── Comuna conocida de una oferta (docs/revision-2026-09-16.md §2.1, punto 4) ──
// AP.COMUNAS_CL (data/comunas-cl.js, cargado antes que este archivo) trae las
// comunas normalizadas (minúsculas, sin tildes) con su región. ubicacionNorm
// y tituloNorm ya deben venir normalizados con AP.n.
//
// Formatos reales verificados en vivo (2026-09-16/17): Computrabajo
// "santiago - providencia, r.metropolitana" (con guion) o "san bernardo,
// r.metropolitana" (sin guion); Laborum "providencia, región metropolitana";
// Trabajando "pudahuel, metropolitana de santiago" -- los tres calzan con
// UNA sola regla: si hay " - ", la comuna es lo que sigue al ÚLTIMO " - ";
// si no, es lo que va antes de la primera coma. Sin campo o sin calce ahí,
// se busca cualquier comuna conocida como palabra completa en el título.
function apExtraerComunaConocida(ubicacionNorm, tituloNorm) {
  const comunas = AP.COMUNAS_CL;
  if (!comunas || !comunas.length) return null;

  if (ubicacionNorm) {
    const idxGuion = ubicacionNorm.lastIndexOf(' - ');
    let candidato = idxGuion >= 0 ? ubicacionNorm.slice(idxGuion + 3) : ubicacionNorm;
    const idxComa = candidato.indexOf(',');
    if (idxComa >= 0) candidato = candidato.slice(0, idxComa);
    candidato = candidato.trim();
    const match = comunas.find((c) => c.nombre === candidato);
    if (match) return match;
  }

  if (tituloNorm) {
    for (const c of comunas) {
      const rx = apConstruirPatron(c.nombre);
      if (rx && rx.test(tituloNorm)) return c;
    }
  }
  return null;
}

// ── Región de una oferta (docs/revision-scorer-2026-09-30.md §2.5) ──
// Hay ofertas que dicen solo la región ("Región Metropolitana",
// "R.Metropolitana", "Metropolitana de Santiago", "Región V"). Se mira solo
// cuando no se reconoció ninguna comuna. Los números romanos van con límite
// de palabra: "region x" no calza dentro de "region xi" ni "region xiv".
// Reconocer una región puede DESCARTAR la oferta, así que los nombres que
// también son calles o lugares (Tarapacá, O'Higgins, Ñuble, Biobío, Los Ríos,
// Los Lagos, Magallanes) solo cuentan con "región" delante. Sin ella queda la
// duda, que deja la oferta en "Por decidir".
const AP_REGIONES_EN_TEXTO = [
  ['AP', /\barica y parinacota\b|\bregion xv\b|\bxv region\b/],
  ['TA', /\bregion (de )?tarapaca\b|\bregion i\b|\bi region\b/],
  ['AN', /\bregion (de )?antofagasta\b|\bregion ii\b|\bii region\b/],
  ['AT', /\bregion (de )?atacama\b|\bregion iii\b|\biii region\b/],
  ['CO', /\bregion (de )?coquimbo\b|\bregion iv\b|\biv region\b/],
  ['VA', /\bregion (de )?valparaiso\b|\bregion v\b|\bv region\b/],
  ['RM', /\bmetropolitana\b|\bgran santiago\b|\bregion xiii\b|\bxiii region\b|\brm\b/],
  ['OH', /\bregion (de |del )?(libertador )?(general |gral\.? )?(bernardo )?o'?\s?higgins\b|\bregion del libertador\b|\bregion vi\b|\bvi region\b/],
  ['ML', /\bregion (del )?maule\b|\bregion vii\b|\bvii region\b/],
  ['NB', /\bregion (de |del )?nuble\b|\bregion xvi\b|\bxvi region\b/],
  ['BI', /\bregion (de |del )?bio\s?-?bio\b|\bregion viii\b|\bviii region\b/],
  ['AR', /\baraucania\b|\bregion ix\b|\bix region\b/],
  ['LR', /\bregion (de )?los rios\b|\bregion xiv\b|\bxiv region\b/],
  ['LL', /\bregion (de )?los lagos\b|\bregion x\b|\bx region\b/],
  ['AI', /\baysen\b|\baisen\b|\bregion xi\b|\bxi region\b/],
  ['MA', /\bregion (de )?magallanes\b|\bregion xii\b|\bxii region\b/],
];

function apRegionesEnTexto(ubicacionNorm) {
  if (!ubicacionNorm) return [];
  return AP_REGIONES_EN_TEXTO.filter(([, rx]) => rx.test(ubicacionNorm)).map(([codigo]) => codigo);
}

// Qué regiones declaró la persona enteras (el 90% o más de sus entradas en
// AP.COMUNAS_CL: "toda la región" trae todas, con variantes y abreviaturas) y
// en cuáles tiene al menos una comuna. Se calcula una vez por perfil.
const AP_COBERTURA_DECLARADA = new WeakMap();
function apCoberturaDeclarada(ubicacionCfg) {
  if (AP_COBERTURA_DECLARADA.has(ubicacionCfg)) return AP_COBERTURA_DECLARADA.get(ubicacionCfg);
  const declaradas = new Set((ubicacionCfg.comunas || []).map((c) => AP.n(c)));
  const porRegion = new Map();
  for (const c of AP.COMUNAS_CL || []) {
    const r = porRegion.get(c.region) || { total: 0, declaradas: 0 };
    r.total++;
    if (declaradas.has(AP.n(c.nombre))) r.declaradas++;
    porRegion.set(c.region, r);
  }
  const enteras = new Set();
  const conAlguna = new Set();
  for (const [codigo, r] of porRegion) {
    if (r.declaradas > 0) conAlguna.add(codigo);
    if (r.total && r.declaradas / r.total >= 0.9) enteras.add(codigo);
  }
  const cobertura = { enteras, conAlguna };
  AP_COBERTURA_DECLARADA.set(ubicacionCfg, cobertura);
  return cobertura;
}

// §2.7: términos de jefatura/dirección en un título (ya normalizado, sin
// tildes). Mismos que backend/lib/nivel-cargo.ts. "Asistente de gerente" o
// "secretaria de gerencia" no son cargos directivos: se quita la frase antes.
const AP_NIVEL_DIRECTIVO = /\b(?:sub)?(?:gerent[ea]|director[a]?|jef[ea]|jefatura)\b|\bhead of\b/;
const AP_NIVEL_DE_APOYO = /\b(?:asistente|secretari[oa]|ayudante|apoyo)\s+(?:de|del|a|al)\s+(?:la\s+|el\s+)?(?:sub)?(?:gerent[ea]|director[a]?|jef[ea]|jefatura)\b/g;
function apTerminoDirectivo(tituloNorm) {
  const m = AP_NIVEL_DIRECTIVO.exec(tituloNorm.replace(AP_NIVEL_DE_APOYO, ' '));
  return m ? m[0] : null;
}

AP.puntuarOferta = function (campos, perfil) {
  const titulo = AP.n((campos && campos.titulo) || '');
  const empresa = AP.n((campos && campos.empresa) || '');
  const cuerpo = AP.n((campos && campos.cuerpo) || '');
  const ubicacion = AP.n((campos && campos.ubicacion) || '');
  const razones = [];

  // soloPlural: las señales (ver apPatronPalabraSoloPlural).
  function buscar(patronTexto, soloPlural) {
    const rx = apConstruirPatron(AP.n(patronTexto || ''), soloPlural ? apPatronPalabraSoloPlural : null);
    if (!rx) return { coincide: false };
    const enTitulo = rx.test(titulo);
    const enEmpresa = rx.test(empresa);
    const enCuerpo = rx.test(cuerpo);
    return { coincide: enTitulo || enEmpresa || enCuerpo, enTitulo, enEmpresa, enCuerpo };
  }

  perfil = perfil || {};
  // docs/amplitud-de-busqueda.md §5: en modo "cualquier trabajo" el eje deja de
  // ser el rol y pasa a ser las condiciones (comuna, jornada, vetos, requisitos).
  const modoAbierto = perfil.modo === 'abierto';

  // docs/revision-scorer-2026-09-30.md §3-§5: el puntaje responde UNA pregunta,
  // "¿es lo que busco?" (el rol), y las señales de gusto lo mueven. "¿Puedo
  // tomarlo?" (vetos, requisitos, nivel, comuna, jornada) son COMPUERTAS: o
  // descartan de golpe, o ponen un TOPE -- la oferta no puede pasar de "Por
  // decidir" -- pero nunca suman ni restan puntos. Antes la duda de ubicación
  // restaba 40 y un veto en la descripción 60, y cualquier señal los podía
  // devolver: "Vendedor de tienda part time" con la comuna ilegible postulaba
  // solo. Los topes se juntan al final (paso 9).

  // 1. Vetos -- si calzan en el título o la empresa, descartan con la misma
  // certeza de siempre. Si calzan SOLO en el cuerpo, no descartan (revisión del
  // 2026-09-04: el problema de polaridad -- una mención de pasada en la
  // descripción mataba un aviso bueno): desde 2026-09-30 son un tope (paso 9),
  // y la oferta queda en "Por decidir". Antes restaban 60, que casi siempre
  // terminaba en descartar igual.
  const vetos = perfil.vetos || [];
  let vetoCuerpo = null;
  for (const veto of vetos) {
    const resultado = buscar(veto.patron);
    if (!resultado.coincide) continue;
    if (resultado.enTitulo || resultado.enEmpresa) {
      // §C: objeto estructurado con el patrón y dónde matcheó, no un string
      // ya armado -- para que cada superficie lo formatee a su manera.
      return {
        score: 0, banda: 'descartar',
        razones: [{ tipo: 'veto', patron: veto.patron, razon: veto.razon || ('no cumple: ' + veto.patron), donde: resultado.enTitulo ? 'titulo' : 'empresa' }],
      };
    }
    if (!vetoCuerpo) vetoCuerpo = { tipo: 'veto', patron: veto.patron, razon: veto.razon || ('posible: ' + veto.patron), donde: 'cuerpo' };
  }

  // 2. Requisitos excluyentes (docs/amplitud-de-busqueda.md §5). Solo en modo
  // abierto: en los otros modos el rol ya hace de filtro, y aplicarlo siempre
  // le escondería a la persona ofertas de SU rubro por una mención suelta.
  if (modoAbierto) {
    const faltante = apRequisitoFaltante(titulo + ' ' + empresa + ' ' + cuerpo, perfil.tiene);
    if (faltante) {
      return { score: 0, banda: 'descartar', razones: [{ tipo: 'requisito', que: faltante }] };
    }
  }

  // 3. Nivel del cargo (docs/revision-2026-09-16.md §2.7). El rol "ventas"
  // calzaba con "Gerente Comercial" y "Subgerente de ventas" -- el nivel no se
  // miraba. Es solo por título, determinista: perfil.nivelDirectivo lo pone el
  // backend según el CIUO de los objetivos declarados (true = busca ese nivel,
  // false = no, ausente/null = no se sabe). Sin certeza, tope (paso 9).
  let nivelIncierto = null;
  if (perfil.nivelDirectivo !== true) {
    const terminoNivel = apTerminoDirectivo(titulo);
    if (terminoNivel) {
      if (perfil.nivelDirectivo === false) {
        return { score: 0, banda: 'descartar', razones: [{ tipo: 'nivel', termino: terminoNivel }] };
      }
      nivelIncierto = { tipo: 'nivel', termino: terminoNivel, certeza: 'desconocida' };
    }
  }

  // 4. Ubicación (docs/revision-2026-09-16.md §2.1). AP.COMUNAS_CL reconoce la
  // comuna REAL de la oferta cuando se puede:
  //   comuna reconocida y DENTRO de lo declarado -> pasa
  //   comuna reconocida y FUERA de lo declarado  -> DESCARTAR (la persona ya
  //     dijo que esa zona no le sirve)
  //   sin comuna, pero con región (docs/revision-scorer-2026-09-30.md §2.5):
  //     declaró esa región entera -> pasa; ninguna comuna suya está ahí ->
  //     DESCARTAR; algunas sí -> no se sabe cuál, tope
  //   nada reconocible -> tope ("no sé" no es "no calza"; antes restaba 40)
  //   remoto + aceptaRemoto -> pasa
  //
  // Sin comunas declaradas no hay filtro de lugar, aunque acepte remoto: el
  // panel dice "TAMBIÉN acepto trabajo remoto". Antes aceptaRemoto solo bastaba
  // para entrar acá, y con la lista vacía toda oferta presencial con comuna
  // reconocida quedaba "fuera de tus comunas": marcar remoto era "solo remoto".
  let ubicacionIncierta = null;
  const ubicacionCfg = perfil.ubicacion || {};
  const comunasDeclaradas = ubicacionCfg.comunas || [];
  if (comunasDeclaradas.length) {
    const pareceRemoto = /\bremot[oa]\b/.test(cuerpo) || /\bremot[oa]\b/.test(titulo) || /\bremot[oa]\b/.test(ubicacion);
    if (!(ubicacionCfg.aceptaRemoto && pareceRemoto)) {
      const comunaOferta = apExtraerComunaConocida(ubicacion, titulo);
      if (comunaOferta) {
        const dentro = comunasDeclaradas.some((c) => AP.n(c) === comunaOferta.nombre);
        if (!dentro) {
          return {
            score: 0,
            banda: 'descartar',
            razones: [{ tipo: 'ubicacion', ofertaEn: comunaOferta.nombre, buscadas: comunasDeclaradas }],
          };
        }
      } else {
        const regiones = apRegionesEnTexto(ubicacion);
        const cobertura = apCoberturaDeclarada(ubicacionCfg);
        if (regiones.some((r) => cobertura.enteras.has(r))) {
          // Dentro: declaró esa región entera.
        } else if (regiones.length && regiones.every((r) => !cobertura.conAlguna.has(r))) {
          const nombres = AP.NOMBRE_REGION_CL || {};
          return {
            score: 0,
            banda: 'descartar',
            razones: [{ tipo: 'ubicacion', ofertaEn: nombres[regiones[0]] || regiones[0], region: regiones[0], buscadas: comunasDeclaradas }],
          };
        } else {
          ubicacionIncierta = { tipo: 'ubicacion_desconocida', ofertaEn: (campos && campos.ubicacion) || null };
        }
      }
    }
  }

  // 5. Jornada (docs/amplitud-de-busqueda.md §6). Existía en
  // SearchPreferences.jornada y compilar-perfil.ts lo guardaba en el perfil
  // compilado, pero el scorer nunca lo leía: alguien que declaró "solo part
  // time" igual recibía avisos de jornada completa. AP_KEYWORDS_JORNADA (con
  // el que trabajaba el filtro viejo) dice qué términos delatan cada jornada.
  //   aviso dice la jornada CONTRARIA a la declarada -> DESCARTAR
  //   aviso no dice ninguna de las dos                -> tope ("no sé" no es "no calza")
  //   aviso confirma la jornada declarada, o "cualquiera" -> pasa
  //
  // El TÍTULO manda sobre el resto del aviso (2026-09-30). Sodimac publica sus
  // ofertas part time en trabajando.com ("Vendedor/a Sodimac La Reina Jornada
  // PT20 hrs") con la ficha "Jornada Completa" y "turnos rotativos jornada
  // completa" en la descripción, y bastaba una mención de la contraria en
  // cualquier parte para descartar lo que el título decía que sí calza. Ahora:
  // si el título dice la declarada, calza (aunque diga las dos); si no, una
  // mención de la contraria en cualquier parte descarta, y si nada dice la
  // declarada queda la duda, como antes.
  let jornadaIncierta = null;
  const jornadaDeclarada = perfil.jornada;
  if (jornadaDeclarada === 'full_time' || jornadaDeclarada === 'part_time') {
    const contraria = jornadaDeclarada === 'full_time' ? 'part_time' : 'full_time';
    const dice = (jornada, soloTitulo) =>
      AP_KEYWORDS_JORNADA[jornada].some((k) => { const r = buscar(k); return soloTitulo ? r.enTitulo : r.coincide; }) ||
      AP_JORNADA_CON_HORAS[jornada].test(soloTitulo ? titulo : titulo + ' ' + empresa + ' ' + cuerpo) ||
      AP_JORNADA_HORAS_TITULO[jornada].test(titulo);
    if (!dice(jornadaDeclarada, true)) {
      if (dice(contraria, false)) {
        return { score: 0, banda: 'descartar', razones: [{ tipo: 'jornada', declarada: jornadaDeclarada }] };
      }
      if (!dice(jornadaDeclarada, false)) jornadaIncierta = { tipo: 'jornada_desconocida', declarada: jornadaDeclarada };
    }
  }

  // 6. Relevancia: el mejor calce de rol (canónico o sinónimo) × peso del rol,
  // con el campo donde calzó pesando más (título, luego empresa, luego cuerpo).
  // Los multiplicadores tienen que ser FACTORES <= 1: con peso=1 en título,
  // puntaje = 1*100*1 = 100 -- si el de título fuera >1 (como ×3), el clamp lo
  // iguala con cualquier otro campo que también llegue a >=100, y el peso del
  // rol deja de importar. Bug real encontrado en revisión el 2026-09-04: con el
  // ×3 de antes, "Bodeguero nocturno" en una empresa llamada "Vendedores
  // Unidos SpA" daba 100 y postulaba.
  const roles = perfil.roles || [];
  let score = 0;
  let mejorRol = null;
  for (const rol of roles) {
    const terminos = [rol.canonico].concat(rol.sinonimos || []).filter(Boolean);
    const peso = rol.peso != null ? rol.peso : 1;
    for (const termino of terminos) {
      const resultado = buscar(termino);
      if (!resultado.coincide) continue;
      const campo = resultado.enTitulo ? 'titulo' : resultado.enEmpresa ? 'empresa' : 'cuerpo';
      const multiplicadorCampo = resultado.enTitulo ? 1 : resultado.enEmpresa ? 0.35 : 0.3;
      const puntaje = peso * 100 * multiplicadorCampo;
      if (puntaje > score) {
        score = puntaje;
        mejorRol = { rol: rol.canonico, termino: termino, campo: campo };
      }
    }
  }
  score = Math.min(100, score);
  // §5: la base del modo abierto se aplica acá, después de los roles -- un rol
  // que igual calza (la persona declaró algo y además se abrió a todo) suma por
  // encima, no se pierde.
  if (modoAbierto) score = Math.max(score, AP_BASE_ABIERTO);
  if (mejorRol) {
    razones.push({ tipo: 'rol', rol: mejorRol.rol, termino: mejorRol.termino, campo: mejorRol.campo });
  } else if (modoAbierto) {
    razones.push({ tipo: 'modo_abierto' });
  } else if (roles.length) {
    razones.push({ tipo: 'sin_rol' });
  }

  // docs/revision-scorer-2026-09-30.md §4.1: un cargo mencionado de pasada en
  // la descripción (o en el nombre de la empresa) es una pista, no una
  // afirmación: sirve para no descartar, no para enviar. "Bodeguero Part Time
  // con comisiones" con "coordina con el vendedor de turno" postulaba con 80
  // (30 del rol + 50 de dos señales). En modo abierto el rol no es el eje, así
  // que no aplica.
  const rolFueraDelTitulo = !modoAbierto && mejorRol && mejorRol.campo !== 'titulo'
    ? { tipo: 'rol_fuera_del_titulo', rol: mejorRol.rol, termino: mejorRol.termino, campo: mejorRol.campo }
    : null;

  // 7. Señales: ajustes de gusto, mueven dentro de una banda. Las positivas
  // pesan según el campo donde calzan, igual que los roles (un +25 perdido en
  // la descripción empuja menos que en el título). Las NEGATIVAS pesan enteras
  // donde calcen (docs/revision-scorer-2026-09-30.md §4.3): las condiciones de
  // renta, turnos y contrato viven siempre en la descripción, y un -40 por
  // "comisión pura" quedaba en -12. Equivocarse hacia "no postular" es barato
  // (la persona la rescata en Por decidir); hacia "postular", no se deshace.
  const senales = perfil.senales || [];
  for (const senal of senales) {
    const resultado = buscar(senal.patron, true);
    if (!resultado.coincide) continue;
    const base = senal.delta || 0;
    const multiplicadorCampo = resultado.enTitulo ? 1 : resultado.enEmpresa ? 0.35 : 0.3;
    const delta = base < 0 ? base : Math.round(base * multiplicadorCampo);
    score += delta;
    razones.push({ tipo: 'senal', patron: senal.patron, delta: delta });
  }

  // 8. Banda por umbral.
  score = Math.max(0, Math.min(100, Math.round(score)));
  const umbralPostular = perfil.umbralPostular != null ? perfil.umbralPostular : 65;
  const umbralGris = perfil.umbralGris != null ? perfil.umbralGris : 45;
  let banda;
  if (score >= umbralPostular) banda = 'postular';
  else if (score <= umbralGris) banda = 'descartar';
  else banda = 'gris';

  // 9. Topes, todos en un solo lugar (§5): ninguno descarta, ninguno se
  // compensa con puntos, y con cualquiera la oferta no pasa de "Por decidir".
  // Van primero en las razones, que es lo que la persona tiene que mirar. Si el
  // puntaje ya la descartó, las dudas no cambian nada; solo el rol fuera del
  // título explica por qué el puntaje fue bajo, y va primero.
  const topes = [jornadaIncierta, nivelIncierto, ubicacionIncierta, vetoCuerpo, rolFueraDelTitulo].filter(Boolean);
  if (banda === 'descartar') {
    if (rolFueraDelTitulo) razones.unshift(rolFueraDelTitulo);
  } else if (topes.length) {
    razones.unshift(...topes);
    banda = 'gris';
  }

  if (!razones.length) razones.push({ tipo: 'sin_senales' });

  return { score: score, banda: banda, razones: razones };
};

// Portal-agnóstico: cada adaptador arma sus propios "campos" (título, empresa,
// cuerpo, ubicación -- lo que pueda leer sin abrir el aviso) y llama acá. Si
// el scorer local está activo (AP.cfg.scorer.usarScorerLocal) y hay perfil
// compilado, puntúa con AP.puntuarOferta. Si no, YA NO cae al filtro viejo
// para decidir 'postular' (§1.1, docs/revision-2026-09-16.md): una cuenta
// nueva de punta a punta, sin perfil compilado, habría postulado a 55/55
// ofertas reales en los 3 portales (comunas que la persona pidió evitar,
// turnos de noche) porque coincideFiltros con todo vacío devolvía `true`
// para cualquier oferta. "Sin perfil" ya no es "acepto todo" -- es "no sé
// qué buscas", y eso va a gris, nunca a postular.
AP.evaluarOferta = function (campos) {
  const scorerCfg = AP.cfg && AP.cfg.scorer;
  if (scorerCfg && scorerCfg.usarScorerLocal && scorerCfg.perfilCompilado) {
    // Revisión externa 2026-09-05: si el perfil quedó desactualizado (una
    // recompilación forzada por cambio de objetivo falló -- ver
    // lib/compilar-perfil.ts), el puntaje puede estar mirando un rubro que
    // ya no es el real. En vez de confiar en él (postular o descartar mal
    // en silencio), todo va a banda gris hasta que se recompile bien --
    // mismo principio que "sin clasificar = incierto = preguntarle al
    // usuario" del §7.4 del rediseño.
    if (scorerCfg.perfilDesactualizado) {
      return {
        banda: 'gris',
        score: null,
        razones: ['tu perfil de búsqueda está desactualizado — revísalo en tu dashboard'],
        usoScorer: true,
      };
    }
    const resultado = AP.puntuarOferta(campos, scorerCfg.perfilCompilado);
    const entrada = apRecordarEntrada(campos, resultado, scorerCfg);
    return { banda: resultado.banda, score: resultado.score, razones: resultado.razones, usoScorer: true, entrada };
  }
  return {
    banda: 'gris',
    score: null,
    razones: [{ tipo: 'sin_perfil' }],
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

// Elige un <option> en su <select> como lo haría una persona: los portales
// validan con "change". Un <option> no se puede "clickear" -- seleccionarOpcion
// lo descarta por no tener layout propio (trabajando.com pregunta con <select>).
AP.elegirOpcion = function (opcion) {
  const sel = opcion && opcion.closest && opcion.closest('select');
  if (!sel) return false;
  sel.value = opcion.value;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
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
// Devuelve { analisis, respuestas: {[id]: string|null}, datosFaltantes: {[id]: string}, error }.
// datosFaltantes (§8.4, docs/revision-2026-09-16.md): la IA puede decir que
// una pregunta pide un hecho verificable (licencia, vehículo, renta...) que
// no está en el perfil, en vez de inventar un "sí"/"no" con el nombre de la
// persona -- ver la regla 1b del prompt en procesar-postulacion/route.ts.
AP.analizarYResponder = async function (contexto, preguntas) {
  if (!contexto) return { analisis: null, respuestas: {}, datosFaltantes: {}, error: null };
  const p = (AP.cfg && AP.cfg.perfil) || {};
  const info = (AP.cfg && AP.cfg.info || []).map(it => it.texto);
  // La IA puede tardar hasta ~25 s: se avisa antes y después (ver AP.latido).
  AP.latido();
  const data = await AP.llamarBackendIA('procesar_postulacion', {
    contexto, perfil: p, info, preguntas: preguntas || []
  });
  AP.latido();
  if (!data || data.error) return { analisis: null, respuestas: {}, datosFaltantes: {}, error: data && data.error };
  const respuestas = {};
  const datosFaltantes = {};
  (data.respuestas || []).forEach(r => {
    if (!r || !r.id) return;
    respuestas[r.id] = r.respuesta;
    if (r.datoFaltante) datosFaltantes[r.id] = r.datoFaltante;
  });
  return { analisis: data.analisis || null, respuestas, datosFaltantes, error: null };
};

// ── Panel de revisión antes de enviar (editable) — genérico, cualquier
//    adaptador puede mostrarlo pasándole su propio respuestasLog ──────
//
// Igual que el overlay: vive dentro del portal, así que va en un shadow
// root para que su CSS no nos deforme, y sobre tinta para que no se
// confunda con la página de abajo.
//
// `opciones.mensaje` (§2.10, docs/revision-2026-09-16.md) la convierte en una
// confirmación SIN respuestas -- para postulaciones que se envían con un solo
// clic, donde no hay formulario que revisar y el clic ya es el envío: el
// "Revisar antes de enviar" tiene que pedir el visto bueno ANTES de ese clic.
// docs/revision-2026-09-28.md §5: el panel de revisión avisa al background
// cuando se abre (y cada 20 segundos mientras sigue abierto: Chrome duerme el
// service worker a los 30 s sin eventos, y con él se perdería la pestaña que
// está esperando) y cuando se cierra.
// Las ráfagas y las aprobadas de "Por decidir" abren pestañas de fondo: sin
// esto, el panel quedaba en una pestaña que nadie veía, la ráfaga lo saltaba a
// los 3 minutos y la pestaña de una aprobada se cerraba a los 35 segundos.
// El background trae la pestaña al frente y le da tiempo.
AP.avisarRevision = function (enCurso) {
  try {
    chrome.runtime.sendMessage({ type: enCurso ? 'REVISION_EN_CURSO' : 'REVISION_TERMINADA' }, () => {
      if (chrome.runtime.lastError) { /* el service worker se está reiniciando */ }
    });
  } catch (e) { /* extensión recargada: esta pestaña quedó huérfana */ }
};

// "Sigo postulando en esta pestaña" (docs/extension-trabajando-2026-09-30.md).
// Los seguros de tiempo del background (90 s una aprobada de "Por decidir",
// 8 min un paso de ráfaga) vuelven a contar desde cero con cada aviso: una
// postulación con preguntas e IA en una pestaña de fondo los pasaba, y la
// pestaña se cerraba a la mitad del formulario.
AP.latido = function () {
  try {
    chrome.runtime.sendMessage({ type: 'POSTULANDO' }, () => {
      if (chrome.runtime.lastError) { /* el service worker se está reiniciando */ }
    });
  } catch (e) { /* extensión recargada: esta pestaña quedó huérfana */ }
};

// `opciones.titulo` y `opciones.limiteMs` (docs/extension-trabajando-2026-09-30.md):
// el mismo panel sirve para pedir solo lo que le falta a la IA, con su propio
// título y un plazo más corto. AP.revisionVencida dice si la última se cerró
// sola, por tiempo (quien la abrió sabe así que no había nadie mirando).
AP.mostrarRevision = function (titulo, respuestasLog, contexto, opciones) {
  const soloConfirmar = !!(opciones && opciones.mensaje);
  return new Promise(resolve => {
    document.getElementById('ap-revision-panel')?.remove();

    const host = document.createElement('div');
    host.id = 'ap-revision-panel';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483648';
    const raiz = host.attachShadow({ mode: 'open' });

    const esc = t => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const filas = respuestasLog.map((r, idx) => {
      // r.errorIA solo viene seteado cuando la llamada a la IA falló (límite del plan,
      // timeout, red, etc.) -- se distingue de r.vacia sin errorIA, que es cuando la IA
      // sí respondió pero no tenía el dato pedido.
      const esLimite = r.errorIA && /l[ií]mite/i.test(r.errorIA);
      let tono, etiqueta;
      if (esLimite) { tono = 'aviso'; etiqueta = 'Se acabó tu cupo de IA este mes: complétala tú'; }
      else if (r.errorIA) { tono = 'malo'; etiqueta = 'La IA no pudo responder (' + esc(r.errorIA) + '): complétala tú'; }
      // §8.4 (docs/revision-2026-09-16.md): distinto de "vacía" a secas --
      // acá la IA SÍ identificó qué falta (un hecho verificable que no está
      // en el perfil), pero decidió no inventarlo. Antes de esto no existía
      // esta distinción: o se inventaba un "sí"/"no" con el nombre de la
      // persona, o quedaba vacía sin decir por qué.
      else if (r.datoFaltante) { tono = 'aviso'; etiqueta = 'No está en tu perfil (' + esc(r.datoFaltante) + ') — complétalo'; }
      else if (r.vacia) { tono = 'malo'; etiqueta = 'Quedó vacía: complétala antes de enviar'; }
      else if (r.fueIA) { tono = 'bueno'; etiqueta = 'La escribió la IA con tu perfil: puedes editarla'; }
      else { tono = 'bueno'; etiqueta = 'Lista'; }

      const cabecera =
        '<p class="preg">' + esc((r.pregunta || '').slice(0, 140)) + '</p>' +
        '<p class="estado" data-tono="' + tono + '"><i></i>' + etiqueta + '</p>';

      if (r.tipo === 'opcion') {
        const opts = (r.opciones || []).map((o, oi) => {
          const sel = r.elegidoEl && o.el === r.elegidoEl ? ' selected' : '';
          return '<option value="' + oi + '"' + sel + '>' + esc((o.texto || '(opción sin texto)').slice(0, 80)) + '</option>';
        }).join('');
        // Una opción que la IA no podía elegir (licencia, disponibilidad...)
        // también se guarda en el perfil: antes solo se podía en las de texto,
        // y la misma pregunta de Sí/No volvía en cada oferta.
        const guardarOpcion = r.datoFaltante
          ? '<div class="arreglos"><button class="chip guardar ap-rev-guardar" data-idx="' + idx + '">Guardar esto en mi perfil</button></div>'
          : '';
        return '<div class="item" data-idx="' + idx + '" data-tipo="opcion">' + cabecera +
          '<select class="ap-rev-select" data-idx="' + idx + '">' +
            '<option value="-1"' + (r.elegidoEl ? '' : ' selected') + '>Sin elegir</option>' + opts +
          '</select>' + guardarOpcion + '</div>';
      }

      const max = (r.el && r.el.maxLength && r.el.maxLength > 0 && r.el.maxLength < 10000) ? r.el.maxLength : 500;
      // Arreglos de un clic (docs/estrategia-y-rediseno.md §6): lo que la
      // gente hace de verdad cuando una respuesta no le gusta es acortarla o
      // cambiarle el tono. Antes la única salida era borrarla y escribirla a
      // mano dentro del portal -- justo lo que vino a evitar el producto.
      const arreglos = r.datoFaltante
        // Si falta un dato, no hay nada que pulir: hay que decirlo una vez y
        // guardarlo, para no volver a encontrarse con la misma pregunta.
        ? '<div class="arreglos">' +
            '<button class="chip guardar ap-rev-guardar" data-idx="' + idx + '">Guardar esto en mi perfil</button>' +
          '</div>'
        : '<div class="arreglos">' +
            '<button class="chip ap-rev-ajuste" data-idx="' + idx + '" data-ajuste="corta">Más corta</button>' +
            '<button class="chip ap-rev-ajuste" data-idx="' + idx + '" data-ajuste="formal">Más formal</button>' +
            '<button class="chip ap-rev-ajuste" data-idx="' + idx + '" data-ajuste="cercana">Más cercana</button>' +
            '<button class="chip falso ap-rev-falso" data-idx="' + idx + '">Esto no es cierto</button>' +
          '</div>';
      return '<div class="item" data-idx="' + idx + '" data-tipo="texto">' + cabecera +
        '<textarea class="ap-rev-textarea" data-idx="' + idx + '" maxlength="' + max + '" rows="3">' +
          esc(r.respuesta || '') + '</textarea>' +
        '<p class="cuenta ap-rev-counter" data-idx="' + idx + '">' + (r.respuesta || '').length + ' / ' + max + '</p>' +
        arreglos +
      '</div>';
    }).join('');

    raiz.innerHTML =
      '<style>' +
      ':host,*{box-sizing:border-box}' +
      '.velo{position:fixed;inset:0;background:rgba(15,14,22,.5);display:grid;place-items:center;padding:20px;' +
        'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '.panel{width:660px;max-width:100%;max-height:86vh;display:flex;flex-direction:column;' +
        'background:#F4F5F3;color:#16181A;border-radius:14px;overflow:hidden;' +
        'box-shadow:0 30px 80px -20px rgba(0,0,0,.6);animation:sube .3s cubic-bezier(.2,.8,.3,1)}' +
      '@keyframes sube{from{opacity:0;transform:translateY(12px)}}' +

      /* Cabecera de tinta: se lee al tiro como algo que no es el portal */
      '.cab{display:flex;align-items:center;gap:11px;padding:15px 20px;background:#16181A;color:#E9EBEA;cursor:move;user-select:none}' +
      '.marca{width:30px;height:30px;flex:none;border-radius:8px;background:#26292D;border:1.5px solid #3C4145;display:grid;place-items:center}' +
      '.marca svg{width:17px;height:17px;display:block}' +
      '.marca path{fill:none;stroke:#D6F24B;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}' +
      '.cab h2{margin:0;font-size:14.5px;font-weight:700;letter-spacing:-.01em}' +
      '.cab p{margin:1px 0 0;font-size:11.5px;color:#8E9599;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.agarre{margin-left:auto;flex:none;color:#3C4145;letter-spacing:2px;font-size:13px}' +

      /* Pestañas con el filo de destacador, igual que en el tablero */
      '.pest{display:flex;gap:2px;padding:0 20px;background:#F4F5F3;border-bottom:1px solid #DFE1DE}' +
      '.pest button{border:none;background:none;font:inherit;font-size:12.5px;font-weight:600;color:#5D6468;' +
        'padding:11px 13px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}' +
      '.pest button:hover{color:#16181A}' +
      '.pest button[aria-selected="true"]{color:#16181A;border-bottom-color:#D6F24B}' +

      '.cuerpo{flex:1;overflow-y:auto;padding:18px 20px}' +
      '.aviso{white-space:pre-wrap;font-size:12.5px;line-height:1.7;color:#43415A;max-width:74ch}' +

      '.item{margin-bottom:12px;padding:13px 14px;background:#fff;border:1px solid #DFE1DE;border-radius:10px}' +
      '.item:last-child{margin-bottom:0}' +
      '.preg{margin:0 0 7px;font-size:12.5px;font-weight:700;line-height:1.45}' +
      '.estado{margin:0 0 9px;display:flex;align-items:center;gap:6px;font-size:11px}' +
      '.estado i{width:6px;height:6px;border-radius:50%;flex:none;background:currentColor}' +
      '.estado[data-tono="bueno"]{color:#17784F}' +
      '.estado[data-tono="aviso"]{color:#9A5B00}' +
      '.estado[data-tono="malo"]{color:#B3283C}' +

      'textarea,select{width:100%;padding:9px 11px;font:inherit;font-size:12.5px;color:#16181A;' +
        'background:#FAFAF9;border:1px solid #DFE1DE;border-radius:8px;resize:vertical}' +
      'textarea:focus,select:focus{outline:none;border-color:#D6F24B;box-shadow:0 0 0 3px #26292D}' +
      '.cuenta{margin:4px 0 0;font-size:10.5px;color:#5D6468;text-align:right;font-variant-numeric:tabular-nums}' +
      '.arreglos{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
      '.chip{font:inherit;font-size:11.5px;font-weight:600;color:#3F4448;background:#FAFAF9;' +
        'border:1px solid #DFE1DE;border-radius:20px;padding:5px 11px;cursor:pointer}' +
      '.chip:hover:not(:disabled){border-color:#16181A;color:#16181A}' +
      '.chip:disabled{opacity:.5;cursor:default}' +
      '.chip.falso{margin-left:auto;color:#B3283C;border-color:#F0D5D9}' +
      '.chip.guardar{color:#17784F;border-color:#CCE3D8}' +
      '.vacio{color:#5D6468;font-size:12.5px;text-align:center;padding:20px}' +

      '.pie{display:flex;align-items:center;gap:10px;padding:14px 20px;background:#fff;border-top:1px solid #DFE1DE}' +
      '.btn{font:inherit;font-size:13px;font-weight:600;border-radius:9px;padding:11px 16px;cursor:pointer;' +
        'border:1px solid transparent;transition:transform .15s,box-shadow .2s}' +
      '.btn:active{transform:translateY(1px)}' +
      /* El destacador se gasta acá: es la decisión de la pantalla */
      '.btn.enviar{flex:1;background:#D6F24B;color:#16181A;border-color:#A8C023}' +
      '.btn.enviar:hover{transform:translateY(-1px);box-shadow:0 10px 20px -12px #A8C023}' +
      '.btn.saltar{background:#fff;color:#16181A;border-color:#C6C9C5}' +
      '.btn.saltar:hover{border-color:#16181A}' +
      '.reloj{font-size:11.5px;color:#5D6468;font-variant-numeric:tabular-nums}' +
      '.reloj b{color:#B3283C}' +
      '@media (prefers-reduced-motion:reduce){.panel{animation:none}}' +
      '</style>' +

      '<div class="velo">' +
        '<div class="panel" id="panel">' +
          '<div class="cab" id="ap-rev-header" title="Arrastra para mover el panel">' +
            '<span class="marca"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg></span>' +
            '<span style="min-width:0">' +
              '<h2>' + (soloConfirmar ? 'Confirma antes de postular' : esc((opciones && opciones.titulo) || 'Revisa antes de enviar')) + '</h2>' +
              '<p>' + esc(titulo.slice(0, 80)) + '</p>' +
            '</span>' +
            '<span class="agarre" aria-hidden="true">⋮⋮</span>' +
          '</div>' +

          '<div class="pest" role="tablist">' +
            '<button role="tab" aria-selected="true" class="ap-tab-btn" data-tab="respuestas">' +
              (soloConfirmar ? 'Postulación' : 'Respuestas (' + respuestasLog.length + ')') + '</button>' +
            '<button role="tab" aria-selected="false" class="ap-tab-btn" data-tab="aviso">El aviso completo</button>' +
          '</div>' +

          '<div class="cuerpo">' +
            '<div class="ap-tab-content" data-tab-content="respuestas">' +
              (filas || '<p class="vacio">' + esc(soloConfirmar ? opciones.mensaje : 'Este formulario no tenía preguntas que responder.') + '</p>') +
            '</div>' +
            '<div class="ap-tab-content" data-tab-content="aviso" style="display:none">' +
              '<div class="aviso">' + esc(contexto || 'El portal no entregó el texto del aviso.') + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="pie">' +
            '<button class="btn enviar" id="ap-rev-confirm">' + (soloConfirmar ? 'Sí, postular' : 'Confirmar y enviar') + '</button>' +
            '<button class="btn saltar" id="ap-rev-skip">Saltar esta oferta</button>' +
            '<span class="reloj" id="ap-rev-reloj"></span>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(host);
    AP.avisarRevision(true);
    const latidoRevision = setInterval(() => AP.avisarRevision(true), 20000);

    const panel = raiz.getElementById('panel');

    // -- Pestañas: por defecto se abren las respuestas, que es lo que hay
    //    que revisar. Antes abría el aviso completo, que es contexto. --
    raiz.querySelectorAll('.ap-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        raiz.querySelectorAll('.ap-tab-btn').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
        raiz.querySelectorAll('.ap-tab-content').forEach(c => {
          c.style.display = (c.dataset.tabContent === btn.dataset.tab) ? '' : 'none';
        });
      });
    });

    // -- Arrastrar desde la cabecera --
    const header = raiz.getElementById('ap-rev-header');
    let arrastrando = false, offX = 0, offY = 0;
    const onMouseMove = e => {
      if (!arrastrando) return;
      panel.style.left = (e.clientX - offX) + 'px';
      panel.style.top = (e.clientY - offY) + 'px';
    };
    const onMouseUp = () => { arrastrando = false; };
    header.addEventListener('mousedown', e => {
      const rect = panel.getBoundingClientRect();
      arrastrando = true;
      panel.style.position = 'fixed';
      panel.style.margin = '0';
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Contador de caracteres en vivo
    raiz.querySelectorAll('.ap-rev-textarea').forEach(ta => {
      ta.addEventListener('input', () => {
        const c = raiz.querySelector('.ap-rev-counter[data-idx="' + ta.dataset.idx + '"]');
        if (c) c.textContent = ta.value.length + ' / ' + ta.maxLength;
      });
    });

    // -- Arreglos de un clic --
    // Cada uno cambia el textarea en el momento; lo que se envía sale de
    // aplicarEdiciones() más abajo, así que no hay dos verdades.
    function textareaDe(idx) {
      return raiz.querySelector('.ap-rev-textarea[data-idx="' + idx + '"]');
    }
    function contarDe(idx) {
      const ta = textareaDe(idx);
      const c = raiz.querySelector('.ap-rev-counter[data-idx="' + idx + '"]');
      if (ta && c) c.textContent = ta.value.length + ' / ' + ta.maxLength;
    }
    function estadoDe(idx, tono, texto) {
      const item = raiz.querySelector('.item[data-idx="' + idx + '"]');
      const linea = item && item.querySelector('.estado');
      if (!linea) return;
      linea.dataset.tono = tono;
      linea.innerHTML = '<i></i>' + texto;
    }

    raiz.querySelectorAll('.ap-rev-ajuste').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.idx;
        const ta = textareaDe(idx);
        if (!ta || !ta.value.trim()) return;
        const hermanos = raiz.querySelectorAll('.item[data-idx="' + idx + '"] .chip');
        hermanos.forEach(b => { b.disabled = true; });
        const original = btn.textContent;
        btn.textContent = 'Arreglando…';
        chrome.runtime.sendMessage({
          type: 'REESCRIBIR_RESPUESTA',
          datos: {
            pregunta: (respuestasLog[idx] && respuestasLog[idx].pregunta) || '',
            respuesta: ta.value,
            ajuste: btn.dataset.ajuste,
            maxLargo: ta.maxLength,
          },
        }, (r) => {
          hermanos.forEach(b => { b.disabled = false; });
          btn.textContent = original;
          if (chrome.runtime.lastError || !r || !r.texto) {
            // Si la IA no pudo (cupo, red), se dice y se deja el texto que
            // había: perder lo escrito sería peor que no arreglarlo.
            estadoDe(idx, 'aviso', (r && r.error) ? esc(r.error) : 'No se pudo arreglar ahora: puedes editarla tú');
            return;
          }
          ta.value = r.texto;
          contarDe(idx);
          estadoDe(idx, 'bueno', 'La arreglaste con IA: revísala antes de enviar');
        });
      });
    });

    // "Esto no es cierto": no se arregla sola, se borra y queda a la vista que
    // hay que escribirla. Nada se envía con un dato que la persona desmintió.
    raiz.querySelectorAll('.ap-rev-falso').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.idx;
        const ta = textareaDe(idx);
        if (!ta) return;
        ta.value = '';
        contarDe(idx);
        estadoDe(idx, 'malo', 'La borraste: escríbela tú antes de enviar');
        ta.focus();
      });
    });

    // "Guardar esto en mi perfil": el dato que faltaba se guarda en la cuenta
    // (§6), así la próxima vez la IA ya lo tiene y no vuelve a preguntar.
    raiz.querySelectorAll('.ap-rev-guardar').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.idx;
        const entry = respuestasLog[idx] || {};
        let texto = '';
        if (entry.tipo === 'opcion') {
          const sel = raiz.querySelector('.ap-rev-select[data-idx="' + idx + '"]');
          const oi = sel ? +sel.value : -1;
          texto = oi >= 0 && entry.opciones && entry.opciones[oi] ? (entry.opciones[oi].texto || '').trim() : '';
        } else {
          const ta = textareaDe(idx);
          texto = ta ? ta.value.trim() : '';
        }
        if (!texto) {
          estadoDe(idx, 'aviso', entry.tipo === 'opcion' ? 'Elige primero la respuesta y después guárdala' : 'Escribe primero la respuesta y después guárdala');
          return;
        }
        // Se guarda con lo que es: "Si" o "$800.000" sueltos no le dicen nada a
        // la IA la próxima vez; "licencia clase B: Si" sí.
        const dato = (entry.datoFaltante || '').trim();
        const paraGuardar = dato && !AP.n(texto).includes(AP.n(dato)) ? dato + ': ' + texto : texto;
        btn.disabled = true;
        chrome.runtime.sendMessage({ type: 'GUARDAR_DATO', texto: paraGuardar }, (r) => {
          if (chrome.runtime.lastError || !r || !r.ok) {
            btn.disabled = false;
            estadoDe(idx, 'aviso', 'No se pudo guardar en tu perfil: la respuesta se envía igual');
            return;
          }
          // La próxima oferta de esta misma pestaña ya responde con el dato.
          if (Array.isArray(r.infoAdicional) && AP.cfg) AP.cfg.info = r.infoAdicional;
          btn.textContent = 'Guardado en tu perfil';
          estadoDe(idx, 'bueno', 'Queda en tu perfil: no te lo vamos a volver a preguntar');
        });
      });
    });

    function aplicarEdiciones() {
      raiz.querySelectorAll('.ap-rev-textarea').forEach(ta => {
        const idx = +ta.dataset.idx;
        const entry = respuestasLog[idx];
        if (!entry) return;
        const val = AP.limitarTexto(ta.value, entry.el);
        if (entry.el) AP.setVal(entry.el, val);
        entry.respuesta = val;
        entry.vacia = !val;
      });
      raiz.querySelectorAll('.ap-rev-select').forEach(sel => {
        const idx = +sel.dataset.idx;
        const entry = respuestasLog[idx];
        if (!entry) return;
        const oi = +sel.value;
        if (oi >= 0 && entry.opciones && entry.opciones[oi]) {
          const nueva = entry.opciones[oi];
          if (nueva.el !== entry.elegidoEl) {
            if (nueva.el && nueva.el.tagName === 'OPTION') AP.elegirOpcion(nueva.el);
            else AP.seleccionarOpcion(nueva.el);
          }
          entry.elegidoEl = nueva.el;
          entry.respuesta = nueva.texto;
          entry.vacia = false;
        } else {
          // "Sin elegir" en un <select>: también se vacía en la página, si no
          // se enviaba igual la opción que había puesto la IA.
          const selPagina = entry.elegidoEl && entry.elegidoEl.tagName === 'OPTION' && entry.elegidoEl.closest('select');
          if (selPagina) {
            selPagina.value = '';
            selPagina.dispatchEvent(new Event('input', { bubbles: true }));
            selPagina.dispatchEvent(new Event('change', { bubbles: true }));
          }
          entry.elegidoEl = null;
          entry.vacia = true;
          entry.respuesta = '';
        }
      });
    }

    // -- Cuenta regresiva --
    // Cuenta regresiva de 3 minutos, visible; los últimos 30 segundos se
    // marcan en rojo. Al llegar a cero la oferta se salta (ver abajo).
    const LIMITE_MS = (opciones && opciones.limiteMs) || 180000;
    const vence = Date.now() + LIMITE_MS;
    AP.revisionVencida = false;
    const reloj = raiz.getElementById('ap-rev-reloj');
    let tic = null;

    function pintarReloj() {
      const restan = Math.max(0, Math.round((vence - Date.now()) / 1000));
      const mm = Math.floor(restan / 60), ss = String(restan % 60).padStart(2, '0');
      reloj.innerHTML = restan <= 30
        ? 'Se salta sola en <b>' + mm + ':' + ss + '</b>'
        : 'Se salta sola en ' + mm + ':' + ss;
      // §2.10 (docs/revision-2026-09-16.md): al vencer se SALTA la oferta, no
      // se envía. Antes se auto-confirmaba y mandaba la postulación: "Revisar
      // antes de enviar" no garantizaba revisión (te ibas a buscar un café y
      // volvías con la postulación mandada), y los Términos (§5) prometen
      // que se puede leer y editar cada respuesta ANTES de que se envíe.
      if (restan <= 0) { AP.revisionVencida = true; cerrar('skip'); }
    }
    pintarReloj();
    tic = setInterval(pintarReloj, 1000);

    function cerrar(resultado) {
      clearInterval(tic);
      clearInterval(latidoRevision);
      AP.avisarRevision(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (resultado === 'confirm') aplicarEdiciones();
      host.remove();
      resolve(resultado);
    }

    raiz.getElementById('ap-rev-confirm').onclick = () => cerrar('confirm');
    raiz.getElementById('ap-rev-skip').onclick = () => cerrar('skip');
  });
};

// §5 (docs/revision-2026-09-16.md): en Computrabajo cada oferta quedaba
// registrada DOS veces en un mismo escaneo (40 líneas para 20 tarjetas). Un
// escaneo tiene esperas largas (abrir avisos, revisar grises) durante las que
// el MutationObserver de abajo -- o el AUTO_SCAN de la ráfaga, que llega ~2 s
// después del arranque propio -- lanza OTRO escaneo sobre las mismas
// tarjetas, todavía no marcadas como vistas. Además de ensuciar el log, dos
// escaneos a la vez podían postular dos veces la misma oferta. Mientras uno
// corre, los demás disparos se ignoran; el tope de 10 min evita que un
// escaneo colgado bloquee para siempre a la pestaña.
AP.sinReentrada = function (escanear) {
  const TOPE_MS = 10 * 60 * 1000;
  return function () {
    if (AP._escaneandoDesde && Date.now() - AP._escaneandoDesde < TOPE_MS) return;
    AP._escaneandoDesde = Date.now();
    return Promise.resolve(escanear()).finally(() => { AP._escaneandoDesde = 0; });
  };
};

// §2.10: pide confirmación antes del clic que envía una postulación de un
// solo paso. Devuelve 'confirm' o 'skip' (también si vence el tiempo).
AP.confirmarAntesDeEnviar = function (titulo, contexto, mensaje) {
  return AP.mostrarRevision(titulo, [], contexto, { mensaje: mensaje });
};

// ── Mensajería compartida ──────────────────────────────────────────
// El escaneo disparado por la búsqueda automática (background) y el
// toggle/config no dependen del portal — solo necesitan que el adaptador
// ya haya definido AP.escanear.
// AP.escaneoPedido: AUTO_SCAN (la búsqueda automática, a la pestaña de la
// búsqueda) y FORCE_SCAN (el botón Escanear) son escaneos que alguien pidió.
// trabajando.js no escanea solo una pestaña abierta en una oferta puntual,
// pero sí cuando se lo piden (ver CARGADA_EN_OFERTA en adapters/trabajando.js).
chrome.runtime.onMessage.addListener((m, _sender, sendResponse) => {
  if (m.type === 'AUTO_SCAN') {
    AP.escaneoPedido = true;
    try { sessionStorage.setItem(AP_CLAVE_PESTANA_RAFAGA, '1'); } catch (e) {}
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
      AP.escaneoPedido = true;
      AP.procesando = false;
      AP.msg('Escaneando…', '#16A34A');
      if (AP.escanear) AP.escanear();
    });
    sendResponse({ ok: true });
  }
  // §8.6: la pestaña se abrió apuntando a una oferta concreta ya aprobada en
  // banda gris -- cada adaptador define AP.aplicarDirecto con su propio
  // flujo de postular una sola oferta (no un escaneo de listado). Async
  // porque la postulación real toma varios segundos -- hay que devolver
  // true para que Chrome no cierre el canal antes del sendResponse.
  if (m.type === 'DO_APPLY') {
    // docs/modo-solo-observar.md §4.3: "solo observar" tiene que significar
    // lo que dice -- una aprobación de banda gris NO puede postular por esta
    // puerta mientras el modo esté activo. No se marca expirada (expirada:
    // false): queda pendiente para reintentarse en el próximo ciclo, cuando
    // la persona salga del modo observar.
    if (AP.soloObservarEfectivo()) {
      // soloObservar: el background no lo cuenta como un intento fallido (§6).
      sendResponse({ success: false, expirada: false, soloObservar: true, motivo: 'Estás en modo solo observar' });
      return true;
    }
    if (!AP.aplicarDirecto) { sendResponse({ success: false, expirada: false }); return true; }
    // La primera del panel de revisión cuando la cuenta recién empieza a
    // postular: se muestra antes de enviarla, como en "Empezar a postular".
    if (m.revisar) { try { sessionStorage.setItem(AP_CLAVE_REVISAR_PRIMERA, '1'); } catch (e) {} }
    AP.aplicarDirecto(m.decisionId, m.url).then(sendResponse);
    return true;
  }
  // docs/panel-de-revision-en-el-portal.md §2.1: el popup ofrece el panel de
  // revisión si esta página ya se revisó, y lo abre acá.
  if (m.type === 'ESTADO_REVISION') {
    const total = AP.esPestanaDeRafaga() ? 0 : AP.ofertasDelPanel().length;
    sendResponse({ total, enCurso: !!(apPanel && apPanel.estado === 'enviando') });
  }
  if (m.type === 'ABRIR_REVISION') sendResponse({ ok: AP.abrirPanel() });
  if (m.type === 'PROGRESO_REVISION') apProgresoPanel(m);
});

// Lo que agrega la propia extensión (el aviso, la marca de cada oferta) no es
// un cambio del portal: sin este filtro, cada marca pintada volvía a disparar
// un escaneo.
function apEsNuestro(nodo) {
  return !!nodo && nodo.nodeType === 1 && (nodo.id === 'ap-ov' || nodo.id === 'ap-recorrido' || (!!nodo.hasAttribute && nodo.hasAttribute('data-ap-marca')));
}

new MutationObserver(function (registros) {
  const delPortal = !registros || registros.some(r => !Array.prototype.every.call(r.addedNodes || [], apEsNuestro) ||
    !Array.prototype.every.call(r.removedNodes || [], apEsNuestro));
  if (!delPortal) return;
  // Si el portal volvió a dibujar las tarjetas, sus marcas se perdieron.
  AP.pintarMarcas();
  // §4: otra página (un portal que pagina sin recargar): el panel listaba las
  // de antes. Mientras se envía se queda, con el avance.
  if (apPanel && apPanel.estado === 'eligiendo' && apPanel.url !== location.href) apCerrarPanel();
  // El encabezado de Laborum y Trabajando llega después de cargar.
  clearTimeout(window._apSesionT);
  window._apSesionT = setTimeout(() => AP.reportarSesion(), 1500);
  if (AP.activo && !AP.procesando) {
    clearTimeout(window._apT);
    window._apT = setTimeout(() => AP.escanear && AP.escanear(), 2500);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

// ── ¿Hay sesión iniciada en este portal? (docs/estrategia-y-rediseno.md §6) ──
//
// El popup muestra una línea por portal conectado. La cuenta sabe cuáles
// conectó la persona, pero no si la sesión de ESE navegador sigue viva -- y
// una sesión caída es la causa más común de "no postuló nada y no dijo por
// qué". Acá se mira lo que cada portal muestra solo con sesión o solo sin
// ella. Si no aparece ningún indicio no se inventa un veredicto: no se manda
// nada y el popup dice "Sin revisar".
const PORTAL_POR_HOST = [
  [/computrabajo\.(cl|com)$/i, 'Computrabajo'],
  [/laborum\.cl$/i, 'Laborum'],
  [/trabajando\.cl$/i, 'Trabajando'],
];
const SEL_CON_SESION = 'a[href*="logout" i], a[href*="cerrar-sesion" i], a[href*="cerrarsesion" i], a[href*="signout" i], form[action*="logout" i]';
const SEL_SIN_SESION = 'a[href*="/login" i], a[href*="iniciar-sesion" i], a[href*="iniciarsesion" i], a[href*="signin" i]';

// Los dos de arriba solo decían algo en Laborum, y solo cuando faltaba la
// sesión (docs/primera-busqueda-guiada.md §12). Mirado en los tres sitios el
// 2026-10-03, con y sin sesión: ninguno tiene en el listado un enlace para
// cerrarla, y Computrabajo y Trabajando no entran por "/login". Lo que sí
// distingue los dos casos:
//   Computrabajo: con sesión, el menú de la persona (data-info-user) y su
//     <span id="logout">; sin sesión, el botón "Login". Sus enlaces a
//     /acceso/ están en los dos casos: no sirven.
//   Laborum: con sesión, el acceso a los mensajes; sin sesión, "Ingresar".
//   Trabajando: con sesión, "Mis postulaciones" y "Actualizar mi CV"; sin
//     sesión, "Ingresa".
// `ingreso` es la página para entrar: ahí llevan la tarjeta del final y el
// popup. popup.js la copia, y verificar-estado-extension.js compara las dos.
const SESION_POR_PORTAL = {
  Computrabajo: {
    con: '[data-info-user], #logout',
    sin: '[data-login-button-desktop]',
    ingreso: 'https://candidato.cl.computrabajo.com/acceso/',
  },
  Laborum: {
    con: 'a[href*="/postulantes/mensajes" i]',
    sin: 'a[href*="/login" i]',
    ingreso: 'https://www.laborum.cl/login',
  },
  Trabajando: {
    con: 'a[href$="/mis-postulaciones" i], a[href$="/mi-curriculum" i]',
    sin: 'a[href*="/ingresa-a-tu-cuenta" i]',
    ingreso: 'https://www.trabajando.cl/ingresa-a-tu-cuenta',
  },
};

AP.portalDelHost = function (host) {
  const par = PORTAL_POR_HOST.find(([re]) => re.test(host));
  return par ? par[1] : null;
};

AP.ingresoDelPortal = function (portal) {
  const p = SESION_POR_PORTAL[portal];
  return p ? p.ingreso : null;
};

// true = hay sesión, false = no hay, null = no se pudo saber en esta página.
// Lo de "con sesión" se mira primero: los portales dejan escondidos sus
// enlaces para entrar aunque la persona ya haya entrado.
AP.mirarSesion = function (doc, portal) {
  const d = doc || document;
  const propio = SESION_POR_PORTAL[portal] || {};
  if (d.querySelector(SEL_CON_SESION) || (propio.con && d.querySelector(propio.con))) return true;
  if (d.querySelector(SEL_SIN_SESION) || (propio.sin && d.querySelector(propio.sin))) return false;
  return null;
};

// Se mira al cargar y otra vez cuando el portal cambia la página (el
// MutationObserver de arriba): Laborum y Trabajando dibujan el encabezado
// después de cargar, y la sesión se puede abrir o cerrar sin recargar. Solo
// se avisa cuando el veredicto cambia.
let apSesionAvisada = null;
AP.reportarSesion = function () {
  const portal = AP.portalDelHost(location.hostname);
  if (!portal) return;
  const hay = AP.mirarSesion(document, portal);
  if (hay === null || hay === apSesionAvisada) return; // esta página no dice nada nuevo: no se pisa lo anterior
  try {
    chrome.runtime.sendMessage({ type: 'SESION_PORTAL', portal: portal, hay: hay });
    apSesionAvisada = hay;
  } catch (e) { /* el service worker se está reiniciando: se reporta la próxima */ }
};

// ── Init compartido ───────────────────────────────────────────────
// Carga cfg/active/log/token y avisa al adaptador (AP.onInit) para que
// decida qué hacer según la URL en la que esté parado (cada portal tiene
// sus propias páginas de "mis postulaciones", listados, etc.).
try {
  chrome.storage.local.get(['config', 'active', 'log', 'recorrido'], function (data) {
    apRecLeido(data.recorrido);
    AP.cfg = data.config || null;
    AP.activo = !!(data.active || (AP.cfg && AP.cfg.active));
    AP.log = data.log || [];
    AP.vistos = new Set();
    chrome.storage.sync.get('autopostulaToken', function (d) {
      AP.iaDisponible = !!d.autopostulaToken;
      console.log('[AP] core listo — config:', !!AP.cfg, 'activo:', AP.activo, 'IA (token):', AP.iaDisponible);
      AP.reportarSesion();
      // Pide al service worker que refresque el perfil si esta viejo (el
      // guardian de tiempo vive alla). Si lo refresco, devuelve la config nueva
      // y se aplica acá: AP.cfg ya se cargo arriba y no se entera solo de que
      // cambio en storage. No se bloquea el arranque esperandolo -- onInit
      // sigue de largo y lo que llegue despues alcanza igual al primer
      // formulario, que es lo que importa.
      if (AP.iaDisponible) {
        try {
          chrome.runtime.sendMessage({ type: 'SINCRONIZAR_PERFIL' }, (r) => {
            void chrome.runtime.lastError;
            if (r && r.config) { AP.cfg = r.config; AP.activo = !!(r.config.active); }
          });
        } catch (e) {}
      }
      if (AP.onInit) AP.onInit();
    });
  });
} catch (e) { console.error('[AP] init error:', e); }

try {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes.autopostulaToken) {
      AP.iaDisponible = !!changes.autopostulaToken.newValue;
    }
    if (area === 'local' && changes.recorrido) apRecLeido(changes.recorrido.newValue);
  });
} catch (e) {}

window._apInjected = true;
})();
