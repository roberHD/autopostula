-- AlterTable
ALTER TABLE "style_profiles" ADD COLUMN     "evitar_repetidas" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instrucciones" TEXT,
ADD COLUMN     "longitud_respuesta" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "usar_perfil" BOOLEAN NOT NULL DEFAULT true;
