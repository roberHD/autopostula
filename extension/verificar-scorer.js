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
// Mismo orden que manifest.json: la lista de comunas se carga antes que core.js
// (sin ella la ubicación de la oferta nunca se reconoce -- §2.1).
for (const archivo of ['data/comunas-cl.js', 'core.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, archivo), 'utf8'), ctx, { filename: archivo });
}
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
  check('la razón de ubicación trae la comuna real de la oferta, no un string genérico', razonUbicacion && razonUbicacion.ofertaEn === 'puente alto');
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
    { titulo: 'Ingeniero de software senior', empresa: '', cuerpo: '', ubicacion: 'Ñuñoa' }, // sin_rol -> descartar (score 0)
    { titulo: 'Gerente de finanzas', empresa: '', cuerpo: '', ubicacion: 'Providencia' }, // sin_rol -> descartar (score 0)
    { titulo: 'Vendedor de tienda', empresa: '', cuerpo: 'Trabajo presencial', ubicacion: 'Sector norte' }, // rol ok, comuna no reconocida penaliza -> score 60 -> gris
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

// 18. Nivel del cargo (docs/revision-2026-09-16.md §2.7): el rol "ventas" calza
// con "Gerente Comercial", pero una persona que busca de vendedor no busca
// gerencia. perfil.nivelDirectivo lo calcula el backend desde el CIUO.
{
  const base = Object.assign({}, perfil, { ubicacion: { comunas: [], aceptaRemoto: false } });
  const oferta = (titulo) => ({ titulo, empresa: 'Falabella', cuerpo: 'Ventas', ubicacion: '' });
  const conNivel = (nivelDirectivo) => Object.assign({}, base, { nivelDirectivo });
  const titulos = ['Gerente Comercial y Marketing de ventas', 'Subgerente de ventas', 'Jefa Zonal de ventas Grandes Tiendas', 'Jefe de ventas', 'Director de ventas', 'Directora comercial de ventas'];
  for (const t of titulos) {
    const r = AP.puntuarOferta(oferta(t), conNivel(false));
    check('nivel: "' + t + '" se descarta si no busca jefatura', r.banda === 'descartar' && r.razones[0].tipo === 'nivel');
  }
  const rIncierto = AP.puntuarOferta(oferta('Gerente ejecutivo de ventas'), conNivel(null));
  check('nivel: sin certeza (CIUO desconocido) va a gris, no postula', rIncierto.banda === 'gris' && rIncierto.razones[0].tipo === 'nivel' && rIncierto.razones[0].certeza === 'desconocida');
  const rAusente = AP.puntuarOferta(oferta('Gerente ejecutivo de ventas'), base);
  check('nivel: perfil sin el campo (anterior al cambio) también va a gris', rAusente.banda === 'gris');
  const rBusca = AP.puntuarOferta(oferta('Gerente ejecutivo de ventas'), conNivel(true));
  check('nivel: si busca jefatura, no se toca', rBusca.banda === 'postular' && !rBusca.razones.some((x) => x.tipo === 'nivel'));
  const rVendedor = AP.puntuarOferta(oferta('Vendedor de tienda'), conNivel(false));
  check('nivel: un vendedor normal sigue postulando', rVendedor.banda === 'postular');
  const rApoyo = AP.puntuarOferta(oferta('Vendedor asistente de gerente comercial'), conNivel(false));
  check('nivel: "asistente de gerente" no es cargo directivo', rApoyo.banda === 'postular');
  const rGerencia = AP.puntuarOferta(oferta('Vendedor gerencia de personas'), conNivel(false));
  check('nivel: "gerencia" (área) no es "gerente" (cargo)', rGerencia.banda === 'postular');
  const rSinRol = AP.puntuarOferta(oferta('Gerente de finanzas'), conNivel(null));
  check('nivel: directivo con nivel incierto y sin rol sigue descartando por rol', rSinRol.banda === 'descartar');
}

// 19. Duplicados (§2.8): clave título + empresa normalizados.
{
  const k = AP.claveDuplicado;
  check('duplicado: mayúsculas, tildes y símbolos no cambian la clave',
    k('Asesor Comercial Remoto | Ventas Consultivas', 'AVAN-C Chile') === k('ASESOR comercial remoto  ventas consultivas', 'avan c chile'));
  check('duplicado: distinta empresa -> distinta clave', k('Vendedor', 'Falabella') !== k('Vendedor', 'Paris'));
  check('duplicado: distinto título -> distinta clave', k('Vendedor', 'Falabella') !== k('Cajero', 'Falabella'));
  check('duplicado: sin empresa la clave incluye el día (no junta todos los "Vendedor")',
    k('Vendedor', '') !== k('Vendedor', 'Falabella') && /\|\|/.test(k('Vendedor', '')));
  check('duplicado: sin título no hay clave (no se puede afirmar nada)', k('', 'Falabella') === null);
  check('duplicado: usa solo la primera línea del título (Computrabajo mete etiquetas)', k('Vendedor\nPostulado', 'Falabella') === k('Vendedor', 'Falabella'));
}

// 20. Sinónimos con palabras intermedias (docs/amplitud-de-busqueda.md §2.3):
// "vendedor retail" tiene que calzar con "Vendedor de Retail" (una
// preposición corta de enlace), pero no con "vendedor de repuestos para
// retail" (palabras intermedias que no son de enlace).
{
  const perfilRetail = { roles: [{ canonico: 'vendedor retail', sinonimos: [], peso: 1 }], umbralPostular: 65, umbralGris: 45 };
  const rCalza = AP.puntuarOferta({ titulo: 'Vendedor de Retail vestuario', empresa: '', cuerpo: '', ubicacion: '' }, perfilRetail);
  const rNoCalza = AP.puntuarOferta({ titulo: 'Vendedor de repuestos para retail', empresa: '', cuerpo: '', ubicacion: '' }, perfilRetail);
  check('"vendedor retail" calza con "Vendedor de Retail" (una preposición de enlace)', rCalza.banda === 'postular');
  check('"vendedor retail" NO calza con "vendedor de repuestos para retail" (palabras intermedias de más)', rNoCalza.banda !== 'postular');
}

// 21. El caso real del documento (§1) de punta a punta -- criterio de
// aceptación §9.1. La oferta calzaba perfecto y quedaba en "Por decidir"
// porque las señales nunca calzaban (patrón con comas) y los vetos son los
// mismos del perfil real, ya normalizados como los guardaría
// lib/normalizar-patron.ts: el veto "retail genérico sin especialidad en
// moda/vestuario/calzado" queda con patron=null (era una frase, no una
// lista -- ver el comentario en normalizar-patron.ts) y NO debe convertirse
// en un veto sobre "vestuario"/"calzado", que sería exactamente lo contrario
// de la intención y descartaría esta misma oferta.
{
  const perfilVendedora = {
    roles: [{ canonico: 'vendedor', sinonimos: [], peso: 0.5 }],
    vetos: [
      { patron: null, razon: 'no es retail genérico' },
      { patron: 'full time exclusive', razon: 'no quiere full time' },
    ],
    umbralPostular: 65, umbralGris: 45,
    senales: [
      { patron: 'vestuario', delta: 25 },
      { patron: 'part time', delta: 15 },
    ],
  };
  const campos = {
    titulo: 'Vendedor de Retail vestuario Rotativo Part Time (V, S y D)',
    empresa: 'Manpower Chile',
    cuerpo: 'buscamos Vendedores(as) Part Time del rubro retail moda',
    ubicacion: 'Santiago - San Miguel',
  };
  const r = AP.puntuarOferta(campos, perfilVendedora);
  check('caso real §1: con las señales separadas, la oferta da postular (antes quedaba en gris)', r.banda === 'postular');
  check('caso real §1: el puntaje es 90 (50 del rol + 25 vestuario + 15 part time, las tres en el título)', r.score === 90);
}

// 22. Multiplicador de campo en señales (§2.1, "a decidir al implementar"):
// la misma señal pesa distinto si calza en título, empresa o cuerpo -- igual
// que los roles, para que un +25 perdido en el cuerpo no empuje tan fuerte
// como uno en el título.
{
  const perfilSenal = { roles: [], senales: [{ patron: 'vestuario', delta: 20 }], umbralPostular: 65, umbralGris: 45 };
  const rTitulo = AP.puntuarOferta({ titulo: 'Vendedor vestuario', empresa: '', cuerpo: '', ubicacion: '' }, perfilSenal);
  const rEmpresa = AP.puntuarOferta({ titulo: 'Vendedor', empresa: 'Vestuario SpA', cuerpo: '', ubicacion: '' }, perfilSenal);
  const rCuerpo = AP.puntuarOferta({ titulo: 'Vendedor', empresa: '', cuerpo: 'Trabajamos con vestuario de temporada', ubicacion: '' }, perfilSenal);
  check('señal en título suma el delta completo (+20)', rTitulo.razones.find((x) => x.tipo === 'senal').delta === 20);
  check('señal en empresa suma con el multiplicador 0.35 (+7)', rEmpresa.razones.find((x) => x.tipo === 'senal').delta === 7);
  check('señal en cuerpo suma con el multiplicador 0.3 (+6)', rCuerpo.razones.find((x) => x.tipo === 'senal').delta === 6);
}

// 23. Jornada (docs/amplitud-de-busqueda.md §6): SearchPreferences.jornada
// llegaba hasta el perfil compilado pero el scorer nunca la leía.
{
  const perfilPartTime = { roles: [{ canonico: 'vendedor', sinonimos: [], peso: 1 }], jornada: 'part_time', umbralPostular: 65, umbralGris: 45 };
  const rContraria = AP.puntuarOferta({ titulo: 'Vendedor jornada completa', empresa: '', cuerpo: '', ubicacion: '' }, perfilPartTime);
  const rDeclarada = AP.puntuarOferta({ titulo: 'Vendedor part time', empresa: '', cuerpo: '', ubicacion: '' }, perfilPartTime);
  const rSinDecir = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: '', ubicacion: '' }, perfilPartTime);
  check('jornada contraria a la declarada -> descarta', rContraria.banda === 'descartar' && rContraria.razones[0].tipo === 'jornada');
  check('jornada que confirma lo declarado -> postula sin penalización', rDeclarada.banda === 'postular');
  check('el aviso no dice la jornada -> gris, no postula a ciegas', rSinDecir.banda === 'gris' && rSinDecir.razones.some((x) => x.tipo === 'jornada_desconocida'));

  const perfilCualquiera = Object.assign({}, perfilPartTime, { jornada: 'cualquiera' });
  const rCualquiera = AP.puntuarOferta({ titulo: 'Vendedor jornada completa', empresa: '', cuerpo: '', ubicacion: '' }, perfilCualquiera);
  check('jornada "cualquiera" no filtra nada (como antes)', rCualquiera.banda === 'postular');

  // Bug real reportado en vivo el 2026-09-29: avisos reales de trabajando.com
  // para "vendedor part time" caían TODOS a gris. AP_KEYWORDS_JORNADA.part_time
  // solo tenía 'part time' con espacio, y el chequeo era un .includes() crudo
  // -- "Part-Time" con guion (como lo escribe trabajando.com) nunca calzaba,
  // así que el aviso quedaba como "no se sabe la jornada" pese a decirlo bien
  // claro en el título.
  const rGuion = AP.puntuarOferta({ titulo: 'Vendedor(a) Part-Time (domingos y festivos) - RM', empresa: 'Piwén', cuerpo: '', ubicacion: '' }, perfilPartTime);
  check('"Part-Time" con guion sí confirma la jornada declarada -> postula', rGuion.banda === 'postular');

  // Misma familia de bug: "PT" es la abreviatura real que usan estos avisos
  // ("PT 20 hrs"). Con límite de palabra (\bpt\b) no debe calzar dentro de
  // palabras como "septiembre" o "aceptar".
  const rAbreviatura = AP.puntuarOferta({ titulo: 'Vendedor/Cajero (PT 20 hrs fines de semana)', empresa: '', cuerpo: '', ubicacion: '' }, perfilPartTime);
  check('"PT" (abreviatura) confirma la jornada declarada -> postula', rAbreviatura.banda === 'postular');
  const rFalsoPositivoPt = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: 'Contratación directa desde septiembre, se acepta cambio de turno', ubicacion: '' }, perfilPartTime);
  check('"pt" no calza dentro de "septiembre" ni "acepta" (limite de palabra)', rFalsoPositivoPt.banda === 'gris' && rFalsoPositivoPt.razones.some((x) => x.tipo === 'jornada_desconocida'));

  // Caso real del 2026-09-30 (trabajando.com): Sodimac titula sus part time
  // "Jornada PT20 hrs" pero les pone la ficha "Jornada Completa" y "turnos
  // rotativos jornada completa" en la descripción. Todas se descartaban.
  const cuerpoSodimac = 'Jornada Completa Vendedor Región Metropolitana La Reina ... disponibilidad para trabajar en sistema de turnos rotativos jornada completa';
  const rSodimac = AP.puntuarOferta({ titulo: 'Vendedor/a Sodimac La Reina Jornada PT20 hrs', empresa: 'Sodimac', cuerpo: cuerpoSodimac, ubicacion: '' }, perfilPartTime);
  check('el título dice "PT20" y la ficha dice "Jornada Completa": manda el título -> postula', rSodimac.banda === 'postular', rSodimac);
  const rPt30 = AP.puntuarOferta({ titulo: 'Vendedor Pulcro/Hunter/Pulcro PT30HRS - Alto las Condes', empresa: 'Paris', cuerpo: '', ubicacion: '' }, perfilPartTime);
  check('"PT30HRS" (pegado al número) es part time -> postula', rPt30.banda === 'postular', rPt30);
  const rFt42 = AP.puntuarOferta({ titulo: 'Vendedor/a Sodimac HC Tobalaba Jornada FT42 hrs', empresa: 'Sodimac', cuerpo: cuerpoSodimac, ubicacion: '' }, perfilPartTime);
  check('"FT42" es jornada completa -> descarta a quien busca part time', rFt42.banda === 'descartar' && rFt42.razones[0].tipo === 'jornada', rFt42);
  const rAmbas = AP.puntuarOferta({ titulo: 'Vendedor part time o full time', empresa: '', cuerpo: '', ubicacion: '' }, perfilPartTime);
  check('el título ofrece las dos jornadas -> calza con la declarada', rAmbas.banda === 'postular', rAmbas);
  const rTituloContrario = AP.puntuarOferta({ titulo: 'Vendedor jornada completa', empresa: '', cuerpo: 'también hay turnos part time los fines de semana', ubicacion: '' }, perfilPartTime);
  check('el título dice solo la contraria -> descarta aunque el cuerpo nombre la declarada', rTituloContrario.banda === 'descartar', rTituloContrario);
  const rSoloCuerpo = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: 'Jornada Completa, lunes a sábado', ubicacion: '' }, perfilPartTime);
  check('el título no dice jornada y el cuerpo dice la contraria -> descarta, como antes', rSoloCuerpo.banda === 'descartar' && rSoloCuerpo.razones[0].tipo === 'jornada', rSoloCuerpo);
  const perfilFullTime = Object.assign({}, perfilPartTime, { jornada: 'full_time' });
  check('quien busca jornada completa: "FT42" en el título -> postula', AP.puntuarOferta({ titulo: 'Vendedor/a Sodimac HC Tobalaba Jornada FT42 hrs', empresa: 'Sodimac', cuerpo: '', ubicacion: '' }, perfilFullTime).banda === 'postular');
  check('quien busca jornada completa: "PT20" en el título -> descarta, aunque la ficha diga "Jornada Completa"', AP.puntuarOferta({ titulo: 'Vendedor/a Sodimac La Reina Jornada PT20 hrs', empresa: 'Sodimac', cuerpo: cuerpoSodimac, ubicacion: '' }, perfilFullTime).banda === 'descartar');

  // El historial y el resumen del escaneo decían "sin razón" en cada descarte
  // por jornada: formatearRazonCorta no conocía estas razones.
  check('razón corta de jornada contraria', AP.formatearRazonCorta(rFt42.razones[0]) === 'es de jornada completa y buscas part time', AP.formatearRazonCorta(rFt42.razones[0]));
  check('razón corta de jornada desconocida', AP.formatearRazonCorta(rSinDecir.razones.find((x) => x.tipo === 'jornada_desconocida')) === 'no dice la jornada, y buscas part time');
  check('razón corta de requisito y de modo abierto', AP.formatearRazonCorta({ tipo: 'requisito', que: 'licencia' }) === 'pide una licencia de conducir profesional que no está en tu CV' && AP.formatearRazonCorta({ tipo: 'modo_abierto' }) === 'cumple tus condiciones (buscas cualquier trabajo)');
}

