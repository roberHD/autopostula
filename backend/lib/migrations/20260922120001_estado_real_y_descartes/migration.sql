-- docs/estado-real-de-postulaciones.md §6.4: de dónde salió cada estado, para
-- que un escaneo del portal nunca pise lo que contó la persona, y cuántas veces
-- se le preguntó "¿supiste algo?".
-- docs/estrategia-y-rediseno.md §5.2: las ofertas descartadas, con su razón.

-- CreateEnum
CREATE TYPE "OrigenEstado" AS ENUM ('PORTAL', 'USUARIO', 'SISTEMA');

-- AlterTable
ALTER TABLE "application_status_history" ADD COLUMN     "origen" "OrigenEstado";

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "origen_estado" "OrigenEstado" NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "ultima_consulta" TIMESTAMP(3),
ADD COLUMN     "veces_consultada" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "descartes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "empresa" TEXT,
    "url" TEXT,
    "razon" JSONB,
    "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corregido_en" TIMESTAMP(3),

    CONSTRAINT "descartes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "descartes_user_id_visto_en_idx" ON "descartes"("user_id", "visto_en");

-- CreateIndex
CREATE UNIQUE INDEX "descartes_user_id_plataforma_external_id_key" ON "descartes"("user_id", "plataforma", "external_id");

-- AddForeignKey
ALTER TABLE "descartes" ADD CONSTRAINT "descartes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
