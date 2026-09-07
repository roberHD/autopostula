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
  //
  // El fallback es para desarrollo: contra el Postgres de docker-compose no
  // hay pooler que esquivar, DATABASE_URL ya es la conexión directa y
  // DATABASE_URL_UNPOOLED no existe. Sin esto, env() tira PrismaConfigEnvError
  // al cargar el config y ni `prisma generate` -- que ni siquiera se conecta --
  // llega a correr.
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? env("DATABASE_URL"),
  },
});