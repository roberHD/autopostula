-- AlterEnum
ALTER TYPE "EstadoPostulacion" ADD VALUE 'INCOMPLETA';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "nota_atencion" TEXT;

-- AlterTable
ALTER TABLE "job_offers" ADD COLUMN     "url" TEXT;
