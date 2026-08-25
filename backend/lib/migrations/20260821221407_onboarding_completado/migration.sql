-- AlterTable
ALTER TABLE "cv_profiles" ADD COLUMN     "experiencia" JSONB,
ADD COLUMN     "habilidades" JSONB,
ADD COLUMN     "modalidad" TEXT,
ADD COLUMN     "rut" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboarding_completado" BOOLEAN NOT NULL DEFAULT false;
