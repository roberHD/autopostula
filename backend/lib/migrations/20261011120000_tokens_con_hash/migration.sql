-- Los tokens secretos de cada cuenta pasan a guardarse como hash (lib/token.ts;
-- Ley 21.719, art. 14 quinquies). Solo cambia el contenido de tres columnas que
-- ya existen: no se agrega ni se borra ninguna, y nada más se toca.
--
-- Se reemplaza cada token por su SHA-256 en hexadecimal, que es exactamente lo
-- que calcula hashToken() en el servidor. Así las extensiones ya conectadas y
-- los enlaces de correo todavía vigentes siguen funcionando: la extensión manda
-- su token, el servidor lo pasa a hash y lo encuentra.
--
-- Se corre una sola vez (Prisma no repite migraciones). Repetirla haría el hash
-- de un hash y desconectaría a todas: no copiar este UPDATE a otro lado.

UPDATE "users" SET "api_token" = encode(sha256(convert_to("api_token", 'UTF8')), 'hex') WHERE "api_token" IS NOT NULL;
UPDATE "users" SET "reset_token" = encode(sha256(convert_to("reset_token", 'UTF8')), 'hex') WHERE "reset_token" IS NOT NULL;
UPDATE "users" SET "verify_token" = encode(sha256(convert_to("verify_token", 'UTF8')), 'hex') WHERE "verify_token" IS NOT NULL;
