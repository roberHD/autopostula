// ═══════════════════════════════════════════════════════════════
//  AutoPostula — rubros, tipos de venta y familias de cargos de Chile
//  (para el filtro de ofertas: docs/filtro-por-rubro-2026-11-14.md)
//
//  Escrito a mano, a partir de 901 ofertas reales vistas por la extensión en
//  Computrabajo, Laborum y Trabajando entre septiembre y noviembre de 2026.
//  Se carga ANTES que core.js (ver manifest.json). Sin este archivo el filtro
//  funciona igual que antes: solo mira el cargo.
//
//  Todo va en minúsculas y sin tildes, como deja el texto AP.n.
//  - palabras: palabras del rubro. Aceptan el plural y se buscan en el título,
//    en la empresa y en la descripción.
//  - marcas: nombres propios, tal cual. Solo se buscan en el título y en la
//    empresa: en una descripción, "converse" o "guess" pueden ser otra cosa.
//  - excepto: frases que se sacan antes de buscar ("fibra optica" no es óptica).
//  - soloTitulo: el rubro no se lee en el nombre de la empresa ("Inmobiliaria e
//    Inversiones X" es la razón social de cualquier negocio).
//
//  Cuidado al agregar: una marca que también es una palabra común ("vans",
//  "lider", "patagonia", "top") marca de moda cualquier aviso que la diga.
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';
// En las páginas es window; en el service worker (background.js) no hay window.
const raiz = typeof window !== 'undefined' ? window : self;
const AP = raiz.AP = raiz.AP || {};

// ── Tipos de venta ────────────────────────────────────────────────
// Cómo se vende: detrás de un mostrador, en la calle, por teléfono...
// "Vendedor" a secas no lo dice; el título casi siempre sí.
AP.CANALES_CL = [
  { id: 'tienda', nombre: 'venta en tienda',
    palabras: ['tienda', 'mall', 'outlet', 'local', 'retail', 'boutique', 'stand', 'modulo', 'sala de ventas',
      'centro comercial', 'punto de venta', 'meson', 'multitienda', 'showroom',
      // Centros comerciales que los avisos nombran sin decir "mall".
      'parque arauco', 'costanera center', 'alto las condes', 'plaza vespucio', 'plaza norte', 'plaza oeste',
      'plaza egana', 'plaza tobalaba', 'plaza sur', 'plaza alameda', 'los dominicos', 'florida center',
      'portal la dehesa', 'portal nunoa', 'portal la reina', 'apumanque', 'easton', 'arauco maipu',
      'arauco estacion', 'arauco quilicura', 'vivo los trapenses', 'espacio urbano', 'midmall'] },
  { id: 'terreno', nombre: 'venta en terreno',
    palabras: ['terreno', 'puerta a puerta', 'preventa', 'pre venta', 'canal tradicional', 'cobertura', 'visitador',
      'visitadora', 'cobrador'] },
  { id: 'telefono', nombre: 'venta por teléfono',
    palabras: ['call center', 'callcenter', 'contact center', 'telefonico', 'telefonica', 'telemarketing', 'televenta',
      'inbound', 'outbound', 'contactabilidad'] },
  { id: 'empresas', nombre: 'venta a empresas',
    palabras: ['b2b', 'corporativo', 'corporativa', 'industrial', 'tecnico', 'tecnica', 'kam', 'key account', 'mayorista',
      'pyme', 'constructoras', 'licitaciones', 'empresas'] },
  { id: 'remoto', nombre: 'venta por internet o desde la casa',
    palabras: ['remoto', 'remota', 'teletrabajo', 'desde casa', 'home office', 'on line', 'online', 'por internet',
      'digitales', 'redes sociales', 'virtual', 'ecommerce', 'e commerce', 'e comerce', 'marketplace'] },
  { id: 'directa', nombre: 'venta directa por comisión',
    palabras: ['venta directa', 'comisionista', 'freelance', 'independiente', 'emprendedor', 'emprendedora', 'multinivel',
      'segundo ingreso', 'duenas de casa', 'todas las regiones', 'todo latam', 'chilenas o extranjeras',
      'gestiona tus tiempos', 'por comision'] },
];

