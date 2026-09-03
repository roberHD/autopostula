// Scrape semilla del corpus de títulos (docs/rediseno-filtrado-ofertas.md, §7.1).
//
// ESTADO (2026-09-03): probado en vivo y NO funciona tal cual todavía.
// - Computrabajo devuelve 403 en todo -- su anti-bot bloquea el User-Agent
//   identificado. No se intentó camuflarlo como navegador real para sortearlo
//   (el propio documento pide "identificable, no falseado").
// - Laborum devuelve 0 títulos -- es una SPA, el HTML que llega con fetch()
//   viene vacío (el listado lo arma JavaScript después de cargar, con datos que
//   salen de un endpoint interno /api/avisos/searchV2). Este script solo lee
//   HTML crudo, no ejecuta JS, así que nunca ve el contenido real.
// Decisión (con Roberto): no perseguir esto ahora. El corpus se arma solo, más
// lento pero sin este riesgo, con la cosecha pasiva de la extensión (§7.2, ya
// funcionando -- ver /api/extension/titulos-vistos). Este script queda tal cual
// por si más adelante conviene retomarlo (ej. con un navegador headless real
// para Laborum, o si cambia algo del lado de Computrabajo).
//
// Uso manual, UNA sola vez, a mano, desde tu propia máquina -- no se expone por
// HTTP, no se referencia desde la app, no se automatiza ni se agenda:
//   npx tsx scripts/scrape-corpus.ts
//
// Reglas de ejecución (del documento, no negociables):
// - 1 request cada 2-3 segundos, sin paralelizar.
// - User-Agent identificable, no falseado.
// - Solo Computrabajo y Laborum -- NO Indeed (ver §7.1 del documento para el porqué).
// - Se extraen TÍTULOS de las páginas de LISTADO, nunca el detalle de cada aviso.
// - El resultado crudo se guarda en scripts/data/corpus-crudo.json antes que nada
//   más, para no tener que repetir el scrape si hay que iterar la limpieza después.
//
// URLs y selectores verificados a mano contra los sitios reales el 2026-09-03
// (no asumidos -- ver nota del documento sobre "verificar contra el sitio").
import { writeFileSync, existsSync, mkdirSync } from "fs";
import * as cheerio from "cheerio";

const USER_AGENT =
  "AutoPostulaCorpusBot/1.0 (+https://autopostula.vercel.app; scrape unico y manual para armar un corpus de titulos de cargo; contacto: rober.hidalgo2004@gmail.com)";

const RITMO_MS = 2700; // dentro del rango pedido de 2-3s
const PAGINAS_POR_BUSQUEDA = 8; // ~20 titulos/pagina -> ~160 por busqueda por portal

// Set inicial de búsquedas -- pensado para el tipo de rubros que ya aparecen en
// toda la app (retail, atención al cliente, ventas). Editar esta lista y volver a
// correr el script es la forma normal de ampliar el corpus a otros rubros.
const BUSQUEDAS = [
  "vendedor",
  "cajero",
  "atencion-al-cliente",
  "reponedor",
  "bodega",
  "administrativo",
  "recepcionista",
  "guardia-de-seguridad",
  "garzon",
  "cocina",
  "aseo",
  "operario",
  "chofer",
  "teleoperador",
  "promotor",
  "asesor-comercial",
  "auxiliar",
  "digitador",
  "call-center",
  "logistica",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// El <h2> de Computrabajo trae adentro los badges "Postulado"/"Vista" ocultos con
// display:none pero presentes en el DOM -- si se lee el h2 entero con textContent
// esa basura se cuela igual. Mismo bug que se encontró y arregló en
// extension/adapters/computrabajo.js -- acá se evita leyendo solo el <a> del título.
function extraerTitulosComputrabajo(html: string): string[] {
  const $ = cheerio.load(html);
  const titulos: string[] = [];
  $("article.box_offer h2").each((_, el) => {
    const $h2 = $(el);
    const $a = $h2.find("a").first();
    const texto = ($a.length ? $a.text() : $h2.text()).trim();
    if (texto) titulos.push(texto);
  });
  return titulos;
}

function extraerTitulosLaborum(html: string): string[] {
  const $ = cheerio.load(html);
  const titulos: string[] = [];
  $('a[href^="/empleos/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!/-\d+\.html/.test(href)) return;
    const texto = $(el).find("h2").first().text().trim();
    if (texto) titulos.push(texto);
  });
  return titulos;
}

type Fuente = {
  nombre: "Computrabajo" | "Laborum";
  construirUrl: (slug: string, pagina: number) => string;
  extraerTitulos: (html: string) => string[];
};

const FUENTES: Fuente[] = [
  {
    nombre: "Computrabajo",
    construirUrl: (slug, pagina) =>
      `https://cl.computrabajo.com/trabajo-de-${slug}` + (pagina > 1 ? `?p=${pagina}` : ""),
    extraerTitulos: extraerTitulosComputrabajo,
  },
  {
    nombre: "Laborum",
    construirUrl: (slug, pagina) =>
      `https://www.laborum.cl/empleos-busqueda-${slug}.html` + (pagina > 1 ? `?page=${pagina}` : ""),
    extraerTitulos: extraerTitulosLaborum,
  },
];

type FilaCruda = { fuente: string; busqueda: string; pagina: number; url: string; titulos: string[] };

async function main() {
  const dirDatos = "scripts/data";
  if (!existsSync(dirDatos)) mkdirSync(dirDatos, { recursive: true });

  const crudo: FilaCruda[] = [];
  let totalRequests = 0;

  for (const fuente of FUENTES) {
    console.log(`\n=== ${fuente.nombre} ===`);
    for (const busqueda of BUSQUEDAS) {
      let paginasVacias = 0;
      for (let pagina = 1; pagina <= PAGINAS_POR_BUSQUEDA; pagina++) {
        const url = fuente.construirUrl(busqueda, pagina);
        totalRequests++;
        try {
          const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
          if (!res.ok) {
            console.warn(`  [${fuente.nombre}] "${busqueda}" p${pagina}: HTTP ${res.status}`);
            break;
          }
          const html = await res.text();
          const titulos = fuente.extraerTitulos(html);
          if (!titulos.length) {
            paginasVacias++;
            console.warn(`  [${fuente.nombre}] "${busqueda}" p${pagina}: sin títulos (fin de resultados)`);
            break; // se acabaron los resultados de esta búsqueda -- no seguir pidiendo páginas
          }
          crudo.push({ fuente: fuente.nombre, busqueda, pagina, url, titulos });
          console.log(`  [${fuente.nombre}] "${busqueda}" p${pagina}: ${titulos.length} títulos`);
        } catch (e) {
          console.warn(`  [${fuente.nombre}] "${busqueda}" p${pagina}: error de red -`, (e as Error).message);
          break;
        }
        await sleep(RITMO_MS);
      }
    }
  }

  const ruta = `${dirDatos}/corpus-crudo.json`;
  writeFileSync(ruta, JSON.stringify(crudo, null, 2), "utf8");
  const totalTitulos = crudo.reduce((acc, f) => acc + f.titulos.length, 0);
  const distintos = new Set(crudo.flatMap((f) => f.titulos.map((t) => t.trim().toLowerCase())));
  console.log(
    `\nListo. ${totalRequests} requests, ${totalTitulos} títulos crudos (${distintos.size} distintos por texto exacto) guardados en ${ruta}.`
  );
}

main().catch((e) => {
  console.error("Error corriendo el scrape:", e);
  process.exit(1);
});
