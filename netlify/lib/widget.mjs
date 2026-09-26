// Widget di MoreAI da installare sul sito dell'azienda.
//
// Come funziona:
//   1. Il sito dell'azienda carica /moreai-widget.js con data-company="<public_id>".
//   2. Lo script apre un iframe su /api/widget-frame?c=<public_id>.
//      La pagina risponde con Content-Security-Policy frame-ancestors: solo i
//      siti autorizzati dall'azienda (e moreai.it) possono incorporarla.
//   3. La pagina contiene un "biglietto" firmato e di breve durata; con quello
//      /api/widget-session apre una conversazione di tipo "real" per QUELLA
//      azienda. Da lì in poi valgono /api/chat e /api/feedback come sempre.
//
// Isolamento: l'azienda è ricavata solo dal public_id verificato nel biglietto;
// conversazioni, richieste e quote restano dell'azienda. Senza Demo o piano
// attivo il widget non apre conversazioni.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { effectivePlan } from "./ai-quota.mjs";
import { initialState } from "./chat-state.mjs";
import { knowledgeEntries } from "./company-data.mjs";

const TICKET_SECONDS = 6 * 3600;
const MAX_ORIGINS = 5;

const token = () => randomBytes(32).toString("base64url");
const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const greeting = c =>
  c.agent?.branding?.greeting || `Ciao, sono l’assistente di ${c.name}. Come posso aiutarti oggi?`;

function ticketKey(env) {
  const secret = env.LINEA_INTERNAL_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return null;
  return createHash("sha256").update("moreai-widget-ticket:" + secret).digest();
}

/** Biglietto firmato: azienda + scadenza. Null se il segreto non è configurato. */
export function createTicket(companyId, { env = process.env, now = Date.now() } = {}) {
  const key = ticketKey(env);
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ c: companyId, e: Math.floor(now / 1000) + TICKET_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return payload + "." + signature;
}

/** Restituisce l'id azienda del biglietto se firma e scadenza sono valide. */
export function verifyTicket(ticket, { env = process.env, now = Date.now() } = {}) {
  const key = ticketKey(env);
  if (!key || typeof ticket !== "string" || ticket.length > 600) return null;
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", key).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data?.c !== "string" || !Number.isFinite(data?.e) || data.e < now / 1000) return null;
    return data.c;
  } catch {
    return null;
  }
}

/**
 * Normalizza un sito autorizzato in un'origine https (es. https://www.acme.it).
 * Rifiuta indirizzi IP, localhost, porte e percorsi strani.
 */
