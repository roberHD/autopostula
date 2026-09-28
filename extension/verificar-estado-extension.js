// Verificación de docs/estrategia-y-rediseno.md §6 -- "un solo estado".
//
// El estado de la extensión vive en la cuenta (backend/lib/estado-extension.ts)
// y el popup lo dibuja. Como son dos proyectos sin build compartido, las
// palabras están escritas dos veces: acá se comparan letra por letra, para que
// nadie arregle el texto en un lado y deje el otro mintiendo.
//
// También se prueba lo que el popup calcula solo cuando no hay red, y las tres
// reglas de la migración (background.js) que no se pueden probar a mano sin
// dejar a alguien postulando sin haberlo pedido.
//
// No está conectado a CI, es para correr a mano: node verificar-estado-extension.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fallos = 0;
function check(desc, cond) {
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

const popup = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
const background = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
const backend = fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'lib', 'estado-extension.ts'),
  'utf8',
);

// ── 1. Las mismas palabras en el popup y en el panel ───────────────────────
{
  const desde = popup.indexOf('const TEXTO_MODO = {');
  const hasta = popup.indexOf('// ── DOM');
  const ctx = {};
  vm.createContext(ctx);
  // `const` no queda colgando del contexto del vm: se exporta a mano.
  vm.runInContext(
    popup.slice(desde, hasta) +
      ';globalThis.TEXTO_MODO = TEXTO_MODO; globalThis.TEXTO_MODO_PRUEBA = TEXTO_MODO_PRUEBA;',
    ctx,
    { filename: 'popup.js (textos)' },
  );

  check('el popup define los tres modos', Object.keys(ctx.TEXTO_MODO).join(',') === 'postulando,observando,pausada');

  for (const modo of Object.keys(ctx.TEXTO_MODO)) {
    const t = ctx.TEXTO_MODO[modo];
    check(`"${t.titulo}" está igual en el backend`, backend.includes('"' + t.titulo + '"'));
    check(`el detalle de ${modo} está igual en el backend`, backend.includes('"' + t.detalle + '"'));
  }
  check('la explicación del modo prueba está igual en el backend', backend.includes('"' + ctx.TEXTO_MODO_PRUEBA + '"'));
}

// ── 2. Lo que el popup calcula sin red ─────────────────────────────────────
// Cae a lo último que la cuenta dejó guardado en este navegador. Tiene que
// mandar lo mismo que AP.soloObservarEfectivo (core.js): la red de seguridad
// de la cuenta gana aunque la config local diga que postule.
{
  const desde = popup.indexOf('function estadoDesdeConfig(');
  const hasta = popup.indexOf('\n}', desde) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(popup.slice(desde, hasta), ctx, { filename: 'popup.js (estadoDesdeConfig)' });

  check('sin nada guardado no se inventa un estado', ctx.estadoDesdeConfig(null) === null);
  check('config normal: postulando', ctx.estadoDesdeConfig({ active: true, postulacionHabilitada: true }).modo === 'postulando');
  check('apagada en este navegador: pausada', ctx.estadoDesdeConfig({ active: false, postulacionHabilitada: true }).modo === 'pausada');
  check('solo observar: observando', ctx.estadoDesdeConfig({ active: true, soloObservar: true, postulacionHabilitada: true }).modo === 'observando');
  check('cuenta en modo prueba: observando aunque la config diga que postule', ctx.estadoDesdeConfig({ active: true, postulacionHabilitada: false }).modo === 'observando');
  check('...y se sabe que fue el modo prueba, para poder explicarlo', ctx.estadoDesdeConfig({ active: true, postulacionHabilitada: false }).porModoPrueba === true);
  check('pausada le gana a todo lo demás', ctx.estadoDesdeConfig({ active: false, soloObservar: true, postulacionHabilitada: false }).modo === 'pausada');
}

// ── 3. La migración de lo que había en este navegador ──────────────────────
{
  check('la migración corre una sola vez (queda marcada en storage)', background.includes('CLAVE_MIGRACION_ESTADO') && background.includes("'estadoMigradoV1'"));
  check('la migración solo sube la pausa cuando estaba apagada de verdad', background.includes('pausada: guardado.active === false'));
  check('se sube antes de leer el estado del servidor, no después', background.indexOf('await migrarEstadoLocalAlServidor(token)') < background.indexOf("'/api/extension/perfil'"));
  check('un backend viejo (404) no deja la migración reintentando para siempre', background.includes('res.status === 404'));
  check('el estado del servidor se aplica a la config local y a las pestañas abiertas', background.includes('function aplicarEstadoLocal') && background.includes("type: 'CONFIG_UPDATED'"));
  check('pausar desde el panel apaga la extensión sin abrir el popup', background.includes('chrome.storage.local.set({ active: !data.estado.pausada })'));
}

// ── 4. La sesión en cada portal ────────────────────────────────────────────
{
  const core = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
  // Desde los selectores (los usa la función) hasta el final de mirarSesion.
  const desde = core.indexOf('const SEL_CON_SESION');
  const hasta = core.indexOf('\n};', core.indexOf('AP.mirarSesion = function')) + 3;
  const ctx = { AP: {} };
  vm.createContext(ctx);
  vm.runInContext(core.slice(desde, hasta), ctx, { filename: 'core.js (mirarSesion)' });

  const doc = (coincide) => ({ querySelector: (sel) => (coincide(sel) ? {} : null) });
  check('con un enlace para cerrar sesión: hay sesión', ctx.AP.mirarSesion(doc((s) => s.includes('logout'))) === true);
  check('con un enlace para iniciar sesión: no hay', ctx.AP.mirarSesion(doc((s) => s.includes('/login'))) === false);
  check('sin ninguno de los dos indicios: no se inventa un veredicto', ctx.AP.mirarSesion(doc(() => false)) === null);
}

console.log('\n' + (fallos === 0 ? 'Todo OK (0 fallos).' : fallos + ' fallo(s).'));
