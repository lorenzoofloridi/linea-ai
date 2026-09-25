// Attivazione dei piani (pagamenti SIMULATI: nessun addebito reale).
// Il flusso è quello definitivo: quando collegheremo Stripe cambierà solo
// il punto in cui si registra il pagamento (provider='mock' → 'stripe').
//
// Regole:
// - serve un'azienda verificata (analisi automatica o approvazione manuale);
// - la prova di 14 giorni si può usare una sola volta per azienda;
// - con la prova si registra subito il metodo e l'addebito avviene al 15° giorno;
// - i rinnovi simulati vengono applicati quando si legge lo stato del piano.
import { randomBytes } from "node:crypto";

const DAY = 86400;
const PERIOD_SECONDS = { monthly: 30 * DAY, annual: 365 * DAY };
const ref = prefix => prefix + "_" + randomBytes(9).toString("base64url");
const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function event(db, companyId, actor, action, outcome, amount, created) {
  await db.pool.query(
    `INSERT INTO plan_events(id, company_id, actor, action, outcome, amount_cents, created)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [ref("evt"), companyId, actor, action, outcome, amount, created]
  );
}

/**
 * Applica i rinnovi simulati scaduti (fine prova o fine periodo).
 * Con disdetta programmata il piano passa a "expired".
 */
export async function settleSubscription(db, companyId, now = Date.now() / 1000) {
  const s = (
    await db.pool.query(
      `SELECT plan, period, status, period_end, cancel_at_end, amount_cents, provider
         FROM plan_subscriptions WHERE company_id=$1`,
      [companyId]
    )
  ).rows[0];
  if (!s || s.provider !== "mock" || !["trial", "active"].includes(s.status)) return;
  let end = Number(s.period_end);
  if (end > now) return;
  if (s.cancel_at_end) {
    await db.pool.query(
      "UPDATE plan_subscriptions SET status='expired' WHERE company_id=$1 AND status IN ('trial','active')",
      [companyId]
    );
    await event(db, companyId, "system", "expired", "ok", 0, now);
    return;
  }
  const length = PERIOD_SECONDS[s.period] || PERIOD_SECONDS.monthly;
  let charges = 0;
  while (end <= now && charges < 36) {
    await event(db, companyId, "system", s.status === "trial" && charges === 0 ? "trial_converted" : "renewal", "simulated", s.amount_cents, end);
    end += length;
    charges++;
  }
  await db.pool.query(
    "UPDATE plan_subscriptions SET status='active', period_end=$1 WHERE company_id=$2 AND provider='mock'",
    [end, companyId]
  );
}

/**
 * Stato di verifica dell'azienda. Se l'analisi automatica è verificata e
 * nessuno ha ancora deciso a mano, l'azienda risulta verificata.
 */
export async function syncVerification(db, companyId) {
  const [v, k] = await Promise.all([
    db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [companyId]),
    db.pool.query("SELECT status FROM company_knowledge WHERE company_id=$1", [companyId])
  ]);
  const current = v.rows[0]?.status || "pending";
  if (current === "pending" && k.rows[0]?.status === "verified") {
    await db.pool.query(
      `INSERT INTO company_verification(company_id, status, updated_at) VALUES($1,'verified',NOW())
       ON CONFLICT(company_id) DO UPDATE SET status='verified', updated_at=NOW() WHERE company_verification.status='pending'`,
      [companyId]
    );
    await db.pool.query(
      `INSERT INTO company_verification_audit(company_id, actor, previous, status, reason, created_at)
       VALUES($1,'analisi automatica',$2,'verified','Azienda trovata e verificata dall’analisi web.',NOW())`,
      [companyId, current]
    );
    return "verified";
  }
  return current;
}

/** true se l'azienda può attivare un piano (verificata). */
export async function companyApproved(db, companyId) {
  const r = await db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [companyId]);
  return r.rows[0]?.status === "verified";
}

async function trialUsed(db, companyId) {
  const r = await db.pool.query(
    "SELECT 1 FROM plan_events WHERE company_id=$1 AND action='trial_started' LIMIT 1",
    [companyId]
  );
  return r.rowCount > 0;
}

async function readBody(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) fail(400, "Richiesta non valida.");
  const raw = await request.text();
  if (raw.length > 4000) fail(413, "Richiesta troppo grande.");
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body;
  } catch {
    fail(400, "Richiesta non valida.");
  }
}

/**
 * Rotte: POST /api/plan-checkout, POST /api/plan-cancel, GET /api/plan-offer.
 * options: { plans, amount(code, period), methods, emailVerified(db, userId), trialDays }
 */
export async function billingApi(request, db, auth, options) {
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  if (!["/api/plan-checkout", "/api/plan-cancel", "/api/plan-offer"].includes(path)) return null;

  const user = await auth(db, request);
  if (!user) fail(401, "Accedi al tuo account per continuare.");
  const verification = await syncVerification(db, user.company_id);
  if (["suspended", "rejected"].includes(verification)) fail(403, "Accesso aziendale non disponibile.");
  const now = Date.now() / 1000;
  await settleSubscription(db, user.company_id, now);

  if (path === "/api/plan-offer" && method === "GET") {
    return json({
      approved: verification === "verified",
      verification: verification || "pending",
      trial_available: !(await trialUsed(db, user.company_id)),
      trial_days: options.trialDays
    });
  }

  if (path === "/api/plan-cancel" && method === "POST") {
    const r = await db.pool.query(
      `UPDATE plan_subscriptions SET cancel_at_end=TRUE, cancelled_at=$1
        WHERE company_id=$2 AND status IN ('trial','active') AND cancel_at_end=FALSE
        RETURNING period_end`,
      [now, user.company_id]
    );
    if (!r.rowCount) fail(409, "Non c’è un piano attivo da disdire.");
    await event(db, user.company_id, user.email || user.id, "cancel_scheduled", "ok", 0, now);
    return json({ ok: true, ends: Number(r.rows[0].period_end) });
  }

  if (path === "/api/plan-checkout" && method === "POST") {
    const body = await readBody(request);
    if (!(await options.emailVerified(db, user.id))) fail(403, "Verifica prima il tuo indirizzo email.");
    if (verification !== "verified") fail(409, "La verifica della tua azienda è ancora in corso. Ti avvisiamo appena è completata.");
    const plan = body.plan;
    const period = body.period;
    if (!["base", "plus", "advanced"].includes(plan) || !["monthly", "annual"].includes(period)) fail(400, "Scegli un piano e un periodo.");
    const methodInfo = options.methods[body.method];
    if (!methodInfo) fail(400, "Scegli un metodo di pagamento.");
    if (!methodInfo[1]) fail(400, "Questo metodo non permette il rinnovo automatico: scegline un altro.");
    if (body.confirm !== true) fail(400, "Conferma le condizioni per continuare.");
    const trial = body.trial === true;
    if (trial && (await trialUsed(db, user.company_id))) fail(409, "Hai già usato la prova gratuita di 14 giorni.");

    const current = (await db.pool.query("SELECT status, period_end FROM plan_subscriptions WHERE company_id=$1", [user.company_id])).rows[0];
    if (current && ["trial", "active", "past_due"].includes(current.status) && Number(current.period_end) > now) {
      fail(409, "Hai già un piano attivo. Per cambiarlo scrivici dalla pagina Supporto.");
    }

    const amount = options.amount(plan, period);
    const periodEnd = trial ? now + options.trialDays * DAY : now + PERIOD_SECONDS[period];
    await db.pool.query(
      `INSERT INTO plan_subscriptions
         (company_id, plan, period, status, trial_start, trial_end, period_end, cancel_at_end, cancelled_at,
          method_kind, customer_ref, method_ref, amount_cents, provider, grace_until, pending_plan, pending_period)
       VALUES($1,$2,$3,$4,$5,$6,$7,FALSE,NULL,$8,$9,$10,$11,'mock',NULL,NULL,NULL)
       ON CONFLICT(company_id) DO UPDATE SET
         plan=EXCLUDED.plan, period=EXCLUDED.period, status=EXCLUDED.status,
         trial_start=EXCLUDED.trial_start, trial_end=EXCLUDED.trial_end, period_end=EXCLUDED.period_end,
         cancel_at_end=FALSE, cancelled_at=NULL, method_kind=EXCLUDED.method_kind,
         customer_ref=EXCLUDED.customer_ref, method_ref=EXCLUDED.method_ref,
         amount_cents=EXCLUDED.amount_cents, provider='mock', grace_until=NULL,
         pending_plan=NULL, pending_period=NULL`,
      [user.company_id, plan, period, trial ? "trial" : "active", now, trial ? periodEnd : now, periodEnd,
       body.method, ref("cus"), ref("pm"), amount]
    );
    await event(db, user.company_id, user.email || user.id, trial ? "trial_started" : "payment", "simulated", trial ? 0 : amount, now);
    return json({
      ok: true,
      status: trial ? "trial" : "active",
      plan,
      period,
      amount_cents: amount,
      charged_now_cents: trial ? 0 : amount,
      next_charge_at: periodEnd,
      simulated: true
    });
  }

  fail(405, "Metodo non disponibile.");
}
