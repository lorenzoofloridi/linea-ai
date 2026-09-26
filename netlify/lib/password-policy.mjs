// Regole per le NUOVE password (registrazione e reimpostazione).
// L'accesso con password già esistenti non viene toccato.
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 64;
export const PASSWORD_RULE_MESSAGE =
  "La password deve avere da 12 a 64 caratteri e almeno 1 carattere speciale (per esempio ! ? # @ %).";

/** true se la password rispetta: 12–64 caratteri, almeno 1 carattere speciale. */
export function validNewPassword(password) {
  if (typeof password !== "string") return false;
  const length = [...password].length;
  return length >= PASSWORD_MIN && length <= PASSWORD_MAX && /[^\p{L}\p{N}\s]/u.test(password);
}
