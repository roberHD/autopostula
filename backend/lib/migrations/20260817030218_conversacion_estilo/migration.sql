-- AlterTable
ALTER TABLE "style_profiles" ADD COLUMN     "confirmado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estilo_detalle" JSONB,
ADD COLUMN     "fortalezas" JSONB,
ADD COLUMN     "manual_escritura" JSONB,
ADD COLUMN     "motivaciones" TEXT,
ADD COLUMN     "resumen" TEXT;
