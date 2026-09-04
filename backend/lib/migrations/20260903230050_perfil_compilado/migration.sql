-- AlterTable
ALTER TABLE "search_preferences" ADD COLUMN     "perfil_compilado" JSONB,
ADD COLUMN     "version_perfil" INTEGER NOT NULL DEFAULT 0;
