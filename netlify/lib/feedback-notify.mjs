// Avviso email al gestore di MoreAI quando un visitatore lascia un feedback
// sulla chat della home. Attivo solo se LINEA_FEEDBACK_EMAIL è impostata.
// Il feedback resta comunque salvato nel database: l'email è solo un avviso.
import { sendEmail } from "./mailer.mjs";

const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function notifyHomeFeedback(
  db,
  { companyId, conversationId, rating, comment },
  { env = process.env, mail = sendEmail } = {}
) {
  const to = env.LINEA_FEEDBACK_EMAIL;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { skipped: true };

  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const text =
    `Nuovo feedback sulla chat della home di MoreAI.\n\n` +
    `Valutazione: ${rating}/5 ${stars}\n` +
    `Commento: ${comment.trim() || "(nessun commento)"}\n\n` +
    `Per leggere la conversazione, dal Mac: npm run feedback -- chat ${conversationId}`;
  const html =
    `<p>Nuovo feedback sulla chat della home di MoreAI.</p>` +
    `<p><strong>Valutazione:</strong> ${rating}/5 ${stars}</p>` +
    `<p><strong>Commento:</strong> ${escapeHtml(comment.trim() || "(nessun commento)")}</p>` +
    `<p>Per leggere la conversazione, dal Mac:<br><code>npm run feedback -- chat ${escapeHtml(conversationId)}</code></p>`;

  try {
    await mail(db, {
      companyId,
      eventKey: `feedback:${conversationId}`,
      to,
      subject: `Nuovo feedback: ${rating}/5 — MoreAI`,
      text,
      html
    }, { env });
    return { sent: true };
  } catch (error) {
    console.error("Feedback notification failed:", error?.code || "internal");
    return { failed: true };
  }
}
