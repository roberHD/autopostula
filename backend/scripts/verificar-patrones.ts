// docs/amplitud-de-busqueda.md §2.4: "que no vuelva a pasar sin que nadie se
// entere". Dos partes:
//   1. Lógica pura de lib/normalizar-patron.ts contra los casos reales del
//      documento (la lista separada por coma, la descripción larga, el "o").
//   2. Un barrido de solo lectura sobre los perfiles YA COMPILADOS en la base:
//      si algún patron guardado tiene coma, "/", o más de 3 palabras, es la
//      señal de que el bug volvió (prompt editado, IA que dejó de obedecer).
//
// No muta nada. Corre con: npx tsx scripts/verificar-patrones.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { normalizarPatron, normalizarVetos, normalizarSenales } from "../lib/normalizar-patron";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

// ── 1. Lógica pura, contra el caso real del documento (§1) ──
check(
  "una lista separada por coma se parte en términos sueltos",
  JSON.stringify(normalizarPatron("moda, vestuario, calzado, fashion")) === JSON.stringify(["moda", "vestuario", "calzado", "fashion"]),
  normalizarPatron("moda, vestuario, calzado, fashion")
);
check(
  "una frase larga con una lista adentro se descarta ENTERA -- no solo el fragmento largo (§1: partir por '/' y salvar los fragmentos cortos dejaría un veto invertido sobre \"vestuario\"/\"calzado\")",
  JSON.stringify(normalizarPatron("retail genérico sin especialidad en moda/vestuario/calzado")) === JSON.stringify([]),
  normalizarPatron("retail genérico sin especialidad en moda/vestuario/calzado")
);
check(
  "el separador '/' sí parte una lista plana, donde TODOS los fragmentos son términos cortos",
  JSON.stringify(normalizarPatron("full time/jornada completa")) === JSON.stringify(["full time", "jornada completa"]),
);
check(
  '"full time exclusive" son 3 palabras exactas -- se guarda como un solo término, no se descarta',
  JSON.stringify(normalizarPatron("full time exclusive")) === JSON.stringify(["full time exclusive"])
);
check(
  "cuatro palabras sin separador (una explicación, no un término) sí se descarta entera",
  JSON.stringify(normalizarPatron("jornada full time sin excepciones")) === JSON.stringify([])
);
check(
  'la palabra "o" con espacios separa ("mañana o tarde")',
  JSON.stringify(normalizarPatron("mañana o tarde")) === JSON.stringify(["mañana", "tarde"])
);
check(
  'la "o" pegada a una palabra NO separa ("promotor" sigue entero)',
  JSON.stringify(normalizarPatron("promotor")) === JSON.stringify(["promotor"])
);
check("un patrón vacío o nulo no revienta", JSON.stringify(normalizarPatron(null)) === "[]" && JSON.stringify(normalizarPatron("")) === "[]");

// §2.2: un veto sin patrón utilizable no se pierde -- se guarda la razón, sin patrón.
{
  const vetos = normalizarVetos([{ patron: "retail genérico sin especialidad en moda/vestuario/calzado", razon: "no es su rubro" }]);
  check("veto sin patrón usable guarda la razón con patron=null", vetos.length === 1 && vetos[0].patron === null && vetos[0].razon === "no es su rubro", vetos);
}
{
  const vetos = normalizarVetos([{ patron: "jornada full time sin excepciones", razon: "no quiere full time" }]);
  check("un veto de más de 3 palabras (sin separador) también cae al caso sin patrón", vetos.length === 1 && vetos[0].patron === null, vetos);
}
{
  const vetos = normalizarVetos([{ patron: "call center", razon: "no quiere call center" }]);
  check("un veto con patrón corto normal pasa igual, con su patrón", vetos.length === 1 && vetos[0].patron === "call center", vetos);
}

// §2.1: una señal se multiplica en varias, todas con el mismo delta.
{
  const senales = normalizarSenales([{ patron: "moda, vestuario, calzado, fashion", delta: 25 }]);
  check(
    "una señal con lista se convierte en 4 señales, todas con el mismo delta",
    senales.length === 4 && senales.every((s) => s.delta === 25),
    senales
  );
}
{
  const senales = normalizarSenales([{ patron: "una explicación larga que no es un término real", delta: 10 }]);
  check("una señal que no sobrevive a la normalización simplemente se cae (no hay razón que preservar)", senales.length === 0, senales);
}

// ── 2. Barrido de solo lectura sobre lo ya compilado en la base ──
function patronInvalido(patron: string): boolean {
  return patron.includes(",") || patron.includes("/") || patron.split(/\s+/).filter(Boolean).length > 3;
}

async function barrerPerfilesReales() {
  // Filtro en JS, no en la consulta: Prisma distingue NULL de SQL de un JSON
  // null explícito para este tipo de campo, y acá solo interesa "hay algo".
  const todas = await prisma.searchPreferences.findMany({
    select: { userId: true, perfilCompilado: true },
  });
  const prefs = todas.filter((p) => p.perfilCompilado != null);

  let vetosRevisados = 0;
  let senalesRevisadas = 0;
  const problemas: string[] = [];

  for (const p of prefs) {
    const compilado = p.perfilCompilado as any;
    for (const v of Array.isArray(compilado?.vetos) ? compilado.vetos : []) {
      if (typeof v?.patron !== "string") continue; // null = ya marcado como no aplicable (§2.2), no es un problema
      vetosRevisados++;
      if (patronInvalido(v.patron)) problemas.push(`userId=${p.userId} veto.patron="${v.patron}"`);
    }
    for (const s of Array.isArray(compilado?.senales) ? compilado.senales : []) {
      if (typeof s?.patron !== "string") continue;
      senalesRevisadas++;
      if (patronInvalido(s.patron)) problemas.push(`userId=${p.userId} senal.patron="${s.patron}"`);
    }
  }

  console.log(`\n(barrido sobre ${prefs.length} perfiles compilados: ${vetosRevisados} vetos, ${senalesRevisadas} señales)`);
  check("ningún veto ni señal guardado tiene coma, '/' o más de 3 palabras", problemas.length === 0, problemas);
}

barrerPerfilesReales()
  .catch((e) => {
    console.error("No se pudo conectar a la base para el barrido -- se reporta solo la parte de lógica pura.");
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log("\n" + (fallos === 0 ? "Todo OK (0 fallos)." : `${fallos} fallo(s).`));
    process.exit(fallos === 0 ? 0 : 1);
  });
