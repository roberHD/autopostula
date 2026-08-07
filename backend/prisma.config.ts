import "dotenv/config";
import { defineConfig, env } from "prisma/config";


export default defineConfig({
  // Ajusta esta ruta si tu schema.prisma no queda en /prisma
  schema: "schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
