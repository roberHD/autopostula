-- docs/revision-2026-09-16.md §2.1: la ubicacion se declara (region(es) +
-- comuna(s) + acepta remoto), no se infiere del CV via IA.

-- AlterTable
ALTER TABLE "search_preferences" ADD COLUMN "ubicacion_declarada" JSONB;
