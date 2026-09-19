-- docs/rafagas-y-ponerse-al-dia.md §3.8: recordatorio por correo cuando lleva días sin
-- ponerse al día. `recordatorio_rafaga_en` = cuándo salió el último (null = nunca);
-- `recordatorios_activos` = el enlace de baja del propio correo lo apaga sin iniciar sesión.
-- `extension_conectada_en` = cuándo se conectó la extensión por primera vez: sirve para
-- avisarle a quien nunca corrió una ráfaga. Queda null en las cuentas que ya estaban
-- conectadas (no se sabe desde cuándo), y a esas no se les manda ese aviso.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "extension_conectada_en" TIMESTAMP(3),
ADD COLUMN     "recordatorio_rafaga_en" TIMESTAMP(3),
ADD COLUMN     "recordatorios_activos" BOOLEAN NOT NULL DEFAULT true;