export function normalizeOrigin(value) {
  if (typeof value !== "string") return null;
  let text = value.trim().toLowerCase();
  if (!text || text.length > 200) return null;
  if (!/^https?:\/\//.test(text)) text = "https://" + text;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname;
  if (!/^(?=.{4,190}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  return "https://" + host;
}

/** Dal sito del profilo: l'origine indicata e la variante con/senza www. */
export function originsFromWebsite(website) {
  const origin = normalizeOrigin(website);
  if (!origin) return [];
  const host = origin.slice(8);
  const other = host.startsWith("www.") ? host.slice(4) : "www." + host;
  return [origin, "https://" + other];
}

/** Testo compatto delle informazioni trovate sul web, per il contesto dell'assistente. */
export function researchForAssistant(row, max = 6000) {
  if (!row || row.status !== "verified") return "";
  let text = "";
  for (const entry of knowledgeEntries(row)) {
    const line = "- " + entry.content.replace(/\s+/g, " ").trim() + "\n";
    if (text.length + line.length > max) break;
    text += line;
  }
  return text.trim();
}

/** Configurazione della conversazione: config dell'azienda + informazioni dal web verificate. */
export async function conversationConfig(db, company) {
  const research = (
    await db.pool.query("SELECT status, knowledge, sources FROM company_knowledge WHERE company_id=$1", [company.id])
  ).rows[0];
  const publicResearch = researchForAssistant(research);
  return publicResearch ? { ...company.config, public_research: publicResearch } : company.config;
}

async function limit(db, key, maximum, windowSeconds, message) {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const r = await db.pool.query(
    `INSERT INTO chat_limits(key,bucket,count) VALUES($1,$2,1)
     ON CONFLICT(key,bucket) DO UPDATE SET count=chat_limits.count+1
     RETURNING count`,
    [key, bucket]
  );
  if (r.rows[0].count > maximum) fail(429, message);
}

async function companyByPublicId(db, publicId) {
  if (typeof publicId !== "string" || !publicId || publicId.length > 100 || publicId === "demo") return null;
  return (await db.pool.query("SELECT id, public_id, config FROM companies WHERE public_id=$1", [publicId])).rows[0] || null;
}

async function blocked(db, companyId) {
  const r = await db.pool.query("SELECT status FROM company_verification WHERE company_id=$1", [companyId]);
  return ["suspended", "rejected"].includes(r.rows[0]?.status);
}

/** Impostazioni del widget; al primo accesso i siti arrivano dal profilo aziendale. */
async function settings(db, companyId) {
  const row = (await db.pool.query("SELECT enabled, allowed_origins FROM widget_settings WHERE company_id=$1", [companyId])).rows[0];
  if (row) return { enabled: row.enabled, origins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [] };
  const profile = (await db.pool.query("SELECT data FROM plan_profiles WHERE company_id=$1", [companyId])).rows[0];
  const origins = originsFromWebsite(profile?.data?.website);
  await db.pool.query(
    `INSERT INTO widget_settings(company_id, enabled, allowed_origins) VALUES($1, TRUE, $2::jsonb)
     ON CONFLICT(company_id) DO NOTHING`,
    [companyId, JSON.stringify(origins)]
  );
  return { enabled: true, origins };
}

function siteOrigin(request, env) {
  return normalizeOrigin(env.PUBLIC_SITE_URL || "") || new URL(request.url).origin;
}

function frame(request, env, { company, ticket, origins, message }) {
  const own = siteOrigin(request, env);
  const ancestors = [...new Set([...origins, own])].join(" ");
  const cfg = company?.config || {};
  const color = /^#[0-9a-f]{6}$/i.test(cfg.agent?.branding?.color || "") ? cfg.agent.branding.color : "#6D28D9";
  const name = cfg.agent?.branding?.assistant_name || cfg.name || "Assistente";
  const body = message
    ? `<main class="unavailable"><p>${escapeHtml(message)}</p></main>`
    : `<header><span class="avatar" aria-hidden="true">${escapeHtml((name.trim()[0] || "A").toUpperCase())}</span><div><strong>${escapeHtml(name)}</strong><small>Assistente virtuale</small></div><button type="button" id="restart" aria-label="Nuova conversazione" title="Nuova conversazione">↻</button><button type="button" id="close" aria-label="Chiudi la chat" title="Chiudi">×</button></header>
<main id="messages" role="log" aria-live="polite" aria-label="Conversazione"></main>
<form id="chat"><label class="sr-only" for="message">Il tuo messaggio</label><input id="message" maxlength="2000" autocomplete="off" placeholder="Scrivi il tuo messaggio…" required><button id="send" type="submit" aria-label="Invia">↑</button></form>
<footer><span id="status" role="status"></span><a href="${escapeHtml(own)}/privacy.html" target="_blank" rel="noopener">Privacy</a><span>· con MoreAI</span></footer>`;
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(name)}</title><link rel="stylesheet" href="/widget-app.css"><script src="/widget-app.js" defer></script></head>
<body data-company="${escapeHtml(company?.public_id || "")}" data-ticket="${escapeHtml(ticket || "")}" data-greeting="${escapeHtml(company ? greeting(cfg) : "")}" style="--accent:${color}">${body}</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`
    }
  });
}

async function readBody(request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) fail(400, "Richiesta non valida.");
  const raw = await request.text();
  if (raw.length > 8000) fail(413, "Richiesta troppo grande.");
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body;
  } catch {
    fail(400, "Richiesta non valida.");
  }
}

/** Il widget è incluso solo nei piani Base, Plus e Advanced (anche in prova), non nella Demo. */
export async function widgetAllowed(db, companyId) {
  return ["base", "plus", "advanced"].includes(await effectivePlan(db, companyId));
}

/**
 * Gestisce le rotte del widget; restituisce null per le altre.
 * user: utente autenticato (solo per /api/widget-settings), altrimenti null.
 */
export async function widgetApi(request, db, auth, { env = process.env, context = {} } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/api/widget-frame" && method === "GET") {
    const company = await companyByPublicId(db, url.searchParams.get("c"));
    if (!company) return frame(request, env, { origins: [], message: "Questa chat non è disponibile." });
    const s = await settings(db, company.id);
    const ticket = createTicket(company.id, { env });
    if (!s.enabled || !ticket || (await blocked(db, company.id)) || !(await widgetAllowed(db, company.id))) {
      return frame(request, env, { company, origins: s.origins, message: "La chat non è disponibile al momento. Puoi contattare l’azienda con i recapiti indicati sul sito." });
    }
    return frame(request, env, { company, ticket, origins: s.origins });
  }

  if (path === "/api/widget-session" && method === "POST") {
    const body = await readBody(request);
    const company = await companyByPublicId(db, body.company);
    if (!company || verifyTicket(body.ticket, { env }) !== company.id) fail(403, "Chat non disponibile. Ricarica la pagina.");
    const s = await settings(db, company.id);
    if (!s.enabled || (await blocked(db, company.id))) fail(403, "Chat non disponibile.");
    if (!(await widgetAllowed(db, company.id))) fail(402, "La chat non è disponibile al momento.");
    await limit(db, "widget-ip:" + hash(context.ip || "unknown"), 20, 3600, "Hai aperto troppe conversazioni. Riprova più tardi.");
    await limit(db, "widget-day:" + company.id, Number(env.LINEA_WIDGET_DAILY_SESSIONS || 1000), 86400, "La chat ha raggiunto il limite di oggi. Riprova domani.");
    const cfg = await conversationConfig(db, company);
    const access = token();
    await db.pool.query(
      `INSERT INTO conversations(id, company_id, access_hash, state, config, created_at, updated_at, expires, kind, owner_user_id)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb,NOW(),NOW(),$6,'real',NULL)`,
      [token(), company.id, hash(access), JSON.stringify(initialState()), JSON.stringify(cfg), Date.now() / 1000 + 86400]
    );
    return json({ session: access, name: cfg.agent?.branding?.assistant_name || cfg.name, greeting: greeting(cfg) }, 201);
  }

  if (path === "/api/widget-settings" && (method === "GET" || method === "POST")) {
    const user = await auth(db, request);
    if (!user) fail(401, "Accedi al tuo account per continuare.");
    if (await blocked(db, user.company_id)) fail(403, "Accesso aziendale non disponibile.");
    const company = (await db.pool.query("SELECT id, public_id FROM companies WHERE id=$1", [user.company_id])).rows[0];
    if (!company) fail(404, "Azienda non trovata.");
    let s = await settings(db, company.id);
    if (method === "POST") {
      // I siti del widget li configura solo il gestore di MoreAI
      // (dalla visita alla dashboard o dal pannello del gestore).
      if (!user.viewer) fail(403, "I siti del widget vengono configurati dal team MoreAI. Per aggiungerne uno scrivici dalla pagina Supporto.");
      const body = await readBody(request);
      if (!Array.isArray(body.origins) || body.origins.length > MAX_ORIGINS * 2) fail(400, "Controlla i siti indicati.");
      const origins = [];
      for (const item of body.origins) {
        if (typeof item !== "string" || !item.trim()) continue;
        const origin = normalizeOrigin(item);
        if (!origin) fail(400, "Indirizzo non valido: " + String(item).slice(0, 80));
        if (!origins.includes(origin)) origins.push(origin);
      }
      if (origins.length > MAX_ORIGINS) fail(400, `Puoi indicare al massimo ${MAX_ORIGINS} siti.`);
      const enabled = body.enabled !== false;
      await db.pool.query(
        `INSERT INTO widget_settings(company_id, enabled, allowed_origins, updated_at) VALUES($1,$2,$3::jsonb,NOW())
         ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled, allowed_origins=EXCLUDED.allowed_origins, updated_at=NOW()`,
        [company.id, enabled, JSON.stringify(origins)]
      );
      s = { enabled, origins };
    }
    const research = (await db.pool.query("SELECT status FROM company_knowledge WHERE company_id=$1", [company.id])).rows[0];
    const base = siteOrigin(request, env);
    return json({
      enabled: s.enabled,
      origins: s.origins,
      research_status: research?.status || null,
      plan: await effectivePlan(db, company.id),
      active_plan: await widgetAllowed(db, company.id),
      can_edit: Boolean(user.viewer),
      snippet: `<script src="${base}/moreai-widget.js" data-company="${company.public_id}" defer></script>`
    });
  }

  return null;
}
