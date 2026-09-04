-- CreateEnum
CREATE TYPE "OrigenTitulo" AS ENUM ('CATALOGO_OFICIAL', 'COSECHADO');

-- DropIndex
DROP INDEX "titulos_canonicos_rol_canonico_idx";

-- AlterTable
ALTER TABLE "titulos_canonicos" ADD COLUMN     "ciuo" VARCHAR(4),
ADD COLUMN     "codigo_oficial" TEXT,
ADD COLUMN     "origen" "OrigenTitulo" NOT NULL DEFAULT 'COSECHADO';

-- CreateTable
CREATE TABLE "grupos_ciuo" (
    "codigo" VARCHAR(4) NOT NULL,
    "nombre" TEXT NOT NULL,
    "subgrupo" VARCHAR(3) NOT NULL,
    "gran_grupo" VARCHAR(1) NOT NULL,

    CONSTRAINT "grupos_ciuo_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE INDEX "grupos_ciuo_subgrupo_idx" ON "grupos_ciuo"("subgrupo");

-- CreateIndex
CREATE INDEX "titulos_canonicos_ciuo_idx" ON "titulos_canonicos"("ciuo");

-- CreateIndex
CREATE INDEX "titulos_canonicos_origen_ciuo_idx" ON "titulos_canonicos"("origen", "ciuo");
