-- docs/revision-scorer-2026-09-30.md §6 y §7. Solo columnas nuevas, opcionales
-- o con valor por defecto: nada de lo que ya existe cambia.
--
-- entrada_scorer / score_local: lo que evaluó el scorer de la extensión
-- (título, empresa, ubicación, el aviso y la versión del perfil) y su puntaje,
-- para poder volver a correrlo sobre las decisiones de la persona
-- (scripts/banco-de-casos.ts). Antes no se guardaba la ubicación ni la versión.
--
-- umbral_*: desde qué puntaje postula sola cada cuenta, ajustado con sus
-- propias decisiones en "Por decidir" (lib/calibracion-umbral.ts). Vive en
-- search_preferences y no en perfil_compilado porque compilar-perfil.ts vuelve
-- a fijar 65/45 en cada recompilación.

-- AlterTable
ALTER TABLE "search_preferences" ADD COLUMN     "calibrar_umbral" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "umbral_calibrado_con" INTEGER,
ADD COLUMN     "umbral_calibrado_en" TIMESTAMP(3),
ADD COLUMN     "umbral_postular_calibrado" INTEGER;

-- AlterTable
ALTER TABLE "decisiones_oferta" ADD COLUMN     "entrada_scorer" JSONB;

-- AlterTable
ALTER TABLE "descartes" ADD COLUMN     "entrada_scorer" JSONB,
ADD COLUMN     "score_local" INTEGER;
