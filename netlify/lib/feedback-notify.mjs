// Avviso email al gestore di MoreAI quando arriva un feedback sulla chat
// della home o sulla chat di prova della dashboard. Attivo solo se LINEA_FEEDBACK_EMAIL è impostata.
// Il feedback resta comunque salvato nel database: l'email è solo un avviso.
import { sendEmail } from "./mailer.mjs";

const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// source: "home" = chat della home di MoreAI; "test" = chat di prova nella
// dashboard di un'azienda (feedback sul servizio MoreAI). I feedback lasciati
// dai clienti delle aziende sui loro siti NON passano da qui: restano solo
// nella dashboard dell'azienda.
export async function notifyHomeFeedback(
  db,
  { companyId, conversationId, rating, comment, source = "home", companyName = "" },
  { env = process.env, mail = sendEmail } = {}
) {
  const to = env.LINEA_FEEDBACK_EMAIL;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { skipped: true };

  const test = source === "test";
  const name = String(companyName || "").trim().slice(0, 120) || "azienda senza nome";
  const where = test
    ? `sulla chat di prova nella dashboard di ${name}`
    : "sulla chat della home di MoreAI";
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const text =
    `Nuovo feedback ${where}.\n\n` +
    `Valutazione: ${rating}/5 ${stars}\n` +
    `Commento: ${comment.trim() || "(nessun commento)"}` +
    (test
      ? `\n\nLa conversazione è nella dashboard dell'azienda, scheda «Conversazioni».`
      : `\n\nPer leggere la conversazione, dal Mac: npm run feedback -- chat ${conversationId}`);
  const html =
    `<p>Nuovo feedback ${escapeHtml(where)}.</p>` +
    `<p><strong>Valutazione:</strong> ${rating}/5 ${stars}</p>` +
    `<p><strong>Commento:</strong> ${escapeHtml(comment.trim() || "(nessun commento)")}</p>` +
    (test
      ? `<p>La conversazione è nella dashboard dell'azienda, scheda «Conversazioni».</p>`
      : `<p>Per leggere la conversazione, dal Mac:<br><code>npm run feedback -- chat ${escapeHtml(conversationId)}</code></p>`);

  try {
    await mail(db, {
      companyId,
      eventKey: `feedback:${conversationId}`,
      to,
      subject: test
        ? `Nuovo feedback dalla dashboard (${name}): ${rating}/5 — MoreAI`
        : `Nuovo feedback: ${rating}/5 — MoreAI`,
      text,
      html
    }, { env });
    return { sent: true };
  } catch (error) {
    console.error("Feedback notification failed:", error?.code || "internal");
    return { failed: true };
  }
}
