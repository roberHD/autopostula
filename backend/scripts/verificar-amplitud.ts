/**
 * Verificación de la amplitud de búsqueda (docs/amplitud-de-busqueda.md §4 y §5).
 *
 *   npx tsx scripts/verificar-amplitud.ts
 *
 * Dos partes. La primera es lógica pura (lo que el CV acredita) y corre en
 * cualquier parte. La segunda toca la base en SOLO LECTURA: expande los
 * objetivos reales de las cuentas que existen y muestra qué oficios entrarían
 * con cada nivel -- es la forma de ver que "esto y lo parecido" trae cosas que
 * la persona reconocería como suyas, y no ruido.
 */
import { prisma } from "../lib/prisma";
import { requisitosDelCandidato } from "../lib/requisitos-cv";
import { rolesPorAmplitud, resolverCiuos } from "../lib/amplitud";

let fallos = 0;
function check(desc: string, cond: boolean) {
  if (cond) console.log("✓ " + desc);
  else {
    fallos++;
    console.error("✗ " + desc);
  }
}

async function main() {
  console.log("── Lo que el CV acredita (§5) ──");

  const conTitulo = requisitosDelCandidato({
    textoExtraido: "Ingeniero en Administración, Universidad de Santiago. Licencia clase B.",
  });
  check("reconoce el título profesional", conTitulo.titulo === true);
  check("reconoce la licencia clase B", conTitulo.licencias.includes("b"));
  check("no inventa inglés", conTitulo.ingles === false);

  const conducir = requisitosDelCandidato({
    textoExtraido: "Conductor con licencia de conducir clase A-2 al día y experiencia en reparto.",
  });
  check("reconoce la licencia A-2 con su número", conducir.licencias.includes("a2"));
  check("sin estudios superiores, no marca título", conducir.titulo === false);

  const ingles = requisitosDelCandidato({ textoExtraido: "Inglés avanzado. Excel intermedio." });
  check("reconoce inglés avanzado", ingles.ingles === true);

  const vacio = requisitosDelCandidato({ textoExtraido: "" });
  check("un CV sin texto no acredita nada", !vacio.titulo && !vacio.ingles && vacio.licencias.length === 0);

  console.log("\n── Expansión por amplitud (§4), contra la base ──");

  try {
    const grupos = await prisma.grupoCiuo.count();
    const oficios = await prisma.tituloCanonico.count({ where: { origen: "CATALOGO_OFICIAL" } });
    console.log(`Catálogo en la base: ${grupos} grupos, ${oficios} oficios oficiales.`);
    if (!grupos || !oficios) {
      console.log("Sin catálogo importado -- salta la parte de base (npx tsx scripts/importar-catalogo.ts).");
      return;
    }

    // Los objetivos reales de las cuentas que ya declararon algo.
    const objetivos = await prisma.objetivoLaboral.findMany({
      select: { ciuo: true, etiqueta: true, userId: true },
      take: 30,
    });
    if (!objetivos.length) {
      console.log("Ninguna cuenta declaró objetivos todavía -- nada que expandir.");
      return;
    }

    const porUsuario = new Map<string, { ciuo: string | null; etiqueta: string }[]>();
    for (const o of objetivos) {
      const lista = porUsuario.get(o.userId) || [];
      lista.push({ ciuo: o.ciuo, etiqueta: o.etiqueta });
      porUsuario.set(o.userId, lista);
    }

    for (const [userId, lista] of porUsuario) {
      const codigos = await resolverCiuos(lista);
      const parecidos = await rolesPorAmplitud(lista, "parecidos");
      const rubro = await rolesPorAmplitud(lista, "rubro");
      console.log(
        `\ncuenta ${userId.slice(0, 8)} · objetivos: ${lista.map((o) => o.etiqueta).join(", ")}\n` +
          `  códigos CIUO resueltos: ${codigos.join(", ") || "(ninguno)"}\n` +
          `  parecidos (${parecidos.length}): ${parecidos.map((r) => r.canonico).join(", ") || "-"}\n` +
          `  rubro (${rubro.length}): ${rubro.map((r) => r.canonico).join(", ") || "-"}`
      );
      check(
        `cuenta ${userId.slice(0, 8)}: "rubro" nunca trae menos que "parecidos"`,
        rubro.length >= parecidos.length || codigos.length === 0
      );
      check(
        `cuenta ${userId.slice(0, 8)}: todo lo que entra por amplitud pesa menos que un objetivo declarado`,
        [...parecidos, ...rubro].every((r) => r.peso <= 0.5)
      );
    }
  } catch (err) {
    console.error("\nNo se pudo consultar la base (¿DATABASE_URL?):", (err as Error).message);
    console.error("La primera parte igual corrió; la expansión queda sin verificar.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\n" + (fallos === 0 ? "Todo OK (0 fallos)." : `${fallos} fallo(s).`));
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
