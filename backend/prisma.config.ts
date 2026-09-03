import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "lib/migrations",
  },
  // Las migraciones (prisma migrate deploy) necesitan una conexión directa a
  // Postgres -- el pool de Neon (usado en runtime vía DATABASE_URL) no
  // mantiene sesión persistente, y el advisory lock que usa migrate deploy
  // para evitar corridas simultáneas se cuelga y termina en un timeout P1002.
  // El cliente de la app (lib/prisma.ts) sigue usando DATABASE_URL pooleada.
  datasource: {
    url: env("DATABASE_URL_UNPOOLED"),
  },
});