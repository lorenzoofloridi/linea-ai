// Verifica delle aziende e pannello del gestore di MoreAI.
//
// - Dopo l'analisi automatica: se l'azienda è confermata diventa "verified";
//   altrimenti "under_review" e parte un'email al gestore.
// - /admin.html: il gestore (email in LINEA_ADMIN_EMAILS) vede l'elenco delle
//   aziende, approva o rifiuta, corregge le informazioni per l'AI e i siti
//   del widget, rilancia l'analisi. Ogni azione resta nel registro.
//
// È l'unico punto del sistema che legge dati di più aziende: accesso solo per
// utenti gestori con email verificata.
import { sendEmail } from "./mailer.mjs";
import { adminEmails, isAdmin, isAdminEmail, listAdmins, normalizeEmail } from "./owner.mjs";
import { effectivePlan } from "./ai-quota.mjs";
import { knowledgeEntries } from "./company-data.mjs";
import { normalizeOrigin } from "./widget.mjs";
import { internalRequestHeaders } from "./internal-auth.mjs";

const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export { adminEmails };

const siteUrl = env => (env.PUBLIC_SITE_URL || "https://www.moreai.it").replace(/\/+$/, "");

/** Registro permanente delle azioni del gestore (resta anche dopo un'eliminazione). */
async function adminLog(db, actor, action, companyId, companyName, detail = "") {
  await db.pool.query(
    "INSERT INTO admin_log(actor, action, company_id, company_name, detail) VALUES($1,$2,$3,$4,$5)",
    [actor.slice(0, 200), action, companyId, String(companyName || "").slice(0, 200), String(detail).slice(0, 500)]
  );
}

async function audit(db, companyId, actor, previous, status, reason) {
  await db.pool.query(
    `INSERT INTO company_verification_audit(company_id, actor, previous, status, reason, created_at)
     VALUES($1,$2,$3,$4,$5,NOW())`,
    [companyId, actor.slice(0, 200), previous, status, reason.slice(0, 500)]
  );
}

/**
 * Da chiamare quando l'analisi è finita (status: verified | needs_review | failed).
 * Non tocca le decisioni già prese a mano (verified/rejected/suspended da gestore).
 */
export async function researchOutcome(db, companyId, status, { env = process.env, mail = sendEmail } = {}) {
  const current = (await db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [companyId])).rows[0]?.status || "pending";
  if (["rejected", "suspended"].includes(current)) return { status: current };
  if (status === "verified") {
    if (current !== "verified") {
      await db.pool.query(
        `INSERT INTO company_verification(company_id, status, updated_at) VALUES($1,'verified',NOW())
         ON CONFLICT(company_id) DO UPDATE SET status='verified', updated_at=NOW()`,
        [companyId]
      );
      await audit(db, companyId, "analisi automatica", current, "verified", "Azienda trovata e verificata dall’analisi web.");
    }
    return { status: "verified" };
  }
  if (current === "verified") return { status: current };
  await db.pool.query(
    `INSERT INTO company_verification(company_id, status, updated_at) VALUES($1,'under_review',NOW())
     ON CONFLICT(company_id) DO UPDATE SET status='under_review', updated_at=NOW()`,
    [companyId]
  );
  if (current !== "under_review") {
    await audit(db, companyId, "analisi automatica", current, "under_review",
      status === "failed" ? "Analisi non riuscita: serve un controllo manuale." : "Identità non confermata con certezza: serve un controllo manuale.");
  }
  // Avviso al gestore (una sola email per ogni analisi).
  const to = adminEmails(env)[0];
  if (to) {
    const info = (
      await db.pool.query(
        `SELECT c.config->>'name' AS name, p.data AS profile, k.completed_at
           FROM companies c
           LEFT JOIN plan_profiles p ON p.company_id=c.id
           LEFT JOIN company_knowledge k ON k.company_id=c.id
          WHERE c.id=$1`,
        [companyId]
      )
    ).rows[0] || {};
    const name = info.profile?.legal_name || info.name || "Azienda";
    const link = `${siteUrl(env)}/admin.html#${encodeURIComponent(companyId)}`;
    const reason = status === "failed" ? "l’analisi automatica non è riuscita" : "l’analisi non ha confermato con certezza che l’azienda esiste";
    try {
      await mail(db, {
        companyId,
        eventKey: `review:${companyId}:${info.completed_at ? new Date(info.completed_at).getTime() : Date.now()}`,
        to,
        subject: `Azienda da verificare: ${name} — MoreAI`,
        text: `Nuova azienda da verificare: ${name}\nSito: ${info.profile?.website || "-"}\nMotivo: ${reason}.\n\nApri il pannello: ${link}`,
        html: `<p>Nuova azienda da verificare: <strong>${escapeHtml(name)}</strong></p><p>Sito: ${escapeHtml(info.profile?.website || "-")}<br>Motivo: ${escapeHtml(reason)}.</p><p><a href="${escapeHtml(link)}">Apri il pannello di verifica</a></p>`
      }, { env });
    } catch (error) {
      console.error("Review notification failed:", error?.code || "internal");
    }
  }
  return { status: "under_review" };
}

