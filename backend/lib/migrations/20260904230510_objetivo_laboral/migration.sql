-- AlterTable
ALTER TABLE "users" ADD COLUMN     "objetivo_confirmado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "objetivos_laborales" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ciuo" VARCHAR(4),
    "etiqueta" TEXT NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objetivos_laborales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "objetivos_laborales_user_id_orden_idx" ON "objetivos_laborales"("user_id", "orden");

-- AddForeignKey
ALTER TABLE "objetivos_laborales" ADD CONSTRAINT "objetivos_laborales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
