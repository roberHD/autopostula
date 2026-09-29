-- Reportado en vivo el 2026-09-29: actualizadoEn se pisa en CUALQUIER
-- escritura a search_preferences (Prisma @updatedAt), incluyendo guardar
-- ubicación o amplitud -- pero compilar-perfil.ts lo usaba como "última vez
-- que se compiló el perfil" para el límite de 24h. Guardar ubicación/objetivo
-- dejaba el botón manual "Actualizar mi búsqueda" bloqueado aunque el perfil
-- nunca se hubiera recompilado. Este campo lo toca solo compilarPerfil().

-- AlterTable
ALTER TABLE "search_preferences" ADD COLUMN "perfil_compilado_en" TIMESTAMP(3);
