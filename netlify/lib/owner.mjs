// Gestore (owner) di MoreAI.
// Le email dei gestori vengono SOLO dalle variabili d'ambiente:
// LINEA_ADMIN_EMAILS (separate da virgola), altrimenti LINEA_FEEDBACK_EMAIL.
// Nessun valore inviato dal browser può rendere qualcuno gestore.

/** Email dei gestori, in minuscolo. */
export function adminEmails(env = process.env) {
  return String(env.LINEA_ADMIN_EMAILS || env.LINEA_FEEDBACK_EMAIL || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
}

/** true se l'email appartiene a un gestore. */
export function isAdminEmail(email, env = process.env) {
  return typeof email === "string" && adminEmails(env).includes(email.trim().toLowerCase());
}

/**
 * true se l'azienda è quella del gestore (account con email di gestore
 * verificata): ha tutte le funzioni senza limiti di piano.
 */
export async function isOwnerCompany(db, companyId, env = process.env) {
  const emails = adminEmails(env);
  if (!emails.length || !companyId) return false;
  const r = await db.pool.query(
    `SELECT 1
       FROM users u
       JOIN email_verification e ON e.user_id=u.id
      WHERE u.company_id=$1
        AND LOWER(u.email) IN (SELECT jsonb_array_elements_text($2::jsonb))
        AND e.verified_at IS NOT NULL
      LIMIT 1`,
    [companyId, JSON.stringify(emails)]
  );
  return r.rowCount > 0;
}
