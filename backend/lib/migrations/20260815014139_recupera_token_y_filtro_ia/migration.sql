/*
  Warnings:

  - A unique constraint covering the columns `[api_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "api_token" TEXT,
ADD COLUMN     "usar_filtro_ia" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "users_api_token_key" ON "users"("api_token");
