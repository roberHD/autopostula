-- docs/estrategia-y-rediseno.md §7: postulaciones extra (compradas o ganadas)
-- como libro mayor, y las invitaciones que las premian.

-- CreateEnum
CREATE TYPE "MotivoExtra" AS ENUM ('COMPRA', 'PREMIO_INVITACION', 'PREMIO_PERFIL', 'USO', 'AJUSTE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "codigo_invitacion" TEXT,
ADD COLUMN     "invitado_por_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_codigo_invitacion_key" ON "users"("codigo_invitacion");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitado_por_id_fkey" FOREIGN KEY ("invitado_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "postulaciones_extra" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" "MotivoExtra" NOT NULL,
    "clave" TEXT NOT NULL,
    "detalle" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postulaciones_extra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "postulaciones_extra_clave_key" ON "postulaciones_extra"("clave");

-- CreateIndex
CREATE INDEX "postulaciones_extra_user_id_creado_en_idx" ON "postulaciones_extra"("user_id", "creado_en");

-- AddForeignKey
ALTER TABLE "postulaciones_extra" ADD CONSTRAINT "postulaciones_extra_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
