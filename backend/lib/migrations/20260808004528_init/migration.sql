-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('USUARIO', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "TipoPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "NivelAnaliticas" AS ENUM ('BASICO', 'AVANZADO');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('ACTIVA', 'CANCELADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PAGADO', 'FALLIDO', 'REEMBOLSADO');

-- CreateEnum
CREATE TYPE "OrigenOferta" AS ENUM ('MANUAL', 'AUTOMATICO');

-- CreateEnum
CREATE TYPE "EstadoPostulacion" AS ENUM ('ENVIADO', 'VISTO', 'EN_PROCESO', 'FINALIZADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoCalibracion" AS ENUM ('FRASE', 'HISTORIA', 'COMPARACION', 'VOCABULARIO', 'FORMALIDAD', 'PRIORIDAD', 'ESCRITURA');

-- CreateEnum
CREATE TYPE "EstadoRefinamiento" AS ENUM ('PENDIENTE', 'RESPONDIDA');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "oauth_provider" TEXT,
    "nombre" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'USUARIO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "tipo" "TipoPlan" NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_mensual" DOUBLE PRECISION NOT NULL,
    "max_plataformas_activas" INTEGER,
    "limite_postulaciones_mes" INTEGER,
    "busqueda_automatica" BOOLEAN NOT NULL DEFAULT false,
    "muestra_anuncios" BOOLEAN NOT NULL DEFAULT true,
    "guarda_conversaciones_ia" BOOLEAN NOT NULL DEFAULT false,
    "perfil_dinamico" BOOLEAN NOT NULL DEFAULT false,
    "nivel_analiticas" "NivelAnaliticas" NOT NULL DEFAULT 'BASICO',

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "estado" "EstadoSuscripcion" NOT NULL DEFAULT 'ACTIVA',
    "stripe_subscription_id" TEXT,
    "periodo_inicio" TIMESTAMP(3),
    "periodo_fin" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "stripe_payment_id" TEXT,
    "monto" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PAGADO',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_platforms" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url_base" TEXT NOT NULL,
    "adapter_version" TEXT NOT NULL,

    CONSTRAINT "job_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "credenciales_cifradas" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "conectada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "texto_extraido" TEXT,
    "subido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nombre_perfil" TEXT,
    "tono" TEXT,
    "objetivo" TEXT,
    "conversacion" JSONB,
    "confianza_porcentaje" INTEGER NOT NULL DEFAULT 0,
    "fuentes_completadas" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nivel_acceso" TEXT NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "empresa" TEXT,
    "origen" "OrigenOferta" NOT NULL DEFAULT 'MANUAL',
    "relevancia_ai" DOUBLE PRECISION,
    "publicada_en" TIMESTAMP(3),
    "cacheada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_offer_id" TEXT NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "cv_profile_id" TEXT NOT NULL,
    "style_profile_id" TEXT,
    "estado_actual" "EstadoPostulacion" NOT NULL DEFAULT 'ENVIADO',
    "enviada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "estado" "EstadoPostulacion" NOT NULL,
    "cambiado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_calibration_answers" (
    "id" TEXT NOT NULL,
    "style_profile_id" TEXT NOT NULL,
    "tipo" "TipoCalibracion" NOT NULL,
    "pregunta" TEXT NOT NULL,
    "opcion_elegida" TEXT NOT NULL,
    "respondido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_calibration_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_answers" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta_ia" TEXT NOT NULL,
    "respuesta_final" TEXT NOT NULL,
    "fue_editada" BOOLEAN NOT NULL DEFAULT false,
    "tema" TEXT,
    "respondido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_refinements" (
    "id" TEXT NOT NULL,
    "style_profile_id" TEXT NOT NULL,
    "patron_detectado" TEXT NOT NULL,
    "pregunta_generada" TEXT NOT NULL,
    "opciones_json" JSONB NOT NULL,
    "respuesta_elegida" TEXT,
    "estado" "EstadoRefinamiento" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_refinements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "job_platforms_nombre_key" ON "job_platforms"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_user_id_platform_id_key" ON "platform_accounts"("user_id", "platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "cv_profiles_user_id_key" ON "cv_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_user_id_key" ON "admin_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_offers_platform_id_external_id_key" ON "job_offers"("platform_id", "external_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "job_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_profiles" ADD CONSTRAINT "cv_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "job_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_profile_id_fkey" FOREIGN KEY ("cv_profile_id") REFERENCES "cv_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_style_profile_id_fkey" FOREIGN KEY ("style_profile_id") REFERENCES "style_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_calibration_answers" ADD CONSTRAINT "style_calibration_answers_style_profile_id_fkey" FOREIGN KEY ("style_profile_id") REFERENCES "style_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_refinements" ADD CONSTRAINT "style_refinements_style_profile_id_fkey" FOREIGN KEY ("style_profile_id") REFERENCES "style_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
