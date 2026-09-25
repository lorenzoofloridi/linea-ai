import { chatApi } from "../lib/chat-api.mjs";
import { ready as aiReady } from "../lib/online-ai.mjs";
import { internalRequestHeaders } from "../lib/internal-auth.mjs";
import { requestPasswordReset, completePasswordReset } from "../lib/password-reset.mjs";
import { PLAN_MONTHLY_MESSAGES } from "../lib/ai-quota.mjs";
import { getDatabase } from "../lib/db.mjs";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "linea_session";

const PLANS = {
  demo: {
    name: "Demo",
    trial_days: 7,
    monthly_cents: 0,
    available: true
  },
  base: {
    name: "Piano Base",
    trial_days: 14,
    monthly_cents: 29900,
    available: true
  },
  plus: {
    name: "Piano Plus",
    trial_days: 14,
    monthly_cents: 59900,
    available: true
  },
  advanced: {
    name: "Piano Advanced",
    trial_days: 14,
    monthly_cents: 99900,
    available: true
  }
};

const PLAN_DISCOUNT = 15;
const GRACE_DAYS = 7;

const PROFILE_FIELDS = {
  legal_name: "Ragione sociale",
  vat: "Partita IVA / identificativo fiscale",
  website: "Sito ufficiale",
  business_email: "Email aziendale",
  business_phone: "Telefono aziendale",
  contact_name: "Nome e cognome del referente",
  contact_role: "Ruolo del referente",
  address: "Sede legale",
  city: "Città",
  postal_code: "CAP",
  country: "Paese (codice, es. IT)"
};

const FEATURES = [
  "dashboard",
  "conversations",
  "leads",
  "export",
  "booking",
  "crm",
  "voice",
  "handoff",
  "whatsapp"
];

const PLAN_ENTITLEMENTS = Object.fromEntries(
  ["demo", "base", "plus", "advanced"].map(plan => [
    plan,
    Object.fromEntries(
      FEATURES.map(feature => [feature, true])
    )
  ])
);

const PAYMENT_METHODS = {
  card: [
    "Carta — Visa, Mastercard, American Express",
    true
  ],
  apple_pay: ["Apple Pay", true],
  google_pay: ["Google Pay", true],
  sepa: ["Addebito SEPA", true],
  paypal: ["PayPal", true],
  revolut_pay: ["Revolut Pay", true],
  bank_transfer: ["Bonifico bancario manuale", false]
};

function planAmount(code, period) {
  const plan = PLANS[code];

  if (
    !plan ||
    !plan.available ||
    !["monthly", "annual"].includes(period)
  ) {
    throw new Error(
      "Piano o periodo non disponibile."
    );
  }

  return period === "monthly"
    ? plan.monthly_cents
    : Math.floor(
        plan.monthly_cents *
          12 *
          (100 - PLAN_DISCOUNT) /
          100
      );
}

// Catalogo pubblico: i prezzi NON escono dal server finché l'utente non ha
// fatto il login (decisione di prodotto). Restano visibili nome, disponibilità
// e messaggi AI inclusi (stessa fonte usata per applicare le quote).
function publicPlanCatalogue() {
  return {
    authenticated: false,
    discount: PLAN_DISCOUNT,
    plans: Object.entries(PLANS).map(
      ([code, plan]) => ({
        code,
        name: plan.name,
        trial_days: plan.trial_days,
        available: plan.available,
        messages: PLAN_MONTHLY_MESSAGES[code]
      })
    )
  };
}

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
  return createHash("sha256")
    .update(value)
    .digest("hex");
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
      {
        key: "nome",
        label: "Nome e cognome",
        required: true,
        kind: "text"
      },
      {
        key: "telefono",
        label: "Telefono",
        required: true,
        kind: "phone"
      },
      {
        key: "email",
        label: "Email",
        required: false,
        kind: "email"
      },
      {
        key: "interesse",
        label: "Prodotto, servizio o esigenza",
        required: true,
        kind: "text"
      },
      {
        key: "tempistica",
        label: "Preferenza per essere contattati",
        required: true,
        kind: "text"
      }
    ]
  };
}

