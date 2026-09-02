-- CreateTable
CREATE TABLE "search_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "palabras_incluir" JSONB,
    "palabras_excluir" JSONB,
    "modalidad" TEXT NOT NULL DEFAULT 'cualquiera',
    "jornada" TEXT NOT NULL DEFAULT 'cualquiera',
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_preferences_user_id_key" ON "search_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "search_preferences" ADD CONSTRAINT "search_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
