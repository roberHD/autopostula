-- docs/rafagas-y-ponerse-al-dia.md §4.1: la prueba de 5 postulaciones automáticas
-- del plan gratis. Cada cuenta parte con 5 (también las que ya existen: nunca
-- tuvieron ráfagas, así que la prueba les corresponde igual que a una nueva).
-- `es_de_prueba` marca cuáles fueron esas 5, para que "Ver las 5" las muestre.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "prueba_automatica_restantes" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "es_de_prueba" BOOLEAN NOT NULL DEFAULT false;
