// Gestori (admin) di MoreAI.
//
// - Gestori principali: email in LINEA_ADMIN_EMAILS (separate da virgola),
//   altrimenti LINEA_FEEDBACK_EMAIL. Non si possono togliere dal sito.
// - Gestori aggiunti: tabella admin_users (whitelist), gestita solo dai
//   gestori principali dall'area gestore.
// Nessun valore inviato dal browser può rendere qualcuno gestore: conta solo
// l'email dell'account autenticato (e verificata, dove richiesto).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email dei gestori principali (da variabili d'ambiente), in minuscolo. */
export function adminEmails(env = process.env) {
  return String(env.LINEA_ADMIN_EMAILS || env.LINEA_FEEDBACK_EMAIL || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(x => EMAIL.test(x));
}

/** true se l'email è di un gestore principale. */
export function isAdminEmail(email, env = process.env) {
  return typeof email === "string" && adminEmails(env).includes(email.trim().toLowerCase());
}

/** Normalizza un'email per la whitelist, o null se non valida. */
export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** true se l'email è di un gestore (principale o aggiunto). */
export async function isAdmin(db, email, env = process.env) {
  if (typeof email !== "string" || !email) return false;
  if (isAdminEmail(email, env)) return true;
  const r = await db.pool.query("SELECT 1 FROM admin_users WHERE email=$1", [email.trim().toLowerCase()]);
  return r.rowCount > 0;
}

/** Tutti i gestori: principali + aggiunti. */
export async function listAdmins(db, env = process.env) {
  const rows = (await db.pool.query("SELECT email, added_by, added_at FROM admin_users ORDER BY added_at")).rows;
  const primary = adminEmails(env);
  return [
    ...primary.map(email => ({ email, primary: true, added_by: "", added_at: null })),
    ...rows.filter(r => !primary.includes(r.email)).map(r => ({ email: r.email, primary: false, added_by: r.added_by, added_at: r.added_at }))
  ];
}

/**
 * true se l'azienda è di un gestore (account con email di gestore
 * verificata): ha tutte le funzioni senza limiti di piano.
 */
export async function isOwnerCompany(db, companyId, env = process.env) {
  if (!companyId) return false;
  const r = await db.pool.query(
    `SELECT 1
       FROM users u
       JOIN email_verification e ON e.user_id=u.id
      WHERE u.company_id=$1
        AND e.verified_at IS NOT NULL
        AND (
          LOWER(u.email) IN (SELECT jsonb_array_elements_text($2::jsonb))
          OR EXISTS (SELECT 1 FROM admin_users a WHERE a.email=LOWER(u.email))
        )
      LIMIT 1`,
    [companyId, JSON.stringify(adminEmails(env))]
  );
  return r.rowCount > 0;
}
