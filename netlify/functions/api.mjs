import { getDatabase } from "@netlify/database";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "linea_session";

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function token() {
  return randomBytes(32).toString("base64url");
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function defaultConfig(name) {
  return {
    name,
    sector: "Generale",
    recipient: "personale dell’azienda",
    knowledge: "",
    region: "IT",
    confirmation_email: false,
    fields: [
      { key: "nome", label: "Nome e cognome", required: true, kind: "text" },
      { key: "telefono", label: "Telefono", required: true, kind: "phone" },
      { key: "email", label: "Email", required: false, kind: "email" },
      { key: "interesse", label: "Prodotto, servizio o esigenza", required: true, kind: "text" },
      { key: "tempistica", label: "Preferenza per essere contattati", required: true, kind: "text" }
    ]
  };
}

async function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, Buffer.from(salt, "hex"), 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return `${salt}:${derived.toString("hex")}`;
}

async function passwordMatches(password, stored) {
  if (typeof stored !== "string") return false;

  const parts = stored.split(":");
  if (parts.length !== 2 || !/^[0-9a-f]{32}$/i.test(parts[0]) || !/^[0-9a-f]{128}$/i.test(parts[1])) {
    return false;
  }

  const candidate = await passwordHash(password, parts[0]);
  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);

  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return "";
}

