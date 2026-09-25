import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, aiReady, AIError } from '../lib/ai/provider.mjs';
import { interpret } from '../lib/online-ai.mjs';
import { researchCompany } from '../lib/company-research.mjs';
import { initialState } from '../lib/chat-state.mjs';
import { currentPeriod, PLAN_MONTHLY_MESSAGES } from '../lib/ai-quota.mjs';
import { internalRequestHeaders, internalRequestAuthorized } from '../lib/internal-auth.mjs';

const KEY = 'test-key-not-real';
const env = { LINEA_GEMINI_API_KEY: KEY };
const ok = payload => ({ ok: true, status: 200, json: async () => payload, text: async () => { throw Error('body must not be read'); } });
const reply = text => ok({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 } });

test('gemini is called directly with the key only in a header', async () => {
  let seen;
  const out = await generate(
    { system: 'S', messages: [{ role: 'user', text: 'ciao' }, { role: 'assistant', text: 'ok' }], jsonSchema: { type: 'object' }, thinking: false },
    { env, transport: async (url, init) => { seen = { url, init }; return reply('{"a":1}'); } }
  );
  assert.equal(seen.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.ok(!seen.url.includes(KEY));
  assert.equal(seen.init.headers['x-goog-api-key'], KEY);
  const body = JSON.parse(seen.init.body);
  assert.ok(!seen.init.body.includes(KEY));
  assert.deepEqual(body.contents.map(c => c.role), ['user', 'model']);
  assert.equal(body.systemInstruction.parts[0].text, 'S');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.equal(out.text, '{"a":1}');
  assert.deepEqual(out.usage, { inputTokens: 11, outputTokens: 7 });
});

test('not ready without LINEA_GEMINI_API_KEY; gateway variables are ignored', async () => {
  const gateway = { GEMINI_API_KEY: 'x', GOOGLE_GEMINI_BASE_URL: 'https://gateway.invalid' };
  assert.equal(aiReady(gateway), false);
  let called = 0;
  await assert.rejects(generate({ messages: [{ role: 'user', text: 'a' }] }, { env: gateway, transport: () => called++ }), e => e.code === 'AI_UNAVAILABLE');
  assert.equal(called, 0);
  assert.equal(aiReady({ ...env, LINEA_AI_PROVIDER: 'other' }), false);
});

test('upstream errors are normalized without reading or exposing the body', async () => {
  for (const [status, code] of [[429, 'AI_RATE_LIMITED'], [403, 'AI_AUTH'], [500, 'AI_UPSTREAM'], [404, 'AI_MODEL_NOT_FOUND']]) {
    await assert.rejects(
      generate({ messages: [{ role: 'user', text: 'a' }] }, { env, transport: async () => ({ ok: false, status, text: async () => { throw Error('read'); }, json: async () => { throw Error('read'); } }) }),
      e => e instanceof AIError && e.code === code && !String(e.message).includes(KEY)
    );
  }
  await assert.rejects(generate({ messages: [{ role: 'user', text: 'a' }] }, { env, transport: async () => ok({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }) }), e => e.code === 'AI_BLOCKED');
  await assert.rejects(generate({ messages: [{ role: 'user', text: 'a' }], model: '../x' }, { env, transport: async () => reply('x') }), e => e.code === 'AI_MODEL_INVALID');
});

test('chat interpreter uses the adapter and rejects malformed output', async () => {
  const cfg = { fields: [] };
  const good = JSON.stringify({ reply: 'Ciao', language: 'it', action: 'continue', consent: 'none', consent_quote: '', extracted: [] });
  const r = await interpret(cfg, initialState(), [{ role: 'assistant', content: 'x' }], 'ciao', { env, transport: async () => reply(good) });
  assert.equal(r.reply, 'Ciao');
  assert.equal(r.usage.inputTokens, 11);
  await assert.rejects(interpret(cfg, initialState(), [], 'ciao', { env, transport: async () => reply('{"reply":""}') }), e => e.code === 'AI_INVALID_RESPONSE');
});

test('chat interpreter retries once on a temporary Gemini error, never on permanent ones', async () => {
  const cfg = { fields: [] };
  const good = JSON.stringify({ reply: 'Ciao', language: 'it', action: 'continue', consent: 'none', consent_quote: '', extracted: [] });
  let calls = 0;
  const slowThenOk = async () => {
    calls++;
    if (calls === 1) { const e = new Error('slow'); e.name = 'TimeoutError'; throw e; }
    return reply(good);
  };
  const r = await interpret(cfg, initialState(), [], 'ciao', { env, transport: slowThenOk });
  assert.equal(r.reply, 'Ciao');
  assert.equal(calls, 2);

  calls = 0;
  const alwaysSlow = async () => { calls++; const e = new Error('slow'); e.name = 'TimeoutError'; throw e; };
  await assert.rejects(interpret(cfg, initialState(), [], 'ciao', { env, transport: alwaysSlow }), e => e.code === 'AI_TIMEOUT');
  assert.equal(calls, 2);

  calls = 0;
  const denied = async () => { calls++; return { ok: false, status: 403, json: async () => ({}) }; };
  await assert.rejects(interpret(cfg, initialState(), [], 'ciao', { env, transport: denied }), e => e.code === 'AI_AUTH');
  assert.equal(calls, 1);
});

test('chat replies never contain exclamation marks', async () => {
  const cfg = { fields: [] };
  const out = JSON.stringify({ reply: 'Ciao! Benvenuto!! ¡Hola! Tutto ok?! Visita www.moreai.it!', language: 'it', action: 'continue', consent: 'none', consent_quote: '', extracted: [] });
  const r = await interpret(cfg, initialState(), [], 'ciao', { env, transport: async () => reply(out) });
  assert.equal(r.reply, 'Ciao. Benvenuto. Hola. Tutto ok? Visita www.moreai.it.');
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const html = (body, extra = {}) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...extra }), text: async () => body });