async function passwordHash(
  password,
  salt = randomBytes(16).toString("hex")
) {
  const derived = await scrypt(
    password,
    Buffer.from(salt, "hex"),
    64,
    {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    }
  );

  return `${salt}:${derived.toString("hex")}`;
}

async function passwordMatches(password, stored) {
  if (typeof stored !== "string") {
    return false;
  }

  const parts = stored.split(":");

  if (
    parts.length !== 2 ||
    !/^[0-9a-f]{32}$/i.test(parts[0]) ||
    !/^[0-9a-f]{128}$/i.test(parts[1])
  ) {
    return false;
  }

  const candidate = await passwordHash(
    password,
    parts[0]
  );

  const a = Buffer.from(candidate);
  const b = Buffer.from(stored);

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

function readCookie(request, name) {
  const raw =
    request.headers.get("cookie") || "";

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      part.slice(0, index).trim();

    if (key === name) {
      return decodeURIComponent(
        part.slice(index + 1).trim()
      );
    }
  }

  return "";
}

function sessionCookie(
  value,
  {
    clear = false,
    remember = false
  } = {}
) {
  let cookie =
    `${SESSION_COOKIE}=${encodeURIComponent(value)}` +
    "; Path=/; HttpOnly; Secure; SameSite=Strict";

  if (clear) {
    cookie += "; Max-Age=0";
  } else if (remember) {
    cookie += "; Max-Age=2592000";
  }

  return cookie;
}

async function requestBody(request) {
  const type =
    (
      request.headers.get(
        "content-type"
      ) || ""
    )
      .split(";")[0]
      .trim();

  if (type !== "application/json") {
    throw new Error(
      "Formato non valido."
    );
  }

  const raw =
    await request.text();

  if (
    !raw ||
    Buffer.byteLength(
      raw,
      "utf8"
    ) > 32000
  ) {
    throw new Error(
      "Richiesta troppo grande."
    );
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(
      "Richiesta non valida."
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new Error(
      "Formato non valido."
    );
  }

  return body;
}

function text(
  body,
  key,
  maximum = 200,
  required = true
) {
  const value =
    body[key] ?? "";

  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (
      required &&
      !value.trim()
    )
  ) {
    throw new Error(
      "Controlla i campi richiesti."
    );
  }

  return value.trim();
}

async function createSession(
  client,
  userId,
  remember = false
) {
  const value = token();

  const expires =
    Date.now() / 1000 +
    (
      remember
        ? 30 * 86400
        : 8 * 3600
    );

  await client.query(
    "DELETE FROM auth_sessions WHERE expires < $1",
    [Date.now() / 1000]
  );

  await client.query(
    `INSERT INTO auth_sessions(hash,user_id,expires)
     VALUES ($1,$2,$3)`,
    [
      digest(value),
      userId,
      expires
    ]
  );

  return value;
}

async function principal(
  db,
  request
) {
  const value =
    readCookie(
      request,
      SESSION_COOKIE
    );

  if (!value) {
    return null;
  }

  const result =
    await db.pool.query(
      `SELECT u.id,u.company_id,u.email
         FROM auth_sessions s
         JOIN users u ON s.user_id=u.id
        WHERE s.hash=$1
          AND s.expires>$2`,
      [
        digest(value),
        Date.now() / 1000
      ]
    );

  return result.rows[0] || null;
}

async function emailVerified(
  db,
  userId
) {
  const result =
    await db.pool.query(
      `SELECT verified_at
         FROM email_verification
        WHERE user_id=$1`,
      [userId]
    );

  return Boolean(
    result.rows[0]?.verified_at
  );
}