function sessionCookie(value, { clear = false, remember = false } = {}) {
  let cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict`;

  if (clear) cookie += "; Max-Age=0";
  else if (remember) cookie += "; Max-Age=2592000";

  return cookie;
}

async function requestBody(request) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();

  if (type !== "application/json") {
    throw new Error("Formato non valido.");
  }

  const raw = await request.text();

  if (!raw || Buffer.byteLength(raw, "utf8") > 32000) {
    throw new Error("Richiesta troppo grande.");
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("Richiesta non valida.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Formato non valido.");
  }

  return body;
}

function text(body, key, maximum = 200, required = true) {
  const value = body[key] ?? "";

  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (required && !value.trim())
  ) {
    throw new Error("Controlla i campi richiesti.");
  }

  return value.trim();
}

async function createSession(client, userId, remember = false) {
  const value = token();
  const expires =
    Date.now() / 1000 + (remember ? 30 * 86400 : 8 * 3600);

  await client.query(
    "DELETE FROM auth_sessions WHERE expires < $1",
    [Date.now() / 1000]
  );

  await client.query(
    "INSERT INTO auth_sessions(hash,user_id,expires) VALUES ($1,$2,$3)",
    [digest(value), userId, expires]
  );

  return value;
}

async function principal(db, request) {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return null;

  const result = await db.pool.query(
    `SELECT u.id,u.company_id,u.email
       FROM auth_sessions s
       JOIN users u ON s.user_id=u.id
      WHERE s.hash=$1 AND s.expires>$2`,
    [digest(value), Date.now() / 1000]
  );

  return result.rows[0] || null;
}

async function emailVerified(db, userId) {
  const result = await db.pool.query(
    "SELECT verified_at FROM email_verification WHERE user_id=$1",
    [userId]
  );

  return Boolean(result.rows[0]?.verified_at);
}

async function register(db, body) {
  const email = text(body, "email").toLowerCase();
  const password = text(body, "password", 256);
  const companyName = text(body, "company", 120);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new Error("Email non valida.");
  }

  if (password.length < 12) {
    throw new Error("Scegli una password di almeno 12 caratteri.");
  }

  if (body.terms !== true || body.privacy !== true) {
    throw new Error(
      "Accetta i termini e conferma di aver letto l’informativa privacy."
    );
  }

  if (body.password_confirm !== password) {
    throw new Error("Le password non coincidono.");
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT 1 FROM users WHERE email=$1",
      [email]
    );

    if (existing.rowCount) {
      throw new Error(
        "Registrazione non disponibile con questi dati. Prova ad accedere."
      );
    }

    const companyId = token();
    const userId = token();
    const publicId = token();
    const encodedPassword = await passwordHash(password);

    await client.query(
      `INSERT INTO companies(id,public_id,config,created_at)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [
        companyId,
        publicId,
        JSON.stringify(defaultConfig(companyName)),
        new Date().toISOString()
      ]
    );

    await client.query(
      "INSERT INTO company_management(company_id) VALUES ($1)",
      [companyId]
    );

    await client.query(
      "INSERT INTO users(id,company_id,email,password) VALUES ($1,$2,$3,$4)",
      [userId, companyId, email, encodedPassword]
    );

    await client.query(
      `INSERT INTO registration_consents
       (user_id,terms_version,privacy_version,marketing_analysis,recorded_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        userId,
        "local-2026-09-19",
        "local-2026-09-19",
        body.marketing === true,
        new Date().toISOString()
      ]
    );

    const session = await createSession(client, userId, false);

    await client.query("COMMIT");

    return { session, userId };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error?.code === "23505") {
      throw new Error(
        "Registrazione non disponibile con questi dati. Prova ad accedere."
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function login(db, body) {
  const email = text(body, "email").toLowerCase();
  const password = text(body, "password", 256);

  if (password.length > 256) {
    throw new Error("Email o password non corrette.");
  }

  const result = await db.pool.query(
    "SELECT id,password FROM users WHERE email=$1",
    [email]
  );

  const user = result.rows[0];

  if (!user || !(await passwordMatches(password, user.password))) {
    throw new Error("Email o password non corrette.");
  }

  const remember = body.remember === true;
  const client = await db.pool.connect();

  try {
    return {
      session: await createSession(client, user.id, remember),
      userId: user.id,
      remember
    };
  } finally {
    client.release();
  }
}

export default async (request) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  try {
    const db = getDatabase();

    if (path === "/api/health" && method === "GET") {
      await db.pool.query("SELECT 1");

      return json({
        ok: true,
        service: "linea-ai",
        database: "connected"
      });
    }

    if (path === "/api/register" && method === "POST") {
      const body = await requestBody(request);
      const result = await register(db, body);

      return json(
        { ok: true, redirect: "/account.html" },
        200,
        { "Set-Cookie": sessionCookie(result.session) }
      );
    }

    if (path === "/api/login" && method === "POST") {
      const body = await requestBody(request);
      const result = await login(db, body);
      const verified = await emailVerified(db, result.userId);

      return json(
        {
          ok: true,
          redirect: verified ? "/#contatti" : "/account.html"
        },
        200,
        {
          "Set-Cookie": sessionCookie(result.session, {
            remember: result.remember
          })
        }
      );
    }

    if (path === "/api/logout" && method === "POST") {
      const value = readCookie(request, SESSION_COOKIE);

      if (value) {
        await db.pool.query(
          "DELETE FROM auth_sessions WHERE hash=$1",
          [digest(value)]
        );
      }

      return json(
        { ok: true },
        200,
        { "Set-Cookie": sessionCookie("", { clear: true }) }
      );
    }

    if (path === "/api/me" && method === "GET") {
      const user = await principal(db, request);

      if (!user) {
        return json(
          { error: "Accedi al tuo account per continuare." },
          401
        );
      }

      const companyResult = await db.pool.query(
        "SELECT id,public_id,config FROM companies WHERE id=$1",
        [user.company_id]
      );

      const company = companyResult.rows[0];

      if (!company) {
        return json({ error: "Risorsa non disponibile." }, 404);
      }

      return json({
        email: user.email,
        company: {
          id: company.id,
          public_id: company.public_id,
          config: company.config
        },
        email_verified: await emailVerified(db, user.id)
      });
    }

    return json({ error: "Operazione non disponibile." }, 404);
  } catch (error) {
    console.error("Linea AI API error:", error);

    const knownMessages = new Set([
      "Formato non valido.",
      "Richiesta troppo grande.",
      "Richiesta non valida.",
      "Controlla i campi richiesti.",
      "Email non valida.",
      "Scegli una password di almeno 12 caratteri.",
      "Accetta i termini e conferma di aver letto l’informativa privacy.",
      "Le password non coincidono.",
      "Registrazione non disponibile con questi dati. Prova ad accedere.",
      "Email o password non corrette."
    ]);

    if (knownMessages.has(error?.message)) {
      return json({ error: error.message }, 400);
    }

    return json(
      {
        error:
          "Al momento non riesco a registrare la richiesta. Riprova tra poco."
      },
      503
    );
  }
};

export const config = {
  path: "/api/*"
};