test('company research reads the official site, then uses Gemini web search', async () => {
  let body;
  const fetched = [];
  const knowledge = { identity: { legal_name: 'ACME' }, services: ['Consulenza'], confidence: 'medium' };
  const transport = async (url, init) => {
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      body = JSON.parse(init.body);
      return ok({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(knowledge) + '\n```' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://news.example/acme', title: 'Notizia' } }] } }] });
    }
    fetched.push(url);
    assert.equal(init.redirect, 'manual');
    return url === 'https://acme.example/'
      ? html('<h1>ACME</h1><a href="/servizi">Servizi</a><a href="http://10.0.0.1/x">x</a>')
      : html('<p>Consulenza aziendale</p>');
  };
  const out = await researchCompany({ legal_name: 'ACME srl', website: 'https://acme.example/' }, { env, transport, lookup: publicLookup });
  assert.deepEqual(fetched, ['https://acme.example/', 'https://acme.example/servizi']);
  assert.deepEqual(body.tools, [{ url_context: {} }, { google_search: {} }]);
  assert.equal(body.generationConfig.responseMimeType, undefined);
  assert.match(body.contents[0].parts[0].text, /Consulenza aziendale/);
  assert.equal(out.knowledge.identity.legal_name, 'ACME srl'); // dato del proprietario prevale
  assert.equal(out.verified, true);
  assert.deepEqual(out.sources.map(s => s.type + ' ' + s.url), [
    'website https://acme.example/', 'website https://acme.example/servizi', 'web https://news.example/acme'
  ]);
});

test('company research never reaches private networks (DNS or redirect)', async () => {
  const calls = [];
  const transport = async url => {
    calls.push(url);
    return { ok: false, status: 302, headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data' }), text: async () => '' };
  };
  await assert.rejects(
    researchCompany({ legal_name: 'ACME', website: 'https://acme.example/' }, { env, transport, lookup: publicLookup }),
    e => e.message === 'COMPANY_RESEARCH_WEBSITE_UNAVAILABLE'
  );
  assert.deepEqual(calls, ['https://acme.example/']);

  const neverCalled = async () => { throw Error('must not fetch'); };
  for (const address of ['127.0.0.1', '10.1.2.3', '::1', 'fd00::1', '::ffff:192.168.1.1']) {
    await assert.rejects(
      researchCompany({ legal_name: 'ACME', website: 'https://acme.example/' }, { env, transport: neverCalled, lookup: async () => [{ address, family: address.includes(':') ? 6 : 4 }] }),
      e => e.message === 'COMPANY_RESEARCH_WEBSITE_UNAVAILABLE'
    );
  }
});

test('ollama fallback: only with LINEA_AI_PROVIDER=ollama, HTTPS only, key in header', async () => {
  const oEnv = { LINEA_AI_PROVIDER: 'ollama', OLLAMA_API_KEY: KEY, OLLAMA_MODEL: 'gpt-oss:120b' };
  assert.equal(aiReady(oEnv), true);
  assert.equal(aiReady({ ...oEnv, OLLAMA_BASE_URL: 'http://ollama.example' }), false);
  assert.equal(aiReady({ OLLAMA_API_KEY: KEY, OLLAMA_MODEL: 'm' }), false); // default resta Gemini
  let seen;
  const out = await generate(
    { system: 'S', messages: [{ role: 'user', text: 'ciao' }], jsonSchema: { type: 'object', additionalProperties: false }, thinking: false },
    { env: oEnv, transport: async (url, init) => { seen = { url, init }; return ok({ message: { content: '{"a":1}' }, prompt_eval_count: 3, eval_count: 2 }); } }
  );
  assert.equal(seen.url, 'https://ollama.com/api/chat');
  assert.equal(seen.init.headers.Authorization, 'Bearer ' + KEY);
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.messages.map(m => m.role), ['system', 'user']);
  assert.deepEqual(body.format, { type: 'object', additionalProperties: false });
  assert.equal(out.provider, 'ollama');
  assert.deepEqual(out.usage, { inputTokens: 3, outputTokens: 2 });
});

test('minimal thinking uses the right field for each Gemini generation', async () => {
  const seen = {};
  for (const model of ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
    await generate({ messages: [{ role: 'user', text: 'a' }], thinking: false }, { env: { ...env, LINEA_AI_MODEL: model }, transport: async (_u, init) => { seen[model] = JSON.parse(init.body).generationConfig.thinkingConfig; return reply('x'); } });
  }
  assert.deepEqual(seen, {
    'gemini-2.5-flash-lite': { thinkingBudget: 0 },
    'gemini-3.5-flash-lite': { thinkingLevel: 'minimal' },
    'gemini-3.8-flash': { thinkingLevel: 'low' }
  });
});

test('gemini schema drops additionalProperties (unsupported by Gemini)', async () => {
  let body;
  await generate(
    { messages: [{ role: 'user', text: 'a' }], jsonSchema: { type: 'object', additionalProperties: false, properties: { x: { type: 'object', additionalProperties: false } } } },
    { env, transport: async (_u, init) => { body = JSON.parse(init.body); return reply('{}'); } }
  );
  assert.ok(!JSON.stringify(body.generationConfig.responseSchema).includes('additionalProperties'));
});

test('plan quotas and monthly period (Europe/Rome)', () => {
  assert.deepEqual({ ...PLAN_MONTHLY_MESSAGES }, { demo: 100, base: 3000, plus: 10000, advanced: 50000 });
  assert.ok(Object.isFrozen(PLAN_MONTHLY_MESSAGES));
  assert.equal(currentPeriod(new Date('2026-09-30T22:30:00Z')), '2026-10'); // 00:30 a Roma
  assert.equal(currentPeriod(new Date('2026-12-31T22:59:59Z')), '2026-12');
});

test('internal background calls require the shared secret', () => {
  const secretEnv = { LINEA_INTERNAL_SECRET: 's'.repeat(40) };
  const req = h => new Request('https://x.invalid', { method: 'POST', headers: h || {} });
  assert.equal(internalRequestHeaders({}), null);
  assert.equal(internalRequestHeaders({ LINEA_INTERNAL_SECRET: 'short' }), null);
  assert.equal(internalRequestAuthorized(req(internalRequestHeaders(secretEnv)), secretEnv), true);
  assert.equal(internalRequestAuthorized(req({ 'x-linea-internal': 'wrong' }), secretEnv), false);
  assert.equal(internalRequestAuthorized(req(), secretEnv), false);
  assert.equal(internalRequestAuthorized(req({ 'x-linea-internal': 's'.repeat(40) }), {}), false);
});
