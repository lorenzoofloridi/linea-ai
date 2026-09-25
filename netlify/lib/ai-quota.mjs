// Quote mensili dei messaggi AI per azienda.
// I limiti esistono solo qui (backend): nessun valore inviato dal browser
// viene letto per decidere piano, limite o periodo.

/** Messaggi AI inclusi per mese di calendario (Europe/Rome). */
export const PLAN_MONTHLY_MESSAGES = Object.freeze({
  demo: 100,
  base: 3000,
  plus: 10000,
  advanced: 50000 // limite tecnico di uso corretto
});

/** Tenant di servizio della chat pubblica MoreAI (companies.id='demo'). */
export const SERVICE_COMPANY_ID = 'demo';
const SERVICE_DEFAULT_LIMIT = 1000;

const periodFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit'
});

/** Periodo mensile 'YYYY-MM' nel fuso Europe/Rome. */
export function currentPeriod(date = new Date()) {
  const parts = Object.fromEntries(periodFormat.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

/**
 * Piano effettivo dell'azienda, calcolato solo dal database.
 * Abbonamento attivo (trial/active nel periodo, oppure past_due in tolleranza)
 * ha la precedenza; altrimenti Demo attiva; altrimenti nessun piano.
 */
export async function effectivePlan(db, companyId, now = Date.now() / 1000) {
  const [subscription, demo] = await Promise.all([
    db.pool.query(
      `SELECT plan,status,period_end,grace_until
         FROM plan_subscriptions
        WHERE company_id=$1`,
      [companyId]
    ),
    db.pool.query(
      `SELECT 1 FROM plan_demo_usage WHERE company_id=$1 AND ends>$2 LIMIT 1`,
      [companyId, now]
    )
  ]);
  const s = subscription.rows[0];
  const active = Boolean(
    s &&
    ['base', 'plus', 'advanced'].includes(s.plan) &&
    (
      (['trial', 'active'].includes(s.status) && Number(s.period_end) > now) ||
      (s.status === 'past_due' && Number(s.grace_until || 0) > now)
    )
  );
  if (active) return s.plan;
  if (demo.rowCount) return 'demo';
  return null;
}

function serviceLimit(env) {
  const value = Number.parseInt(env.LINEA_PUBLIC_DEMO_MONTHLY_LIMIT ?? '', 10);
  return Number.isInteger(value) && value >= 0 ? value : SERVICE_DEFAULT_LIMIT;
}

/** Limite mensile applicabile all'azienda, o null se non ha un piano attivo. */
export async function monthlyLimit(db, companyId, { env = process.env, now } = {}) {
  if (companyId === SERVICE_COMPANY_ID) return { plan: 'service', limit: serviceLimit(env) };
  const plan = await effectivePlan(db, companyId, now);
  return { plan, limit: plan ? PLAN_MONTHLY_MESSAGES[plan] : null };
}

export class QuotaError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Riserva atomicamente un messaggio PRIMA della chiamata al modello.
 * Un solo UPDATE condizionato: richieste concorrenti non superano il limite.
 * @returns {{period:string,used:number,limit:number,plan:string}}
 */
export async function reserveMessage(db, companyId, { env = process.env, date = new Date() } = {}) {
  const { plan, limit } = await monthlyLimit(db, companyId, { env, now: date.getTime() / 1000 });
  if (!plan) throw new QuotaError('NO_ACTIVE_PLAN');
  const period = currentPeriod(date);
  if (!(limit > 0)) throw new QuotaError('QUOTA_EXCEEDED', { period, used: 0, limit: 0, plan });

  const result = await db.pool.query(
    `INSERT INTO ai_usage(company_id,period,used,updated_at)
     VALUES($1,$2,1,NOW())
     ON CONFLICT(company_id,period)
     DO UPDATE SET used=ai_usage.used+1, updated_at=NOW()
     WHERE ai_usage.used < $3
     RETURNING used`,
    [companyId, period, limit]
  );
  if (!result.rowCount) {
    throw new QuotaError('QUOTA_EXCEEDED', { period, used: limit, limit, plan });
  }
  return { period, used: result.rows[0].used, limit, plan };
}

/** Annulla una riserva quando il modello non ha prodotto una risposta. */
export async function releaseMessage(db, companyId, period) {
  await db.pool.query(
    `UPDATE ai_usage
        SET used=used-1, updated_at=NOW()
      WHERE company_id=$1 AND period=$2 AND used>0`,
    [companyId, period]
  );
}

/** Registra i token consumati (solo statistica/costi, non influisce sulla quota). */
export async function recordTokens(db, companyId, period, usage) {
  const input = Math.max(0, Math.trunc(Number(usage?.inputTokens) || 0));
  const output = Math.max(0, Math.trunc(Number(usage?.outputTokens) || 0));
  if (!input && !output) return;
  await db.pool.query(
    `UPDATE ai_usage
        SET input_tokens=input_tokens+$3, output_tokens=output_tokens+$4, updated_at=NOW()
      WHERE company_id=$1 AND period=$2`,
    [companyId, period, input, output]
  );
}

/** Stato della quota per la dashboard (sola lettura). */
export async function usageSummary(db, companyId, { env = process.env, date = new Date() } = {}) {
  const period = currentPeriod(date);
  const { plan, limit } = await monthlyLimit(db, companyId, { env, now: date.getTime() / 1000 });
  const row = (
    await db.pool.query(
      'SELECT used FROM ai_usage WHERE company_id=$1 AND period=$2',
      [companyId, period]
    )
  ).rows[0];
  const used = row ? Number(row.used) : 0;
  return { period, plan, limit, used, remaining: limit == null ? 0 : Math.max(0, limit - used) };
}
