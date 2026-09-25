// Provider Google Gemini (Gemini API diretta, Google AI Studio / Cloud).
// Endpoint fisso: la chiave viene inviata solo a Google, mai a host configurabili.
// Chiave: LINEA_GEMINI_API_KEY (variabile d'ambiente Netlify, scope Functions).
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// I modelli 2.5 sono riservati a chi li usava già: per i progetti nuovi
// Google indica la famiglia 3.x.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export const name = 'gemini';

export function ready(env) {
  return typeof env.LINEA_GEMINI_API_KEY === 'string' && env.LINEA_GEMINI_API_KEY.trim().length > 0;
}

function sourcesOf(raw) {
  const out = [];
  const seen = new Set();
  const add = (url, title) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ url: url.slice(0, 2000), title: typeof title === 'string' ? title.slice(0, 300) : '' });
  };
  for (const c of raw?.candidates || []) {
    for (const chunk of c?.groundingMetadata?.groundingChunks || []) add(chunk?.web?.uri, chunk?.web?.title);
    for (const item of c?.urlContextMetadata?.urlMetadata || []) add(item?.retrievedUrl || item?.url, 'Sito ufficiale');
  }
  return out.slice(0, 50);
}

// Ragionamento ridotto al minimo: i modelli 2.x usano thinkingBudget,
// i 3.x thinkingLevel (Flash-Lite accetta "minimal", gli altri partono da "low").
function minimalThinking(model) {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: 0 };
  return { thinkingLevel: /flash-lite/.test(model) ? 'minimal' : 'low' };
}

// Lo schema di Gemini (sottoinsieme OpenAPI) non accetta additionalProperties.
function geminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties') continue;
    out[k] = geminiSchema(v);
  }
  return out;
}

export async function generate(request, { env, transport, AIError }) {
  const model = (request.model || env.LINEA_AI_MODEL || DEFAULT_MODEL).trim();
  if (!MODEL_PATTERN.test(model)) throw new AIError('AI_MODEL_INVALID');

  const generationConfig = {
    temperature: request.temperature ?? 0.2,
    maxOutputTokens: request.maxOutputTokens ?? 1000
  };
  if (request.jsonSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = geminiSchema(request.jsonSchema);
  } else if (request.json) {
    generationConfig.responseMimeType = 'application/json';
  }
  if (request.thinking === false) generationConfig.thinkingConfig = minimalThinking(model);

  const body = {
    contents: request.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text ?? '') }]
    })),
    generationConfig
  };
  if (request.system) body.systemInstruction = { parts: [{ text: request.system }] };
  const tools = [];
  if (request.tools?.urlContext) tools.push({ url_context: {} });
  if (request.tools?.webSearch) tools.push({ google_search: {} });
  if (tools.length) body.tools = tools;

  let response;
  try {
    response = await transport(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.LINEA_GEMINI_API_KEY.trim() },
      signal: AbortSignal.timeout(request.timeoutMs ?? 22000),
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new AIError(e?.name === 'TimeoutError' ? 'AI_TIMEOUT' : 'AI_NETWORK', { retryable: true });
  }

  if (!response.ok) {
    // Il corpo d'errore non viene letto né loggato: può riflettere contenuti della richiesta.
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
  if (raw?.promptFeedback?.blockReason) throw new AIError('AI_BLOCKED');
  const candidate = raw?.candidates?.[0];
  if (!candidate) throw new AIError('AI_EMPTY');
  if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(candidate.finishReason)) {
    throw new AIError('AI_BLOCKED');
  }
  const text = (candidate.content?.parts || [])
    .filter(p => typeof p?.text === 'string' && !p.thought)
    .map(p => p.text)
    .join('')
    .trim();
  if (!text) throw new AIError('AI_EMPTY');

  return {
    text,
    sources: sourcesOf(raw),
    usage: {
      inputTokens: Number(raw.usageMetadata?.promptTokenCount) || 0,
      outputTokens: Number(raw.usageMetadata?.candidatesTokenCount) || 0
    },
    model,
    provider: name
  };
}
