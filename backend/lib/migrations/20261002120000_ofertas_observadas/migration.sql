-- docs/primera-busqueda-guiada.md §11: lo que la extensión habría postulado al
-- mirar un portal en modo "solo mirar", para que el panel diga cuáles y
-- cuántas. Tabla nueva: nada de lo que ya existe cambia.

-- CreateTable
CREATE TABLE "ofertas_observadas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plataforma" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "empresa" TEXT,
    "url" TEXT,
    "razon" JSONB,
    "score_local" INTEGER,
    "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ofertas_observadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ofertas_observadas_user_id_visto_en_idx" ON "ofertas_observadas"("user_id", "visto_en");

-- CreateIndex
CREATE UNIQUE INDEX "ofertas_observadas_user_id_plataforma_external_id_key" ON "ofertas_observadas"("user_id", "plataforma", "external_id");

-- AddForeignKey
ALTER TABLE "ofertas_observadas" ADD CONSTRAINT "ofertas_observadas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
