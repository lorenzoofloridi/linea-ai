// Invio email transazionali tramite Resend, con registro in email_outbox.
// La chiave RESEND_API_KEY resta solo nel backend; nei log compare solo lo stato HTTP.
import { randomBytes } from "node:crypto";

const FROM = "Linea AI <noreply@linea-ai.it>";

export class MailError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Registra e invia un'email. eventKey rende l'invio idempotente
 * (stesso evento = nessun doppione, anche lato Resend).
 */
export async function sendEmail(
  db,
  { companyId, eventKey, to, subject, text, html },
  { env = process.env, transport = fetch } = {}
) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new MailError("MAIL_NOT_CONFIGURED");

  const id = randomBytes(24).toString("base64url");
  const inserted = await db.pool.query(
    `INSERT INTO email_outbox
       (id, company_id, event_key, recipient, subject, body, status, created_at, error)
     VALUES ($1,$2,$3,$4,$5,$6,'sending',NOW(),NULL)
     ON CONFLICT (company_id, event_key) DO NOTHING
     RETURNING id`,
    [id, companyId, eventKey, to, subject, text]
  );
  if (!inserted.rowCount) return { duplicate: true };

  await db.pool.query(
    "INSERT INTO email_details (id, html, mode) VALUES ($1,$2,'resend')",
    [id, html]
  );

  let response;
  try {
    response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": eventKey
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html })
    });
  } catch {
    await db.pool.query(
      "UPDATE email_outbox SET status='uncertain', error=$1 WHERE id=$2",
      ["Invio non confermato (rete).", id]
    );
    throw new MailError("MAIL_NETWORK");
  }

  if (!response.ok) {
    console.error("Resend request failed:", response.status);
    await db.pool.query(
      "UPDATE email_outbox SET status='failed', error=$1 WHERE id=$2",
      [`Resend HTTP ${response.status}`, id]
    );
    throw new MailError("MAIL_FAILED");
  }

  await db.pool.query(
    "UPDATE email_outbox SET status='sent', error=NULL WHERE id=$1",
    [id]
  );
  return { sent: true };
}
