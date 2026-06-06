// Gemini embeddings wrapper — turns text into vectors for RAG retrieval.
// Uses text-embedding-004 (free tier). One module so both ingest and
// retrieval share the exact same embedding model.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = 'gemini-embedding-001';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Embed a single piece of text. Returns a number[] vector.
 * @param {string} text
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 */
export async function embedText(text, taskType = 'RETRIEVAL_DOCUMENT') {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY is not set in .env');

  const endpoint = `${BASE_URL}/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const body = {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    taskType
  };

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.status === 429) {
      const retryMatch = (data?.error?.message || '').match(/retry in ([\d.]+)s/i);
      const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : 15000;
      if (attempt < MAX_RETRIES) {
        console.warn(`[embed] rate limited, waiting ${waitMs}ms (retry ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(waitMs);
        continue;
      }
      throw new Error('Embedding rate limit hit after 3 attempts.');
    }

    if (!res.ok) throw new Error(data?.error?.message || `Embedding API error ${res.status}`);

    const values = data?.embedding?.values;
    if (!Array.isArray(values)) throw new Error('Embedding response missing values');
    return values;
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
