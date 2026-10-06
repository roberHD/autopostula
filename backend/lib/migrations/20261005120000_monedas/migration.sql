-- Monedas (lib/monedas.ts): 1 por cada hora de uso, canjeables más adelante
-- por postulaciones extra. Tabla y enum nuevos: nada de lo que ya existe cambia.

-- CreateEnum
CREATE TYPE "MotivoMoneda" AS ENUM ('USO', 'CANJE', 'AJUSTE');

-- CreateTable
CREATE TABLE "movimientos_monedas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" "MotivoMoneda" NOT NULL,
    "clave" TEXT NOT NULL,
    "detalle" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_monedas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_monedas_clave_key" ON "movimientos_monedas"("clave");

-- CreateIndex
CREATE INDEX "movimientos_monedas_user_id_creado_en_idx" ON "movimientos_monedas"("user_id", "creado_en");

-- AddForeignKey
ALTER TABLE "movimientos_monedas" ADD CONSTRAINT "movimientos_monedas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

