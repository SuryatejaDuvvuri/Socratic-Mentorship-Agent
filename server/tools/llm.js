/**
 * Provider-agnostic LLM wrapper.
 *
 * Reads LLM_PROVIDER from .env and routes to the right backend:
 *   gemini    — Google Gemini API
 *   groq      — Groq API (OpenAI-compatible, 30K req/day free)
 *   cerebras  — Cerebras API (OpenAI-compatible, fastest inference, free tier)
 *   sambanova — SambaNova API (OpenAI-compatible, Llama 405B free)
 *   ollama    — Local Ollama (no rate limits, no API key)
 *
 * All providers implement the same interface:
 *   callLLM(opts)     → string  (raw text)
 *   callLLMJson(opts) → object  (parsed JSON with guardrails)
 */

import { callMentor as callGemini, callMentorJson as callGeminiJson } from './gemini.js';

// ── Ollama ────────────────────────────────────────────────────────────────────

async function callOllama({ systemPrompt, history = [], userMessage, temperature = 0.7, forceJson = false }) {
  const base = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = process.env.LLM_MODEL || 'llama3.1:8b';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role === 'mentor' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userMessage }
  ];

  const body = {
    model,
    messages,
    stream: false,
    options: { temperature },
    ...(forceJson ? { format: 'json' } : {})
  };

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data?.message?.content || '';
  if (!text) throw new Error('Ollama returned empty response');
  return text;
}

// ── Groq (OpenAI-compatible) ──────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGroq({ systemPrompt, history = [], userMessage, temperature = 0.7, forceJson = false, maxTokens = 4096 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set in .env');

  const model = process.env.LLM_MODEL || 'llama-3.1-8b-instant';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role === 'mentor' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userMessage }
  ];

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(forceJson ? { response_format: { type: 'json_object' } } : {})
  };

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (res.status === 429) {
      // Groq returns retry-after in headers
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 + 500 : 10000;
      if (attempt < MAX_RETRIES) {
        console.warn(`[groq] Rate limited. Waiting ${waitMs}ms (retry ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(waitMs);
        continue;
      }
      throw new Error('Groq rate limit hit after 3 attempts.');
    }

    if (!res.ok) throw new Error(data?.error?.message || `Groq API error ${res.status}`);

    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Groq returned empty response');
    return text;
  }
}

// ── Cerebras (OpenAI-compatible, ~2000 tok/s) ────────────────────────────────

async function callCerebras({ systemPrompt, history = [], userMessage, temperature = 0.7, forceJson = false, maxTokens = 4096 }) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY not set in .env');

  const model = process.env.LLM_MODEL || 'llama-3.3-70b';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role === 'mentor' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userMessage }
  ];

  const body = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
    ...(forceJson ? { response_format: { type: 'json_object' } } : {})
  };

  // Retry on transient failures (429 rate limit, 5xx, "high traffic").
  // Groq already had this; Cerebras threw on first failure — under load
  // spikes one flaky response would kill a whole agent run.
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    const errMsg = data?.message || data?.error?.message || '';
    const transient = res.status === 429 || res.status >= 500 || /high traffic|overloaded|try again/i.test(errMsg);

    if (!res.ok && transient && attempt < MAX_RETRIES) {
      // RPM-window errors need to wait out the minute, not 2s.
      const waitMs = /per minute/i.test(errMsg) ? 20_000 * attempt : 2000 * attempt;
      console.warn(`[cerebras] transient error (${res.status}): ${errMsg.slice(0, 80)} — retrying in ${waitMs}ms (${attempt}/${MAX_RETRIES})`);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new Error(errMsg || `Cerebras API error ${res.status}`);

    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Cerebras returned empty response');
    return text;
  }
}

// ── SambaNova (OpenAI-compatible, free Llama 405B) ────────────────────────────

async function callSambaNova({ systemPrompt, history = [], userMessage, temperature = 0.7, forceJson = false, maxTokens = 4096 }) {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) throw new Error('SAMBANOVA_API_KEY not set in .env');

  const model = process.env.LLM_MODEL || 'Meta-Llama-3.1-405B-Instruct';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role === 'mentor' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: userMessage }
  ];

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(forceJson ? { response_format: { type: 'json_object' } } : {})
  };

  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error?.message || `SambaNova API error ${res.status}`);

  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('SambaNova returned empty response');
  return text;
}

// ── Shared JSON wrapper ───────────────────────────────────────────────────────

function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Try repairing truncated JSON
    const lastBrace = candidate.lastIndexOf('}');
    if (lastBrace !== -1) {
      const truncated = candidate.slice(0, lastBrace + 1);
      let opens = 0;
      for (const ch of truncated) {
        if (ch === '{' || ch === '[') opens++;
        if (ch === '}' || ch === ']') opens--;
      }
      try {
        return JSON.parse(opens > 0 ? truncated + ']}' : truncated);
      } catch { /* fall through */ }
    }
    throw new Error(`JSON parse failed. First 300 chars: ${text.slice(0, 300)}`);
  }
}

async function callLLMJsonWithProvider(callFn, opts) {
  let text;
  try {
    text = await callFn({ ...opts, temperature: opts.temperature ?? 0.2, forceJson: true });
  } catch (e) {
    throw new Error(`LLM call failed: ${e.message}`);
  }

  let parsed;
  try {
    parsed = parseJson(text);
  } catch {
    console.warn('[llm] JSON parse failed — retrying with correction prompt');
    const correctionMessage =
      `Your previous response was not valid JSON. ` +
      `Return ONLY a raw JSON object — no prose, no markdown. ` +
      `Retry now.\n\nOriginal message: ${opts.userMessage}`;
    try {
      const retryText = await callFn({ ...opts, userMessage: correctionMessage, history: [], temperature: 0.1, forceJson: true });
      parsed = parseJson(retryText);
    } catch (retryErr) {
      throw new Error(`Non-JSON after retry: ${retryErr.message}`);
    }
  }

  if (opts.requiredKeys?.length) {
    const missing = opts.requiredKeys.filter(k => !(k in parsed));
    if (missing.length) throw new Error(`LLM JSON missing required keys: ${missing.join(', ')}`);
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('LLM returned empty or non-object JSON');
  return parsed;
}

// ── Public API ────────────────────────────────────────────────────────────────

const PROVIDER = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
console.log(`[llm] provider: ${PROVIDER}, model: ${process.env.LLM_MODEL || 'default'}`);

export async function callLLM(opts) {
  if (PROVIDER === 'ollama')    return callOllama(opts);
  if (PROVIDER === 'groq')      return callGroq(opts);
  if (PROVIDER === 'cerebras')  return callCerebras(opts);
  if (PROVIDER === 'sambanova') return callSambaNova(opts);
  return callGemini(opts);
}

export async function callLLMJson(opts) {
  if (PROVIDER === 'ollama')    return callLLMJsonWithProvider(callOllama, opts);
  if (PROVIDER === 'groq')      return callLLMJsonWithProvider(callGroq, opts);
  if (PROVIDER === 'cerebras')  return callLLMJsonWithProvider(callCerebras, opts);
  if (PROVIDER === 'sambanova') return callLLMJsonWithProvider(callSambaNova, opts);
  return callGeminiJson(opts);
}
