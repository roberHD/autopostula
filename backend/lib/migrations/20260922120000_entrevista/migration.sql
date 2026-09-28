-- docs/estado-real-de-postulaciones.md §6.3: la entrevista, casi siempre contada
-- por la persona (ningún portal la ve).
--
-- Va en su propia migración a propósito: en Postgres un valor nuevo de un enum
-- no se puede USAR en la misma transacción que lo agrega.

-- AlterEnum
ALTER TYPE "EstadoPostulacion" ADD VALUE IF NOT EXISTS 'ENTREVISTA';
