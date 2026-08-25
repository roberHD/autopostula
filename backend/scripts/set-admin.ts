// Script de uso manual, NO se expone por ninguna ruta HTTP ni se referencia desde
// la app -- es la única forma de otorgar el rol ADMIN (llamadas de IA ilimitadas).
//
// Uso:
//   npx tsx scripts/set-admin.ts tu@email.com          -> otorga ADMIN
//   npx tsx scripts/set-admin.ts tu@email.com --revoke  -> vuelve a USUARIO
//
// Corre esto una sola vez, a mano, desde tu máquina. No lo agregues a ningún
// flujo automático ni lo dejes corriendo en un endpoint.
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  const revocar = process.argv.includes("--revoke");

  if (!email) {
    console.error("Uso: npx tsx scripts/set-admin.ts <email> [--revoke]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No existe ningún usuario con el email "${email}".`);
    process.exit(1);
  }

  const nuevoRol: "USUARIO" | "ADMIN" = revocar ? "USUARIO" : "ADMIN";
  await prisma.user.update({
    where: { email },
    data: { rol: nuevoRol },
  });

  console.log(`Listo: ${email} ahora tiene rol ${nuevoRol}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
