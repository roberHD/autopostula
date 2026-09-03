/*
  Warnings:

  - You are about to drop the column `stripe_payment_id` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_subscription_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_customer_id` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "stripe_payment_id",
ADD COLUMN     "flow_order" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id",
ADD COLUMN     "flow_subscription_id" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "stripe_customer_id",
ADD COLUMN     "flow_customer_id" TEXT;
