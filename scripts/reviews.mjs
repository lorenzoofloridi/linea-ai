// Moderazione delle recensioni del sito, dal Mac (nessun credito Netlify).
//
//   npm run reviews                  elenca le recensioni in attesa
//   npm run reviews -- all           elenca tutte le recensioni
//   npm run reviews -- approve <id>  pubblica una recensione
//   npm run reviews -- reject <id>   la scarta (resta nel database, non visibile)
//
// Usa la stessa configurazione delle migrazioni (.env.supabase).
import pg from "pg";
import { connectionOptions } from "../netlify/lib/db.mjs";
import { moderateReview } from "../netlify/lib/site-reviews.mjs";

const [command = "pending", id] = process.argv.slice(2);
const url = process.env.LINEA_DATABASE_MIGRATION_URL || process.env.LINEA_DATABASE_URL;
const pool = new pg.Pool({ ...connectionOptions(url, process.env), max: 1, application_name: "linea-ai-reviews" });
const db = { pool };

try {
  if (command === "pending" || command === "all") {
    const rows = (
      await pool.query(
        `SELECT id, status, rating, name, comment, created_at FROM site_reviews
          ${command === "pending" ? "WHERE status = 'pending'" : ""}
          ORDER BY created_at DESC LIMIT 200`
      )
    ).rows;
    if (!rows.length) console.log(command === "pending" ? "Nessuna recensione in attesa." : "Nessuna recensione.");
    for (const r of rows) {
      console.log(`\n${r.id}  [${r.status}]  ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}  ${r.name}  (${new Date(r.created_at).toLocaleString("it-IT")})`);
      console.log("  " + r.comment.replace(/\n/g, "\n  "));
    }
  } else if ((command === "approve" || command === "reject") && id) {
    await moderateReview(db, id, command === "approve" ? "approved" : "rejected");
    console.log(command === "approve" ? "Recensione pubblicata." : "Recensione scartata.");
  } else {
    console.log("Uso: npm run reviews [-- all | approve <id> | reject <id>]");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.httpStatus ? error.message : "Errore: " + (error.code || "sconosciuto"));
  process.exitCode = 1;
} finally {
  await pool.end();
}
