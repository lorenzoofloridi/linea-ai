// Richiesta di supporto o di attivazione di un piano, inviata dal sito.
// Un solo pulsante che funziona con qualsiasi posta: il messaggio parte dal
// server (Resend) verso il gestore, con "Rispondi a" = email dell'account,
// così la risposta arriva direttamente al cliente.
// Il destinatario è fisso lato server: il sito non può essere usato per
// scrivere ad altri indirizzi.
import { createHash, randomBytes } from "node:crypto";
import { sendEmail } from "./mailer.mjs";

const DEFAULT_TO = "lorenzoofloridi@gmail.com";
const PLANS = { base: "Piano Base", plus: "Piano Plus", advanced: "Piano Advanced" };
const PERIODS = { monthly: "mensile", annual: "annuale" };

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};
const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clean = value =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

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

export async function sendSupportRequest(db, user, body, { env = process.env, mail = sendEmail } = {}) {
  const message = typeof body?.message === "string" ? clean(body.message) : "";
  if (message.length < 10 || message.length > 2000) {
    fail(400, "Scrivi un messaggio tra 10 e 2000 caratteri.");
  }
  const plan = PLANS[body?.plan] || null;
  const period = PERIODS[body?.period] || null;

  await rateLimit(db, "support-user:" + digest(user.id), 5, 3600, "Hai già inviato diverse richieste. Riprova tra un’ora.");
  await rateLimit(db, "support-all", 100, 86400, "Troppe richieste oggi. Riprova domani.");

  const row = (
    await db.pool.query(
      `SELECT c.config->>'name' AS company, v.verified_at
         FROM companies c
         LEFT JOIN email_verification v ON v.user_id = $2
        WHERE c.id = $1`,
      [user.company_id, user.id]
    )
  ).rows[0] || {};

  const company = row.company || "—";
  const verified = Boolean(row.verified_at);
  const subject = plan
    ? `Attivazione ${plan}${period ? " (" + period + ")" : ""} — ${company}`
    : `Richiesta di supporto — ${company}`;
  const details = [
    ["Tipo", plan ? `Attivazione ${plan}${period ? ", fatturazione " + period : ""}` : "Supporto"],
    ["Azienda", company],
    ["Email dell’account", user.email + (verified ? "" : " (non ancora verificata)")]
  ];

  const text =
    details.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessaggio:\n${message}\n\nPer rispondere al cliente basta rispondere a questa email.`;
  const html =
    details.map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join("") +
    `<p><strong>Messaggio:</strong></p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>` +
    `<p>Per rispondere al cliente basta rispondere a questa email.</p>`;

  try {
    await mail(db, {
      companyId: user.company_id,
      eventKey: "support:" + randomBytes(12).toString("hex"),
      to: env.LINEA_SUPPORT_EMAIL || DEFAULT_TO,
      replyTo: user.email,
      subject,
      text,
      html
    }, { env });
  } catch (error) {
    console.error("Support request email failed:", error?.code || "internal");
    fail(503, "Invio non riuscito. Riprova tra poco oppure scrivici a " + (env.LINEA_SUPPORT_EMAIL || DEFAULT_TO) + ".");
  }
  return { ok: true };
}
