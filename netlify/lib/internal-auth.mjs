// Autenticazione delle chiamate interne backend → background function.
// Il segreto (LINEA_INTERNAL_SECRET, almeno 32 caratteri) esiste solo nelle
// variabili d'ambiente Netlify; se manca, le chiamate interne sono rifiutate.
import { createHash, timingSafeEqual } from "node:crypto";

const HEADER = "x-linea-internal";

function secret(env) {
  const value = env.LINEA_INTERNAL_SECRET;
  return typeof value === "string" && value.length >= 32 ? value : null;
}

const digest = value => createHash("sha256").update(value).digest();

/** Header da allegare alla chiamata interna, o null se non configurato. */
export function internalRequestHeaders(env = process.env) {
  const value = secret(env);
  return value ? { [HEADER]: value } : null;
}

/** Confronto a tempo costante del segreto ricevuto. */
export function internalRequestAuthorized(request, env = process.env) {
  const expected = secret(env);
  const received = request.headers.get(HEADER);
  if (!expected || typeof received !== "string" || !received) return false;
  return timingSafeEqual(digest(received), digest(expected));
}
