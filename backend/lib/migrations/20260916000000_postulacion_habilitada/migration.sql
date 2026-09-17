-- docs/revision-2026-09-16.md §1.2: red de seguridad para cuentas nuevas --
-- false = la extensión trabaja en solo observar aunque el toggle del popup
-- diga otra cosa. Se agrega con default false para que toda cuenta nueva
-- parta en modo prueba, y de inmediato se pone en true para las cuentas
-- existentes: ya están usando el producto, no se les cambia nada.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "postulacion_habilitada" BOOLEAN NOT NULL DEFAULT false;

-- Cuentas existentes: ya venían postulando antes de esta red de seguridad.
UPDATE "users" SET "postulacion_habilitada" = true;
