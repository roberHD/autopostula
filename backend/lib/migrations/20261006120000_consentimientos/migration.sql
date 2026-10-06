-- Consentimientos (lib/consentimiento.ts): prueba de qué aceptó cada persona y
-- cuándo (art. 12, Ley 19.628 modificada por la 21.719). Tabla y enum nuevos:
-- nada de lo que ya existe cambia.

-- CreateEnum
CREATE TYPE "TipoConsentimiento" AS ENUM ('TERMINOS_Y_PRIVACIDAD', 'MAYORIA_DE_EDAD', 'DATOS_SENSIBLES_CV');

-- CreateTable
CREATE TABLE "consentimientos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tipo" "TipoConsentimiento" NOT NULL,
    "version" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "aceptado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_en" TIMESTAMP(3),

    CONSTRAINT "consentimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consentimientos_user_id_tipo_idx" ON "consentimientos"("user_id", "tipo");

-- AddForeignKey
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

