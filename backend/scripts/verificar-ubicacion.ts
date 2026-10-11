// Verificación de la ubicación declarada (lib/ubicacion-declarada.ts) y de
// cómo la usa el scorer real de la extensión. Sin base de datos:
//   npx tsx scripts/verificar-ubicacion.ts
import { expandirUbicacionDeclarada } from "../lib/ubicacion-declarada";
import { lugaresDeclarados } from "../lib/busqueda-declarada";
import { cargarScorerDeLaExtension } from "../lib/scorer-extension";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

const soloRegion = { regiones: ["RM"], comunas: [], todaLaRegion: false, aceptaRemoto: false };
const regionEntera = { ...soloRegion, todaLaRegion: true };
const conComunas = { regiones: ["RM"], comunas: ["Maipú", "Ñuñoa"], todaLaRegion: false, aceptaRemoto: false };

// ── La expansión ──
const eSola = expandirUbicacionDeclarada(soloRegion);
const eEntera = expandirUbicacionDeclarada(regionEntera);
check("una región sin comunas ya no queda vacía (antes: sin filtro de lugar)", eSola.comunas.length > 30, eSola.comunas.length);
check("...y es lo mismo que marcar \"toda la región\"", eSola.comunas.length === eEntera.comunas.length);
check("...con comunas de esa región y no de otras", eSola.comunas.includes("maipú") && !eSola.comunas.includes("viña del mar"));
const eComunas = expandirUbicacionDeclarada(conComunas);
check("si eligió comunas, mandan las comunas", eComunas.comunas.length === 2 && eComunas.comunas.includes("ñuñoa"), eComunas.comunas);
check("sin región ni comunas sigue sin filtro de lugar", expandirUbicacionDeclarada({ regiones: [], comunas: [] }).comunas.length === 0);

// ── Lo que se muestra en "Lo que buscas" y se le dice a la IA de los formularios ──
check("una región sin comunas se nombra como la región", JSON.stringify(lugaresDeclarados(soloRegion)) === '["Región Metropolitana"]', lugaresDeclarados(soloRegion));
check("con comunas, se nombran las comunas", JSON.stringify(lugaresDeclarados(conComunas)) === '["Maipú","Ñuñoa"]');

// ── El scorer real de la extensión ──
const puntuar = cargarScorerDeLaExtension();
const perfil = (ubicacion: { comunas: string[]; aceptaRemoto: boolean }) => ({
  version: 1,
  roles: [{ canonico: "vendedor", sinonimos: [], peso: 1 }],
  vetos: [],
  senales: [],
  ubicacion,
  umbralPostular: 65,
  umbralGris: 45,
});
const oferta = (ubicacion: string) => ({ titulo: "Vendedor de tienda", empresa: "Falabella", cuerpo: "Buscamos vendedor", ubicacion });

const enVina = puntuar(oferta("Viña del Mar"), perfil(eSola));
check("con solo la Región Metropolitana, una oferta en Viña del Mar se descarta", enVina.banda === "descartar", enVina);
const enMaipu = puntuar(oferta("Maipú"), perfil(eSola));
check("...y una en Maipú pasa", enMaipu.banda === "postular", enMaipu);
const enLaRegion = puntuar(oferta("Región Metropolitana"), perfil(eSola));
check("...y una que solo dice \"Región Metropolitana\" también pasa", enLaRegion.banda === "postular", enLaRegion);

console.log(fallos ? `\n${fallos} falla(s)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
