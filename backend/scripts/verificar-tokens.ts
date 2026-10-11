// Verificación de los tokens con hash (lib/token.ts; Ley 21.719, art. 14
// quinquies). Se prueba contra la base de verdad, con cuentas de mentira que se
// borran al final:
//   npx tsx scripts/verificar-tokens.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashToken, nuevoToken } from "../lib/token";

const PREFIJO = "verificar-tokens-";

let fallos = 0;
function check(desc: string, cond: boolean, detalle?: unknown) {
  if (!cond) {
    fallos++;
    console.log("FALLA  " + desc + (detalle !== undefined ? "  → " + JSON.stringify(detalle) : ""));
  } else {
    console.log("ok     " + desc);
  }
}

// El mismo UPDATE de la migración 20261011120000_tokens_con_hash, para una sola cuenta.
async function migrar(userId: string) {
  await prisma.$executeRaw`UPDATE "users" SET
    "api_token" = CASE WHEN "api_token" IS NULL THEN NULL ELSE encode(sha256(convert_to("api_token", 'UTF8')), 'hex') END,
    "reset_token" = CASE WHEN "reset_token" IS NULL THEN NULL ELSE encode(sha256(convert_to("reset_token", 'UTF8')), 'hex') END,
    "verify_token" = CASE WHEN "verify_token" IS NULL THEN NULL ELSE encode(sha256(convert_to("verify_token", 'UTF8')), 'hex') END
    WHERE "id" = ${userId}`;
}

async function main() {
  const creadas: string[] = [];
  try {
    // ── Un token nuevo ──
    const { token, hash } = nuevoToken();
    check("el token es de 64 caracteres hexadecimales (32 bytes al azar)", /^[0-9a-f]{64}$/.test(token));
    check("el hash es determinista", hashToken(token) === hash && hash !== token);

    const nueva = await prisma.user.create({
      data: { email: `${PREFIJO}nueva-${Date.now()}@ejemplo.invalid`, apiToken: hash },
      select: { id: true },
    });
    creadas.push(nueva.id);
    const porToken = await prisma.user.findUnique({ where: { apiToken: hashToken(token) }, select: { id: true } });
    check("con el token de la extensión se encuentra la cuenta", porToken?.id === nueva.id);
    const porHash = await prisma.user.findUnique({ where: { apiToken: hashToken(hash) }, select: { id: true } });
    check("con lo que está guardado en la base no se entra (no sirve como token)", porHash === null);
    const guardado = await prisma.user.findUnique({ where: { id: nueva.id }, select: { apiToken: true } });
    check("la base no tiene el token, solo su hash", guardado?.apiToken === hash && guardado?.apiToken !== token);

    // ── La migración: una cuenta de antes, con los tokens en texto plano ──
    const viejoApi = nuevoToken().token;
    const viejoReset = nuevoToken().token;
    const viejoVerify = nuevoToken().token;
    const vieja = await prisma.user.create({
      data: {
        email: `${PREFIJO}vieja-${Date.now()}@ejemplo.invalid`,
        apiToken: viejoApi, resetToken: viejoReset, verifyToken: viejoVerify,
      },
      select: { id: true },
    });
    creadas.push(vieja.id);
    await migrar(vieja.id);

    check(
      "después de la migración, la extensión ya conectada sigue entrando con el token que tiene",
      (await prisma.user.findUnique({ where: { apiToken: hashToken(viejoApi) }, select: { id: true } }))?.id === vieja.id
    );
    check(
      "...y el enlace de recuperar contraseña que ya se mandó sigue sirviendo",
      (await prisma.user.findUnique({ where: { resetToken: hashToken(viejoReset) }, select: { id: true } }))?.id === vieja.id
    );
    check(
      "...y el de verificar el correo también",
      (await prisma.user.findUnique({ where: { verifyToken: hashToken(viejoVerify) }, select: { id: true } }))?.id === vieja.id
    );
    check(
      "...pero el token en texto plano ya no está en la base",
      (await prisma.user.findUnique({ where: { apiToken: viejoApi }, select: { id: true } })) === null
    );

    // El hash de Postgres (el de la migración) tiene que ser el mismo que el de Node.
    const [fila] = await prisma.$queryRaw<{ h: string }[]>`SELECT encode(sha256(convert_to(${token}, 'UTF8')), 'hex') AS h`;
    check("el SHA-256 de Postgres es igual al de hashToken()", fila?.h === hash, fila);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: creadas } } });
  }

  console.log(fallos ? `\n${fallos} falla(s)` : "\nTodo OK");
  process.exit(fallos ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