async function requestEmailVerification(
  db,
  user,
  baseUrl,
  plan = null
) {
  if (
    await emailVerified(
      db,
      user.id
    )
  ) {
    return;
  }

  const resendApiKey =
    process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error(
      "Servizio email non configurato."
    );
  }

  const requestedPlan =
    plan === "demo"
      ? "demo"
      : null;

  const value = token();
  const tokenHash = digest(value);

  const expires =
    Date.now() / 1000 +
    86400;

  const eventKey =
    `verify:${tokenHash}`;

  const subject =
    "Verifica la tua email — Linea AI";

  const verificationUrl =
    requestedPlan === "demo"
      ? `${baseUrl}/verifica-email.html?plan=demo#${value}`
      : `${baseUrl}/verifica-email.html#${value}`;

  const body =
    "Conferma il tuo indirizzo aprendo questo link entro 24 ore:\n" +
    verificationUrl +
    "\nSe non hai creato un account, ignora il messaggio.";

  const html =
    "<p>Conferma il tuo indirizzo aprendo questo link entro 24 ore:</p>" +
    `<p><a href="${verificationUrl}">Verifica il tuo indirizzo email</a></p>` +
    "<p>Se non hai creato un account, ignora il messaggio.</p>";

  const outboxId = token();

  const client =
    await db.pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `DELETE FROM email_verification_tokens
        WHERE user_id=$1`,
      [user.id]
    );

    await client.query(
      `INSERT INTO email_verification_tokens
       (hash,user_id,expires)
       VALUES ($1,$2,$3)`,
      [
        tokenHash,
        user.id,
        expires
      ]
    );

    await client.query(
      `INSERT INTO email_outbox
       (
         id,
         company_id,
         event_key,
         recipient,
         subject,
         body,
         status,
         created_at,
         error
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        outboxId,
        user.company_id,
        eventKey,
        user.email,
        subject,
        body,
        "pending",
        new Date().toISOString(),
        null
      ]
    );

    await client.query(
      `INSERT INTO email_details
       (id,html,mode)
       VALUES ($1,$2,$3)`,
      [
        outboxId,
        html,
        "resend"
      ]
    );

    await client.query(
      "COMMIT"
    );
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }

  try {
    await db.pool.query(
      `UPDATE email_outbox
          SET status=$1,
              error=NULL
        WHERE id=$2`,
      [
        "sending",
        outboxId
      ]
    );

    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${resendApiKey}`,

            "Content-Type":
              "application/json",

            "Idempotency-Key":
              eventKey
          },

          body: JSON.stringify({
            from:
              "Linea AI <noreply@linea-ai.it>",

            to: [
              user.email
            ],

            subject,

            text: body,

            html
          })
        }
      );

    let result = {};

    try {
      result =
        await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      const message =
        typeof result?.message ===
        "string"
          ? result.message
          : "Invio email non riuscito.";

      await db.pool.query(
        `UPDATE email_outbox
            SET status=$1,
                error=$2
          WHERE id=$3`,
        [
          "uncertain",
          message.slice(
            0,
            1000
          ),
          outboxId
        ]
      );

      // Il dettaglio di Resend resta in email_outbox.error;
      // nei log solo lo stato HTTP (nessun indirizzo o contenuto).
      console.error(
        "Resend request failed:",
        response.status
      );

      throw new Error(
        "Invio email non riuscito."
      );
    }

    await db.pool.query(
      `UPDATE email_outbox
          SET status=$1,
              error=NULL
        WHERE id=$2`,
      [
        "sent",
        outboxId
      ]
    );

    return result;
  } catch (error) {
    await db.pool.query(
      `UPDATE email_outbox
          SET status=$1,
              error=COALESCE(error,$2)
        WHERE id=$3
          AND status<>$4`,
      [
        "uncertain",
        String(
          error?.message ||
          "Invio email non riuscito."
        ).slice(
          0,
          1000
        ),
        outboxId,
        "sent"
      ]
    );

    throw error;
  }
}

async function verifyEmailToken(
  db,
  value
) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 200
  ) {
    throw new Error(
      "Token di verifica non valido o scaduto."
    );
  }

  const client =
    await db.pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const result =
      await client.query(
        `SELECT user_id
           FROM email_verification_tokens
          WHERE hash=$1
            AND expires>$2
          FOR UPDATE`,
      [
        digest(value),
        Date.now() / 1000
      ]
    );

    const row =
      result.rows[0];

    if (!row) {
      throw new Error(
        "Token di verifica non valido o scaduto."
      );
    }

    await client.query(
      `INSERT INTO email_verification
       (user_id,verified_at)
       VALUES ($1,$2)
       ON CONFLICT (user_id)
       DO UPDATE SET
         verified_at=EXCLUDED.verified_at`,
      [
        row.user_id,
        new Date().toISOString()
      ]
    );

    await client.query(
      `DELETE FROM email_verification_tokens
        WHERE user_id=$1`,
      [row.user_id]
    );

    await client.query(
      "COMMIT"
    );
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}

