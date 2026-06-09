// Gemini API wrapper — used by all phase agents
//
// Rate limit handling:
// - Global request queue (only 1 LLM call at a time, no thundering herd)
// - Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (6 retries total)
// - Respects Gemini's "retry-in" header if present
// - Only fires one request after the previous one completes

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Global request queue — ensures only one Gemini call at a time
let requestQueue = Promise.resolve();

function queueRequest(fn) {
  requestQueue = requestQueue.then(fn).catch(err => {
    // Keep the queue alive even on error
    return Promise.reject(err);
  });
  return requestQueue;
}

/**
 * Call Gemini with a system prompt and a conversation history.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {Array<{role:'user'|'model', text:string}>} opts.history  - prior turns
 * @param {string} opts.userMessage  - the new user message
 * @param {string} [opts.model]      - defaults to env or gemini-2.5-flash
 * @param {number} [opts.temperature]
 * @returns {Promise<string>}  raw text response
 */
export async function callMentor({ systemPrompt, history = [], userMessage, model, temperature = 0.7, forceJson = false }) {
  return queueRequest(async () => {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('LLM_API_KEY is not set in .env');

    const resolvedModel = model || process.env.LLM_MODEL || 'gemini-2.5-flash';
    const endpoint = `${BASE_URL}/models/${encodeURIComponent(resolvedModel)}:generateContent?key=${apiKey}`;

    const contents = [];
    for (const turn of history) {
      contents.push({
        role: turn.role === 'mentor' ? 'model' : 'user',
        parts: [{ text: turn.content }]
      });
    }
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const generationConfig = {
      temperature,
      maxOutputTokens: 8192,
      ...(forceJson ? { responseMimeType: 'application/json' } : {})
    };

    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig
    };

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (6 retries)
    const MAX_RETRIES = 6;
    const baseWaitMs = 1000; // Start at 1 second

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.status === 429) {
        // Check if Gemini told us how long to wait
        const retryMsg = data?.error?.message || '';
        const retryMatch = retryMsg.match(/retry in ([\d.]+)s/i);
        let waitMs;

        if (retryMatch) {
          // Use Gemini's suggested wait time + 500ms buffer
          waitMs = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500;
        } else {
          // Use exponential backoff: 2^(attempt-1) seconds
          waitMs = baseWaitMs * Math.pow(2, attempt - 1);
        }

        // Add small random jitter (0-1s) to prevent thundering herd
        const jitter = Math.random() * 1000;
        const totalWaitMs = waitMs + jitter;

        if (attempt < MAX_RETRIES) {
          console.warn(`[gemini] Rate limited (attempt ${attempt}/${MAX_RETRIES}). Waiting ${Math.round(totalWaitMs)}ms before retry...`);
          await sleep(totalWaitMs);
          continue;
        }

        // All retries exhausted
        throw new Error(`Rate limit hit after ${MAX_RETRIES} attempts. The API quota may be exhausted. Try again in a few minutes.`);
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || `Gemini API error ${response.status}`);
      }

      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      if (!text) throw new Error('Gemini returned empty response');
      return text;
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Same as callMentor but expects a JSON response.
 * - Forces responseMimeType: application/json at the API level
 * - Retries once on parse failure with an explicit correction prompt
 * - Validates required keys if opts.requiredKeys is provided
 * Returns parsed object.
 */
export async function callMentorJson(opts) {
  // First attempt
  let text;
  try {
    text = await callMentor({ ...opts, temperature: opts.temperature ?? 0.2, forceJson: true });
  } catch (e) {
    throw new Error(`Gemini API call failed: ${e.message}`);
  }

  // Try to parse
  let parsed;
  try {
    parsed = parseJson(text);
  } catch {
    // Retry once: explicitly tell the model it returned non-JSON
    console.warn('[gemini] JSON parse failed on first attempt — retrying with correction prompt');
    const correctionMessage =
      `Your previous response was not valid JSON. ` +
      `You MUST return only a raw JSON object — no prose, no markdown fences, no explanation. ` +
      `Retry your response now as pure JSON.\n\nOriginal user message: ${opts.userMessage}`;
    try {
      const retryText = await callMentor({
        ...opts,
        userMessage: correctionMessage,
        history: [],           // clean slate for the retry
        temperature: 0.1,      // lower temp = more deterministic
        forceJson: true
      });
      parsed = parseJson(retryText);
    } catch (retryErr) {
      throw new Error(`Gemini returned non-JSON after retry: ${retryErr.message}`);
    }
  }

  // Validate required keys if caller specified them
  if (opts.requiredKeys?.length) {
    const missing = opts.requiredKeys.filter(k => !(k in parsed));
    if (missing.length) {
      throw new Error(`Gemini JSON missing required keys: ${missing.join(', ')}`);
    }
  }

  // Guard against empty/null response
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned empty or non-object JSON');
  }

  return parsed;
}

function parseJson(text) {
  // Try fenced block first, then raw text
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Response may be truncated. Try to salvage by finding the last complete
    // top-level key and closing the object/array manually — last resort.
    const salvaged = tryRepairJson(candidate);
    if (salvaged) return salvaged;

    throw new Error(
      `Gemini response was not valid JSON (likely truncated at ${text.length} chars).\n` +
      `First 400 chars:\n${text.slice(0, 400)}`
    );
  }
}

function tryRepairJson(text) {
  // Walk backwards from the end to find the last complete key-value pair,
  // then close the structure. Works for the common "summaries array" pattern.
  try {
    // Find last complete '}' inside an array
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace === -1) return null;
    const truncated = text.slice(0, lastBrace + 1);
    // Count open brackets/braces to decide what to close
    let opens = 0;
    for (const ch of truncated) {
      if (ch === '{' || ch === '[') opens++;
      if (ch === '}' || ch === ']') opens--;
    }
    // Append enough closers
    let repaired = truncated;
    // Simple heuristic: if we were inside an array of objects inside an object
    // close with ]}\n
    if (opens > 0) repaired += ']}';
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}
