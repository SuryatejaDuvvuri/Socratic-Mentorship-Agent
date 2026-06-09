/**
 * arxiv search tool
 * Fetches real papers from the arxiv API. No hallucination.
 *
 * Improvements:
 * - **Caching**: Stores results in DB (7-day TTL) to avoid repeated API hits
 * - **Exponential backoff**: 1s, 3s, 9s, 27s on retries (not fixed 3s)
 * - **Rate limit handling**: HTTP 429/503 trigger intelligent retries
 * - **Query deduplication**: Same query cached across all learners
 */

import { getDb } from '../db.js';

const ARXIV_API = 'https://export.arxiv.org/api/query';
const CACHE_TTL_DAYS = 7;
const RATE_LIMIT_RETRIES = 4;
const MIN_REQUEST_INTERVAL_MS = 10000;  // 10 seconds between requests
const CIRCUIT_BREAKER_WINDOW_MS = 60000; // 1 minute window
const CIRCUIT_BREAKER_THRESHOLD = 2;     // 2 rate limits = circuit opens

// ── Global request queue + circuit breaker ──
let lastArxivRequestTime = 0;
let rateLimitCount = 0;
let circuitBreakerOpenUntil = 0;
const requestQueue = [];
let isProcessing = false;

/**
 * Search arxiv for papers matching a query.
 * Returns up to maxResults papers with id, title, authors, summary, published.
 *
 * Uses global request queue to respect arxiv rate limits (max 1 req per 5 sec).
 * Checks cache first (7-day TTL). On cache miss, hits API with exponential backoff.
 */
