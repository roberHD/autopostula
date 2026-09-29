-- docs/revision-2026-09-28.md. Todo es aditivo: columnas nuevas que aceptan
-- null y una tabla nueva. No cambia ni borra nada de lo que ya existe.

-- §1: cada postulación guarda su propia copia de lo que se muestra de la oferta.
-- JobOffer es compartida entre todas las cuentas y la extensión de cualquiera la
-- actualiza: con una segunda cuenta se cambió la empresa y el enlace "Ver
-- oferta" que veía otra persona.
-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "empresa" TEXT,
ADD COLUMN     "relevancia_ai" DOUBLE PRECISION,
ADD COLUMN     "titulo" TEXT,
ADD COLUMN     "url" TEXT;

-- Las postulaciones que ya existen copian lo que la oferta dice hoy. El enlace
-- solo si es https:// de uno de los tres portales (mismo criterio que
-- lib/entrada.ts, urlDePortal).
UPDATE "applications" AS a
SET "titulo" = j."titulo",
    "empresa" = j."empresa",
    "relevancia_ai" = j."relevancia_ai",
    "url" = CASE
      WHEN j."url" ~* '^https://([a-z0-9-]+\.)*(computrabajo\.com|computrabajo\.cl|laborum\.cl|trabajando\.cl)(/|$)'
      THEN j."url"
      ELSE NULL
    END
FROM "job_offers" AS j
WHERE a."job_offer_id" = j."id";

-- §2 y §22: desde cuándo valen las sesiones y el token de la extensión.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sesiones_validas_desde" TIMESTAMP(3);

-- §17: límites de intentos (login, registro, recuperar contraseña...).
-- CreateTable
CREATE TABLE "limites_tasa" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limites_tasa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "limites_tasa_clave_creado_en_idx" ON "limites_tasa"("clave", "creado_en");
