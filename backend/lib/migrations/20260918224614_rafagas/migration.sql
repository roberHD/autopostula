-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ultima_rafaga_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rafagas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "extension_id" TEXT NOT NULL,
    "disparador" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "estado" TEXT NOT NULL,
    "postuladas" INTEGER NOT NULL DEFAULT 0,
    "observadas" INTEGER NOT NULL DEFAULT 0,
    "descartadas" INTEGER NOT NULL DEFAULT 0,
    "gris" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "duracion_ms" INTEGER,

    CONSTRAINT "rafagas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rafagas_user_id_inicio_idx" ON "rafagas"("user_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "rafagas_user_id_extension_id_key" ON "rafagas"("user_id", "extension_id");

-- AddForeignKey
ALTER TABLE "rafagas" ADD CONSTRAINT "rafagas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
