-- docs/panel-de-revision-en-el-portal.md §3.1 y §3.3: lo que habia decidido el
-- motor cuando la persona corrigio la oferta en el panel, y si la tanda entra
-- con peso reducido (se marco casi todo). Solo agrega columnas: nada de lo que
-- ya existe cambia.

-- AlterTable
ALTER TABLE "decisiones_oferta" ADD COLUMN "banda_motor" TEXT;
ALTER TABLE "decisiones_oferta" ADD COLUMN "peso_reducido" BOOLEAN NOT NULL DEFAULT false;
