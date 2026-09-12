-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verificado" TIMESTAMP(3),
ADD COLUMN     "verify_token" TEXT,
ADD COLUMN     "verify_token_expiry" TIMESTAMP(3),
ADD COLUMN     "verify_ultimo_envio" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_verify_token_key" ON "users"("verify_token");

-- docs/verificacion-de-correo.md §4: las cuentas existentes se dan por
-- verificadas. Sin este UPDATE, todas quedarían bloqueadas de golpe apenas
-- se active el gate en /api/account/token y /api/flow/checkout -- incluidas
-- las que ya tienen la extensión conectada y funcionando.
UPDATE "users" SET "email_verificado" = NOW() WHERE "email_verificado" IS NULL;
