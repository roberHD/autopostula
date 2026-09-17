-- docs/revision-2026-09-16.md §1.4: el motor nuevo (scorer local) deja de
-- ser opt-in -- es lo unico que puede decidir 'postular' desde §1.1, asi que
-- dejarlo apagado por defecto significa que ninguna cuenta nueva postula
-- nunca hasta que alguien entre a Filtros a prenderlo a mano. Se pone en
-- true para todo el mundo, existente o nuevo.

-- AlterTable
ALTER TABLE "search_preferences" ALTER COLUMN "usar_scorer_local" SET DEFAULT true;

UPDATE "search_preferences" SET "usar_scorer_local" = true;
