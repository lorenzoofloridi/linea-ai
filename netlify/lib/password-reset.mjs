// Recupero password online.
// - La risposta alla richiesta è sempre la stessa: non rivela se un'email è registrata.
// - Il token viaggia solo nel frammento dell'URL (#), nel database solo il suo hash.
// - Dopo il cambio, tutte le sessioni dell'utente vengono chiuse.
import { createHash, randomBytes } from "node:crypto";
import { sendEmail } from "./mailer.mjs";

const TOKEN_TTL_SECONDS = 30 * 60;
const REQUEST_MESSAGE =
  "Se l’indirizzo è associato a un account, riceverai a breve un’email con il link per scegliere una nuova password. Controlla anche lo spam.";

const digest = value => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};

async function rateLimit(db, key, maximum, windowSeconds) {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const result = await db.pool.query(
    `INSERT INTO chat_limits(key,bucket,count) VALUES($1,$2,1)
     ON CONFLICT(key,bucket) DO UPDATE SET count=chat_limits.count+1
     RETURNING count`,
    [key, bucket]
  );
  if (result.rows[0].count > maximum) {
    fail(429, "Troppi tentativi. Riprova tra qualche minuto.");
  }
}

function field(body, name, maximum) {
  const value = body?.[name];
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    fail(400, "Controlla i dati inseriti.");
  }
  return value.trim();
}

export async function requestPasswordReset(db, body, { ip = "unknown", baseUrl, env = process.env, mail = sendEmail } = {}) {
  const email = field(body, "email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Controlla l’email.");

  await rateLimit(db, "reset-ip:" + digest(ip), 5, 900);
  await rateLimit(db, "reset-email:" + digest(email), 3, 3600);

  const user = (
    await db.pool.query("SELECT id, company_id, email FROM users WHERE email=$1", [email])
  ).rows[0];

  if (user) {
    const value = randomBytes(32).toString("base64url");
    const hash = digest(value);
    await db.pool.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [user.id]);
    await db.pool.query(
      "INSERT INTO password_reset_tokens(hash, user_id, expires) VALUES($1,$2,$3)",
      [hash, user.id, Date.now() / 1000 + TOKEN_TTL_SECONDS]
    );
    const link = `${baseUrl}/recupera-password.html#${value}`;
    try {
      await mail(db, {
        companyId: user.company_id,
        eventKey: "reset:" + hash,
        to: user.email,
        subject: "Scegli una nuova password — Linea AI",
        text:
          "Hai chiesto di reimpostare la password del tuo account Linea AI.\n\n" +
          `Apri questo link entro 30 minuti:\n${link}\n\n` +
          "Se non sei stato tu, ignora questa email: la password attuale resta valida.",
        html:
          "<p>Hai chiesto di reimpostare la password del tuo account Linea AI.</p>" +
          `<p><a href="${link}">Scegli una nuova password</a> (link valido 30 minuti).</p>` +
          "<p>Se non sei stato tu, ignora questa email: la password attuale resta valida.</p>"
      }, { env });
    } catch (error) {
      // Stesso messaggio verso l'esterno; nei log solo il codice.
      console.error("Password reset mail error:", error?.code || "unknown");
    }
  }

  return { ok: true, message: REQUEST_MESSAGE };
}

export async function completePasswordReset(db, body, { ip = "unknown", hashPassword }) {
  const value = field(body, "token", 100);
  const password = body?.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    fail(400, "Scegli una password di almeno 12 caratteri.");
  }

  await rateLimit(db, "reset-complete:" + digest(ip), 10, 900);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query(
        `DELETE FROM password_reset_tokens
          WHERE hash=$1
          RETURNING user_id, expires`,
        [digest(value)]
      )
    ).rows[0];
    if (!row || Number(row.expires) < Date.now() / 1000) {
      await client.query("ROLLBACK");
      fail(400, "Il link non è più valido. Richiedine uno nuovo.");
    }
    await client.query("UPDATE users SET password=$1 WHERE id=$2", [await hashPassword(password), row.user_id]);
    await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [row.user_id]);
    await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [row.user_id]);
    await client.query("COMMIT");
  } catch (error) {
    if (!error.httpStatus) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return { ok: true, message: "Password aggiornata. Ora puoi accedere con la nuova password." };
}
