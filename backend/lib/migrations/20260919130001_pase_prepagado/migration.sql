-- docs/pase-prepagado.md §4. Premium deja de ser una suscripcion con cargo
-- automatico de Flow (solo para empresas) y pasa a pases de 30 o 90 dias:
-- una fila de "subscriptions" por compra, con su propio periodo.
--
-- No hay pagos reales en produccion (Flow sigue sin aprobar), asi que no hay
-- datos que migrar; igual se rellena lo minimo para que la migracion no falle si
-- hubiera filas de prueba.

-- AlterTable: idempotencia de los avisos de vencimiento (§6)
ALTER TABLE "subscriptions" ADD COLUMN "aviso_previo_en" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "aviso_final_en" TIMESTAMP(3);

-- AlterTable: el pago nace antes que el pase
ALTER TABLE "payments" ADD COLUMN "user_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "commerce_order" TEXT;
ALTER TABLE "payments" ADD COLUMN "pase" TEXT;
ALTER TABLE "payments" ADD COLUMN "dias" INTEGER;

-- Filas de antes del cambio (pagos de suscripcion): se les da un commerceOrder
-- propio para poder exigirlo unico y no nulo, y el dueno del pase como dueno.
UPDATE "payments" p
SET "commerce_order" = 'legado_' || p."id",
    "pase" = 'legado',
    "dias" = 0,
    "user_id" = s."user_id"
FROM "subscriptions" s
WHERE s."id" = p."subscription_id";

UPDATE "payments"
SET "commerce_order" = 'legado_' || "id", "pase" = 'legado', "dias" = 0
WHERE "commerce_order" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "commerce_order" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "pase" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "dias" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "subscription_id" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "estado" SET DEFAULT 'PENDIENTE';

-- CreateIndex
CREATE UNIQUE INDEX "payments_commerce_order_key" ON "payments"("commerce_order");

-- Payment -> Subscription pasa de CASCADE a SET NULL: un pase que se borra no
-- puede arrastrar el registro del pago (normativa tributaria).
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscription_id_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payment -> User: SET NULL, igual que subscriptions (los pagos sobreviven al
-- borrado de la cuenta).
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
