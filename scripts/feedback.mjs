// Feedback dei visitatori sulla chat della home di Linea AI, dal Mac
// (nessun credito Netlify). I feedback delle aziende clienti restano
// nelle loro dashboard e non vengono mostrati qui.
//
//   npm run feedback                  ultimi 50 feedback, con data, voto e commento
//   npm run feedback -- chat <id>     la conversazione completa di quel feedback
//
// Usa la stessa configurazione delle migrazioni (.env.supabase).
import pg from "pg";
import { connectionOptions } from "../netlify/lib/db.mjs";

const [command = "list", id] = process.argv.slice(2);
const url = process.env.LINEA_DATABASE_MIGRATION_URL || process.env.LINEA_DATABASE_URL;
const pool = new pg.Pool({ ...connectionOptions(url, process.env), max: 1, application_name: "linea-ai-feedback" });
const when = d => new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome" });

try {
  if (command === "list") {
    const summary = (
      await pool.query(
        `SELECT COUNT(*) AS n, ROUND(AVG(f.rating)::numeric, 1) AS media
           FROM feedback f
           JOIN conversations c ON c.company_id = f.company_id AND c.id = f.conversation_id
          WHERE c.kind = 'public_demo'`
      )
    ).rows[0];
    const rows = (
      await pool.query(
        `SELECT f.conversation_id, f.rating, f.comment, f.created_at
           FROM feedback f
           JOIN conversations c ON c.company_id = f.company_id AND c.id = f.conversation_id
          WHERE c.kind = 'public_demo'
          ORDER BY f.created_at DESC
          LIMIT 50`
      )
    ).rows;
    console.log(`Feedback sulla chat della home: ${summary.n} · media ${summary.media ?? "—"}/5`);
    if (!rows.length) console.log("Nessun feedback ricevuto finora.");
    for (const r of rows) {
      console.log(`\n${when(r.created_at)}  ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}  ${r.rating}/5`);
      console.log("  " + (r.comment.trim() || "(nessun commento)").replace(/\n/g, "\n  "));
      console.log(`  conversazione: npm run feedback -- chat ${r.conversation_id}`);
    }
  } else if (command === "chat" && id) {
    const messages = (
      await pool.query(
        `SELECT m.role, m.content, m.created_at
           FROM messages m
           JOIN conversations c ON c.company_id = m.company_id AND c.id = m.conversation_id
          WHERE c.kind = 'public_demo' AND m.conversation_id = $1
          ORDER BY m.seq`,
        [id]
      )
    ).rows;
    if (!messages.length) console.log("Conversazione non trovata (o non è della chat della home).");
    for (const m of messages) {
      console.log(`\n[${when(m.created_at)}] ${m.role === "user" ? "Visitatore" : "Assistente"}:`);
      console.log("  " + m.content.replace(/\n/g, "\n  "));
    }
  } else {
    console.log("Uso: npm run feedback [-- chat <id>]");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Errore: " + (error.code || "sconosciuto"));
  process.exitCode = 1;
} finally {
  await pool.end();
}