// ── Rubros ────────────────────────────────────────────────────────
// clase 'tienda': comercio que atiende público en un local.
// clase 'especializado': servicios, intangibles y venta técnica; quien busca
// trabajo en una tienda no está buscando esto.
// afines: rubros que una persona que prefiere este suele aceptar igual.
AP.SECTORES_CL = [
  { id: 'vestuario', nombre: 'vestuario y moda', clase: 'tienda', afines: ['calzado', 'deportes', 'accesorios', 'multitienda'],
    palabras: ['vestuario', 'moda', 'ropa', 'textil', 'fashion', 'sastreria', 'lenceria', 'jeans', 'indumentaria', 'corseteria'],
    marcas: ['adidas', 'nike', 'puma', 'reebok', 'under armour', 'h&m', 'zara', 'mango', 'levis', "levi's", 'levi strauss',
      'forever 21', 'tricot', "fashion's park", 'fashions park', 'family shop', 'americanino', 'esprit', 'gap',
      'banana republic', 'tommy hilfiger', 'calvin klein', 'lacoste', 'guess', 'foster', 'ellus', 'maui', 'volcom',
      'rip curl', 'billabong', 'quiksilver', 'the north face', 'north face', 'columbia', 'lippi', 'doite', 'helly hansen',
      'raindoor', 'umbrale', 'allsaints', 'all saints', 'privilege', 'rapsodia', 'wados', 'opposite', 'sybilla', 'basement',
      'alaniz', 'brooks brothers', 'ralph lauren', 'massimo dutti', 'bershka', 'pull&bear', 'pull and bear', 'stradivarius',
      'oysho', 'italmod', 'grupo limonada', 'intime', 'textil flores', 'colloky', 'opaline', 'colgram', 'eurofashion',
      'americanfashion', 'kayser', 'caffarena', 'monarch', 'saville row', 'dockers', 'rockford', 'kliper', 'haka honu',
      'mammut', 'marmot', 'andesgear', 'lounge s.a.'] },
  { id: 'calzado', nombre: 'calzado', clase: 'tienda', afines: ['vestuario', 'deportes', 'accesorios', 'multitienda'],
    palabras: ['calzado', 'zapateria', 'zapatos', 'zapatillas'],
    marcas: ['bata', 'guante', 'gacel', 'hush puppies', 'skechers', 'aldo', 'pollini', 'converse', 'crocs', 'merrell', 'forus',
      'cardinale', 'via uno', 'azaleia', 'north star', 'new balance', 'asics', 'payless', 'prune', 'panama jack',
      'birkenstock', 'clarks', 'timberland', 'ecco', 'geox', 'dr martens', 'foot locker', 'footlocker', 'funsport',
      "the athlete's foot", 'weinbrenner', 'bubblegummers'] },
  { id: 'deportes', nombre: 'artículos deportivos', clase: 'tienda', afines: ['vestuario', 'calzado'],
    palabras: ['deportiva', 'deportivo', 'deportes', 'outdoor', 'bicicletas'],
    marcas: ['decathlon', 'sparta', 'belsport', 'bold', 'ibikes'] },
  { id: 'accesorios', nombre: 'accesorios, joyas y lentes', clase: 'tienda', afines: ['vestuario', 'calzado'],
    palabras: ['accesorios', 'carteras', 'joyeria', 'joyas', 'relojeria', 'relojes', 'bijouterie', 'bisuteria', 'lentes',
      'optica', 'maletas'],
    marcas: ['parfois', 'isadora', 'todomoda', 'blue star', 'swarovski', 'pandora', 'swatch', 'festina', 'casio', 'rayban',
      'ray ban', 'rotter y krauss', 'rotter & krauss', 'gmo', 'essilorluxottica', 'luxottica', 'sunglass hut', 'saxoline',
      'samsonite', 'maletas chile', 'tumi', 'place vendome', 'econopticas', 'schilling'],
    excepto: ['fibra optica', 'accesorios automotrices', 'accesorios para vehiculos'] },
  { id: 'multitienda', nombre: 'grandes tiendas', clase: 'tienda', afines: ['vestuario', 'calzado', 'accesorios', 'belleza', 'hogar', 'tecnologia'],
    palabras: ['grandes tienda', 'gran tienda', 'multitienda', 'tienda por departamento', 'tiendas por departamento', 'departamental'],
    marcas: ['falabella', 'paris', 'ripley', 'hites', 'la polar', 'abcdin', 'corona', 'johnson'] },
  { id: 'belleza', nombre: 'belleza y perfumería', clase: 'tienda', afines: [],
    palabras: ['belleza', 'perfumeria', 'perfumes', 'fragancias', 'cosmetica', 'cosmeticos', 'maquillaje', 'maquillador',
      'maquilladora', 'dermocosmetica', 'dermoconsejera', 'skincare', 'beauty', 'cuidado personal', 'higiene bucal'],
    marcas: ['kiko milano', 'sephora', 'dbs', 'preunic', 'maicao', 'elite perfumes', "l'oreal", 'loreal', 'the body shop',
      'pichara', 'sally beauty', 'natura', 'edgewell'] },
  { id: 'tecnologia', nombre: 'tecnología y electrónica', clase: 'tienda', afines: [],
    palabras: ['tecnologia', 'electronica', 'electro', 'electrodomesticos', 'linea blanca', 'celulares', 'computacion', 'tv',
      'audio', 'impresoras'],
    marcas: ['samsung', 'apple', 'reifstore', 'maconline', 'pc factory', 'casa royal', 'mobile outfitters', 'dyson', 'sony',
      'xiaomi', 'huawei', 'motorola'] },
  { id: 'telecom', nombre: 'telefonía e internet', clase: 'tienda', afines: [],
    palabras: ['telecomunicaciones', 'fibra optica', 'telefonia', 'planes moviles', 'internet hogar', 'movil y hogar'],
    marcas: ['wom', 'entel', 'movistar', 'claro', 'vtr', 'gtd', 'mundo pacifico', 'atento', 'konecta'] },
  { id: 'hogar', nombre: 'hogar y decoración', clase: 'tienda', afines: [],
    palabras: ['hogar', 'decoracion', 'muebles', 'colchones', 'descanso', 'menaje'],
    marcas: ['rosen', 'casaideas', 'cannon', 'cic', 'ikea', 'homy', 'sokobox', 'muji', 'miniso', 'infanti'] },
  { id: 'ferreteria', nombre: 'ferretería y construcción', clase: 'tienda', afines: [],
    palabras: ['ferreteria', 'ferretero', 'construccion', 'patio constructor', 'gasfiteria', 'homecenter', 'constructor', 'materiales'],
    marcas: ['sodimac', 'easy', 'construmart', 'chilemat', 'shc'] },
  { id: 'alimentos', nombre: 'alimentos y bebidas', clase: 'tienda', afines: [],
    palabras: ['chocolateria', 'pasteleria', 'panaderia', 'heladeria', 'cafeteria', 'minimarket', 'supermercado',
      'carniceria', 'carnicero', 'carnicera', 'emporio', 'lacteos', 'licores', 'gourmet', 'saludable', 'alimentos', 'cafe',
      'abarrotes', 'botilleria'],
    marcas: ['la fete', 'nespresso', 'nestle', 'bresler', 'tarragona', 'mcdonald', "mcdonald's", 'starbucks', 'juan valdez',
      'liquidos.cl', 'piwen', 'ccu', 'jumbo', 'unimarc', 'tottus', 'santa isabel', 'torta caluga'] },
  { id: 'farmacia', nombre: 'farmacia y nutrición', clase: 'tienda', afines: [],
    palabras: ['farmacia', 'farmaceutico', 'farmaceutica', 'nutricion', 'nutricionales', 'suplementos', 'nutriconsejera'],
    marcas: ['cruz verde', 'salcobrand', 'ahumada', 'dr simi', 'knop', 'all nutrition', 'gnc'] },
  { id: 'mascotas', nombre: 'mascotas', clase: 'tienda', afines: [],
    palabras: ['mascotas', 'pet shop', 'petshop', 'veterinaria', 'veterinario'],
    marcas: ['superzoo', 'petco'] },
  { id: 'libreria', nombre: 'librería y juguetes', clase: 'tienda', afines: [],
    palabras: ['libreria', 'papeleria', 'jugueteria', 'juguetes', 'libros'],
    marcas: ['lapiz lopez', 'profesor klocker', 'feria chilena del libro'] },
  { id: 'combustibles', nombre: 'estaciones de servicio', clase: 'tienda', afines: [],
    palabras: ['combustible', 'bencinera', 'estacion de servicio'],
    marcas: ['esmax', 'copec', 'shell', 'petrobras', 'aramco'] },
  { id: 'automotriz', nombre: 'automotriz', clase: 'especializado', afines: [],
    palabras: ['automotriz', 'automotrices', 'automotora', 'vehiculos', 'autos', 'seminuevos', 'repuestos', 'neumaticos',
      'lubricentro', 'motos', 'buses', 'camiones'],
    marcas: ['anfruns', 'indumotora', 'gildemeister', 'inchcape', 'derco', 'salfa', 'kaufmann', 'autoplanet'] },
  { id: 'financiero', nombre: 'seguros, banca y créditos', clase: 'especializado', afines: [],
    palabras: ['seguro', 'banco', 'banca', 'bancario', 'bancaria', 'financiero', 'financiera', 'credito', 'tarjetas', 'afp',
      'isapre', 'previsional', 'hipotecario', 'factoring', 'cobranza', 'pensionado', 'intangible'],
    marcas: ['bancoestado', 'cmr', 'penta vida', 'hdi', 'avla', 'metlife', 'bci', 'santander', 'scotiabank',
      'itau', 'habitat', 'provida', 'cuprum', 'banigualdad'] },
  { id: 'inmobiliario', nombre: 'inmobiliario', clase: 'especializado', afines: [], soloTitulo: true,
    palabras: ['inmobiliario', 'inmobiliaria', 'propiedades', 'parcelas', 'corretaje'],
    marcas: [] },
  { id: 'salud', nombre: 'servicios de salud', clase: 'especializado', afines: [],
    palabras: ['salud', 'clinica', 'ambulancia', 'rescate', 'dental', 'medico', 'medica', 'enfermeria'],
    marcas: ['bupa', 'integramedica', 'redsalud'],
    excepto: ['clinica veterinaria', 'seguro de salud', 'seguro complementario de salud'] },
  { id: 'educacion', nombre: 'educación', clase: 'especializado', afines: [], soloTitulo: true,
    palabras: ['admision', 'admisiones', 'matriculas', 'preuniversitario', 'cursos'],
    marcas: [] },
  { id: 'industrial', nombre: 'industrial y técnico', clase: 'especializado', afines: [], soloTitulo: true,
    palabras: ['industrial', 'maquinaria', 'mineria', 'insumos', 'valvulas', 'bombas', 'acero', 'electrico', 'racks',
      'audiovisual', 'audiovisuales', 'eventos corporativos'],
    marcas: [] },
];

