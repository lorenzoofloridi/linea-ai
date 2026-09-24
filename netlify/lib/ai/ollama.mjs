// Provider Ollama Cloud (riserva, attivo solo con LINEA_AI_PROVIDER=ollama).
// Variabili: OLLAMA_API_KEY (segreta), OLLAMA_MODEL, OLLAMA_BASE_URL
// (facoltativa, default https://ollama.com; deve essere HTTPS).
// Non supporta gli strumenti di ricerca web: vengono ignorati.
const DEFAULT_BASE_URL = 'https://ollama.com';
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;

export const name = 'ollama';

function endpoint(env) {
  const base = String(env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(base.endsWith('/api') ? `${base}/chat` : `${base}/api/chat`);
  } catch {
    return null;
  }
  // La chiave non deve mai viaggiare in chiaro o verso host con credenziali nell'URL.
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return url.toString();
}

export function ready(env) {
  return Boolean(
    typeof env.OLLAMA_API_KEY === 'string' && env.OLLAMA_API_KEY.trim() &&
    typeof env.OLLAMA_MODEL === 'string' && MODEL_PATTERN.test(env.OLLAMA_MODEL.trim()) &&
    endpoint(env)
  );
}

export async function generate(request, { env, transport, AIError }) {
  const model = (request.model || env.OLLAMA_MODEL || '').trim();
  if (!MODEL_PATTERN.test(model)) throw new AIError('AI_MODEL_INVALID');
  const url = endpoint(env);
  if (!url) throw new AIError('AI_UNAVAILABLE');

  const messages = [];
  if (request.system) messages.push({ role: 'system', content: request.system });
  for (const m of request.messages) {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text ?? '') });
  }

  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: request.temperature ?? 0.2,
      ...(request.maxOutputTokens ? { num_predict: request.maxOutputTokens } : {})
    }
  };
  if (request.jsonSchema) body.format = request.jsonSchema;
  else if (request.json) body.format = 'json';
  if (request.thinking === false) body.think = false;

  let response;
  try {
    response = await transport(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OLLAMA_API_KEY.trim()}` },
      signal: AbortSignal.timeout(request.timeoutMs ?? 22000),
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new AIError(e?.name === 'TimeoutError' ? 'AI_TIMEOUT' : 'AI_NETWORK', { retryable: true });
  }

  if (!response.ok) {
    // Il corpo d'errore non viene letto né loggato.
    const status = response.status;
    const code = status === 429 ? 'AI_RATE_LIMITED'
      : status === 400 ? 'AI_BAD_REQUEST'
      : status === 401 || status === 403 ? 'AI_AUTH'
      : status === 404 ? 'AI_MODEL_NOT_FOUND'
      : 'AI_UPSTREAM';
    throw new AIError(code, { status, retryable: status === 429 || status >= 500 });
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new AIError('AI_INVALID_RESPONSE');
  }
  const text = typeof raw?.message?.content === 'string' ? raw.message.content.trim() : '';
  if (!text) throw new AIError('AI_EMPTY');

  return {
    text,
    sources: [],
    usage: {
      inputTokens: Number(raw.prompt_eval_count) || 0,
      outputTokens: Number(raw.eval_count) || 0
    },
    model,
    provider: name
  };
}
