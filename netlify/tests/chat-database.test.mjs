import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { chatApi } from '../lib/chat-api.mjs';
import { currentPeriod } from '../lib/ai-quota.mjs';

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