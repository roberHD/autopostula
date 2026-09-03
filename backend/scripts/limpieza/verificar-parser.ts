// Chequeo manual del parser contra los propios ejemplos y trampas que nombra
// docs/rediseno-filtrado-ofertas.md §7.3 -- no reemplaza el criterio de aceptación
// real del documento (correr sobre el corpus scrapeado, ver §12), que necesita el
// scrape (§7.1) hecho primero. Esto es una red de regresión rápida mientras tanto.
//
// Uso: npx tsx scripts/limpieza/verificar-parser.ts
import { parsearTitulo } from "./parser";
import { LISTA_LIMPIEZA_CL } from "./cl";
import { LISTA_LIMPIEZA_CL_BORRADOR } from "./cl-borrador";

const lista = [...LISTA_LIMPIEZA_CL, ...LISTA_LIMPIEZA_CL_BORRADOR];

let fallos = 0;
function check(descripcion: string, cond: boolean) {
  if (!cond) {
    fallos++;
    console.error("✗ " + descripcion);
  } else {
    console.log("✓ " + descripcion);
  }
}

// El ejemplo exacto del documento (§7.3).
{
  const r = parsearTitulo("Vendedor(a) Part Time Mall Plaza Vespucio - Ñuñoa", lista);
  console.log(JSON.stringify(r, null, 2));
  check("rolLimpio queda 'vendedor'", r.rolLimpio === "vendedor");
  check("comuna queda 'nunoa'", r.comuna === "nunoa");
  check("region queda 'RM'", r.region === "RM");
  check("jornada queda 'part_time'", r.jornada === "part_time");
  check("ruido incluye el mall", r.ruido.includes("mall plaza vespucio"));
  check("ruido incluye el marcador de genero", r.ruido.includes("(a)"));
}

// Trampa de "aseo" -- no debe comerse "paseo" (§2.1a del documento, aplicado
// acá al parser: "aseo" no está en la lista actual, pero se prueba el mismo
// patron de límites de palabra con un término real de la lista, "san pablo",
// contra "sampablo" pegado -- no debe matchear si no hay límite real).
{
  const r = parsearTitulo("Encargado de paseo peatonal", [
    ...lista,
    { termino: "aseo", tipo: "marketing", destino: "descartar" },
  ]);
  check('"aseo" no se come el "paseo" de "paseo peatonal"', !r.ruido.includes("aseo"));
}

// Trampa de Estación Central: no debe existir un término suelto "central" en la
// lista real que se coma "central de llamados".
{
  const tieneCentralSuelto = lista.some((e) => e.termino.trim().toLowerCase() === "central");
  check('no hay un término "central" suelto en la lista (evita comerse "central de llamados")', !tieneCentralSuelto);

  const r = parsearTitulo("Ejecutivo central de llamados", lista);
  check('"central de llamados" no se marca como comuna', r.comuna === null);
}

// Orden malls -> comunas: "Mall Plaza Vespucio" no debe dejar sueltos "Vespucio"
// ni "Plaza" para que una comuna los agarre por error.
{
  const r = parsearTitulo("Vendedor Mall Plaza Vespucio", lista);
  check("el mall se descarta completo, no dispara una comuna falsa", r.comuna === null);
}

// Chillán vs Chillán Viejo -- si no se ordena por largo, "chillan" se come el
// texto antes de que "chillan viejo" tenga oportunidad.
{
  const r1 = parsearTitulo("Vendedor Chillan Viejo", lista);
  check('"Chillan Viejo" se detecta completo, no solo "Chillan"', r1.comuna === "chillan viejo");

  const r2 = parsearTitulo("Vendedor Chillan", lista);
  check('"Chillan" solo se detecta como "chillan"', r2.comuna === "chillan");
}

// Regresión de jerarquía (§7.3, "lo que NO se puede tocar") -- Jefe/Senior/etc.
// nunca deben desaparecer ni colapsar con el rol base.
{
  const jefe = parsearTitulo("Jefe de local Falabella", lista);
  const vendedor = parsearTitulo("Vendedor de local Falabella", lista);
  check('"Jefe de local" conserva la palabra "jefe"', jefe.rolLimpio.includes("jefe"));
  check('"Jefe de local" y "Vendedor de local" NO colapsan al mismo rolLimpio', jefe.rolLimpio !== vendedor.rolLimpio);

  for (const palabra of ["junior", "senior", "supervisor", "encargado", "coordinador", "asistente", "ayudante", "practicante"]) {
    const r = parsearTitulo(palabra + " de ventas", lista);
    check(`"${palabra}" sobrevive intacto en el rolLimpio`, r.rolLimpio.includes(palabra));
  }
}

// Red de seguridad: un título que se limpia a casi nada vuelve al original
// normalizado, no a una fila vacía.
{
  const r = parsearTitulo("Providencia", lista);
  check("un título que se reduce a casi nada no queda vacío", r.rolLimpio.length >= 3);
  check("...sino que vuelve al título normalizado completo", r.rolLimpio === "providencia");
}

// Códigos y números sueltos (regex, no lista).
{
  const r = parsearTitulo("Vendedor Retail #48213", lista);
  check("el código numérico se descarta", !r.rolLimpio.includes("48213"));
}

// Normalización de tildes: el mismo comuna con y sin tilde debe dar igual.
{
  const r1 = parsearTitulo("Vendedor Ñuñoa", lista);
  const r2 = parsearTitulo("Vendedor Nunoa", lista);
  check("con tilde y sin tilde dan la misma comuna", r1.comuna === r2.comuna && r1.comuna === "nunoa");
}

console.log("\n" + (fallos === 0 ? `Todo OK (${fallos} fallos).` : `${fallos} fallo(s).`));
process.exit(fallos === 0 ? 0 : 1);