async function companyVerificationStatus(
  db,
  companyId
) {
  const result =
    await db.pool.query(
      `SELECT status
         FROM company_verification
        WHERE company_id=$1`,
      [companyId]
    );

  return (
    result.rows[0]?.status ||
    "pending"
  );
}

async function companyVerificationHistory(
  db,
  companyId
) {
  const result =
    await db.pool.query(
      `SELECT
         actor,
         previous,
         status,
         reason,
         created_at
       FROM company_verification_audit
       WHERE company_id=$1
       ORDER BY id`,
      [companyId]
    );

  return result.rows;
}

async function planEntitlements(
  db,
  companyId,
  stamp = Date.now() / 1000
) {
  const companyStatus =
    await companyVerificationStatus(
      db,
      companyId
    );

  if (
    [
      "suspended",
      "rejected"
    ].includes(
      companyStatus
    )
  ) {
    return {};
  }

  const subscriptionResult =
    await db.pool.query(
      `SELECT *
         FROM plan_subscriptions
        WHERE company_id=$1`,
      [companyId]
    );

  const subscription =
    subscriptionResult.rows[0] ||
    null;

  const demoResult =
    await db.pool.query(
      `SELECT 1
         FROM plan_demo_usage
        WHERE company_id=$1
          AND ends>$2`,
      [
        companyId,
        stamp
      ]
    );

  const demoActive =
    Boolean(
      demoResult.rows[0]
    );

  const subscriptionActive =
    Boolean(
      subscription &&
      (
        (
          [
            "trial",
            "active"
          ].includes(
            subscription.status
          ) &&
          Number(
            subscription.period_end
          ) > stamp
        ) ||
        (
          subscription.status ===
            "past_due" &&
          Number(
            subscription.grace_until ||
            0
          ) > stamp
        )
      )
    );

  const plan =
    subscriptionActive
      ? subscription.plan
      : demoActive &&
          !subscription
        ? "demo"
        : null;

  return plan
    ? {
        ...PLAN_ENTITLEMENTS[
          plan
        ]
      }
    : {};
}

async function planState(
  db,
  user
) {
  const stamp =
    Date.now() / 1000;

  const [
    demoResult,
    profileResult,
    subscriptionResult,
    eventsResult,
    knowledgeResult
  ] = await Promise.all([
    db.pool.query(
      `SELECT *
         FROM plan_demo_usage
        WHERE email=$1`,
      [user.email]
    ),

    db.pool.query(
      `SELECT data,status
         FROM plan_profiles
        WHERE company_id=$1`,
      [user.company_id]
    ),

    db.pool.query(
      `SELECT *
         FROM plan_subscriptions
        WHERE company_id=$1`,
      [user.company_id]
    ),

    db.pool.query(
      `SELECT
         id,
         actor,
         action,
         outcome,
         amount_cents,
         created
       FROM plan_events
       WHERE company_id=$1
       ORDER BY created DESC`,
      [user.company_id]
    ),

    db.pool.query(
      `SELECT
         status,
         started_at,
         completed_at
       FROM company_knowledge
       WHERE company_id=$1`,
      [user.company_id]
    )
  ]);

  const profile =
    profileResult.rows[0] ||
    null;

  const research =
    knowledgeResult.rows[0] ||
    null;

  return {
    demo:
      demoResult.rows[0] ||
      null,

    profile:
      profile
        ? {
            data:
              profile.data,
            status:
              profile.status
          }
        : null,

    research:
      research
        ? {
            status:
              research.status,
            started_at:
              research.started_at,
            completed_at:
              research.completed_at
          }
        : null,

    subscription:
      subscriptionResult.rows[0] ||
      null,

    company_status:
      await companyVerificationStatus(
        db,
        user.company_id
      ),

    events:
      eventsResult.rows,

    mode:
      "mock",

    entitlements:
      await planEntitlements(
        db,
        user.company_id,
        stamp
      ),

    grace_days:
      GRACE_DAYS,

    fields:
      PROFILE_FIELDS,

    methods:
      Object.entries(
        PAYMENT_METHODS
      ).map(
        (
          [
            code,
            [
              label,
              recurring
            ]
          ]
        ) => ({
          code,
          label,
          recurring
        })
      )
  };
}

