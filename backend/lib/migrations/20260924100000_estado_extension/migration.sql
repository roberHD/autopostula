-- docs/estrategia-y-rediseno.md §6: un solo estado para la extensión.
-- Los interruptores que vivían en chrome.storage (solo observar, revisar antes
-- de enviar, los datos sueltos para la IA) pasan a la cuenta. NULL = la persona
-- todavía no lo dijo acá: la extensión sube una sola vez lo que tenía guardado
-- en ese navegador y desde entonces manda el servidor.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "solo_observar" BOOLEAN,
ADD COLUMN     "revisar_antes_de_enviar" BOOLEAN,
ADD COLUMN     "info_adicional" JSONB;
