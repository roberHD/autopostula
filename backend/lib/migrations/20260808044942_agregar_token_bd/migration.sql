/*
  Warnings:

  - A unique constraint covering the columns `[api_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "api_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_api_token_key" ON "users"("api_token");
