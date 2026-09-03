-- CreateEnum
CREATE TYPE "FuenteDecision" AS ENUM ('TRIAJE_ONBOARDING', 'BANDA_GRIS', 'HISTORIAL');

-- CreateEnum
CREATE TYPE "Veredicto" AS ENUM ('PENDIENTE', 'SI', 'NO', 'EXPIRADA');

-- CreateTable
CREATE TABLE "decisiones_oferta" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_offer_id" TEXT,
    "titulo_crudo" TEXT NOT NULL,
    "score_local" INTEGER,
    "razones" JSONB,
    "fuente" "FuenteDecision" NOT NULL,
    "veredicto" "Veredicto" NOT NULL DEFAULT 'PENDIENTE',
    "vence_en" TIMESTAMP(3),
    "decidido_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisiones_oferta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decisiones_oferta_user_id_veredicto_vence_en_idx" ON "decisiones_oferta"("user_id", "veredicto", "vence_en");

-- AddForeignKey
ALTER TABLE "decisiones_oferta" ADD CONSTRAINT "decisiones_oferta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisiones_oferta" ADD CONSTRAINT "decisiones_oferta_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
