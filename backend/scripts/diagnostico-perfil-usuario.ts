// Diagnóstico de solo lectura (no cambia nada): imprime el perfilCompilado
// real de un usuario -- roles con su peso, umbrales, jornada declarada --
// para depurar por qué el scorer manda TODO a banda gris en vez de postular.
//
// Uso (desde backend/):
//   DATABASE_URL="postgresql://...neon..." npx tsx scripts/diagnostico-perfil-usuario.ts correo@ejemplo.com
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.argv[2];
  if (!url) {
    console.error("Falta DATABASE_URL. Pásala como variable de entorno al correr el script.");
    process.exit(1);
  }
  if (!email) {
    console.error("Falta el correo. Uso: npx tsx scripts/diagnostico-perfil-usuario.ts correo@ejemplo.com");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const db = await client.query("SELECT current_database() AS db");
    console.log("Conectado a la base:", db.rows[0].db);
    console.log("");

    const usuario = await client.query(
      `SELECT id, email, objetivo_confirmado FROM users WHERE email = $1`,
      [email]
    );
    if (!usuario.rowCount) {
      console.log("No encontré ningún usuario con ese correo.");
      return;
    }
    const userId = usuario.rows[0].id;
    console.log("Usuario:", usuario.rows[0]);
    console.log("");

    const objetivos = await client.query(
      `SELECT ciuo, etiqueta, peso, orden FROM objetivos_laborales WHERE user_id = $1 ORDER BY orden ASC`,
      [userId]
    );
    console.log("Objetivos declarados (ObjetivoLaboral):");
    console.log(objetivos.rows);
    console.log("");

    const prefs = await client.query(
      `SELECT perfil_compilado, version_perfil, jornada, modalidad, amplitud, perfil_desactualizado, perfil_compilado_en, actualizado_en
       FROM search_preferences WHERE user_id = $1`,
      [userId]
    );
    if (!prefs.rowCount) {
      console.log("Este usuario no tiene search_preferences todavía.");
      return;
    }
    const fila = prefs.rows[0];
    console.log("jornada declarada:      ", fila.jornada);
    console.log("modalidad declarada:    ", fila.modalidad);
    console.log("amplitud:               ", fila.amplitud);
    console.log("versionPerfil:          ", fila.version_perfil);
    console.log("perfilDesactualizado:   ", fila.perfil_desactualizado);
    console.log("perfilCompiladoEn:      ", fila.perfil_compilado_en);
    console.log("actualizadoEn:          ", fila.actualizado_en);
    console.log("");
    console.log("perfilCompilado.roles (canonico, peso):");
    const pc = fila.perfil_compilado;
    if (pc && Array.isArray(pc.roles)) {
      for (const r of pc.roles) console.log("  -", r.canonico, "| peso:", r.peso, "| sinonimos:", (r.sinonimos || []).join(", "));
    } else {
      console.log("  (sin roles / perfilCompilado nulo)");
    }
    console.log("umbralPostular:", pc?.umbralPostular, "| umbralGris:", pc?.umbralGris);
    console.log("vetos:", JSON.stringify(pc?.vetos));
    console.log("senales:", JSON.stringify(pc?.senales));
    console.log("ubicacion:", JSON.stringify(pc?.ubicacion));
    console.log("jornada (dentro del perfil compilado):", pc?.jornada);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
