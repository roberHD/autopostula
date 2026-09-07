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
  check('señal part time sumó puntaje', r.razones.some((x) => x.tipo === 'senal' && x.patron === 'part time'));
}

// 3. Veto corta todo, sin importar que el rol matchee.
{
  const r = AP.puntuarOferta({ titulo: 'Vendedor con comision pura', empresa: '', cuerpo: '', ubicacion: 'Ñuñoa' }, perfil);
  check('veto descarta aunque el rol matchee', r.banda === 'descartar');
  check('razón del veto es la real, no genérica', r.razones[0].tipo === 'veto' && r.razones[0].razon === 'no acepta renta 100% variable');
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
  const razonUbicacion = r.razones.find((x) => x.tipo === 'ubicacion');
  check('fuera de comuna y no remoto -> penalización aplicada', !!razonUbicacion);
  check('la razón de ubicación trae la comuna real de la oferta, no un string genérico', razonUbicacion && razonUbicacion.ofertaEn === 'Puente Alto');
  check('la razón de ubicación trae las comunas buscadas', razonUbicacion && JSON.stringify(razonUbicacion.buscadas) === JSON.stringify(perfil.ubicacion.comunas));
  check('score bajó por ubicación (no llega a postular)', r.score < 100);
}

// 8. Ubicación: remoto explícito sí pasa aunque no esté en las comunas.
{
  const r = AP.puntuarOferta({ titulo: 'Vendedor 100% remoto', empresa: '', cuerpo: 'Trabajo remoto para todo Chile', ubicacion: 'Cualquier región' }, perfil);
  check('remoto explícito no penaliza por ubicación', !r.razones.some((x) => x.tipo === 'ubicacion'));
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

// 14. perfilDesactualizado (revisión externa 2026-09-05): si una
// recompilación forzada por cambio de objetivo falló, AP.evaluarOferta debe
// mandar todo a banda gris -- no confiar en un puntaje que puede estar
// mirando el rubro viejo. Esto prueba AP.evaluarOferta (el dispatcher),
// no AP.puntuarOferta directo, porque ahí es donde vive la lógica nueva.
{
  const original = AP.cfg;
  AP.cfg = { scorer: { usarScorerLocal: true, perfilCompilado: perfil, perfilDesactualizado: true } };
  const r = AP.evaluarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: '', ubicacion: 'Ñuñoa' });
  check('perfilDesactualizado manda a banda gris aunque el título matchee perfecto', r.banda === 'gris');
  check('perfilDesactualizado trae una razón explicándolo', r.razones.some((x) => x.includes('desactualizado')));
  AP.cfg = original;
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
  const razonVeto = r.razones.find((x) => x.tipo === 'veto');
  check('la razón del veto en cuerpo es un objeto estructurado con donde:"cuerpo"', razonVeto && razonVeto.donde === 'cuerpo');
  check('AP.formatearRazonCorta distingue que el veto fue en el cuerpo, no en título/empresa', AP.formatearRazonCorta(razonVeto).includes('cuerpo del aviso'));
}

// 16. AP.mensajeEscaneo / AP.razonMasFrecuente (docs/visibilidad-y-etapa2.md
// §A): el overlay pasó de "X de Y coinciden" (solo contaba postular) a un
// desglose de las tres bandas más la razón de descarte más frecuente.
{
  const r = AP.mensajeEscaneo({ postular: 2, gris: 6, descartar: 12 }, 'no calza con "desarrollador de software"');
  check('desglose: cuenta las tres bandas', r.texto === '2 postuladas · 6 por decidir · 12 descartadas — la mayoría: no calza con "desarrollador de software"');
  check('desglose: estado ok cuando hubo postulaciones', r.estado === 'ok');
}
{
  const r = AP.mensajeEscaneo({ postular: 0, gris: 3, descartar: 5 }, 'fuera de tus comunas');
  check('sin postulaciones pero con grises -> estado pendiente (no ok, no neutral)', r.estado === 'pendiente');
}
{
  const r = AP.mensajeEscaneo({ postular: 0, gris: 0, descartar: 8 }, 'no calza con tus filtros');
  check('todo descartado -> estado neutral (no es un error)', r.estado === 'neutral');
}
{
  const r = AP.mensajeEscaneo({ postular: 0, gris: 0, descartar: 0 }, null);
  check('nada visto -> mensaje "Sin ofertas nuevas" sin razón', r.texto === 'Sin ofertas nuevas' && r.estado === 'neutral');
}
{
  const razon = AP.razonMasFrecuente(['fuera de tus comunas', 'no calza con tus filtros', 'fuera de tus comunas']);
  check('razón más frecuente cuenta repeticiones, no solo la primera', razon === 'fuera de tus comunas');
}
{
  const razon = AP.razonMasFrecuente([]);
  check('lista vacía de razones no revienta, devuelve null', razon === null);
}

// 17. Integración §A + §C: el flujo real de un adaptador es
// `resultado = AP.puntuarOferta(...)` -> `razonesDescartadas.push(resultado.razones[0])`
// -> `AP.mensajeEscaneo(conteos, AP.razonMasFrecuente(razonesDescartadas))`.
// Prueba las tres piezas encadenadas, no cada una por separado, para agarrar
// un desajuste de forma entre lo que produce el scorer y lo que consume el
// resumen (p.ej. si alguna dejara de pasar objetos y volviera a strings).
{
  const ofertas = [
    { titulo: 'Ingeniero de software senior', empresa: '', cuerpo: '', ubicacion: 'Las Condes' }, // sin_rol -> descartar (score 0)
    { titulo: 'Gerente de finanzas', empresa: '', cuerpo: '', ubicacion: 'Vitacura' }, // sin_rol -> descartar (score 0)
    { titulo: 'Vendedor de tienda', empresa: '', cuerpo: 'Trabajo presencial', ubicacion: 'Puente Alto' }, // rol ok, ubicacion penaliza -> score 60 -> gris
  ];
  const conteos = { postular: 0, gris: 0, descartar: 0 };
  const razonesDescartadas = [];
  ofertas.forEach((campos) => {
    const r = AP.puntuarOferta(campos, perfil);
    if (r.banda === 'postular') conteos.postular++;
    else if (r.banda === 'gris') conteos.gris++;
    else { conteos.descartar++; razonesDescartadas.push(r.razones[0]); }
  });
  const resumen = AP.mensajeEscaneo(conteos, AP.razonMasFrecuente(razonesDescartadas));
  check('integración: 2 descartadas (sin rol) y 1 en gris (ubicación)', conteos.descartar === 2 && conteos.gris === 1 && conteos.postular === 0);
  check('integración: el resumen desglosa las dos bandas', resumen.texto.includes('1 por decidir') && resumen.texto.includes('2 descartadas'));
  check('integración: la razón más frecuente es "sin_rol" (2 de 2 descartes), no la de ubicación (que ni se descartó)', resumen.texto.includes('no se encontró ninguno de los roles buscados'));
  check('integración: estado pendiente (nada postulado, pero hay 1 en gris)', resumen.estado === 'pendiente');
}

console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
process.exit(fallos === 0 ? 0 : 1);
