-- docs/creditos-y-pagina-nueva.md §2.2: main creó "origen_estado" con
-- DEFAULT 'SISTEMA'; gana 'PORTAL' -- una fila vieja cuyo estado vino del
-- portal es exactamente eso, y así portalPuedeCambiar() no trata las filas
-- históricas como intocables. Solo cambia el default de las filas nuevas: no
-- toca ninguna fila existente.

-- AlterTable
ALTER TABLE "applications" ALTER COLUMN "origen_estado" SET DEFAULT 'PORTAL';
