
-- CreateEnum
CREATE TYPE "OrigenEstado" AS ENUM ('PORTAL', 'USUARIO', 'SISTEMA');

-- AlterEnum
ALTER TYPE "EstadoPostulacion" ADD VALUE 'ENTREVISTA';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "origen_estado" "OrigenEstado" NOT NULL DEFAULT 'SISTEMA',
ADD COLUMN     "ultima_consulta" TIMESTAMP(3),
ADD COLUMN     "veces_consultada" INTEGER NOT NULL DEFAULT 0;

