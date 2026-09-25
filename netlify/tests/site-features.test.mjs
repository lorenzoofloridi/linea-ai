import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { requestPasswordReset, completePasswordReset } from '../lib/password-reset.mjs';
import { knowledgeEntries, exportLeadsCsv } from '../lib/company-data.mjs';
import { sendEmail } from '../lib/mailer.mjs';

const sha = v => createHash('sha256').update(v).digest('hex');

// Database finto, sufficiente per le query del recupero password.
function fakeDb({ users = [] } = {}) {
  const state = { limits: new Map(), tokens: [], sessions: [{ user_id: 'u1' }], passwords: {}, outbox: [] };
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO chat_limits')) {
      const key = params[0] + ':' + params[1];
      state.limits.set(key, (state.limits.get(key) || 0) + 1);
      return { rows: [{ count: state.limits.get(key) }], rowCount: 1 };
    }
    if (s.startsWith('SELECT id, company_id, email FROM users')) {
      const rows = users.filter(u => u.email === params[0]);
      return { rows, rowCount: rows.length };
    }
    if (s.startsWith('DELETE FROM password_reset_tokens WHERE user_id')) {
      state.tokens = state.tokens.filter(t => t.user_id !== params[0]);
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('INSERT INTO password_reset_tokens')) {
      state.tokens.push({ hash: params[0], user_id: params[1], expires: params[2] });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('DELETE FROM password_reset_tokens WHERE hash')) {
      const found = state.tokens.find(t => t.hash === params[0]);
      state.tokens = state.tokens.filter(t => t !== found);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (s.startsWith('UPDATE users SET password')) {
      state.passwords[params[1]] = params[0];
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('DELETE FROM auth_sessions')) {
      state.sessions = state.sessions.filter(x => x.user_id !== params[0]);
      return { rows: [], rowCount: 1 };
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [], rowCount: 0 };
    throw new Error('Query non prevista: ' + s);
  };
  return { state, pool: { query, connect: async () => ({ query, release() {} }) } };
}

const user = { id: 'u1', company_id: 'c1', email: 'mario@example.com' };

test('password request never reveals whether an account exists', async () => {
  const sent = [];
  const mail = async (_db, message) => { sent.push(message); return { sent: true }; };
  const db = fakeDb({ users: [user] });
  const known = await requestPasswordReset(db, { email: 'Mario@Example.com' }, { baseUrl: 'https://www.linea-ai.it', mail });
  const unknown = await requestPasswordReset(db, { email: 'nessuno@example.com' }, { baseUrl: 'https://www.linea-ai.it', mail });
  assert.deepEqual(known, unknown);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'mario@example.com');
  const link = sent[0].text.match(/https:\/\/www\.linea-ai\.it\/recupera-password\.html#([\w-]+)/);
  assert.ok(link, 'il link usa il frammento # per il token');
  assert.equal(db.state.tokens[0].hash, sha(link[1]), 'nel database solo l’hash');
});

test('password request is rate limited per address', async () => {
  const db = fakeDb({ users: [user] });
  const mail = async () => ({ sent: true });
  for (let i = 0; i < 3; i++) await requestPasswordReset(db, { email: user.email }, { baseUrl: 'https://x', mail });
  await assert.rejects(requestPasswordReset(db, { email: user.email }, { baseUrl: 'https://x', mail }), e => e.httpStatus === 429);
});

test('reset token is single use, expires and closes every session', async () => {
  const db = fakeDb({ users: [user] });
  let link;
  await requestPasswordReset(db, { email: user.email }, { baseUrl: 'https://x', mail: async (_d, m) => { link = m.text.match(/#([\w-]+)/)[1]; } });
  const hashPassword = async p => 'hashed:' + p.length;
  await assert.rejects(completePasswordReset(db, { token: link, password: 'corta' }, { hashPassword }), e => e.httpStatus === 400);
  const ok = await completePasswordReset(db, { token: link, password: 'UnaPasswordNuova2026' }, { hashPassword });
  assert.equal(ok.ok, true);
  assert.equal(db.state.passwords.u1, 'hashed:20');
  assert.equal(db.state.sessions.length, 0);
  await assert.rejects(completePasswordReset(db, { token: link, password: 'UnaPasswordNuova2026' }, { hashPassword }), e => e.httpStatus === 400);

  db.state.tokens.push({ hash: sha('scaduto'), user_id: 'u1', expires: Date.now() / 1000 - 1 });
  await assert.rejects(completePasswordReset(db, { token: 'scaduto', password: 'UnaPasswordNuova2026' }, { hashPassword }), e => /non è più valido/.test(e.message));
});

test('mailer refuses to send without RESEND_API_KEY and never logs the key', async () => {
  await assert.rejects(sendEmail({ pool: { query: async () => ({ rowCount: 1, rows: [] }) } }, { companyId: 'c', eventKey: 'e', to: 'a@b.it', subject: 's', text: 't', html: 'h' }, { env: {} }), e => e.code === 'MAIL_NOT_CONFIGURED');
});

test('knowledge from research becomes readable entries, never marked as used by the AI', () => {
  const entries = knowledgeEntries({
    status: 'verified',
    sources: [{ url: 'https://acme.example/' }],
    knowledge: { identity: { description: 'Concessionaria a Milano' }, services: ['Vendita', 'Noleggio'], contacts: { email: 'info@acme.example' }, faq: [{ question: 'Aprite il sabato?', answer: 'Sì, fino alle 13.' }] }
  });
  assert.deepEqual(entries.map(e => e.content), ['Concessionaria a Milano', 'Servizi: Vendita, Noleggio', 'Contatti: info@acme.example', 'Aprite il sabato? — Sì, fino alle 13.']);
  assert.ok(entries.every(e => e.source === 'https://acme.example/' && e.ai_allowed === false));
  assert.deepEqual(knowledgeEntries(null), []);
});

test('CSV export neutralizes spreadsheet formulas', async () => {
  const db = { pool: { query: async () => ({ rows: [{ created_at: '2026-09-25T10:00:00Z', status: 'Nuova', kind: 'real', data: { nome: '=HYPERLINK("x")', telefono: '+39 333' }, consent: 'sì', summary: '' }] }) } };
  const csv = await exportLeadsCsv(db, 'c1');
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"'\+39 333"/);
  assert.match(csv, /"Sito"/);
});
