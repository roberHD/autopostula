// Verificación de regresión del scorer local (AP.puntuarOferta) -- carga el
// core.js real en un contexto de Node con stubs mínimos de chrome/document,
// así se prueba el código que de verdad corre en la extensión, no una copia.
// No está conectado a CI, es para correr a mano después de tocar el scorer:
//   node verificar-scorer.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function crearContexto() {
  const listeners = [];
  const documentoFalso = { documentElement: {} };
  class MutationObserverFalso {
    constructor(cb) { this.cb = cb; }
    observe() {}
  }
  const chromeFalso = {
    runtime: {
      onMessage: { addListener: (fn) => listeners.push(fn) },
      sendMessage: () => {},
      lastError: null,
    },
    storage: {
      local: { get: (_keys, cb) => cb({}), set: () => {} },
      sync: { get: (_keys, cb) => cb({}), set: () => {} },
    },
  };
  const ctx = {
    window: {},
    document: documentoFalso,
    chrome: chromeFalso,
    MutationObserver: MutationObserverFalso,
    console,
    setTimeout,
    clearTimeout,
  };
  ctx.window.document = documentoFalso;
  vm.createContext(ctx);
  return ctx;
}

const ctx = crearContexto();
const codigo = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
vm.runInContext(codigo, ctx, { filename: 'core.js' });
const AP = ctx.window.AP;

let fallos = 0;
function check(desc, cond) {
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

// Perfil de ejemplo tipo el de la §5 del documento.
const perfil = {
  roles: [
    { canonico: 'vendedor', sinonimos: ['asesor comercial', 'ejecutivo de ventas', 'promotor'], peso: 1.0 },
    { canonico: 'cajero', sinonimos: ['cajera', 'operador de caja'], peso: 0.5 },
  ],
  vetos: [{ patron: 'comision pura', razon: 'no acepta renta 100% variable' }],
  senales: [{ patron: 'part time', delta: 15 }, { patron: 'licencia clase a', delta: -40 }],
  ubicacion: { comunas: ['nunoa', 'providencia'], aceptaRemoto: true },
  jornada: 'cualquiera', modalidad: 'cualquiera',
  umbralPostular: 65, umbralGris: 45,
};

// 1. Match directo del rol principal en el título -> banda postular.
{
  const r = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: 'Falabella', cuerpo: 'Buscamos vendedor con experiencia', ubicacion: 'Ñuñoa' }, perfil);
  check('rol principal en título -> postular', r.banda === 'postular');
  check('score alto', r.score >= 65);
}

// 2. Sinónimo ("asesor comercial") también debe matchear, no solo el canónico.
{
  const r = AP.puntuarOferta({ titulo: 'Asesor Comercial Part Time', empresa: '', cuerpo: '', ubicacion: 'Providencia' }, perfil);
  check('sinónimo "asesor comercial" matchea', r.banda === 'postular');
  check('señal part time sumó puntaje', r.razones.some((x) => x.includes('part time')));
}

// 3. Veto corta todo, sin importar que el rol matchee.
{
  const r = AP.puntuarOferta({ titulo: 'Vendedor con comision pura', empresa: '', cuerpo: '', ubicacion: 'Ñuñoa' }, perfil);
  check('veto descarta aunque el rol matchee', r.banda === 'descartar');
  check('razón del veto es la real, no genérica', r.razones[0] === 'no acepta renta 100% variable');
}

// 4. Sin ningún rol relacionado -> banda descartar (score 0), con razón.
{
  const r = AP.puntuarOferta({ titulo: 'Ingeniero de software senior', empresa: '', cuerpo: '', ubicacion: 'Las Condes' }, perfil);
  check('sin relación con ningún rol -> descartar', r.banda === 'descartar');
  check('siempre trae al menos una razón', r.razones.length > 0);
}

// 5. Trampa "aseo"/"paseo" -- límites de palabra, no subcadena.
{
  const perfilAseo = { roles: [{ canonico: 'aseo', sinonimos: [], peso: 1 }], umbralPostular: 65, umbralGris: 45 };
  const r = AP.puntuarOferta({ titulo: 'Guía de paseos turísticos', empresa: '', cuerpo: '', ubicacion: '' }, perfilAseo);
  check('"aseo" no matchea dentro de "paseo" (límites de palabra)', r.banda !== 'postular');
}

// 6. Género/plural: "vendedora"/"vendedores" deben matchear el canónico "vendedor".
{
  const r1 = AP.puntuarOferta({ titulo: 'Se busca Vendedora para tienda', empresa: '', cuerpo: '', ubicacion: 'Ñuñoa' }, perfil);
  const r2 = AP.puntuarOferta({ titulo: 'Vendedores para temporada', empresa: '', cuerpo: '', ubicacion: 'Ñuñoa' }, perfil);
  check('"vendedora" matchea "vendedor" (sufijador de género)', r1.banda === 'postular');
  check('"vendedores" matchea "vendedor" (sufijador de plural)', r2.banda === 'postular');
}

// 7. Ubicación: fuera de las comunas configuradas, no remoto -> penalización fuerte.
{
  const r = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: 'Trabajo presencial', ubicacion: 'Puente Alto' }, perfil);
  check('fuera de comuna y no remoto -> penalización aplicada', r.razones.some((x) => x.includes('comunas')));
  check('score bajó por ubicación (no llega a postular)', r.score < 100);
}

