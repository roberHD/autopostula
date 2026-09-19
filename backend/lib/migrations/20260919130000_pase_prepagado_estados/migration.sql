-- docs/pase-prepagado.md §4: Premium pasa a pases prepagados de pago unico. El
-- pago existe antes que el pase (nace PENDIENTE) y Flow puede anularlo.
--
-- Va en su propia migracion a proposito: en Postgres un valor nuevo de un enum
-- no se puede USAR (ni como DEFAULT de una columna) en la misma transaccion que
-- lo agrega. El cambio de default y de columnas esta en la migracion siguiente.

-- AlterEnum
ALTER TYPE "EstadoPago" ADD VALUE IF NOT EXISTS 'PENDIENTE';
ALTER TYPE "EstadoPago" ADD VALUE IF NOT EXISTS 'ANULADO';
