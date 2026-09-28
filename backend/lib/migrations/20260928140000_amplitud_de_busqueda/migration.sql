-- docs/amplitud-de-busqueda.md §4: qué tan lejos del objetivo declarado acepta
-- la persona que se busque ("solo" | "parecidos" | "rubro" | "abierto").
--
-- Default "parecidos" también para las cuentas que ya existen: lo que entra por
-- amplitud entra con peso bajo (0,5), así que cae en la banda gris -- aparece en
-- "Por decidir", no se postula solo. Nadie empieza a postular a más cosas por
-- esta migración.

ALTER TABLE "search_preferences" ADD COLUMN "amplitud" TEXT NOT NULL DEFAULT 'parecidos';