/** Rimette in coda l'analisi e avvia la background function (come «Salva e analizza»). */
export async function startResearch(db, companyId, origin, { env = process.env, transport = fetch } = {}) {
  await db.pool.query(
    `INSERT INTO company_knowledge(company_id, status, knowledge, sources, started_at, completed_at, updated_at, error)
     VALUES($1,'pending','{}'::jsonb,'[]'::jsonb,NULL,NULL,NOW(),NULL)
     ON CONFLICT(company_id) DO UPDATE SET status='pending', started_at=NULL, completed_at=NULL, updated_at=NOW(), error=NULL`,
    [companyId]
  );
  const headers = internalRequestHeaders(env);
  if (!headers) return false;
  const r = await transport(`${origin}/.netlify/functions/company-research-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ company_id: companyId })
  });
  return r.ok || r.status === 202;
}

async function readBody(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) fail(400, "Richiesta non valida.");
  const raw = await request.text();
  if (raw.length > 30000) fail(413, "Richiesta troppo grande.");
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body;
  } catch {
    fail(400, "Richiesta non valida.");
  }
}

/**
 * Rotte /api/admin/*. options.emailVerified(db, userId) obbligatoria.
 */
export async function adminApi(request, db, auth, { env = process.env, emailVerified, transport = fetch, setView = async () => false } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/admin/")) return null;
  const method = request.method.toUpperCase();

  const user = await auth(db, request);
  if (!user) fail(401, "Accedi al tuo account per continuare.");
  if (!(await isAdmin(db, user.email, env)) || !(await emailVerified(db, user.id))) {
    fail(403, "Area riservata al gestore di MoreAI.");
  }
  const actor = "gestore " + user.email;
  // Email di tutti i gestori (principali + whitelist), per riconoscere i loro account.
  const admins = (await listAdmins(db, env)).map(a => a.email);
  const isAdminAccount = async companyId =>
    (await db.pool.query("SELECT email FROM users WHERE company_id=$1", [companyId])).rows
      .some(u => admins.includes(String(u.email).toLowerCase()));

  // Whitelist dei gestori: la vedono tutti i gestori, la modificano solo i principali.
  if (path === "/api/admin/admins" && method === "GET") {
    return json({ admins: await listAdmins(db, env), can_manage: isAdminEmail(user.email, env) });
  }
  if ((path === "/api/admin/admins-add" || path === "/api/admin/admins-remove") && method === "POST") {
    if (!isAdminEmail(user.email, env)) fail(403, "Solo il gestore principale può modificare l’elenco dei gestori.");
    const body = await readBody(request);
    const email = normalizeEmail(body.email);
    if (!email) fail(400, "Scrivi un indirizzo email valido.");
    if (path === "/api/admin/admins-add") {
      await db.pool.query(
        "INSERT INTO admin_users(email, added_by) VALUES($1,$2) ON CONFLICT(email) DO NOTHING",
        [email, user.email]
      );
      await adminLog(db, actor, "admin_add", "-", "gestori", email);
    } else {
      if (isAdminEmail(email, env)) fail(400, "Il gestore principale non si può togliere da qui.");
      await db.pool.query("DELETE FROM admin_users WHERE email=$1", [email]);
      // Chiude subito eventuali visite in corso di quel gestore.
      await db.pool.query(
        "UPDATE auth_sessions SET view_company_id=NULL, view_until=NULL WHERE user_id IN (SELECT id FROM users WHERE LOWER(email)=$1)",
        [email]
      );
      await adminLog(db, actor, "admin_remove", "-", "gestori", email);
    }
    return json({ admins: await listAdmins(db, env), can_manage: true });
  }

  if (path === "/api/admin/companies" && method === "GET") {
    const rows = (
      await db.pool.query(
        `SELECT c.id, c.public_id, c.created_at, c.config->>'name' AS name,
                p.data->>'legal_name' AS legal_name, p.data->>'website' AS website,
                COALESCE(v.status,'pending') AS verification, k.status AS research,
                (SELECT email FROM users u WHERE u.company_id=c.id ORDER BY u.id LIMIT 1) AS owner_email,
                ps.status AS subscription_status,
                (p.company_id IS NOT NULL) AS has_profile,
                EXISTS(SELECT 1 FROM users u JOIN email_verification e ON e.user_id=u.id
                        WHERE u.company_id=c.id AND e.verified_at IS NOT NULL) AS email_verified
           FROM companies c
           LEFT JOIN plan_profiles p ON p.company_id=c.id
           LEFT JOIN company_verification v ON v.company_id=c.id
           LEFT JOIN company_knowledge k ON k.company_id=c.id
           LEFT JOIN plan_subscriptions ps ON ps.company_id=c.id
          WHERE c.id <> 'demo'
          ORDER BY CASE COALESCE(v.status,'pending') WHEN 'under_review' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, c.created_at DESC
          LIMIT 500`
      )
    ).rows;
    for (const r of rows) {
      r.plan = await effectivePlan(db, r.id);
      r.is_owner = admins.includes(String(r.owner_email || "").toLowerCase());
    }
    return json({ companies: rows });
  }

  const companyId = method === "GET" ? url.searchParams.get("id") : null;

  if (path === "/api/admin/company" && method === "GET") {
    const c = (await db.pool.query("SELECT id, public_id, config, created_at FROM companies WHERE id=$1 AND id<>'demo'", [companyId])).rows[0];
    if (!c) fail(404, "Azienda non trovata.");
    const [profile, verification, history, knowledge, widget, subscription] = await Promise.all([
      db.pool.query("SELECT data, status FROM plan_profiles WHERE company_id=$1", [c.id]),
      db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [c.id]),
      db.pool.query("SELECT actor, previous, status, reason, created_at FROM company_verification_audit WHERE company_id=$1 ORDER BY created_at DESC LIMIT 30", [c.id]),
      db.pool.query("SELECT status, knowledge, sources, error, completed_at FROM company_knowledge WHERE company_id=$1", [c.id]),
      db.pool.query("SELECT enabled, allowed_origins FROM widget_settings WHERE company_id=$1", [c.id]),
      db.pool.query("SELECT plan, period, status, period_end FROM plan_subscriptions WHERE company_id=$1", [c.id])
    ]);
    const k = knowledge.rows[0] || null;
    return json({
      id: c.id,
      public_id: c.public_id,
      name: c.config?.name || "",
      ai_knowledge: c.config?.knowledge || "",
      profile: profile.rows[0]?.data || null,
      verification: verification.rows[0]?.status || "pending",
      history: history.rows,
      research: k ? { status: k.status, error: k.error, completed_at: k.completed_at, sources: k.sources || [], entries: knowledgeEntries(k).map(e => e.content) } : null,
      widget: { enabled: widget.rows[0]?.enabled ?? true, origins: widget.rows[0]?.allowed_origins || [] },
      subscription: subscription.rows[0] || null,
      plan: await effectivePlan(db, c.id),
      owner_email: (await db.pool.query("SELECT email FROM users WHERE company_id=$1 ORDER BY id LIMIT 1", [c.id])).rows[0]?.email || "",
      is_owner: await isAdminAccount(c.id),
      email_verified: (await db.pool.query(
        `SELECT 1 FROM users u JOIN email_verification e ON e.user_id=u.id
          WHERE u.company_id=$1 AND e.verified_at IS NOT NULL LIMIT 1`, [c.id])).rowCount > 0,
      demo: (await db.pool.query("SELECT started, ends FROM plan_demo_usage WHERE company_id=$1 ORDER BY started DESC LIMIT 1", [c.id])).rows[0] || null,
      admin_log: (await db.pool.query("SELECT actor, action, detail, created_at FROM admin_log WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20", [c.id])).rows
    });
  }

  if (method !== "POST") fail(405, "Metodo non disponibile.");

  if (path === "/api/admin/view-end") {
    await setView(null);
    return json({ ok: true });
  }

  const body = await readBody(request);
  const id = typeof body.id === "string" ? body.id : "";
  const exists = (await db.pool.query("SELECT config FROM companies WHERE id=$1 AND id<>'demo'", [id])).rows[0];
  if (!exists) fail(404, "Azienda non trovata.");

  if (path === "/api/admin/verify") {
    if (!["verified", "rejected", "suspended"].includes(body.status)) fail(400, "Scegli approva o rifiuta.");
    if (body.status !== "verified" && (await isAdminAccount(id))) {
      fail(400, "Non puoi bloccare l’account del gestore.");
    }
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : body.status === "verified" ? "Approvata dal gestore." : "Rifiutata dal gestore.";
    const previous = (await db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [id])).rows[0]?.status || "pending";
    await db.pool.query(
      `INSERT INTO company_verification(company_id, status, updated_at) VALUES($1,$2,NOW())
       ON CONFLICT(company_id) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()`,
      [id, body.status]
    );
    await audit(db, id, actor, previous, body.status, reason);
    await adminLog(db, actor, "status:" + body.status, id, exists.config?.name || id, reason);
    return json({ ok: true, status: body.status });
  }

  const companyName = exists.config?.name || id;
  const isOwner = await isAdminAccount(id);

  // Entrare nella dashboard dell'azienda (configurazione, statistiche, widget).
  // Richieste e conversazioni dei clienti restano bloccate dal server.
  if (path === "/api/admin/view") {
    if (!(await setView(id))) fail(401, "Sessione non valida: accedi di nuovo.");
    await adminLog(db, actor, "view", id, companyName, "Accesso alla dashboard (senza dati dei clienti).");
    return json({ ok: true, redirect: "/dashboard.html" });
  }

  // Conferma dell'email fatta dal gestore (quando l'azienda non riceve o non
  // apre il link): l'account diventa verificato e parte la Demo di 7 giorni,
  // se l'azienda non l'ha già usata.
  if (path === "/api/admin/confirm-email") {
    const users = (await db.pool.query("SELECT id, email FROM users WHERE company_id=$1 ORDER BY id", [id])).rows;
    if (!users.length) fail(404, "L’azienda non ha account.");
    const now = Date.now() / 1000;
    let demo = null;
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      for (const u of users) {
        await client.query(
          `INSERT INTO email_verification(user_id, verified_at) VALUES($1, NOW())
           ON CONFLICT(user_id) DO UPDATE SET verified_at=COALESCE(email_verification.verified_at, NOW())`,
          [u.id]
        );
        await client.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [u.id]);
      }
      const used = await client.query(
        "SELECT 1 FROM plan_demo_usage WHERE company_id=$1 OR email = ANY(SELECT email FROM users WHERE company_id=$1) LIMIT 1",
        [id]
      );
      if (!used.rowCount) {
        demo = { started: now, ends: now + 7 * 86400 };
        await client.query(
          "INSERT INTO plan_demo_usage(email, company_id, started, ends) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [users[0].email, id, demo.started, demo.ends]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await adminLog(db, actor, "confirm_email", id, companyName, demo ? "Email confermata dal gestore, Demo di 7 giorni avviata." : "Email confermata dal gestore (Demo già usata).");
    return json({ ok: true, demo_started: Boolean(demo), demo_ends: demo?.ends || null });
  }

  // Eliminazione definitiva dell'account aziendale e di tutti i suoi dati.
  if (path === "/api/admin/delete") {
    if (isOwner) fail(400, "Non puoi eliminare l’account del gestore.");
    if (typeof body.confirm_name !== "string" || body.confirm_name.trim() !== companyName.trim()) {
      fail(400, "Per confermare scrivi esattamente il nome dell’azienda.");
    }
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM trial_requests WHERE company_id=$1", [id]);
      await client.query("DELETE FROM companies WHERE id=$1", [id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await adminLog(db, actor, "delete", id, companyName, typeof body.reason === "string" ? body.reason.trim() : "");
    return json({ ok: true });
  }

  if (path === "/api/admin/company-ai") {
    if (typeof body.knowledge !== "string" || body.knowledge.length > 10000) fail(400, "Le informazioni per l’AI possono avere al massimo 10.000 caratteri.");
    if (!Array.isArray(body.origins) || body.origins.length > 10) fail(400, "Controlla i siti del widget.");
    const origins = [];
    for (const item of body.origins) {
      if (typeof item !== "string" || !item.trim()) continue;
      const origin = normalizeOrigin(item);
      if (!origin) fail(400, "Indirizzo non valido: " + String(item).slice(0, 80));
      if (!origins.includes(origin)) origins.push(origin);
    }
    if (origins.length > 5) fail(400, "Al massimo 5 siti.");
    const config = { ...exists.config, knowledge: body.knowledge.trim() };
    await db.pool.query("UPDATE companies SET config=$1::jsonb WHERE id=$2", [JSON.stringify(config), id]);
    await db.pool.query("UPDATE company_management SET config_version=config_version+1 WHERE company_id=$1", [id]);
    await db.pool.query(
      `INSERT INTO widget_settings(company_id, enabled, allowed_origins, updated_at) VALUES($1, TRUE, $2::jsonb, NOW())
       ON CONFLICT(company_id) DO UPDATE SET allowed_origins=EXCLUDED.allowed_origins, updated_at=NOW()`,
      [id, JSON.stringify(origins)]
    );
    const previous = (await db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [id])).rows[0]?.status || "pending";
    await audit(db, id, actor, previous, previous, "Informazioni per l’AI e siti del widget aggiornati dal gestore.");
    return json({ ok: true, origins });
  }

  if (path === "/api/admin/research") {
    const profile = (await db.pool.query("SELECT 1 FROM plan_profiles WHERE company_id=$1", [id])).rowCount;
    if (!profile) fail(409, "L’azienda non ha ancora inserito i suoi dati.");
    const started = await startResearch(db, id, url.origin, { env, transport });
    if (!started) fail(503, "Non riesco ad avviare l’analisi. Riprova tra poco.");
    const previous = (await db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [id])).rows[0]?.status || "pending";
    await audit(db, id, actor, previous, previous, "Analisi rilanciata dal gestore.");
    return json({ ok: true });
  }

  fail(404, "Operazione non disponibile.");
}
