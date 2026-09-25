// Repara el estado a medias que dejó la migración
// 20260922120001_estado_real_y_descartes (ver diagnostico-migracion-atascada.ts).
//
// Diagnóstico confirmado: en la base ya existen el tipo OrigenEstado y las 3
// columnas nuevas de "applications" -- probablemente porque una versión más
// vieja del archivo de migración (antes de que le agregaran la columna
// "origen" y la tabla "descartes") ya se había aplicado en un deploy anterior.
// Al editar el archivo de migración DESPUÉS de eso, Prisma vuelve a intentar
// correrlo entero desde el principio y truena en el primer CREATE TYPE, que ya
// existe.
//
// Este script SOLO agrega lo que falta -- una columna nullable nueva y una
// tabla nueva, nada que toque una fila existente -- y cada paso revisa antes
// si ya está hecho (para poder correrlo más de una vez sin problema). Al final
// dice el comando de "prisma migrate resolve --applied" para que Vercel deje
// de rechazar el deploy.
//
// Uso, desde backend/, apuntando a la misma base que falló:
//   DATABASE_URL="..." npx tsx scripts/reparar-migracion-estado-real.ts
import { Client } from "pg";

async function columnaExiste(client: Client, tabla: string, columna: string) {
  const r = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
    [tabla, columna]
  );
  return r.rowCount! > 0;
}

async function tablaExiste(client: Client, tabla: string) {
  const r = await client.query("SELECT to_regclass($1) AS existe", [`public.${tabla}`]);
  return !!r.rows[0].existe;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL. Pásala como variable de entorno al correr el script.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  console.log("Conectado a:", (await client.query("SELECT current_database() AS db")).rows[0].db);

  try {
    await client.query("BEGIN");

    if (await columnaExiste(client, "application_status_history", "origen")) {
      console.log('· "origen" en application_status_history ya existe -- se deja igual.');
    } else {
      console.log('· Agregando la columna "origen" a application_status_history...');
      await client.query('ALTER TABLE "application_status_history" ADD COLUMN "origen" "OrigenEstado"');
    }

    if (await tablaExiste(client, "descartes")) {
      console.log('· La tabla "descartes" ya existe -- se deja igual.');
    } else {
      console.log('· Creando la tabla "descartes"...');
      await client.query(`
        CREATE TABLE "descartes" (
            "id" TEXT NOT NULL,
            "user_id" TEXT NOT NULL,
            "plataforma" TEXT NOT NULL,
            "external_id" TEXT NOT NULL,
            "titulo" TEXT NOT NULL,
            "empresa" TEXT,
            "url" TEXT,
            "razon" JSONB,
            "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "corregido_en" TIMESTAMP(3),

            CONSTRAINT "descartes_pkey" PRIMARY KEY ("id")
        )
      `);
      await client.query('CREATE INDEX "descartes_user_id_visto_en_idx" ON "descartes"("user_id", "visto_en")');
      await client.query(
        'CREATE UNIQUE INDEX "descartes_user_id_plataforma_external_id_key" ON "descartes"("user_id", "plataforma", "external_id")'
      );
      await client.query(
        'ALTER TABLE "descartes" ADD CONSTRAINT "descartes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE'
      );
    }

    await client.query("COMMIT");
    console.log("");
    console.log("Listo -- la base ya tiene todo lo que pide schema.prisma para esta migración.");
    console.log("Último paso (esto sí hay que correrlo, este script no lo hace):");
    console.log("");
    console.log(
      '  DATABASE_URL="..." npx prisma migrate resolve --applied "20260922120001_estado_real_y_descartes"'
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Algo falló -- no se dejó nada a medias (se revirtió todo). Detalle:");
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
