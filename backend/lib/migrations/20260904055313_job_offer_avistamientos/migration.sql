-- AlterTable
ALTER TABLE "job_offers" ADD COLUMN     "postulada" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "job_offers_postulada_cacheada_en_idx" ON "job_offers"("postulada", "cacheada_en");