// 8. Ubicación: remoto explícito sí pasa aunque no esté en las comunas.
{
  const r = AP.puntuarOferta({ titulo: 'Vendedor 100% remoto', empresa: '', cuerpo: 'Trabajo remoto para todo Chile', ubicacion: 'Cualquier región' }, perfil);
  check('remoto explícito no penaliza por ubicación', !r.razones.some((x) => x.includes('comunas')));
}

// 9. Perfil vacío/incompleto no debe reventar.
{
  const r = AP.puntuarOferta({ titulo: 'Cualquier cosa' }, {});
  check('perfil vacío no revienta', r && typeof r.score === 'number' && r.banda);
}

// ── Casos agregados tras la revisión del 2026-09-04 -- estas dos dimensiones
// (peso por campo, peso de rol) eran justo las que tenían los dos bugs
// críticos, y ningún caso de arriba las cubría (el único plural probado era
// "vendedor", que es -or, el único caso que ya funcionaba antes del fix).

// 10. Un match en título debe puntuar más que el mismo rol solo en empresa.
// ubicacion: 'Nunoa' en los dos -- el perfil compartido tiene comunas
// configuradas, sin esto la penalización de ubicación (-40) se mezclaría
// con lo que este caso quiere medir (peso por campo).
{
  const rTitulo = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: '', ubicacion: 'Nunoa' }, perfil);
  const rEmpresa = AP.puntuarOferta({ titulo: 'Bodeguero nocturno', empresa: 'Vendedores Unidos SpA', cuerpo: '', ubicacion: 'Nunoa' }, perfil);
  check('match en título puntúa más que el mismo rol solo en empresa', rTitulo.score > rEmpresa.score);
  check('rol solo en el nombre de la empresa no basta para postular solo', rEmpresa.banda !== 'postular');
}

// 11. El peso del rol debe importar: peso 0.5 en título debe dar la mitad
// que peso 1.0 en título (antes del bug, ambos clampeaban a 100 por igual).
{
  const rPesoAlto = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: '', ubicacion: 'Nunoa' }, perfil);
  const rPesoBajo = AP.puntuarOferta({ titulo: 'Cajero de tienda', empresa: '', cuerpo: '', ubicacion: 'Nunoa' }, perfil);
  check('peso 0.5 en título puntúa menos que peso 1.0 en título', rPesoBajo.score < rPesoAlto.score);
  check('peso 0.5 en título cae en banda gris, no postular', rPesoBajo.banda === 'gris');
}

// 12. Género/plural de palabras en -o (el caso que fallaba: el sufijo se
// agregaba sin sacar la vocal final, así que nunca generaba "cajera").
{
  const formas = ['Cajero de supermercado', 'Cajera de supermercado', 'Se necesitan cajeros', 'Cajeras part time'];
  formas.forEach((titulo) => {
    const r = AP.puntuarOferta({ titulo, empresa: '', cuerpo: '', ubicacion: 'Nunoa' }, perfil);
    check('"' + titulo + '" matchea "cajero" (género/plural)', r.banda !== 'descartar');
  });
}

// 13. Plural de palabras en -ista y -o con otra raíz (operario, recepcionista).
// Perfil sin comunas configuradas -- acá no aplica ninguna penalización de
// ubicación aunque no se pase el campo.
{
  const perfilOperario = {
    roles: [
      { canonico: 'operario', sinonimos: [], peso: 1 },
      { canonico: 'recepcionista', sinonimos: [], peso: 1 },
    ],
    umbralPostular: 65, umbralGris: 45,
  };
  const r1 = AP.puntuarOferta({ titulo: 'Operarios de producción', empresa: '', cuerpo: '', ubicacion: '' }, perfilOperario);
  const r2 = AP.puntuarOferta({ titulo: 'Recepcionistas turno noche', empresa: '', cuerpo: '', ubicacion: '' }, perfilOperario);
  check('"operarios" matchea "operario" (plural)', r1.banda === 'postular');
  check('"recepcionistas" matchea "recepcionista" (plural en -ista)', r2.banda === 'postular');
}

// 14. Veto en el nombre de la empresa sigue cortando duro (no se ablandó por
// error al arreglar el caso del cuerpo).
{
  const perfilVetoEmpresa = { roles: [{ canonico: 'analista', sinonimos: [], peso: 1 }], vetos: [{ patron: 'call center', razon: 'no quiere call center' }], umbralPostular: 65, umbralGris: 45 };
  const r = AP.puntuarOferta({ titulo: 'Analista de datos', empresa: 'Call Center Corp', cuerpo: '', ubicacion: '' }, perfilVetoEmpresa);
  check('veto en el nombre de la empresa corta duro', r.banda === 'descartar' && r.score === 0);
}

// 15. Veto que aparece SOLO en el cuerpo penaliza, no corta -- antes cortaba
// igual que en título/empresa, reintroduciendo el problema de polaridad de
// §2.1 (mención de pasada en el boilerplate matando una oferta buena).
{
  const perfilVetoCuerpo = { roles: [{ canonico: 'analista', sinonimos: [], peso: 1 }], vetos: [{ patron: 'call center', razon: 'no quiere call center' }], umbralPostular: 65, umbralGris: 45 };
  const r = AP.puntuarOferta({ titulo: 'Analista de datos', empresa: 'Konecta', cuerpo: 'Nuestro call center queda en el centro', ubicacion: '' }, perfilVetoCuerpo);
  check('veto solo en el cuerpo NO corta duro (no da score 0)', r.score > 0);
  check('veto solo en el cuerpo sí penaliza (no postula directo)', r.banda !== 'postular');
}

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
process.exit(fallos === 0 ? 0 : 1);
