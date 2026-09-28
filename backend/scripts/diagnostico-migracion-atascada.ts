// Diagnóstico de solo lectura (no cambia nada) para el error de Vercel:
//
//   P3018 / P3009 en la migración 20260922120001_estado_real_y_descartes
//   "type \"OrigenEstado\" already exists"
//
// Uso: apunta DATABASE_URL a la base que falló (la del deploy de Vercel que
// truena) y corre esto desde backend/:
//
//   DATABASE_URL="postgresql://...la-de-vercel..." npx tsx scripts/diagnostico-migracion-atascada.ts
//
// Solo hace SELECT -- no crea, borra ni altera nada. Al final dice qué comando
// de recuperación corresponde.
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL. Pásala como variable de entorno al correr el script.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const db = await client.query("SELECT current_database() AS db");
    console.log("Conectado a la base:", db.rows[0].db);
    console.log("");

    const tipo = await client.query("SELECT 1 FROM pg_type WHERE typname = 'OrigenEstado'");
    const existeTipo = tipo.rowCount! > 0;
    console.log("¿Existe el tipo OrigenEstado?          ", existeTipo);

    const colsApplications = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'applications' AND column_name IN ('origen_estado','ultima_consulta','veces_consultada')`
    );
    const colsHistory = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'application_status_history' AND column_name = 'origen'`
    );
    const tablaDescartes = await client.query("SELECT to_regclass('public.descartes') AS existe");
    const existeTablaDescartes = !!tablaDescartes.rows[0].existe;

    console.log("Columnas nuevas en applications:       ", colsApplications.rows.map((r) => r.column_name));
    console.log("Columna 'origen' en status_history:    ", colsHistory.rows.map((r) => r.column_name));
    console.log("¿Existe la tabla descartes?             ", existeTablaDescartes);
    console.log("");

    const historial = await client.query(
      `SELECT migration_name, finished_at, rolled_back_at, logs
       FROM _prisma_migrations
       WHERE migration_name = '20260922120001_estado_real_y_descartes'`
    );
    console.log("Fila en _prisma_migrations para esta migración:");
    console.log(historial.rows);
    console.log("");

    const todoCreado =
      existeTipo &&
      colsApplications.rowCount === 3 &&
      colsHistory.rowCount === 1 &&
      existeTablaDescartes;
    const nadaCreado = !existeTipo && colsApplications.rowCount === 0 && colsHistory.rowCount === 0 && !existeTablaDescartes;

    console.log("── Diagnóstico ──────────────────────────────────────────");
    if (todoCreado) {
      console.log("La migración en realidad SÍ se aplicó completa. Falta solo decírselo a Prisma:");
      console.log('  DATABASE_URL="..." npx prisma migrate resolve --applied "20260922120001_estado_real_y_descartes"');
    } else if (nadaCreado) {
      console.log("Curioso: no encuentro rastro del tipo ni de las columnas, pero Postgres dijo que ya existía.");
      console.log("Puede que estés apuntando a otra base. Revisa el DATABASE_URL antes de seguir.");
    } else {
      console.log("Quedó a medias -- el tipo (y quizás algo más) se creó pero no todo. Antes de tocar nada,");
      console.log("pégame la salida de este script y decidimos juntos el DROP mínimo, sin arriesgar datos reales.");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