// ── Modo "cualquier trabajo" (docs/amplitud-de-busqueda.md §5) ──
{
  const perfilAbierto = Object.assign({}, perfil, {
    modo: 'abierto',
    tiene: { titulo: false, licencias: [], ingles: false },
    ubicacion: { comunas: [], aceptaRemoto: false },
  });
  const perfilCerrado = Object.assign({}, perfil, { ubicacion: { comunas: [], aceptaRemoto: false } });

  const sinRelacion = { titulo: 'Reponedor de supermercado', empresa: 'Lider', cuerpo: 'Turnos rotativos', ubicacion: '' };
  const rCerrado = AP.puntuarOferta(sinRelacion, perfilCerrado);
  const rAbierto = AP.puntuarOferta(sinRelacion, perfilAbierto);
  check('modo objetivo: un oficio sin relacion se descarta (como siempre)', rCerrado.banda === 'descartar');
  check('modo abierto: ese mismo oficio ya no se descarta', rAbierto.banda !== 'descartar');
  check('modo abierto: la razon dice que cumple las condiciones', rAbierto.razones.some((x) => x.tipo === 'modo_abierto'));

  const conRol = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: '', ubicacion: '' }, perfilAbierto);
  check('modo abierto: un rol que igual calza suma por encima de la base', conRol.score > rAbierto.score);

  const vetada = AP.puntuarOferta({ titulo: 'Vendedor con comision pura', empresa: '', cuerpo: '', ubicacion: '' }, perfilAbierto);
  check('modo abierto: el veto sigue descartando', vetada.banda === 'descartar');

  const pideTitulo = AP.puntuarOferta({ titulo: 'Asistente administrativo', empresa: '', cuerpo: 'Requisito: titulo profesional al dia', ubicacion: '' }, perfilAbierto);
  check('modo abierto: pide titulo y el CV no lo acredita -> descarta', pideTitulo.banda === 'descartar' && pideTitulo.razones[0].tipo === 'requisito');

  const conTitulo = Object.assign({}, perfilAbierto, { tiene: { titulo: true, licencias: [], ingles: false } });
  const rConTitulo = AP.puntuarOferta({ titulo: 'Asistente administrativo', empresa: '', cuerpo: 'Requisito: titulo profesional al dia', ubicacion: '' }, conTitulo);
  check('modo abierto: si el CV acredita el titulo, no se descarta', rConTitulo.banda !== 'descartar');

  const pideLicencia = AP.puntuarOferta({ titulo: 'Repartidor', empresa: '', cuerpo: 'Se requiere licencia clase a-2 al dia', ubicacion: '' }, perfilAbierto);
  check('modo abierto: pide licencia profesional que no tiene -> descarta', pideLicencia.banda === 'descartar');

  const sinDatosDelCv = Object.assign({}, perfilAbierto, { tiene: undefined });
  const rSinDatos = AP.puntuarOferta({ titulo: 'Asistente', empresa: '', cuerpo: 'Requisito: titulo profesional al dia', ubicacion: '' }, sinDatosDelCv);
  check('modo abierto: sin datos del CV no se descarta por requisitos (la duda no descarta)', rSinDatos.banda !== 'descartar');

  const rCerradoConTitulo = AP.puntuarOferta({ titulo: 'Vendedor de tienda', empresa: '', cuerpo: 'Deseable titulo profesional al dia', ubicacion: '' }, Object.assign({}, perfilCerrado, { tiene: { titulo: false, licencias: [], ingles: false } }));
  check('modo objetivo: una mencion de titulo no descarta nada', rCerradoConTitulo.banda === 'postular');
}


console.log('\n' + (fallos === 0 ? `Todo OK (0 fallos).` : `${fallos} fallo(s).`));
process.exit(fallos === 0 ? 0 : 1);
