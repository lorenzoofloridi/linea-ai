// Connessione PostgreSQL (Supabase) per tutte le Functions.
// Sostituisce @netlify/database mantenendo la stessa forma: { pool }.
//
// Variabili d'ambiente (solo backend, mai nel frontend o nei log):
// - LINEA_DATABASE_URL: stringa di connessione. In Netlify: Transaction
//   pooler Supabase (porta 6543). Dal Mac per le migrazioni: Session pooler
//   (porta 5432), tramite LINEA_DATABASE_MIGRATION_URL.
// - LINEA_DATABASE_CA: certificato CA di Supabase (contenuto PEM), oppure
//   LINEA_DATABASE_CA_FILE: percorso del file .crt scaricato da Supabase.
// Con un host remoto il TLS è obbligatorio e il certificato viene sempre
// verificato: nessuna opzione per disattivare la verifica.
import { readFileSync } from "node:fs";
import pg from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class DatabaseConfigError extends Error {
  constructor(code) {
    super(code);
    this.name = "DatabaseConfigError";
    this.code = code;
  }
}

function certificate(env) {
  if (typeof env.LINEA_DATABASE_CA === "string" && env.LINEA_DATABASE_CA.includes("BEGIN CERTIFICATE")) {
    // Le variabili Netlify possono contenere "\n" letterali al posto degli a capo.
    return env.LINEA_DATABASE_CA.replace(/\\n/g, "\n");
  }
  if (env.LINEA_DATABASE_CA_FILE) {
    try {
      return readFileSync(env.LINEA_DATABASE_CA_FILE, "utf8");
    } catch {
      throw new DatabaseConfigError("DATABASE_CA_UNREADABLE");
    }
  }
  return null;
}

/** Opzioni per pg.Pool/pg.Client. Non restituisce mai la password nei messaggi d'errore. */
export function connectionOptions(connectionString, env = process.env) {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new DatabaseConfigError("DATABASE_NOT_CONFIGURED");
  }
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseConfigError("DATABASE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new DatabaseConfigError("DATABASE_URL_INVALID");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTS.has(host)) {
    return { connectionString };
  }
  const ca = certificate(env);
  if (!ca) throw new DatabaseConfigError("DATABASE_CA_MISSING");
  // sslmode nella stringa verrebbe interpretato da pg e sovrascriverebbe
  // l'oggetto ssl: lo si rimuove e si impone la verifica completa.
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl"]) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true }
  };
}

/** Host e porta, per messaggi diagnostici senza credenziali. */
export function describeConnection(connectionString) {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "configurazione non valida";
  }
}

let shared = null;

/** Pool condiviso tra le invocazioni della stessa istanza della Function. */
export function getDatabase(env = process.env) {
  if (!shared) {
    const pool = new pg.Pool({
      ...connectionOptions(env.LINEA_DATABASE_URL, env),
      // Il Transaction pooler di Supabase gestisce le connessioni reali:
      // ogni istanza della Function ne tiene poche e le chiude presto.
      max: Math.max(1, Math.min(10, Number.parseInt(env.LINEA_DATABASE_POOL_MAX || "3", 10) || 3)),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      application_name: "linea-ai-functions"
    });
    // Un errore su una connessione inattiva non deve far cadere la Function.
    pool.on("error", error => {
      console.error("Database pool error:", error?.code || error?.name || "unknown");
    });
    shared = { pool };
  }
  return shared;
}
