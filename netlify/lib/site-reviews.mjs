// Recensioni pubbliche del sito Linea AI.
// - Inserimento anonimo solo con consenso alla pubblicazione, sempre in stato "pending".
// - In vetrina solo le recensioni approvate a mano (scripts/reviews.mjs dal Mac).
// - Nessun dato personale oltre al nome pubblico scelto dall'autore; l'IP serve
//   solo come hash per il limite anti-spam e non viene salvato con la recensione.
import { createHash, randomBytes } from "node:crypto";

const PUBLIC_LIMIT = 12;

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};

async function rateLimit(db, key, maximum, windowSeconds, message) {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const result = await db.pool.query(
    `INSERT INTO chat_limits(key,bucket,count) VALUES($1,$2,1)
     ON CONFLICT(key,bucket) DO UPDATE SET count=chat_limits.count+1
     RETURNING count`,
    [key, bucket]
  );
  if (result.rows[0].count > maximum) fail(429, message);
}

// Rimuove caratteri di controllo e spazi superflui; il testo viene poi
// mostrato con textContent, quindi non è mai interpretato come HTML.
const clean = value =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

export async function listPublicReviews(db) {
  const rows = (
    await db.pool.query(
      `SELECT name, rating, comment, created_at
         FROM site_reviews
        WHERE status = 'approved' AND consent
        ORDER BY rating DESC, created_at DESC
        LIMIT $1`,
      [PUBLIC_LIMIT]
    )
  ).rows;
  return {
    reviews: rows.map(r => ({
      name: r.name,
      rating: r.rating,
      comment: r.comment,
      created_at: new Date(r.created_at).toISOString()
    }))
  };
}

export async function submitReview(db, body, { ip = "unknown" } = {}) {
  if (body?.consent !== true) {
    fail(400, "Serve il consenso alla pubblicazione della recensione.");
  }
  const name = typeof body.name === "string" ? clean(body.name) : "";
  const comment = typeof body.comment === "string" ? clean(body.comment) : "";
  const rating = body.rating;

  if (name.length < 1 || name.length > 80) {
    fail(400, "Indica un nome pubblico di massimo 80 caratteri.");
  }
  if (comment.length < 10 || comment.length > 1200) {
    fail(400, "Scrivi una recensione tra 10 e 1200 caratteri.");
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail(400, "Scegli una valutazione da 1 a 5.");
  }

  const busy = "Hai già inviato una recensione da poco. Riprova più tardi.";
  await rateLimit(db, "review-ip:" + digest(ip), 3, 3600, busy);
  // Tetto globale: limita lo spam e il lavoro di moderazione.
  await rateLimit(db, "review-all", 50, 86400, "Troppe recensioni oggi. Riprova domani.");

  await db.pool.query(
    `INSERT INTO site_reviews(id, name, rating, comment, status, consent)
     VALUES($1, $2, $3, $4, 'pending', TRUE)`,
    [randomBytes(16).toString("hex"), name, rating, comment]
  );
  return { ok: true };
}

export async function moderateReview(db, id, status) {
  if (!["approved", "rejected"].includes(status)) fail(400, "Esito non valido.");
  const result = await db.pool.query(
    `UPDATE site_reviews SET status = $2, moderated_at = NOW() WHERE id = $1`,
    [id, status]
  );
  if (!result.rowCount) fail(404, "Recensione non trovata.");
}
