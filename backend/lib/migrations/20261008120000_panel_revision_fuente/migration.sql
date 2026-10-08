-- docs/panel-de-revision-en-el-portal.md §3: las decisiones que la persona toma
-- en el panel de revisión del portal.
--
-- Va en su propia migracion a proposito: en Postgres un valor nuevo de un enum
-- no se puede USAR en la misma transaccion que lo agrega. Las columnas estan en
-- la migracion siguiente.

-- AlterEnum
ALTER TYPE "FuenteDecision" ADD VALUE IF NOT EXISTS 'PANEL_REVISION';
