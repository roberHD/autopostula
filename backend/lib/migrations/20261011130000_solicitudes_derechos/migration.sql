-- Solicitudes de derechos sobre datos personales (lib/derechos.ts; Ley 21.719,
-- art. 11). Tabla y enums nuevos: nada de lo que ya existe cambia.

-- CreateEnum
CREATE TYPE "TipoSolicitudDerecho" AS ENUM ('ACCESO', 'RECTIFICACION', 'SUPRESION', 'OPOSICION', 'PORTABILIDAD', 'BLOQUEO', 'DECISION_AUTOMATIZADA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoSolicitudDerecho" AS ENUM ('RECIBIDA', 'PRORROGADA', 'RESPONDIDA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "solicitudes_derechos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "tipo" "TipoSolicitudDerecho" NOT NULL,
    "detalle" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" "EstadoSolicitudDerecho" NOT NULL DEFAULT 'RECIBIDA',
    "recibida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "prorrogada_en" TIMESTAMP(3),
    "motivo_prorroga" TEXT,
    "respondida_en" TIMESTAMP(3),
    "respuesta" TEXT,
    "aviso_vencimiento_en" TIMESTAMP(3),

    CONSTRAINT "solicitudes_derechos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_derechos_estado_vence_en_idx" ON "solicitudes_derechos"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "solicitudes_derechos_user_id_idx" ON "solicitudes_derechos"("user_id");

-- AddForeignKey
ALTER TABLE "solicitudes_derechos" ADD CONSTRAINT "solicitudes_derechos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

