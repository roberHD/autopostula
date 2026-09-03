-- CreateTable
CREATE TABLE "titulos_canonicos" (
    "id" TEXT NOT NULL,
    "forma_cruda" TEXT NOT NULL,
    "forma_limpia" TEXT NOT NULL,
    "rol_canonico" TEXT,
    "frecuencia" INTEGER NOT NULL DEFAULT 1,
    "platform_id" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titulos_canonicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "titulos_canonicos_forma_cruda_key" ON "titulos_canonicos"("forma_cruda");

-- CreateIndex
CREATE INDEX "titulos_canonicos_rol_canonico_idx" ON "titulos_canonicos"("rol_canonico");

-- CreateIndex
CREATE INDEX "titulos_canonicos_frecuencia_idx" ON "titulos_canonicos"("frecuencia");

-- AddForeignKey
ALTER TABLE "titulos_canonicos" ADD CONSTRAINT "titulos_canonicos_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "job_platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
