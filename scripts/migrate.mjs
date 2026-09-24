// Applica le migrazioni SQL di database/migrations al database PostgreSQL
// (Supabase). Da eseguire dal Mac, mai dalle Functions.
//
//   npm run db:status    elenca migrazioni applicate e in attesa (nessuna modifica)
//   npm run db:migrate   applica quelle in attesa, ognuna in una transazione
//   npm run db:check     verifica RLS e privilegi dei ruoli pubblici Supabase
//
// Configurazione in .env.supabase (ignorato da Git), letto con --env-file:
//   LINEA_DATABASE_MIGRATION_URL=<Session pooler, porta 5432>
//   LINEA_DATABASE_CA_FILE=<percorso del certificato CA scaricato da Supabase>
// La password non viene mai stampata.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { connectionOptions, describeConnection } from "../netlify/lib/db.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "database", "migrations");
const command = process.argv[2] || "status";

async function migrations() {
  const files = (await readdir(DIR)).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  return Promise.all(files.map(async name => {
    const sql = await readFile(path.join(DIR, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

async function applied(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query("ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY");
  const rows = (await client.query("SELECT name, checksum FROM schema_migrations")).rows;
  return new Map(rows.map(r => [r.name, r.checksum]));
}

async function check(client) {
  const problems = [];
  const noRls = (await client.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
      ORDER BY 1`
  )).rows.map(r => r.relname);
  if (noRls.length) problems.push(`RLS disattivata su: ${noRls.join(", ")}`);
  const grants = (await client.query(
    `SELECT grantee, table_name, string_agg(privilege_type, ',') AS privileges
       FROM information_schema.role_table_grants
      WHERE table_schema=current_schema() AND grantee IN ('anon','authenticated')
      GROUP BY 1,2 ORDER BY 1,2`
  )).rows;
  for (const g of grants) problems.push(`${g.grantee} ha ${g.privileges} su ${g.table_name}`);
  return problems;
}

async function main() {
  if (!["status", "migrate", "check"].includes(command)) {
    console.error("Uso: node scripts/migrate.mjs status|migrate|check");
    process.exit(2);
  }
  const url = process.env.LINEA_DATABASE_MIGRATION_URL || process.env.LINEA_DATABASE_URL;
  const client = new pg.Client({ ...connectionOptions(url, process.env), application_name: "linea-ai-migrate" });
  console.log(`Database: ${describeConnection(url)}`);
  await client.connect();
  try {
    const done = await applied(client);
    const all = await migrations();
    const changed = all.filter(m => done.has(m.name) && done.get(m.name) !== m.checksum);
    if (changed.length) {
      throw new Error(`Migrazioni già applicate ma modificate: ${changed.map(m => m.name).join(", ")}. Non si modifica una migrazione applicata: crearne una nuova.`);
    }
    const pending = all.filter(m => !done.has(m.name));

    if (command === "status") {
      for (const m of all) console.log(`${done.has(m.name) ? "applicata " : "in attesa "} ${m.name}`);
      console.log(pending.length ? `${pending.length} migrazioni in attesa.` : "Database aggiornato.");
      return;
    }

    if (command === "migrate") {
      // Un solo esecutore alla volta.
      await client.query("SELECT pg_advisory_lock(727274)");
      try {
        for (const m of pending) {
          await client.query("BEGIN");
          try {
            await client.query(m.sql);
            await client.query("INSERT INTO schema_migrations(name, checksum) VALUES($1,$2)", [m.name, m.checksum]);
            await client.query("COMMIT");
            console.log(`applicata   ${m.name}`);
          } catch (error) {
            await client.query("ROLLBACK");
            throw new Error(`${m.name}: ${error.message}`);
          }
        }
      } finally {
        await client.query("SELECT pg_advisory_unlock(727274)");
      }
      console.log(pending.length ? "Migrazioni completate." : "Nessuna migrazione in attesa.");
    }

    const problems = await check(client);
    if (problems.length) {
      for (const p of problems) console.error(`PROBLEMA: ${p}`);
      process.exitCode = 1;
    } else {
      console.log("Controllo sicurezza: RLS attiva su tutte le tabelle, nessun privilegio per anon/authenticated.");
    }
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(`Errore: ${error.code || error.message}`);
  process.exit(1);
});
