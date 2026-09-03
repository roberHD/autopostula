-- AlterTable
ALTER TABLE "decisiones_oferta" ADD COLUMN     "empresa" TEXT,
ADD COLUMN     "plataforma" TEXT,
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "search_preferences" ADD COLUMN     "usar_scorer_local" BOOLEAN NOT NULL DEFAULT false;