export async function searchArxiv(query, maxResults = 6) {
  const cleaned = String(query)
    .replace(/["'()]/g, ' ')
    .replace(/\b(AND|OR|NOT)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // **CACHE HIT** — check if we've searched this before (within 7 days)
  const cached = getCachedResults(cleaned);
  if (cached && cached.length > 0) {
    console.log(`[arxiv] Cache hit for "${cleaned}" (${cached.length} papers)`);
    return cached.slice(0, maxResults);
  }

  // **CACHE MISS** — queue the request to respect rate limits
  return queueArxivRequest(() => fetchArxivPapers(cleaned, maxResults));
}

// ── Queue manager for rate-limited requests ────────────────────────────────

function queueArxivRequest(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const { fn, resolve, reject } = requestQueue.shift();

    // **CIRCUIT BREAKER** — if too many rate limits recently, back off hard
    if (Date.now() < circuitBreakerOpenUntil) {
      const waitSecs = Math.ceil((circuitBreakerOpenUntil - Date.now()) / 1000);
      console.warn(`[arxiv] 🔴 CIRCUIT BREAKER OPEN — arxiv is throttling us. Waiting ${waitSecs}s before retry...`);
      reject(new Error(`arxiv API is rate limiting. Please wait ${waitSecs} seconds and try again.`));
      continue;
    }

    // Reset rate limit counter if window expired
    if (rateLimitCount > 0 && Date.now() - lastArxivRequestTime > CIRCUIT_BREAKER_WINDOW_MS) {
      rateLimitCount = 0;
    }

    // Respect minimum interval between requests
    const timeSinceLastRequest = Date.now() - lastArxivRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      const waitMs = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      console.log(`[arxiv] Respecting rate limit, waiting ${waitMs}ms...`);
      await sleep(waitMs);
    }

    try {
      lastArxivRequestTime = Date.now();
      const result = await fn();
      resolve(result);
    } catch (err) {
      // If it's a rate limit error, increment counter and maybe open circuit
      if (err.message.includes('rate limited')) {
        rateLimitCount++;
        console.warn(`[arxiv] Rate limit hit (${rateLimitCount}/${CIRCUIT_BREAKER_THRESHOLD})`);

        if (rateLimitCount >= CIRCUIT_BREAKER_THRESHOLD) {
          circuitBreakerOpenUntil = Date.now() + 60000; // Back off 60s
          console.error(`[arxiv] 🔴 Circuit breaker OPEN — arxiv is heavily throttling us. Backing off 60s...`);
        }
      }
      reject(err);
    }
  }

  isProcessing = false;
}

// ── Actual API call (with retries) ─────────────────────────────────────────

async function fetchArxivPapers(cleaned, maxResults) {
  const params = new URLSearchParams({
    search_query: `all:${cleaned}`,
    start: '0',
    max_results: String(maxResults),
    sortBy: 'relevance',
    sortOrder: 'descending'
  });

  const url = `${ARXIV_API}?${params}`;

  for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ResearchMentorAgent/1.0' }
      });

      // Rate limit: exponential backoff and retry
      if (response.status === 429 || response.status === 503) {
        const body = await response.text();
        if (attempt < RATE_LIMIT_RETRIES && (response.status === 429 || body.includes('Rate exceeded'))) {
          const waitMs = exponentialBackoff(attempt);
          console.warn(`[arxiv] Rate limited (attempt ${attempt}/${RATE_LIMIT_RETRIES}), backing off ${waitMs}ms...`);
          await sleep(waitMs);
          continue; // Retry
        }
        throw new Error(`arxiv API rate limited. Please try again in a moment.`);
      }

      if (!response.ok) {
        throw new Error(`arxiv API returned ${response.status}`);
      }

      const xml = await response.text();
      const results = parseArxivXml(xml);

      // **CACHE MISS RESOLVED** — store in cache for next time
      cacheResults(cleaned, results);
      console.log(`[arxiv] Fetched ${results.length} papers, cached for future searches`);

      return results;
    } catch (err) {
      if (attempt === RATE_LIMIT_RETRIES) {
        throw err;
      }
    }
  }

  throw new Error(`arxiv search failed after ${RATE_LIMIT_RETRIES} retries`);
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function getCachedResults(query) {
  try {
    const row = getDb()
      .prepare(`SELECT results, cached_at FROM arxiv_search_cache WHERE query = ? LIMIT 1`)
      .get(query);

    if (!row) return null;

    // Check TTL (7 days)
    const cachedTime = new Date(row.cached_at).getTime();
    const ageMs = Date.now() - cachedTime;
    const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

    if (ageMs > ttlMs) {
      // Cache expired, delete it
      getDb().prepare('DELETE FROM arxiv_search_cache WHERE query = ?').run(query);
      return null;
    }

    return JSON.parse(row.results);
  } catch (e) {
    console.warn(`[arxiv] Cache read error:`, e.message);
    return null;
  }
}

function cacheResults(query, results) {
  try {
    getDb()
      .prepare(`INSERT OR REPLACE INTO arxiv_search_cache (query, results) VALUES (?, ?)`)
      .run(query, JSON.stringify(results));
  } catch (e) {
    console.warn(`[arxiv] Cache write error:`, e.message);
  }
}

function exponentialBackoff(attempt) {
  // 1s, 3s, 9s, 27s
  return Math.pow(3, attempt - 1) * 1000;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArxivXml(xml) {
  const papers = [];

  // Extract entries using regex (no DOM parser in Node without extra deps)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const id = extractTag(entry, 'id')?.replace('http://arxiv.org/abs/', '').trim() || '';
    const title = cleanText(extractTag(entry, 'title') || '');
    const summary = cleanText(extractTag(entry, 'summary') || '');
    const published = extractTag(entry, 'published')?.slice(0, 10) || '';

    // Extract all authors
    const authorRegex = /<name>([\s\S]*?)<\/name>/g;
    const authors = [];
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(cleanText(authorMatch[1]));
    }

    if (title && id) {
      papers.push({
        arxiv_id: id,
        title,
        authors: authors.slice(0, 4).join(', ') + (authors.length > 4 ? ' et al.' : ''),
        summary: summary.slice(0, 500) + (summary.length > 500 ? '...' : ''),
        published,
        url: `https://arxiv.org/abs/${id}`
      });
    }
  }

  return papers;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
