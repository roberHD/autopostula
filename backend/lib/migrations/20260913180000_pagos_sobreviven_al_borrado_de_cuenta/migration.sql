-- Al borrar una cuenta, la suscripción y sus pagos dejan de borrarse en
-- cascada: quedan como registro contable, con user_id en NULL. Ver el
-- comentario de Subscription en schema.prisma.
--
-- Compatible hacia atrás: el código anterior nunca escribe NULL en esta
-- columna, así que puede seguir corriendo contra la base ya migrada.

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_fkey";

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
