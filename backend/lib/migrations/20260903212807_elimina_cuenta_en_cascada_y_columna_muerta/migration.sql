/*
  Warnings:

  - You are about to drop the column `credenciales_cifradas` on the `platform_accounts` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "admin_profiles" DROP CONSTRAINT "admin_profiles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "application_answers" DROP CONSTRAINT "application_answers_application_id_fkey";

-- DropForeignKey
ALTER TABLE "application_status_history" DROP CONSTRAINT "application_status_history_application_id_fkey";

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_cv_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_platform_account_id_fkey";

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_style_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "cv_profiles" DROP CONSTRAINT "cv_profiles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "platform_accounts" DROP CONSTRAINT "platform_accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "search_preferences" DROP CONSTRAINT "search_preferences_user_id_fkey";

-- DropForeignKey
ALTER TABLE "style_calibration_answers" DROP CONSTRAINT "style_calibration_answers_style_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "style_profiles" DROP CONSTRAINT "style_profiles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "style_refinements" DROP CONSTRAINT "style_refinements_style_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_fkey";

-- AlterTable
ALTER TABLE "platform_accounts" DROP COLUMN "credenciales_cifradas";

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_profiles" ADD CONSTRAINT "cv_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_preferences" ADD CONSTRAINT "search_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_profile_id_fkey" FOREIGN KEY ("cv_profile_id") REFERENCES "cv_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_style_profile_id_fkey" FOREIGN KEY ("style_profile_id") REFERENCES "style_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_calibration_answers" ADD CONSTRAINT "style_calibration_answers_style_profile_id_fkey" FOREIGN KEY ("style_profile_id") REFERENCES "style_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_refinements" ADD CONSTRAINT "style_refinements_style_profile_id_fkey" FOREIGN KEY ("style_profile_id") REFERENCES "style_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
