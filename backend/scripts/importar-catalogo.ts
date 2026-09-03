// Importa el catálogo oficial de ocupaciones chilenas (CIUO-08.CL + ChileValora)
// a TituloCanonico y GrupoCiuo. Reemplaza al scrape descartado -- ver
// docs/rediseno-filtrado-ofertas.md §7.0/§7.1/§9.1.
//
// Uso manual, mismo patrón que scripts/set-admin.ts -- no se expone por HTTP,
// no se referencia desde la app:
//   npx tsx scripts/importar-catalogo.ts
//
// Idempotente: correrlo dos veces no duplica (upsert por formaCruda / codigo).
import "dotenv/config";
import { readFileSync } from "fs";
import { prisma } from "../lib/prisma";

const RUTA_CATALOGO = "scripts/data/catalogo-ocupaciones-cl.json";

type OcupacionCatalogo = {
  ocupacion: string;
  ciuo: string;
  fuente: "CIUO_INCLUIDA" | "CIUO_REFERENCIA" | "CHILEVALORA";
  normalizado: string;
  codigoPerfil?: string;
  sector?: string;
};

type Catalogo = {
  grupos: Record<string, string>;
  ocupaciones: OcupacionCatalogo[];
};

async function main() {
  const catalogo: Catalogo = JSON.parse(readFileSync(RUTA_CATALOGO, "utf8"));
  const codigosGrupo = Object.keys(catalogo.grupos);
  console.log(`Catálogo leído: ${codigosGrupo.length} grupos, ${catalogo.ocupaciones.length} ocupaciones.`);

  console.log("\nImportando GrupoCiuo...");
  let gruposImportados = 0;
  for (const codigo of codigosGrupo) {
    await prisma.grupoCiuo.upsert({
      where: { codigo },
      create: {
        codigo,
        nombre: catalogo.grupos[codigo],
        subgrupo: codigo.slice(0, 3),
        granGrupo: codigo.slice(0, 1),
      },
      update: { nombre: catalogo.grupos[codigo] },
    });
    gruposImportados++;
  }
  console.log(`  ${gruposImportados} grupos.`);

  console.log("\nImportando TituloCanonico (origen = CATALOGO_OFICIAL)...");
  let ocupacionesImportadas = 0;
  let sinNombreDeGrupo = 0;
  for (const oc of catalogo.ocupaciones) {
    const rolCanonico = catalogo.grupos[oc.ciuo] ?? null;
    if (!rolCanonico) sinNombreDeGrupo++;

    await prisma.tituloCanonico.upsert({
      where: { formaCruda: oc.normalizado },
      create: {
        formaCruda: oc.normalizado,
        formaLimpia: oc.normalizado,
        rolCanonico,
        ciuo: oc.ciuo,
        origen: "CATALOGO_OFICIAL",
        codigoOficial: oc.fuente === "CHILEVALORA" ? oc.codigoPerfil ?? null : null,
        frecuencia: 0, // sin frecuencia real de mercado -- ver §7.1
      },
      update: {
        rolCanonico,
        ciuo: oc.ciuo,
        origen: "CATALOGO_OFICIAL",
        codigoOficial: oc.fuente === "CHILEVALORA" ? oc.codigoPerfil ?? null : null,
      },
    });
    ocupacionesImportadas++;
    if (ocupacionesImportadas % 500 === 0) console.log(`  ${ocupacionesImportadas}/${catalogo.ocupaciones.length}...`);
  }
  console.log(`  ${ocupacionesImportadas} ocupaciones (${sinNombreDeGrupo} sin nombre de grupo -- ver §7.1 "deudas menores").`);

  console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
