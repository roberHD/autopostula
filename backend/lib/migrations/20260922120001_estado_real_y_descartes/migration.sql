-- docs/estado-real-de-postulaciones.md §6.4: de dónde salió cada estado, para
-- que un escaneo del portal nunca pise lo que contó la persona, y cuántas veces
-- se le preguntó "¿supiste algo?".
-- docs/estrategia-y-rediseno.md §5.2: las ofertas descartadas, con su razón.
--
-- docs/creditos-y-pagina-nueva.md §2.2: el tipo "OrigenEstado" y las 3 columnas
-- de "applications" NO van acá -- ya los creó 20260921120000_entrevista_y_origen_estado,
-- que llegó antes a producción por otra rama. Repetirlos hace fallar el deploy
-- con 42710/42701 ("ya existe"). Esta migración solo agrega lo que de verdad es
-- nuevo: la columna "origen" en application_status_history y la tabla descartes.

-- AlterTable
ALTER TABLE "application_status_history" ADD COLUMN     "origen" "OrigenEstado";

-- CreateTable
CREATE TABLE "descartes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "empresa" TEXT,
    "url" TEXT,
    "razon" JSONB,
    "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corregido_en" TIMESTAMP(3),

    CONSTRAINT "descartes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "descartes_user_id_visto_en_idx" ON "descartes"("user_id", "visto_en");

-- CreateIndex
CREATE UNIQUE INDEX "descartes_user_id_plataforma_external_id_key" ON "descartes"("user_id", "plataforma", "external_id");

-- AddForeignKey
ALTER TABLE "descartes" ADD CONSTRAINT "descartes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
