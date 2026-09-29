-- Primera pregunta del onboarding: de dónde llegó la persona.
--
-- Columna y no tabla aparte porque cada cuenta lo responde una sola vez: un
-- GROUP BY sobre "como_nos_conocio" ya da el reparto por canal. El texto libre
-- de "Otro" va en su propia columna para que el canal siga siendo un valor
-- cerrado y agrupable.
--
-- Todo aditivo y nullable: las cuentas que ya existen quedan en NULL, que se
-- lee como "nunca se le preguntó", distinto de haber respondido "Otro".

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "como_nos_conocio" TEXT,
ADD COLUMN     "como_nos_conocio_en" TIMESTAMP(3),
ADD COLUMN     "como_nos_conocio_otro" TEXT;
