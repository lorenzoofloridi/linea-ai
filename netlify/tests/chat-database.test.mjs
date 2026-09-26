import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { chatApi } from '../lib/chat-api.mjs';
import { widgetApi } from '../lib/widget.mjs';
import { currentPeriod, effectivePlan } from '../lib/ai-quota.mjs';
import { billingApi, settleSubscription } from '../lib/billing.mjs';
import { adminApi, researchOutcome } from '../lib/company-review.mjs';
import { isOwnerCompany } from '../lib/owner.mjs';

const local = JSON.parse(
  await readFile('var/audit/local-database.json', 'utf8')
);

const address = new URL(local.connection_string);

if (!['localhost', '127.0.0.1', '::1'].includes(address.hostname)) {
  throw Error('Tests require local database');
}

const schema = 'test_chat_' + Date.now();

const admin = new pg.Pool({
  connectionString: local.connection_string
});

await admin.query(`CREATE SCHEMA ${schema}`);

address.searchParams.set(
  'options',
  `-c search_path=${schema}`
);

const pool = new pg.Pool({
  connectionString: address.toString(),
  max: 1
});

try {
  await pool.query(`SET search_path TO ${schema}`);

  assert.equal(
    (await pool.query('SELECT current_schema() AS name')).rows[0].name,
    schema
  );

  for (
    const file of (await readdir('database/migrations'))
      .filter(f => f.endsWith('.sql'))
      .sort()
  ) {
    await pool.query(
      await readFile(
        'database/migrations/' + file,
        'utf8'
      )
    );
  }

  const cfg = {
    name: 'Test',
    sector: 'Auto',
    recipient: 'commerciale',
    region: 'IT',
    knowledge: 'Vendiamo auto usate. Prezzi non disponibili.',
    fields: [
      {
        key: 'nome',
        label: 'Nome',
        kind: 'text',
        required: true
      },
      {
        key: 'telefono',
        label: 'Telefono',
        kind: 'phone',
        required: true
      },
      {
        key: 'interesse',
        label: 'Interesse',
        kind: 'text',
        required: true
      }
    ]
  };

  /*
   * Aziende di test.
   */
  for (const id of ['a', 'b']) {
    await pool.query(
      'INSERT INTO companies VALUES($1,$2,$3,NOW())',
      [id, 'public-' + id, cfg]
    );

    await pool.query(
      'INSERT INTO users VALUES($1,$2,$3,$4)',
      [
        'user-' + id,
        id,
        id + '@example.invalid',
        'unused'
      ]
    );

    await pool.query(
      'INSERT INTO company_management(company_id) VALUES($1)',
      [id]
    );
  }

  /*
   * Entrambe le aziende hanno una Demo attiva.
   * Questo permette di verificare le funzioni operative
   * dello Spazio Aziendale durante i 7 giorni di Demo.
   */
  const demoNow = Date.now() / 1000;

  for (const id of ['a', 'b']) {
    await pool.query(
      `INSERT INTO plan_demo_usage
       (email, company_id, started, ends)
       VALUES($1,$2,$3,$4)`,
      [
        id + '@example.invalid',
        id,
        demoNow,
        demoNow + 7 * 24 * 60 * 60
      ]
    );
  }

  const auth = async (_db, req) =>
    req.headers.get('x-test-user')
      ? {
          id: 'user-' + req.headers.get('x-test-user'),
          company_id: req.headers.get('x-test-user')
        }
      : null;

  let calls = 0;
  let failModel = false;

  const model = async (_cfg, state, _history, msg) => {
    calls++;

    if (failModel) {
      throw Object.assign(new Error('AI_UPSTREAM'), { code: 'AI_UPSTREAM' });
    }

    return {
      reply: 'Come posso aiutarti?',
      language: 'it',
      action: 'consent',
      consent: msg === 'sì' ? 'positive' : 'none',
      consent_quote: msg === 'sì' ? msg : '',
      extracted:
        msg === 'dati'
          ? [
              {
                key: 'nome',
                quote: 'dati',
                value: 'Mario'
              },
              {
                key: 'telefono',
                quote: 'dati',
                value: '3331234567'
              }
            ]
          : msg.includes('Mario')
            ? [
                {
                  key: 'nome',
                  quote: 'Mario',
                  value: 'Mario'
                },
                {
                  key: 'telefono',
                  quote: '3331234567',
                  value: '3331234567'
                },
                {
                  key: 'interesse',
                  quote: 'auto',
                  value: 'Auto usata'
                }
              ]
            : []
    };
  };

  const request = (path, body, user = 'a') =>
    new Request(
      'https://linea.invalid/api/' + path,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(user
            ? { 'x-test-user': user }
            : {})
        },
        ...(body
          ? { body: JSON.stringify(body) }
          : {})
      }
    );

  const api = async (path, body, user = 'a') => {
    const res = await chatApi(
      request(path, body, user),
      { pool },
      auth,
      {
        model,
        modelReady: () => true,
        context: {
          ip: '127.0.0.1'
        }
      }
    );

    return res.json();
  };

  await test(
    'preview identity comes from session, not browser company id',
    async () => {
      await assert.rejects(
        api('session', { company: 'public-b' }),
        e => e.httpStatus === 404
      );

      await assert.rejects(
        api('session', { company: 'public-a' }, null),
        e => e.httpStatus === 404
      );
    }
  );

  let session;

  await test(
    'progressive state, consent, persisted lead and idempotence',
    async () => {
      session = (
        await api(
          'session',
          { company: 'public-a' }
        )
      ).session;

      const first = await api(
        'chat',
        {
          session,
          message:
            'Sono Mario, telefono 3331234567, cerco auto',
          request_id: 'one'
        }
      );

      assert.equal(first.saved, false);
      assert.equal(first.consent_pending, true);

      const second = await api(
        'chat',
        {
          session,
          message: 'sì',
          request_id: 'two'
        }
      );

      assert.equal(second.saved, true);

      const count = calls;

      assert.deepEqual(
        await api(
          'chat',
          {
            session,
            message: 'sì',
            request_id: 'two'
          }
        ),
        second
      );

      assert.equal(calls, count);

      const leads = await api('leads');

      assert.equal(leads.leads.length, 1);
      assert.equal(leads.leads[0].kind, 'test');
      assert.equal(
        leads.leads[0].data.nome,
        'Mario'
      );

      const detail = await api(
        'leads/' + leads.leads[0].id
      );

      assert.equal(detail.messages.length, 4);
    }
  );

  await test(
    'a correction after saving updates the same lead, in the same company',
    async () => {
      const correction = async () => ({
        reply: 'Grazie, buona giornata.',
        language: 'it',
        action: 'close',
        consent: 'none',
        consent_quote: '',
        extracted: [{ key: 'nome', quote: 'Mario Bianchi', value: 'Mario Bianchi' }]
      });
      const res = await (await chatApi(
        request('chat', { session, message: 'hai sbagliato, mi chiamo Mario Bianchi', request_id: 'fix-1' }),
        { pool }, auth, { model: correction, modelReady: () => true, context: { ip: '127.0.0.1' } }
      )).json();
      assert.equal(res.closed, false);
      assert.match(res.reply, /aggiornato/);
      const leads = (await api('leads')).leads;
      assert.equal(leads.length, 1);
      assert.equal(leads[0].data.nome, 'Mario Bianchi');
      assert.deepEqual((await api('leads', null, 'b')).leads, []);
    }
  );

  await test(
    'widget opens real conversations only for the ticket company and only on allowed sites',
    async () => {
      const env = { LINEA_INTERNAL_SECRET: 'w'.repeat(40) };
      const call = async (path, body, user = null, query = '') =>
        widgetApi(new Request('https://www.moreai.invalid/api/' + path + query, {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        }), { pool }, auth, { env, context: { ip: '127.0.0.9' } });

      // L'azienda vede i siti ma non li modifica: li configura il gestore (in visita).
      await assert.rejects(call('widget-settings', { origins: ['www.shop-a.it'] }, 'a'), e => e.httpStatus === 403);
      const viewerAuth = async (_db, req) => req.headers.get('x-test-user') ? { id: 'admin', company_id: req.headers.get('x-test-user'), email: 'admin@example.invalid', viewer: true } : null;
      const asViewer = async (path, body, user) => widgetApi(new Request('https://www.moreai.invalid/api/' + path, {
        method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, ...(body ? { body: JSON.stringify(body) } : {})
      }), { pool }, viewerAuth, { env });
      const saved = await (await asViewer('widget-settings', { origins: ['www.shop-a.it'] }, 'a')).json();
      assert.deepEqual(saved.origins, ['https://www.shop-a.it']);
      assert.match(saved.snippet, /data-company="public-a"/);
      assert.equal(saved.can_edit, true);
      await assert.rejects(asViewer('widget-settings', { origins: ['http://10.1.1.1'] }, 'a'), e => e.httpStatus === 400);
      await assert.rejects(call('widget-settings', null, null), e => e.httpStatus === 401);
      const seen = await (await call('widget-settings', null, 'a')).json();
      assert.equal(seen.can_edit, false);

      // Con la sola Demo il widget non è incluso.
      assert.equal(seen.active_plan, false);
      const demoFrame = await (await call('widget-frame', null, null, '?c=public-a')).text();
      assert.doesNotMatch(demoFrame, /data-ticket="[^"]+"/);
      await pool.query(
        `INSERT INTO plan_subscriptions(company_id,plan,period,status,trial_start,trial_end,period_end,method_kind,customer_ref,method_ref,amount_cents)
         VALUES('a','base','monthly','trial',$1,$2,$2,'card','c','m',29900)`,
        [Date.now() / 1000, Date.now() / 1000 + 14 * 86400]
      );
      assert.equal((await (await call('widget-settings', null, 'a')).json()).active_plan, true);

      const frame = await call('widget-frame', null, null, '?c=public-a');
      assert.match(frame.headers.get('content-security-policy'), /frame-ancestors https:\/\/www\.shop-a\.it/);
      const ticket = (await frame.text()).match(/data-ticket="([^"]+)"/)[1];

      // Il biglietto di A non apre la chat di B.
      await assert.rejects(call('widget-session', { company: 'public-b', ticket }), e => e.httpStatus === 403);
      const opened = await (await call('widget-session', { company: 'public-a', ticket })).json();
      assert.ok(opened.session);
      const row = (await pool.query("SELECT company_id, kind, owner_user_id FROM conversations WHERE access_hash=encode(sha256($1::bytea),'hex')", [opened.session])).rows[0];
      assert.deepEqual(row, { company_id: 'a', kind: 'real', owner_user_id: null });

      // Fine della prova senza rinnovo: il widget si ferma.
      await pool.query("UPDATE plan_subscriptions SET status='expired' WHERE company_id='a'");
      await assert.rejects(call('widget-session', { company: 'public-a', ticket }), e => e.httpStatus === 402);
      await pool.query("DELETE FROM plan_subscriptions WHERE company_id='a'");
    }
  );

  await test(
    'B cannot read/update A lead, history or chat bearer token',
    async () => {
      assert.deepEqual(
        (await api('leads', null, 'b')).leads,
        []
      );

      const lead = (await api('leads')).leads[0];

      for (const [path, body] of [
        ['leads/' + lead.id, null],
        [
          'leads/' + lead.id,
          { status: 'Completata' }
        ],
        [
          'conversations/' + lead.conversation_id,
          null
        ],
        [
          'chat',
          {
            session,
            message: 'ciao'
          }
        ]
      ]) {
        await assert.rejects(
          api(path, body, 'b'),
          e => e.httpStatus === 404
        );
      }
    }
  );

  await test(
    'config snapshot survives company changes',
    async () => {
      const old = (
        await pool.query(
          "SELECT config FROM conversations WHERE company_id='a'"
        )
      ).rows[0].config;

      await api(
        'config',
        {
          ...cfg,
          name: 'New company knowledge',
          knowledge: ''
        }
      );

      assert.deepEqual(
        (
          await pool.query(
            "SELECT config FROM conversations WHERE company_id='a'"
          )
        ).rows[0].config,
        old
      );
    }
  );

  await test(
    'trial requires consent, is idempotent, and reports email unavailable',
    async () => {
      const data = {
        request_id: 'trial-test',
        name: 'Demo',
        company: 'Example',
        email: 'demo@example.invalid',
        message: 'Prova',
        consent: true
      };

      await assert.rejects(
        api(
          'trial',
          {
            ...data,
            consent: false
          },
          null
        ),
        e => e.httpStatus === 400
      );

      assert.equal(
        (await api('trial', data, null)).email_status,
        'not_configured'
      );

      await api('trial', data, null);

      assert.equal(
        (
          await pool.query(
            'SELECT count(*) FROM trial_requests'
          )
        ).rows[0].count,
        '1'
      );

      await assert.rejects(
        api(
          'trial',
          {
            ...data,
            message: 'Changed'
          },
          null
        ),
        e => e.httpStatus === 409
      );
    }
  );

  await test(
    'public demo accepts anonymous session without leaking config',
    async () => {
      const pub = await api(
        'public',
        { company: 'demo' },
        null
      );

      assert.equal(
        pub.name,
        'Servizi MoreAI'
      );

      assert.equal(
        pub.knowledge,
        undefined
      );

      assert.ok(
        (
          await api(
            'session',
            { company: 'demo' },
            null
          )
        ).session
      );
    }
  );

  /*
   * Quote mensili AI: controllate nel backend prima del modello,
   * per azienda e per periodo, senza influenza dal browser.
   */
  const period = currentPeriod();

  const setUsage = (cid, used) =>
    pool.query(
      `INSERT INTO ai_usage(company_id,period,used)
       VALUES($1,$2,$3)
       ON CONFLICT(company_id,period) DO UPDATE SET used=EXCLUDED.used`,
      [cid, period, used]
    );

  const usageOf = async cid =>
    Number(
      (
        await pool.query(
          'SELECT used FROM ai_usage WHERE company_id=$1 AND period=$2',
          [cid, period]
        )
      ).rows[0]?.used ?? 0
    );

  await test(
    'monthly quota blocks before the model and is isolated per company',
    async () => {
      await setUsage('b', 100); // Demo: 100 messaggi/mese

      const sessionB = (
        await api('session', { company: 'public-b' }, 'b')
      ).session;

      const before = calls;

      await assert.rejects(
        api(
          'chat',
          {
            session: sessionB,
            message: 'ciao',
            request_id: 'quota-1',
            limit: 999999,
            plan: 'advanced'
          },
          'b'
        ),
        e => e.httpStatus === 429
      );

      assert.equal(calls, before, 'il modello non deve essere chiamato');
      assert.equal(await usageOf('b'), 100);

      const usedA = await usageOf('a');

      const sessionA = (
        await api('session', { company: 'public-a' })
      ).session;

      await api('chat', {
        session: sessionA,
        message: 'ciao',
        request_id: 'quota-a'
      });

      assert.equal(await usageOf('a'), usedA + 1);
      assert.equal(await usageOf('b'), 100);
    }
  );

  await test(
    'failed model call is released and not counted',
    async () => {
      await setUsage('b', 5);

      const sessionB = (
        await api('session', { company: 'public-b' }, 'b')
      ).session;

      failModel = true;

      await assert.rejects(
        api(
          'chat',
          { session: sessionB, message: 'ciao', request_id: 'fail-1' },
          'b'
        ),
        e => e.httpStatus === 503
      );

      failModel = false;

      assert.equal(await usageOf('b'), 5);

      await api(
        'chat',
        { session: sessionB, message: 'ciao', request_id: 'fail-2' },
        'b'
      );

      assert.equal(await usageOf('b'), 6);
    }
  );

  await test(
    'active subscription sets the limit; usage endpoint is read-only per tenant',
    async () => {
      const now = Date.now() / 1000;

      await pool.query(
        `INSERT INTO plan_subscriptions(
           company_id,plan,period,status,trial_start,trial_end,period_end,
           method_kind,customer_ref,method_ref,amount_cents
         )
         VALUES('b','base','monthly','active',$1,$1,$2,'card','c','m',29900)`,
        [now, now + 86400 * 30]
      );

      await setUsage('b', 100);

      const sessionB = (
        await api('session', { company: 'public-b' }, 'b')
      ).session;

      await api(
        'chat',
        { session: sessionB, message: 'ciao', request_id: 'base-1' },
        'b'
      );

      const summaryB = await api('ai-usage', null, 'b');

      assert.equal(summaryB.plan, 'base');
      assert.equal(summaryB.limit, 3000);
      assert.equal(summaryB.used, 101);
      assert.equal(summaryB.period, period);

      const summaryA = await api('ai-usage', null, 'a');

      assert.equal(summaryA.plan, 'demo');
      assert.equal(summaryA.limit, 100);
      assert.notEqual(summaryA.used, 101);

      await assert.rejects(
        api('ai-usage', null, null),
        e => e.httpStatus === 401
      );

      await assert.rejects(
        api('ai-usage', { used: 0 }, 'b'),
        e => e.httpStatus === 405
      );
    }
  );

  await test(
    'dashboard data stays inside each company (overview, notes, export, delete)',
    async () => {
      const sessionA = (await api('session', { company: 'public-a' })).session;
      await api('chat', { session: sessionA, message: 'Sono Mario, telefono 3331234567, cerco auto', request_id: 'iso-1' });
      await api('chat', { session: sessionA, message: 'sì', request_id: 'iso-2' });

      const convA = (await api('conversations')).conversations[0].id;

      const overviewA = await api('company-overview');
      const overviewB = await api('company-overview', null, 'b');
      assert.ok(overviewA.statistics.leads >= 1);
      assert.equal(overviewB.statistics.leads, 0);

      await assert.rejects(api('company-review', { conversation: convA, comment: 'nota di B' }, 'b'), e => e.httpStatus === 404);
      await api('company-review', { conversation: convA, comment: 'Cliente interessato, richiamare.' });
      assert.equal((await api('company-overview')).reviews[0].comment, 'Cliente interessato, richiamare.');
      assert.equal((await api('company-overview', null, 'b')).reviews.length, 0);

      const csvA = await (await chatApi(request('data-export.csv', null, 'a'), { pool }, auth, { model, modelReady: () => true, context: { ip: '127.0.0.1' } })).text();
      const csvB = await (await chatApi(request('data-export.csv', null, 'b'), { pool }, auth, { model, modelReady: () => true, context: { ip: '127.0.0.1' } })).text();
      assert.match(csvA, /Mario/);
      assert.doesNotMatch(csvB, /Mario/);

      await assert.rejects(api('data-delete', { conversation: convA, confirm: true }, 'b'), e => e.httpStatus === 404);
      await assert.rejects(api('data-delete', { conversation: convA }), e => e.httpStatus === 400);
      await api('data-delete', { conversation: convA, confirm: true });
      const left = await pool.query('SELECT 1 FROM conversations WHERE company_id=$1 AND id=$2', ['a', convA]);
      assert.equal(left.rowCount, 0);
    }
  );

  /*
   * Attivazione del piano (pagamenti simulati) e verifica dell'azienda.
   */
  const billingOptions = {
    plans: {},
    amount: (plan, period) => ({ base: 4900, plus: 9900, advanced: 19900 }[plan] * (period === 'annual' ? 10 : 1)),
    methods: { card: ['Carta', true], transfer: ['Bonifico', false] },
    emailVerified: async () => true,
    trialDays: 14
  };
  const billing = async (path, body, user) => {
    const res = await billingApi(request(path, body, user), { pool }, auth, billingOptions);
    return res.json();
  };
  for (const id of ['c', 'd']) {
    await pool.query('INSERT INTO companies VALUES($1,$2,$3,NOW())', [id, 'public-' + id, cfg]);
    await pool.query('INSERT INTO users VALUES($1,$2,$3,$4)', ['user-' + id, id, id + '@example.invalid', 'unused']);
    await pool.query('INSERT INTO company_management(company_id) VALUES($1)', [id]);
  }

  await test('checkout requires a verified company, one trial per company, lazy renewal', async () => {
    const offer = await billing('plan-offer', null, 'c');
    assert.equal(offer.approved, false);
    assert.equal(offer.trial_available, true);
    await assert.rejects(
      billing('plan-checkout', { plan: 'base', period: 'monthly', method: 'card', trial: true, confirm: true }, 'c'),
      e => e.httpStatus === 409
    );

    // L'analisi automatica verificata rende l'azienda approvata.
    await pool.query("INSERT INTO company_knowledge(company_id, status) VALUES('c','verified')");
    assert.equal((await billing('plan-offer', null, 'c')).approved, true);

    await assert.rejects(
      billing('plan-checkout', { plan: 'base', period: 'monthly', method: 'transfer', trial: true, confirm: true }, 'c'),
      e => e.httpStatus === 400
    );
    await assert.rejects(
      billing('plan-checkout', { plan: 'base', period: 'monthly', method: 'card', trial: true }, 'c'),
      e => e.httpStatus === 400
    );
    const started = await billing('plan-checkout', { plan: 'plus', period: 'monthly', method: 'card', trial: true, confirm: true }, 'c');
    assert.equal(started.status, 'trial');
    assert.equal(started.charged_now_cents, 0);
    assert.ok(Math.abs(started.next_charge_at - (Date.now() / 1000 + 14 * 86400)) < 60);
    assert.equal(await effectivePlan({ pool }, 'c'), 'plus');
    assert.equal(await effectivePlan({ pool }, 'd'), null);
    await assert.rejects(
      billing('plan-checkout', { plan: 'base', period: 'monthly', method: 'card', trial: false, confirm: true }, 'c'),
      e => e.httpStatus === 409
    );

    // Al 15° giorno la prova diventa piano attivo con addebito (simulato).
    const day15 = Date.now() / 1000 + 15 * 86400;
    await settleSubscription({ pool }, 'c', day15);
    const sub = (await pool.query("SELECT status, period_end FROM plan_subscriptions WHERE company_id='c'")).rows[0];
    assert.equal(sub.status, 'active');
    assert.ok(Number(sub.period_end) > day15);
    const converted = await pool.query("SELECT amount_cents FROM plan_events WHERE company_id='c' AND action='trial_converted'");
    assert.equal(converted.rows[0].amount_cents, 9900);

    // Disdetta: alla scadenza il piano termina.
    await billing('plan-cancel', {}, 'c');
    await settleSubscription({ pool }, 'c', Number(sub.period_end) + 1);
    assert.equal((await pool.query("SELECT status FROM plan_subscriptions WHERE company_id='c'")).rows[0].status, 'expired');

    // La prova non si può riusare: il nuovo piano parte subito a pagamento.
    const offerAgain = await billing('plan-offer', null, 'c');
    assert.equal(offerAgain.trial_available, false);
    await assert.rejects(
      billing('plan-checkout', { plan: 'base', period: 'annual', method: 'card', trial: true, confirm: true }, 'c'),
      e => e.httpStatus === 409
    );
    const paid = await billing('plan-checkout', { plan: 'base', period: 'annual', method: 'card', trial: false, confirm: true }, 'c');
    assert.equal(paid.status, 'active');
    assert.equal(paid.charged_now_cents, 49000);
    // Nessun dato di pagamento di un'azienda compare nell'altra.
    assert.equal((await pool.query("SELECT 1 FROM plan_events WHERE company_id='d'")).rowCount, 0);
  });

  await test('unconfirmed research goes to manual review with one email to the admin only', async () => {
    const sent = [];
    const env = { LINEA_ADMIN_EMAILS: 'gestore@example.invalid', PUBLIC_SITE_URL: 'https://moreai.invalid' };
    const mail = async (_db, message) => { sent.push(message); };
    await pool.query("INSERT INTO plan_profiles(company_id, data, status, updated_at) VALUES('d', $1, 'pending', NOW())", [{ legal_name: 'Delta Srl', website: 'https://delta.invalid' }]);
    const r = await researchOutcome({ pool }, 'd', 'needs_review', { env, mail });
    assert.equal(r.status, 'under_review');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'gestore@example.invalid');
    assert.match(sent[0].text, /admin\.html#d/);
    assert.equal((await billing('plan-offer', null, 'd')).approved, false);
    // Una decisione manuale non viene sovrascritta dall'analisi.
    await pool.query("UPDATE company_verification SET status='rejected' WHERE company_id='d'");
    assert.equal((await researchOutcome({ pool }, 'd', 'verified', { env, mail })).status, 'rejected');
    await pool.query("UPDATE company_verification SET status='under_review' WHERE company_id='d'");
  });

  await test('admin panel is reserved to the MoreAI admin and edits only the chosen company', async () => {
    const env = { LINEA_ADMIN_EMAILS: 'a@example.invalid' };
    const adminAuth = async (_db, req) => {
      const u = req.headers.get('x-test-user');
      return u ? { id: 'user-' + u, company_id: u, email: u + '@example.invalid' } : null;
    };
    const admin = async (path, body, user = 'a') => {
      const res = await adminApi(request('admin/' + path, body, user), { pool }, adminAuth, { env, emailVerified: async () => true, transport: async () => new Response(null, { status: 202 }) });
      return res.json();
    };
    await assert.rejects(admin('companies', null, 'b'), e => e.httpStatus === 403);
    await assert.rejects(admin('companies', null, null), e => e.httpStatus === 401);
    await assert.rejects(
      adminApi(request('admin/companies', null, 'a'), { pool }, adminAuth, { env, emailVerified: async () => false }),
      e => e.httpStatus === 403
    );
    const list = await admin('companies');
    assert.ok(list.companies.some(c => c.id === 'd' && c.verification === 'under_review'));
    const detail = await admin('company?id=d');
    assert.equal(detail.profile.legal_name, 'Delta Srl');

    await admin('company-ai', { id: 'd', knowledge: 'Delta ripara biciclette. Orari 9-18.', origins: ['https://www.delta.invalid/negozio', 'https://www.delta.invalid'] });
    const config = (await pool.query("SELECT config FROM companies WHERE id='d'")).rows[0].config;
    assert.equal(config.knowledge, 'Delta ripara biciclette. Orari 9-18.');
    assert.equal((await pool.query("SELECT config FROM companies WHERE id='c'")).rows[0].config.knowledge, cfg.knowledge);
    const widget = (await pool.query("SELECT allowed_origins FROM widget_settings WHERE company_id='d'")).rows[0];
    assert.deepEqual(widget.allowed_origins, ['https://www.delta.invalid']);
    await assert.rejects(admin('company-ai', { id: 'd', knowledge: 'x', origins: ['javascript:alert(1)'] }), e => e.httpStatus === 400);

    await assert.rejects(admin('verify', { id: 'd', status: 'boh' }), e => e.httpStatus === 400);
    await admin('verify', { id: 'd', status: 'verified', reason: 'Controllata a mano.' });
    assert.equal((await billing('plan-offer', null, 'd')).approved, true);
    const history = (await admin('company?id=d')).history;
    assert.equal(history[0].actor, 'gestore a@example.invalid');
    await assert.rejects(admin('company?id=demo'), e => e.httpStatus === 404);
  });

  await test('plan change: upgrade now, downgrade at renewal, resume after cancel', async () => {
    // 'c' ha un Piano Base annuale attivo (test precedente).
    const up = await billing('plan-change', { plan: 'plus', period: 'annual' }, 'c');
    assert.equal(up.when, 'now');
    assert.equal(await effectivePlan({ pool }, 'c'), 'plus');
    const down = await billing('plan-change', { plan: 'base', period: 'monthly' }, 'c');
    assert.equal(down.when, 'renewal');
    assert.equal(await effectivePlan({ pool }, 'c'), 'plus');
    const sub = (await pool.query("SELECT period_end FROM plan_subscriptions WHERE company_id='c'")).rows[0];
    await settleSubscription({ pool }, 'c', Number(sub.period_end) + 1);
    const after = (await pool.query("SELECT plan, period, amount_cents, pending_plan FROM plan_subscriptions WHERE company_id='c'")).rows[0];
    assert.deepEqual(after, { plan: 'base', period: 'monthly', amount_cents: 4900, pending_plan: null });
    await billing('plan-cancel', {}, 'c');
    const resumed = await billing('plan-change', { plan: 'base', period: 'monthly' }, 'c');
    assert.equal(resumed.when, 'none');
    assert.equal((await pool.query("SELECT cancel_at_end FROM plan_subscriptions WHERE company_id='c'")).rows[0].cancel_at_end, false);
    await assert.rejects(billing('plan-change', { plan: 'plus', period: 'monthly' }, 'd'), e => e.httpStatus === 409);
  });

  await test('admin visit: configuration only, never customer data', async () => {
    const viewer = async (_db, req) => req.headers.get('x-test-user')
      ? { id: 'user-a', company_id: req.headers.get('x-test-user'), email: 'a@example.invalid', viewer: true }
      : null;
    const visit = async (path, body) => {
      const res = await chatApi(request(path, body, 'd'), { pool }, viewer, { model, modelReady: () => true, context: { ip: '127.0.0.1' } });
      return res.json();
    };
    for (const path of ['leads', 'conversations', 'data-export.xlsx', 'data-export.csv']) {
      await assert.rejects(visit(path), e => e.httpStatus === 403, path);
    }
    await assert.rejects(visit('data-delete', { conversation: 'x', confirm: true }), e => e.httpStatus === 403);
    await assert.rejects(visit('company-review', { conversation: 'x', comment: 'x' }), e => e.httpStatus === 403);
    const overview = await visit('company-overview');
    assert.deepEqual(overview.reviews, []);
    assert.deepEqual(overview.feedback, []);
    assert.ok(overview.statistics);
    // La configurazione si può sistemare anche senza piano attivo dell'azienda.
    const current = (await pool.query("SELECT config FROM companies WHERE id='d'")).rows[0].config;
    const saved = await visit('config', { ...current, knowledge: 'Aggiornato dal gestore.', confirmation_email: false });
    assert.equal(saved.config.knowledge, 'Aggiornato dal gestore.');
  });

  await test('admin can enter a dashboard, cannot delete the owner, deletes with typed name', async () => {
    const env = { LINEA_ADMIN_EMAILS: 'a@example.invalid' };
    const views = [];
    const adminAuth = async (_db, req) => req.headers.get('x-test-user') ? { id: 'user-a', company_id: 'a', email: 'a@example.invalid' } : null;
    const admin = async (path, body) => {
      const res = await adminApi(request('admin/' + path, body, 'a'), { pool }, adminAuth, { env, emailVerified: async () => true, setView: async id => { views.push(id); return true; } });
      return res.json();
    };
    assert.equal((await admin('view', { id: 'd' })).redirect, '/dashboard.html');
    await admin('view-end', {});
    assert.deepEqual(views, ['d', null]);
    await assert.rejects(admin('delete', { id: 'a', confirm_name: 'Test' }), e => e.httpStatus === 400);
    await assert.rejects(admin('verify', { id: 'a', status: 'suspended' }), e => e.httpStatus === 400);
    await assert.rejects(admin('delete', { id: 'd', confirm_name: 'Sbagliato' }), e => e.httpStatus === 400);
    await pool.query("INSERT INTO companies VALUES('e','public-e',$1,NOW())", [{ ...cfg, name: 'Da Eliminare' }]);
    await pool.query("INSERT INTO users VALUES('user-e','e','e@example.invalid','unused')");
    await admin('delete', { id: 'e', confirm_name: 'Da Eliminare' });
    assert.equal((await pool.query("SELECT 1 FROM companies WHERE id='e'")).rowCount, 0);
    assert.equal((await pool.query("SELECT 1 FROM users WHERE id='user-e'")).rowCount, 0);
    const log = (await pool.query("SELECT action FROM admin_log WHERE company_id='e'")).rows.map(r => r.action);
    assert.deepEqual(log, ['delete']);
  });

  await test('owner company has every feature without plan limits', async () => {
    const before = process.env.LINEA_ADMIN_EMAILS;
    process.env.LINEA_ADMIN_EMAILS = 'd@example.invalid';
    try {
      assert.equal(await isOwnerCompany({ pool }, 'd'), false); // email non verificata
      await pool.query("INSERT INTO email_verification(user_id, verified_at) VALUES('user-d', NOW()) ON CONFLICT (user_id) DO UPDATE SET verified_at=NOW()");
      assert.equal(await isOwnerCompany({ pool }, 'd'), true);
      assert.equal(await effectivePlan({ pool }, 'd'), 'advanced');
      const usage = await api('ai-usage', null, 'd');
      assert.equal(usage.unlimited, true);
      assert.equal(await isOwnerCompany({ pool }, 'b'), false);
    } finally {
      if (before === undefined) delete process.env.LINEA_ADMIN_EMAILS; else process.env.LINEA_ADMIN_EMAILS = before;
    }
  });

  /*
   * Quando la Demo aziendale scade:
   * - le funzioni operative vengono bloccate;
   * - la chat aziendale non può creare una nuova sessione;
   * - l'azienda e i suoi dati non vengono cancellati.
   */
  await test(
    'expired demo blocks company operations without deleting company data',
    async () => {
      const expired = Date.now() / 1000 - 1;

      await pool.query(
        `UPDATE plan_demo_usage
         SET ends=$1
         WHERE company_id='a'`,
        [expired]
      );

      await assert.rejects(
        api('leads'),
        e => e.httpStatus === 402
      );

      await assert.rejects(
        api(
          'session',
          { company: 'public-a' }
        ),
        e => e.httpStatus === 402
      );

      const company = await pool.query(
        `SELECT id
         FROM companies
         WHERE id='a'`
      );

      assert.equal(company.rowCount, 1);
    }
  );
} finally {
  await pool.end();

  await admin.query(
    `DROP SCHEMA ${schema} CASCADE`
  );

  await admin.end();
}