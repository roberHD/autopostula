// Lista blanca cerrada para el parser determinista de títulos (etapa 1, sin IA) —
// ver docs/rediseno-filtrado-ofertas.md, §7.3. Namespace por país a propósito:
// el día que se agregue otro país (Perú, Colombia), esto no se toca, se agrega
// scripts/limpieza/<pais>.ts aparte.
//
// Regla dura: es una lista BLANCA. Si un término no está acá, se conserva tal
// cual en el título (nunca se infiere ni se adivina). Orden de aplicación al
// usar esta lista: malls -> comunas -> regiones -> resto, y siempre coincidencia
// por frase completa con límites de palabra (nunca subcadena), probando primero
// los términos más largos (más palabras) de cada categoría.
//
// Generado a partir de la lista entregada por Roberto el 2026-09-03.

export type TerminoLimpieza =
  | { termino: string; tipo: "comuna"; destino: "comuna"; region: string }
  | { termino: string; tipo: "mall"; destino: "descartar" }
  | { termino: string; tipo: "jornada"; destino: "jornada"; valor: string };

export const LISTA_LIMPIEZA_CL: TerminoLimpieza[] = [
  // =====================================================
  // COMUNAS DE CHILE
  // =====================================================

  // -------------------------
  // REGIÓN DE ARICA Y PARINACOTA
  // -------------------------
  { termino: "arica", tipo: "comuna", destino: "comuna", region: "AP" },
  { termino: "camarones", tipo: "comuna", destino: "comuna", region: "AP" },
  { termino: "general lagos", tipo: "comuna", destino: "comuna", region: "AP" },
  { termino: "putre", tipo: "comuna", destino: "comuna", region: "AP" },

  // -------------------------
  // REGIÓN DE TARAPACÁ
  // -------------------------
  { termino: "alto hospicio", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "camiña", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "camina", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "colchane", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "huara", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "iquique", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "pica", tipo: "comuna", destino: "comuna", region: "TA" },
  { termino: "pozo almonte", tipo: "comuna", destino: "comuna", region: "TA" },

  // -------------------------
  // REGIÓN DE ANTOFAGASTA
  // -------------------------
  { termino: "antofagasta", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "calama", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "maría elena", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "maria elena", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "mejillones", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "ollagüe", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "ollague", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "san pedro de atacama", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "sierra gorda", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "taltal", tipo: "comuna", destino: "comuna", region: "AN" },
  { termino: "tocopilla", tipo: "comuna", destino: "comuna", region: "AN" },

  // -------------------------
  // REGIÓN DE ATACAMA
  // -------------------------
  { termino: "alto del carmen", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "caldera", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "chañaral", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "chanaral", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "copiapó", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "copiapo", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "diego de almagro", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "freirina", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "huasco", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "tierra amarilla", tipo: "comuna", destino: "comuna", region: "AT" },
  { termino: "vallenar", tipo: "comuna", destino: "comuna", region: "AT" },

  // -------------------------
  // REGIÓN DE COQUIMBO
  // -------------------------
  { termino: "andacollo", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "canela", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "combarbalá", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "combarbala", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "coquimbo", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "illapel", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "la higuera", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "la serena", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "los vilos", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "monte patria", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "ovalle", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "paihuano", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "punitaqui", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "río hurtado", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "rio hurtado", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "salamanca", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "vicuña", tipo: "comuna", destino: "comuna", region: "CO" },
  { termino: "vicuna", tipo: "comuna", destino: "comuna", region: "CO" },

  // -------------------------
  // REGIÓN DE VALPARAÍSO
  // -------------------------
  { termino: "algarrobo", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "cabildo", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "calle larga", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "cartagena", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "casablanca", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "catemu", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "concón", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "concon", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "el quisco", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "el tabo", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "hijuelas", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "isla de pascua", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "rapa nui", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "juan fernández", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "juan fernandez", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "la calera", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "la cruz", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "la ligua", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "limache", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "llaillay", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "los andes", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "nogales", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "olmué", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "olmue", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "panquehue", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "papudo", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "petorca", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "puchuncaví", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "puchuncavi", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "putaendo", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "quillota", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "quilpué", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "quilpue", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "quintero", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "rinconada", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "san antonio", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "san esteban", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "san felipe", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "santa maría", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "santa maria", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "santo domingo", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "valparaíso", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "valparaiso", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "villa alemana", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "viña del mar", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "vina del mar", tipo: "comuna", destino: "comuna", region: "VA" },
  { termino: "zapallar", tipo: "comuna", destino: "comuna", region: "VA" },

  // -------------------------
  // REGIÓN METROPOLITANA
  // -------------------------
  { termino: "alhué", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "alhue", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "buin", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "calera de tango", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "cerrillos", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "cerro navia", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "colina", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "conchalí", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "conchali", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "curacaví", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "curacavi", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "el bosque", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "el monte", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "estación central", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "estacion central", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "e. central", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "huechuraba", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "independencia", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "isla de maipo", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "la cisterna", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "la florida", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "la granja", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "lampa", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "la pintana", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "la reina", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "las condes", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "lo barnechea", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "lo espejo", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "lo prado", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "macul", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "maipú", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "maipu", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "maría pinto", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "maria pinto", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "melipilla", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "ñuñoa", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "nunoa", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "padre hurtado", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "paine", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "pedro aguirre cerda", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "pac", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "peñaflor", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "penaflor", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "peñalolén", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "penalolen", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "pirque", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "providencia", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "pudahuel", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "puente alto", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "quilicura", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "quinta normal", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "recoleta", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "renca", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san bernardo", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san joaquín", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san joaquin", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san josé de maipo", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san jose de maipo", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san miguel", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san pedro", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san ramón", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "san ramon", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "santiago", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "stgo", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "talagante", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "tiltil", tipo: "comuna", destino: "comuna", region: "RM" },
  { termino: "vitacura", tipo: "comuna", destino: "comuna", region: "RM" },

  // -------------------------
  // REGIÓN DE O'HIGGINS
  // -------------------------
  { termino: "chépica", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "chepica", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "chimbarongo", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "codegua", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "coinco", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "coltauco", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "doñihue", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "donihue", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "graneros", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "la estrella", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "las cabras", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "litueche", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "lolol", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "machalí", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "machali", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "malloa", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "marchihue", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "marchigüe", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "marchigue", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "mostazal", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "nancagua", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "navidad", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "olivar", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "palmilla", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "paredones", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "peralillo", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "peumo", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "pichidegua", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "pichilemu", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "pinto", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "placilla", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "pumanque", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "quinta de tilcoco", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "rancagua", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "rengo", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "requínoa", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "requinoa", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "san fernando", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "santa cruz", tipo: "comuna", destino: "comuna", region: "OH" },
  { termino: "san vicente", tipo: "comuna", destino: "comuna", region: "OH" },

  // -------------------------
  // REGIÓN DEL MAULE
  // -------------------------
  { termino: "cauquenes", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "chanco", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "colbún", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "colbun", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "constitución", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "constitucion", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "curepto", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "curicó", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "curico", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "empedrado", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "hualañé", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "hualane", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "licantén", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "licanten", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "linares", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "longaví", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "longavi", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "maule", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "molina", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "parral", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "pelarco", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "pelluhue", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "pencahue", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "rauco", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "retiro", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "río claro", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "rio claro", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "romeral", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "sagrada familia", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "san clemente", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "san javier", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "san rafael", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "talca", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "teno", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "vichuquén", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "vichuquen", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "villa alegre", tipo: "comuna", destino: "comuna", region: "ML" },
  { termino: "yerbas buenas", tipo: "comuna", destino: "comuna", region: "ML" },

  // -------------------------
  // REGIÓN DE ÑUBLE
  // -------------------------
  { termino: "bulnes", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "chillán", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "chillan", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "chillán viejo", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "chillan viejo", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "cobquecura", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "coelemu", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "coihueco", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "el carmen", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "ninhue", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "ñiquén", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "niquen", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "pemuco", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "pinto", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "portezuelo", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "quillón", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "quillon", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "quirihue", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "ránquil", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "ranquil", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "san carlos", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "san fabián", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "san fabian", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "san ignacio", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "san nicolás", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "san nicolas", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "treguaco", tipo: "comuna", destino: "comuna", region: "NB" },
  { termino: "yungay", tipo: "comuna", destino: "comuna", region: "NB" },

  // -------------------------
  // REGIÓN DEL BIOBÍO
  // -------------------------
  { termino: "alto biobío", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "alto biobio", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "antuco", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "arauco", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "cabrero", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "cañete", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "canete", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "chiguayante", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "concepción", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "concepcion", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "contulmo", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "coronel", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "curanilahue", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "florida", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "hualpén", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "hualpen", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "hualqui", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "laja", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "lebu", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "los alamos", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "los álamos", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "los angeles", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "los ángeles", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "lota", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "mulchén", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "mulchen", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "nacimiento", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "negrete", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "penco", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "quilaco", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "quilleco", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "san pedro de la paz", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "san rosendo", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "santa bárbara", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "santa barbara", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "santa juana", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "talcahuano", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "tirúa", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "tirua", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "tomé", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "tome", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "tucapel", tipo: "comuna", destino: "comuna", region: "BI" },
  { termino: "yumbel", tipo: "comuna", destino: "comuna", region: "BI" },

  // -------------------------
  // REGIÓN DE LA ARAUCANÍA
  // -------------------------
  { termino: "angol", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "carahue", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "cholchol", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "collipulli", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "cunco", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "curacautín", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "curacautin", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "curarrehue", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "ercilla", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "freire", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "galvarino", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "gorbea", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "lautaro", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "loncoche", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "lonquimay", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "los sauces", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "lumaco", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "melipeuco", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "nueva imperial", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "padre las casas", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "perquenco", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "pitrufquén", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "pitrufquen", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "pucón", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "pucon", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "purén", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "puren", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "renaico", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "saavedra", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "temuco", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "teodoro schmidt", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "toltén", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "tolten", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "traiguén", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "traiguen", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "victoria", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "vilcún", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "vilcun", tipo: "comuna", destino: "comuna", region: "AR" },
  { termino: "villarrica", tipo: "comuna", destino: "comuna", region: "AR" },

  // -------------------------
  // REGIÓN DE LOS RÍOS
  // -------------------------
  { termino: "corral", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "futrono", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "lago ranco", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "lanco", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "la unión", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "la union", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "los lagos", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "máfil", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "mafil", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "mariquina", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "san josé de la mariquina", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "paillaco", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "panguipulli", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "río bueno", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "rio bueno", tipo: "comuna", destino: "comuna", region: "LR" },
  { termino: "valdivia", tipo: "comuna", destino: "comuna", region: "LR" },

  // -------------------------
  // REGIÓN DE LOS LAGOS
  // -------------------------
  { termino: "ancud", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "calbuco", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "castro", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "chaitén", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "chaiten", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "chonchi", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "cochamó", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "cochamo", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "curaco de vélez", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "curaco de velez", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "dalcahue", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "fresia", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "frutillar", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "futaleufú", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "futaleufu", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "hualaihué", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "hualaihue", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "llanquihue", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "los muermos", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "maullín", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "maullin", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "osorno", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "palena", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "puerto montt", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "pto montt", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "puerto octay", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "puerto varas", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "puqueldón", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "puqueldon", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "purranque", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "puyehue", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "queilén", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "queilen", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "quellón", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "quellon", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "quemchi", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "quinchao", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "río negro", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "rio negro", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "san juan de la costa", tipo: "comuna", destino: "comuna", region: "LL" },
  { termino: "san pablo", tipo: "comuna", destino: "comuna", region: "LL" },

  // -------------------------
  // REGIÓN DE AYSÉN
  // -------------------------
  { termino: "aysén", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "aysen", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "chile chico", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "cisnes", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "cochrane", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "coyhaique", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "guaitecas", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "lago verde", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "o'higgins", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "ohiggins", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "río ibáñez", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "rio ibanez", tipo: "comuna", destino: "comuna", region: "AI" },
  { termino: "tortel", tipo: "comuna", destino: "comuna", region: "AI" },

  // -------------------------
  // REGIÓN DE MAGALLANES
  // -------------------------
  { termino: "antártica", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "antartica", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "cabo de hornos", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "laguna blanca", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "natales", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "porvenir", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "primavera", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "punta arenas", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "rio verde", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "río verde", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "san gregorio", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "timaukel", tipo: "comuna", destino: "comuna", region: "MA" },
  { termino: "torres del paine", tipo: "comuna", destino: "comuna", region: "MA" },


  // =====================================================
  // MALLS / CENTROS COMERCIALES / OUTLETS
  // =====================================================

  // -------------------------
  // ARICA
  // -------------------------
  { termino: "mallplaza arica", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza arica", tipo: "mall", destino: "descartar" },
  { termino: "mall arica", tipo: "mall", destino: "descartar" },
  { termino: "mall las américas", tipo: "mall", destino: "descartar" },
  { termino: "mall las americas", tipo: "mall", destino: "descartar" },

  // -------------------------
  // TARAPACÁ
  // -------------------------
  { termino: "mall zofri", tipo: "mall", destino: "descartar" },
  { termino: "zofri", tipo: "mall", destino: "descartar" },
  { termino: "zona franca iquique", tipo: "mall", destino: "descartar" },
  { termino: "mall zofri iquique", tipo: "mall", destino: "descartar" },
  { termino: "centro comercial zofri", tipo: "mall", destino: "descartar" },

  // -------------------------
  // ANTOFAGASTA
  // -------------------------
  { termino: "mallplaza antofagasta", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza antofagasta", tipo: "mall", destino: "descartar" },
  { termino: "mall antofagasta", tipo: "mall", destino: "descartar" },
  { termino: "antofagasta shopping", tipo: "mall", destino: "descartar" },
  { termino: "cenco costanera antofagasta", tipo: "mall", destino: "descartar" },
  { termino: "patio la chimba", tipo: "mall", destino: "descartar" },
  { termino: "patio la chimba ii", tipo: "mall", destino: "descartar" },
  { termino: "cenco angamos", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza calama", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza calama", tipo: "mall", destino: "descartar" },
  { termino: "arauco express calama", tipo: "mall", destino: "descartar" },

  // -------------------------
  // ATACAMA
  // -------------------------
  { termino: "mallplaza copiapó", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza copiapó", tipo: "mall", destino: "descartar" },
  { termino: "mall copiapó", tipo: "mall", destino: "descartar" },
  { termino: "patio los carrera", tipo: "mall", destino: "descartar" },

  // -------------------------
  // COQUIMBO
  // -------------------------
  { termino: "mallplaza la serena", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza la serena", tipo: "mall", destino: "descartar" },
  { termino: "mall la serena", tipo: "mall", destino: "descartar" },
  { termino: "paseo balmaceda", tipo: "mall", destino: "descartar" },
  { termino: "vivo outlet peñuelas", tipo: "mall", destino: "descartar" },
  { termino: "vivo outlet penuelas", tipo: "mall", destino: "descartar" },
  { termino: "open plaza ovalle", tipo: "mall", destino: "descartar" },
  { termino: "mall coquimbo", tipo: "mall", destino: "descartar" },
  { termino: "vivo mall coquimbo", tipo: "mall", destino: "descartar" },
  { termino: "arauco premium outlet coquimbo", tipo: "mall", destino: "descartar" },

  // -------------------------
  // VALPARAÍSO
  // -------------------------
  { termino: "mall marina", tipo: "mall", destino: "descartar" },
  { termino: "marina arauco", tipo: "mall", destino: "descartar" },
  { termino: "espacio urbano 15 norte", tipo: "mall", destino: "descartar" },
  { termino: "portal valparaíso", tipo: "mall", destino: "descartar" },
  { termino: "portal valparaiso", tipo: "mall", destino: "descartar" },
  { termino: "arauco premium outlet curauma", tipo: "mall", destino: "descartar" },
  { termino: "patio villa alemana", tipo: "mall", destino: "descartar" },
  { termino: "portal belloto", tipo: "mall", destino: "descartar" },
  { termino: "patio concón", tipo: "mall", destino: "descartar" },
  { termino: "patio concon", tipo: "mall", destino: "descartar" },
  { termino: "open plaza la calera", tipo: "mall", destino: "descartar" },
  { termino: "open plaza san felipe", tipo: "mall", destino: "descartar" },
  { termino: "arauco san antonio", tipo: "mall", destino: "descartar" },
  { termino: "arauco express palmares", tipo: "mall", destino: "descartar" },

  // -------------------------
  // REGIÓN METROPOLITANA
  // -------------------------
  { termino: "mallplaza vespucio", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza vespucio", tipo: "mall", destino: "descartar" },
  { termino: "vespucio", tipo: "mall", destino: "descartar" },
  { termino: "mall vespucio", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza norte", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza norte", tipo: "mall", destino: "descartar" },
  { termino: "mall norte", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza oeste", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza oeste", tipo: "mall", destino: "descartar" },
  { termino: "mall oeste", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza alameda", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza alameda", tipo: "mall", destino: "descartar" },
  { termino: "mall alameda", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza egaña", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza egaña", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza egana", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza egana", tipo: "mall", destino: "descartar" },
  { termino: "mall egaña", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza los dominicos", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza los dominicos", tipo: "mall", destino: "descartar" },
  { termino: "los dominicos", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza tobalaba", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza tobalaba", tipo: "mall", destino: "descartar" },
  { termino: "tobalaba", tipo: "mall", destino: "descartar" },

  { termino: "costanera center", tipo: "mall", destino: "descartar" },
  { termino: "costanera", tipo: "mall", destino: "descartar" },
  { termino: "cenco costanera", tipo: "mall", destino: "descartar" },
  { termino: "mall costanera", tipo: "mall", destino: "descartar" },

  { termino: "alto las condes", tipo: "mall", destino: "descartar" },
  { termino: "alto de las condes", tipo: "mall", destino: "descartar" },
  { termino: "cenco alto las condes", tipo: "mall", destino: "descartar" },
  { termino: "cenco alto", tipo: "mall", destino: "descartar" },

  { termino: "parque arauco", tipo: "mall", destino: "descartar" },
  { termino: "parque arauco kennedy", tipo: "mall", destino: "descartar" },
  { termino: "arauco kennedy", tipo: "mall", destino: "descartar" },
  { termino: "kennedy", tipo: "mall", destino: "descartar" },

  { termino: "cenco florida", tipo: "mall", destino: "descartar" },
  { termino: "florida center", tipo: "mall", destino: "descartar" },
  { termino: "mall florida center", tipo: "mall", destino: "descartar" },
  { termino: "mall florida", tipo: "mall", destino: "descartar" },

  { termino: "cenco la dehesa", tipo: "mall", destino: "descartar" },
  { termino: "portal la dehesa", tipo: "mall", destino: "descartar" },
  { termino: "la dehesa", tipo: "mall", destino: "descartar" },

  { termino: "cenco la reina", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza la reina", tipo: "mall", destino: "descartar" },
  { termino: "la reina shopping", tipo: "mall", destino: "descartar" },

  { termino: "cenco el llano", tipo: "mall", destino: "descartar" },
  { termino: "el llano", tipo: "mall", destino: "descartar" },
  { termino: "mall el llano", tipo: "mall", destino: "descartar" },

  { termino: "cenco ñuñoa", tipo: "mall", destino: "descartar" },
  { termino: "cenco nunoa", tipo: "mall", destino: "descartar" },
  { termino: "mall ñuñoa", tipo: "mall", destino: "descartar" },
  { termino: "mall nunoa", tipo: "mall", destino: "descartar" },

  { termino: "arauco maipú", tipo: "mall", destino: "descartar" },
  { termino: "arauco maipu", tipo: "mall", destino: "descartar" },
  { termino: "mall arauco maipú", tipo: "mall", destino: "descartar" },
  { termino: "mall arauco maipu", tipo: "mall", destino: "descartar" },

  { termino: "arauco estación", tipo: "mall", destino: "descartar" },
  { termino: "arauco estacion", tipo: "mall", destino: "descartar" },
  { termino: "mall estación", tipo: "mall", destino: "descartar" },
  { termino: "mall estacion", tipo: "mall", destino: "descartar" },

  { termino: "arauco quilicura", tipo: "mall", destino: "descartar" },
  { termino: "mall arauco quilicura", tipo: "mall", destino: "descartar" },
  { termino: "buenaventura", tipo: "mall", destino: "descartar" },
  { termino: "arauco premium outlet buenaventura", tipo: "mall", destino: "descartar" },
  { termino: "premium outlet buenaventura", tipo: "mall", destino: "descartar" },

  { termino: "arauco el bosque", tipo: "mall", destino: "descartar" },
  { termino: "mall el bosque", tipo: "mall", destino: "descartar" },

  { termino: "patio valle grande", tipo: "mall", destino: "descartar" },
  { termino: "valle grande", tipo: "mall", destino: "descartar" },

  { termino: "espacio urbano melipilla", tipo: "mall", destino: "descartar" },
  { termino: "mall melipilla", tipo: "mall", destino: "descartar" },

  // -------------------------
  // O'HIGGINS
  // -------------------------
  { termino: "cenco rancagua", tipo: "mall", destino: "descartar" },
  { termino: "mall cenco rancagua", tipo: "mall", destino: "descartar" },
  { termino: "mall rancagua", tipo: "mall", destino: "descartar" },
  { termino: "open plaza rancagua", tipo: "mall", destino: "descartar" },
  { termino: "portal rancagua", tipo: "mall", destino: "descartar" },
  { termino: "mall patio rancagua", tipo: "mall", destino: "descartar" },
  { termino: "vivo mall san fernando", tipo: "mall", destino: "descartar" },
  { termino: "mall vivo san fernando", tipo: "mall", destino: "descartar" },
  { termino: "patio chimbarongo", tipo: "mall", destino: "descartar" },

  // -------------------------
  // MAULE
  // -------------------------
  { termino: "mall curicó", tipo: "mall", destino: "descartar" },
  { termino: "mall curico", tipo: "mall", destino: "descartar" },
  { termino: "paseo las rastras", tipo: "mall", destino: "descartar" },
  { termino: "espacio urbano linares", tipo: "mall", destino: "descartar" },
  { termino: "mall talca", tipo: "mall", destino: "descartar" },
  { termino: "paseo maule", tipo: "mall", destino: "descartar" },

  // -------------------------
  // ÑUBLE
  // -------------------------
  { termino: "arauco chillán", tipo: "mall", destino: "descartar" },
  { termino: "arauco chillan", tipo: "mall", destino: "descartar" },
  { termino: "mall arauco chillán", tipo: "mall", destino: "descartar" },
  { termino: "mall arauco chillan", tipo: "mall", destino: "descartar" },
  { termino: "open plaza chillán", tipo: "mall", destino: "descartar" },
  { termino: "open plaza chillan", tipo: "mall", destino: "descartar" },
  { termino: "patio alonso de ercilla", tipo: "mall", destino: "descartar" },
  { termino: "mall chillán", tipo: "mall", destino: "descartar" },
  { termino: "mall chillan", tipo: "mall", destino: "descartar" },

  // -------------------------
  // BIOBÍO
  // -------------------------
  { termino: "mallplaza trébol", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza trebol", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza trébol", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza trebol", tipo: "mall", destino: "descartar" },
  { termino: "mall trébol", tipo: "mall", destino: "descartar" },
  { termino: "mall trebol", tipo: "mall", destino: "descartar" },

  { termino: "mall del centro concepción", tipo: "mall", destino: "descartar" },
  { termino: "mall del centro concepcion", tipo: "mall", destino: "descartar" },
  { termino: "mall del centro", tipo: "mall", destino: "descartar" },

  { termino: "mallplaza bio bio", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza biobío", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza mirador bio bio", tipo: "mall", destino: "descartar" },

  { termino: "arauco premium outlet san pedro", tipo: "mall", destino: "descartar" },
  { termino: "premium outlet san pedro", tipo: "mall", destino: "descartar" },

  { termino: "patio andalué", tipo: "mall", destino: "descartar" },
  { termino: "patio andalue", tipo: "mall", destino: "descartar" },
  { termino: "patio bosquemar", tipo: "mall", destino: "descartar" },
  { termino: "arauco coronel", tipo: "mall", destino: "descartar" },
  { termino: "paseo montt", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza los ángeles", tipo: "mall", destino: "descartar" },
  { termino: "mallplaza los angeles", tipo: "mall", destino: "descartar" },
  { termino: "mall plaza los ángeles", tipo: "mall", destino: "descartar" },

  // -------------------------
  // ARAUCANÍA
  // -------------------------
  { termino: "portal temuco", tipo: "mall", destino: "descartar" },
  { termino: "mall temuco", tipo: "mall", destino: "descartar" },
  { termino: "cenco temuco", tipo: "mall", destino: "descartar" },
  { termino: "patio general bonilla", tipo: "mall", destino: "descartar" },
  { termino: "patio padre las casas", tipo: "mall", destino: "descartar" },
  { termino: "patio barrio inglés", tipo: "mall", destino: "descartar" },
  { termino: "patio barrio ingles", tipo: "mall", destino: "descartar" },
  { termino: "patio rudecindo ortega", tipo: "mall", destino: "descartar" },
  { termino: "patio labranza", tipo: "mall", destino: "descartar" },
  { termino: "vivo outlet temuco", tipo: "mall", destino: "descartar" },
  { termino: "patio victoria", tipo: "mall", destino: "descartar" },

  // -------------------------
  // LOS RÍOS
  // -------------------------
  { termino: "portal valdivia", tipo: "mall", destino: "descartar" },
  { termino: "mall valdivia", tipo: "mall", destino: "descartar" },

  // -------------------------
  // LOS LAGOS
  // -------------------------
  { termino: "portal osorno", tipo: "mall", destino: "descartar" },
  { termino: "cenco osorno", tipo: "mall", destino: "descartar" },
  { termino: "mall osorno", tipo: "mall", destino: "descartar" },
  { termino: "patio rahue", tipo: "mall", destino: "descartar" },
  { termino: "paseo costanera", tipo: "mall", destino: "descartar" },
  { termino: "paseo del mar", tipo: "mall", destino: "descartar" },
  { termino: "paseo rotonda", tipo: "mall", destino: "descartar" },
  { termino: "paseo paloma", tipo: "mall", destino: "descartar" },
  { termino: "paseo cardonal", tipo: "mall", destino: "descartar" },
  { termino: "patio los alerces", tipo: "mall", destino: "descartar" },
  { termino: "patio los notros", tipo: "mall", destino: "descartar" },
  { termino: "patio torres del puerto", tipo: "mall", destino: "descartar" },
  { termino: "patio presidente ibáñez", tipo: "mall", destino: "descartar" },
  { termino: "patio presidente ibanez", tipo: "mall", destino: "descartar" },
  { termino: "paseo chiloé", tipo: "mall", destino: "descartar" },
  { termino: "paseo chiloe", tipo: "mall", destino: "descartar" },
  { termino: "patio llanquihue", tipo: "mall", destino: "descartar" },
  { termino: "paseo puerto varas", tipo: "mall", destino: "descartar" },
  { termino: "patio colón puerto varas", tipo: "mall", destino: "descartar" },
  { termino: "patio colon puerto varas", tipo: "mall", destino: "descartar" },

  // -------------------------
  // AYSÉN
  // -------------------------
  { termino: "espacio urbano pionero", tipo: "mall", destino: "descartar" },
  { termino: "mall pionero", tipo: "mall", destino: "descartar" },

  // =====================================================
  // JORNADAS
  // =====================================================

  // PART TIME
  { termino: "part time", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "part-time", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "parttime", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "media jornada", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "jornada parcial", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "medio tiempo", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "tiempo parcial", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "20 horas", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "25 horas", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "30 horas", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "18 horas", tipo: "jornada", destino: "jornada", valor: "part_time" },
  { termino: "16 horas", tipo: "jornada", destino: "jornada", valor: "part_time" },

  // FULL TIME
  { termino: "full time", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "full-time", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "fulltime", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "tiempo completo", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "jornada completa", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "45 horas", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "44 horas", tipo: "jornada", destino: "jornada", valor: "full_time" },
  { termino: "40 horas", tipo: "jornada", destino: "jornada", valor: "full_time" },

  // =====================================================
  // TURNOS / HORARIOS HABITUALES
  // =====================================================
  { termino: "turno mañana", tipo: "jornada", destino: "jornada", valor: "turno_manana" },
  { termino: "turno tarde", tipo: "jornada", destino: "jornada", valor: "turno_tarde" },
  { termino: "turno noche", tipo: "jornada", destino: "jornada", valor: "turno_noche" },
  { termino: "turnos rotativos", tipo: "jornada", destino: "jornada", valor: "turnos_rotativos" },
  { termino: "turno rotativo", tipo: "jornada", destino: "jornada", valor: "turnos_rotativos" },

];