// ── Familias de cargos ────────────────────────────────────────────
// Títulos distintos para el mismo trabajo. Si el perfil de la persona trae
// alguno de la familia, los demás cuentan como ese mismo cargo: quien busca
// "vendedor" también quiere ver "Asistente de tienda" y "Promotor/a de
// Vestuario", que antes quedaban como "el cargo no se parece a lo que buscas".
//
// tienda: true = el cargo ya dice que es detrás de un mostrador. En los de
// tienda: false ("ejecutivo de ventas", "asistente comercial") puede ser una
// oficina, un call center o la calle, y hay que mirar el resto del aviso.
//
// terminosConTienda: títulos de la familia que también se usan para otra cosa.
// "Promotor" es quien promueve una marca en una tienda y también quien junta
// socios para una ONG en la calle ("Promotor PartTime para Unicef"): solo
// cuentan si el título o la empresa dicen tienda, mall o un rubro de tienda.
AP.FAMILIAS_CARGO_CL = [
  { id: 'venta_tienda', nombre: 'venta en tienda', tienda: true,
    terminos: ['vendedor', 'asesor de ventas', 'asistente de ventas', 'asesor de tienda', 'asistente de tienda',
      'promovendedor', 'consultor de belleza', 'asesor de moda', 'sales assistant', 'sales associate',
      'store associate', 'dependiente', 'asistente de experiencia de compras', 'asesor multifuncional'],
    terminosConTienda: ['promotor', 'consultor de ventas', 'asesor de clientes', 'activador', 'impulsador'] },
  { id: 'venta_consultiva', nombre: 'venta de oficina', tienda: false,
    terminos: ['ejecutivo de ventas', 'ejecutivo comercial', 'asesor comercial', 'asistente comercial',
      'representante de ventas', 'agente de ventas', 'agente comercial', 'gestor comercial', 'gestor de ventas'] },
];
})();
