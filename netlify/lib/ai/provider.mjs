// Adapter AI di Linea AI: unico punto da cui il backend chiama un modello.
// Gira esclusivamente server-side. Le chiavi arrivano solo da variabili
// d'ambiente e non vengono mai restituite, loggate o incluse negli errori.
import * as gemini from './gemini.mjs';
import * as ollama from './ollama.mjs';

// gemini: provider predefinito (decisione architetturale).
// ollama: riserva, solo con LINEA_AI_PROVIDER=ollama.
const PROVIDERS = { gemini, ollama };

export class AIError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super(code);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function selected(env) {
  const name = (env.LINEA_AI_PROVIDER || 'gemini').trim().toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) throw new AIError('AI_PROVIDER_UNKNOWN');
  return provider;
}

/** true se il provider configurato ha le credenziali necessarie. */
export function aiReady(env = process.env) {
  try {
    return selected(env).ready(env);
  } catch {
    return false;
  }
}

/**
 * Richiesta neutrale rispetto al provider.
 * @param {object} request
 * @param {string} [request.system]            istruzioni di sistema
 * @param {{role:'user'|'assistant',text:string}[]} request.messages
 * @param {object} [request.jsonSchema]         forza output JSON conforme
 * @param {boolean} [request.json]              output JSON senza schema
 * @param {{webSearch?:boolean,urlContext?:boolean}} [request.tools]
 * @param {number} [request.temperature]
 * @param {number} [request.maxOutputTokens]
 * @param {boolean} [request.thinking]          false disattiva il ragionamento esteso
 * @param {number} [request.timeoutMs]
 * @param {string} [request.model]              override del modello (del provider attivo)
 * @returns {Promise<{text:string,sources:{url:string,title:string}[],usage:{inputTokens:number,outputTokens:number},model:string,provider:string}>}
 */
export async function generate(request, { env = process.env, transport = fetch } = {}) {
  if (!request || !Array.isArray(request.messages) || !request.messages.length) {
    throw new AIError('AI_INVALID_REQUEST');
  }
  const provider = selected(env);
  if (!provider.ready(env)) throw new AIError('AI_UNAVAILABLE');
  return provider.generate(request, { env, transport, AIError });
}