async function register(
  db,
  body
) {
  const email =
    text(
      body,
      "email"
    ).toLowerCase();

  const password =
    text(
      body,
      "password",
      256
    );

  const companyName =
    text(
      body,
      "company",
      120
    );

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    ) ||
    email.length > 200
  ) {
    throw new Error(
      "Email non valida."
    );
  }

  if (
    password.length < 12
  ) {
    throw new Error(
      "Scegli una password di almeno 12 caratteri."
    );
  }

  if (
    body.terms !== true ||
    body.privacy !== true
  ) {
    throw new Error(
      "Accetta i termini e conferma di aver letto l’informativa privacy."
    );
  }

  if (
    body.password_confirm !==
    password
  ) {
    throw new Error(
      "Le password non coincidono."
    );
  }

  const client =
    await db.pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const existing =
      await client.query(
        `SELECT 1
           FROM users
          WHERE email=$1`,
        [email]
      );

    if (
      existing.rowCount
    ) {
      throw new Error(
        "Registrazione non disponibile con questi dati. Prova ad accedere."
      );
    }

    const companyId =
      token();

    const userId =
      token();

    const publicId =
      token();

    const encodedPassword =
      await passwordHash(
        password
      );

    await client.query(
      `INSERT INTO companies
       (id,public_id,config,created_at)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [
        companyId,
        publicId,
        JSON.stringify(
          defaultConfig(
            companyName
          )
        ),
        new Date().toISOString()
      ]
    );

    await client.query(
      `INSERT INTO company_management
       (company_id)
       VALUES ($1)`,
      [companyId]
    );

    await client.query(
      `INSERT INTO users
       (id,company_id,email,password)
       VALUES ($1,$2,$3,$4)`,
      [
        userId,
        companyId,
        email,
        encodedPassword
      ]
    );

    await client.query(
      `INSERT INTO registration_consents
       (
         user_id,
         terms_version,
         privacy_version,
         marketing_analysis,
         recorded_at
       )
       VALUES ($1,$2,$3,$4,$5)`,
      [
        userId,
        "local-2026-09-19",
        "local-2026-09-19",
        body.marketing ===
          true,
        new Date().toISOString()
      ]
    );

    const session =
      await createSession(
        client,
        userId,
        false
      );

    await client.query(
      "COMMIT"
    );

    return {
      session,
      userId
    };
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    if (
      error?.code ===
      "23505"
    ) {
      throw new Error(
        "Registrazione non disponibile con questi dati. Prova ad accedere."
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

async function login(
  db,
  body
) {
  const email =
    text(
      body,
      "email"
    ).toLowerCase();

  const password =
    text(
      body,
      "password",
      256
    );

  if (
    password.length > 256
  ) {
    throw new Error(
      "Email o password non corrette."
    );
  }

  const result =
    await db.pool.query(
      `SELECT id,password
         FROM users
        WHERE email=$1`,
      [email]
    );

  const user =
    result.rows[0];

  if (
    !user ||
    !(
      await passwordMatches(
        password,
        user.password
      )
    )
  ) {
    throw new Error(
      "Email o password non corrette."
    );
  }

  const remember =
    body.remember === true;

  const client =
    await db.pool.connect();

  try {
    return {
      session:
        await createSession(
          client,
          user.id,
          remember
        ),

      userId:
        user.id,

      remember
    };
  } finally {
    client.release();
  }
}

export default async (
  request,
  context = {}
) => {
  const url =
    new URL(
      request.url
    );

  const path =
    url.pathname;

  const method =
    request.method.toUpperCase();

  try {
    const db =
      getDatabase();

    if (
      path === "/api/health" &&
      method === "GET"
    ) {
      await db.pool.query(
        "SELECT 1"
      );

      return json({
        ok: true,
        service: "linea-ai",
        database: "connected",
        model_ready: aiReady(),
        ai_online: true
      });
    }

    if (
      path === "/api/register" &&
      method === "POST"
    ) {
      const body =
        await requestBody(
          request
        );

      const result =
        await register(
          db,
          body
        );

      return json(
        {
          ok: true,
          redirect:
            "/account.html"
        },
        200,
        {
          "Set-Cookie":
            sessionCookie(
              result.session
            )
        }
      );
    }

    if (
      path === "/api/login" &&
      method === "POST"
    ) {
      const body =
        await requestBody(
          request
        );

      const result =
        await login(
          db,
          body
        );

      const verified =
        await emailVerified(
          db,
          result.userId
        );

      return json(
        {
          ok: true,

          redirect:
            verified
              ? "/dashboard.html"
              : "/account.html"
        },
        200,
        {
          "Set-Cookie":
            sessionCookie(
              result.session,
              {
                remember:
                  result.remember
              }
            )
        }
      );
    }

    if (
      path === "/api/logout" &&
      method === "POST"
    ) {
      const value =
        readCookie(
          request,
          SESSION_COOKIE
        );

      if (value) {
        await db.pool.query(
          `DELETE FROM auth_sessions
            WHERE hash=$1`,
          [
            digest(value)
          ]
        );
      }

      return json(
        {
          ok: true
        },
        200,
        {
          "Set-Cookie":
            sessionCookie(
              "",
              {
                clear: true
              }
            )
        }
      );
    }

    if (
      path === "/api/password-request" &&
      method === "POST"
    ) {
      return json(
        await requestPasswordReset(
          db,
          await requestBody(request),
          {
            ip: context.ip,
            baseUrl:
              process.env.PUBLIC_SITE_URL ||
              url.origin
          }
        )
      );
    }

    if (
      path === "/api/password-reset" &&
      method === "POST"
    ) {
      return json(
        await completePasswordReset(
          db,
          await requestBody(request),
          {
            ip: context.ip,
            hashPassword: passwordHash
          }
        ),
        200,
        {
          "Set-Cookie":
            sessionCookie("", { clear: true })
        }
      );
    }

    if (
      path === "/api/me" &&
      method === "GET"
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          {
            error:
              "Accedi al tuo account per continuare."
          },
          401
        );
      }

      const companyResult =
        await db.pool.query(
          `SELECT id,public_id,config
             FROM companies
            WHERE id=$1`,
          [
            user.company_id
          ]
        );

      const company =
        companyResult.rows[0];

      if (!company) {
        return json(
          {
            error:
              "Risorsa non disponibile."
          },
          404
        );
      }

      return json({
        email:
          user.email,

        company: {
          id:
            company.id,

          public_id:
            company.public_id,

          config:
            company.config
        },

        email_verified:
          await emailVerified(
            db,
            user.id
          )
      });
    }

    if (
      path ===
        "/api/email-verification" &&
      [
        "GET",
        "POST"
      ].includes(
        method
      )
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          {
            error:
              "Accedi al tuo account per continuare."
          },
          401
        );
      }

      if (
        method === "POST" &&
        !(
          await emailVerified(
            db,
            user.id
          )
        )
      ) {
        const body =
          await requestBody(
            request
          );

        const requestedPlan =
          body.plan === "demo"
            ? "demo"
            : null;

        const emailBaseUrl =
          process.env.PUBLIC_SITE_URL ||
          url.origin;

        await requestEmailVerification(
          db,
          user,
          emailBaseUrl,
          requestedPlan
        );
      }

      return json({
        verified:
          await emailVerified(
            db,
            user.id
          )
      });
    }

    if (
      path ===
        "/api/email-verify" &&
      method === "POST"
    ) {
      const body =
        await requestBody(
          request
        );

      const verificationToken =
        text(
          body,
          "token",
          200
        );

      await verifyEmailToken(
        db,
        verificationToken
      );

      return json({
        message:
          "Email verificata."
      });
    }

    if (
      path === "/api/plans" &&
      method === "GET"
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          publicPlanCatalogue()
        );
      }

      const current =
        await planState(
          db,
          user
        );

      const cards = [];

      for (
        const [
          code,
          plan
        ]
        of Object.entries(
          PLANS
        )
      ) {
        if (
          code === "demo" &&
          current.demo
        ) {
          continue;
        }

        const annualCents =
          plan.available
            ? planAmount(
                code,
                "annual"
              )
            : null;

        cards.push({
          code,
          ...plan,
          messages:
            PLAN_MONTHLY_MESSAGES[code],

          annual_cents:
            annualCents,

          annual_monthly_cents:
            annualCents === null
              ? null
              : Math.floor(
                  annualCents /
                  12
                )
        });
      }

      return json({
        authenticated:
          true,

        plans:
          cards,

        discount:
          PLAN_DISCOUNT,

        ...current
      });
    }

    if (
      path ===
        "/api/company-verification" &&
      method === "GET"
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          {
            error:
              "Accedi al tuo account per continuare."
          },
          401
        );
      }

      return json({
        status:
          await companyVerificationStatus(
            db,
            user.company_id
          ),

        history:
          await companyVerificationHistory(
            db,
            user.company_id
          )
      });
    }

    if (
      path ===
        "/api/plan-demo" &&
      method === "POST"
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          {
            error:
              "Accedi al tuo account per continuare."
          },
          401
        );
      }

      if (
        !(
          await emailVerified(
            db,
            user.id
          )
        )
      ) {
        return json(
          {
            error:
              "Verifica prima il tuo indirizzo email."
          },
          403
        );
      }

      const existing =
        await db.pool.query(
          `SELECT 1
             FROM plan_demo_usage
            WHERE email=$1
               OR company_id=$2`,
          [
            user.email,
            user.company_id
          ]
        );

      if (
        existing.rowCount
      ) {
        return json(
          {
            error:
              "La Demo 7 giorni è già stata utilizzata per questo account o azienda."
          },
          409
        );
      }

      const started =
        Date.now() / 1000;

      const ends =
        started +
        7 * 24 * 60 * 60;

      try {
        await db.pool.query(
          `INSERT INTO plan_demo_usage
           (email,company_id,started,ends)
           VALUES ($1,$2,$3,$4)`,
          [
            user.email,
            user.company_id,
            started,
            ends
          ]
        );
      } catch (error) {
        if (
          error?.code ===
          "23505"
        ) {
          return json(
            {
              error:
                "La Demo 7 giorni è già stata utilizzata per questo account o azienda."
            },
            409
          );
        }

        throw error;
      }

      return json({
        ok: true,
        started,
        ends,
        redirect:
          "/dashboard.html"
      });
    }

    if (
      path ===
        "/api/plan-state" &&
      method === "GET"
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          {
            error:
              "Accedi al tuo account per continuare."
          },
          401
        );
      }

      return json(
        await planState(
          db,
          user
        )
      );
    }

    if (
      path === "/api/plan-profile" &&
      method === "POST"
    ) {
      const user =
        await principal(
          db,
          request
        );

      if (!user) {
        return json(
          {
            error:
              "Accedi al tuo account per continuare."
          },
          401
        );
      }

      if (
        !(
          await emailVerified(
            db,
            user.id
          )
        )
      ) {
        return json(
          {
            error:
              "Verifica prima il tuo indirizzo email."
          },
          403
        );
      }

      const body =
        await requestBody(
          request
        );

      const expectedKeys =
        Object.keys(
          PROFILE_FIELDS
        );

      const receivedKeys =
        Object.keys(
          body
        );

      if (
        receivedKeys.length !==
          expectedKeys.length ||
        !expectedKeys.every(
          key =>
            Object.prototype.hasOwnProperty.call(
              body,
              key
            )
        )
      ) {
        return json(
          {
            error:
              "Compila tutti i dati aziendali richiesti."
          },
          400
        );
      }

      const profile = {};

      for (
        const [
          key,
          label
        ] of Object.entries(
          PROFILE_FIELDS
        )
      ) {
        const value =
          body[key];

        if (
          typeof value !== "string" ||
          !value.trim() ||
          value.trim().length > 250
        ) {
          return json(
            {
              error:
                "Controlla: " +
                label
            },
            400
          );
        }

        profile[key] =
          value.trim();
      }

      try {
        const website =
          new URL(
            profile.website
          );

        if (
          ![
            "http:",
            "https:"
          ].includes(
            website.protocol
          ) ||
          !website.hostname ||
          website.username ||
          website.password
        ) {
          throw new Error(
            "Sito non valido."
          );
        }
      } catch {
        return json(
          {
            error:
              "Indica un sito completo, ad esempio https://azienda.it."
          },
          400
        );
      }

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          profile.business_email
        )
      ) {
        return json(
          {
            error:
              "Controlla l’email aziendale."
          },
          400
        );
      }

      profile.country =
        profile.country.toUpperCase();

      if (
        !/^[A-Z]{2}$/.test(
          profile.country
        )
      ) {
        return json(
          {
            error:
              "Indica il Paese con due lettere, ad esempio IT."
          },
          400
        );
      }

      await db.pool.query(
        `INSERT INTO plan_profiles
         (
           company_id,
           data,
           status,
           updated_at
         )
         VALUES ($1,$2::jsonb,$3,$4)
         ON CONFLICT (company_id)
         DO UPDATE SET
           data=EXCLUDED.data,
           status=EXCLUDED.status,
           updated_at=EXCLUDED.updated_at`,
        [
          user.company_id,
          JSON.stringify(
            profile
          ),
          "pending",
          new Date().toISOString()
        ]
      );

      await db.pool.query(
        `INSERT INTO company_knowledge
         (
           company_id,
           status,
           knowledge,
           sources,
           started_at,
           completed_at,
           updated_at,
           error
         )
         VALUES (
           $1,
           'pending',
           '{}'::jsonb,
           '[]'::jsonb,
           NULL,
           NULL,
           NOW(),
           NULL
         )
         ON CONFLICT (company_id)
         DO UPDATE SET
           status='pending',
           knowledge='{}'::jsonb,
           sources='[]'::jsonb,
           started_at=NULL,
           completed_at=NULL,
           updated_at=NOW(),
           error=NULL`,
        [
          user.company_id
        ]
      );

      // Senza LINEA_INTERNAL_SECRET la ricerca non viene avviata
      // e la richiesta segue il ramo di errore già esistente.
      const internalHeaders =
        internalRequestHeaders();

      const backgroundResponse =
        !internalHeaders
          ? { ok: false, status: "internal-secret-missing" }
          : await fetch(
          `${url.origin}/.netlify/functions/company-research-background`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              ...internalHeaders
            },

            body: JSON.stringify({
              company_id:
                user.company_id
            })
          }
        );

      if (
        !backgroundResponse.ok
      ) {
        console.error(
          "Unable to start company research:",
          backgroundResponse.status
        );

        await db.pool.query(
          `UPDATE company_knowledge
              SET status='failed',
                  updated_at=NOW(),
                  error=$1
            WHERE company_id=$2`,
          [
            "Impossibile avviare la ricerca.",
            user.company_id
          ]
        );

        await db.pool.query(
          `UPDATE plan_profiles
              SET status='needs_review',
                  updated_at=NOW()
            WHERE company_id=$1`,
          [
            user.company_id
          ]
        );

        return json(
          {
            error:
              "I dati sono stati salvati, ma la ricerca automatica non è partita. Riprova."
          },
          503
        );
      }

      return json({
        ok: true,
        research_status:
          "pending"
      });
    }

    const chatResponse =
      await chatApi(
        request,
        db,
        principal,
        {
          context
        }
      );

    if (chatResponse) {
      return chatResponse;
    }

    return json(
      {
        error:
          "Operazione non disponibile."
      },
      404
    );
  } catch (error) {
    if (
      error.httpStatus
    ) {
      return json(
        {
          error:
            error.message
        },
        error.httpStatus
      );
    }

    // Mai l'oggetto errore completo: può contenere dati di richiesta.
    console.error(
      "Linea AI API error:",
      error?.code ||
        error?.name ||
        "internal",
      String(
        error?.message || ""
      ).slice(0, 300)
    );

    const knownMessages =
      new Set([
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

    if (
      knownMessages.has(
        error?.message
      )
    ) {
      return json(
        {
          error:
            error.message
        },
        400
      );
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