/*
  Warnings:

  - You are about to drop the column `api_token` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_api_token_key";

-- AlterTable
ALTER TABLE "cv_profiles" ADD COLUMN     "cargo_objetivo" TEXT,
ADD COLUMN     "comuna" TEXT,
ADD COLUMN     "disponibilidad" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "expectativa_renta" TEXT,
ADD COLUMN     "nombre" TEXT,
ADD COLUMN     "resumen_profesional" TEXT,
ADD COLUMN     "telefono" TEXT,
ALTER COLUMN "nombre_archivo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "api_token";
