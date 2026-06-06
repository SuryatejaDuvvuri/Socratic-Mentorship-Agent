/**
 * Tavily Search — replaces arxiv API for paper discovery.
 *
 * Why: arxiv API has brutal rate limits (~1 req/3s, often stricter).
 * Tavily free tier: 1000 queries/day, fast, structured JSON, no 429s.
 *
 * Strategy: search for academic papers on the topic, extract arxiv IDs
 * when available, and return structured paper objects compatible with
 * the rest of the pipeline.
 */

import { getDb } from '../db.js';

const TAVILY_API = 'https://api.tavily.com/search';
const CACHE_TTL_DAYS = 7;

/**
 * Search for research papers using Tavily.
 * Returns papers in the same shape as the old arxiv.js searchArxiv().
 */
export async function searchPapers(query, maxResults = 6) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not set in .env');

  const cleaned = String(query).replace(/\s+/g, ' ').trim();

  // Check cache first
  const cached = getCachedResults(cleaned);
  if (cached && cached.length > 0) {
    console.log(`[tavily] Cache hit for "${cleaned}" (${cached.length} papers)`);
    return cached.slice(0, maxResults);
  }

  // Search with Tavily — bias toward arxiv and academic sources
  const searchQuery = `${cleaned} research paper site:arxiv.org OR site:semanticscholar.org OR site:aclanthology.org`;

  const res = await fetch(TAVILY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: searchQuery,
      max_results: Math.min(maxResults * 2, 10), // Fetch extra, filter to best
      search_depth: 'advanced',
      include_answer: false,
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavily search failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const results = (data.results || []);

  // Parse into paper objects
  const papers = results
    .map(r => parseTavilyResult(r))
    .filter(p => p !== null)
    .slice(0, maxResults);

  if (papers.length === 0) {
    // Fallback: try a broader search without site restriction
    console.log(`[tavily] No papers found with site filter, trying broader search...`);
    const broadRes = await fetch(TAVILY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${cleaned} academic research paper`,
        max_results: maxResults,
        search_depth: 'advanced',
        include_answer: false,
      })
    });

    if (broadRes.ok) {
      const broadData = await broadRes.json();
      const broadPapers = (broadData.results || [])
        .map(r => parseTavilyResult(r))
        .filter(p => p !== null)
        .slice(0, maxResults);

      if (broadPapers.length > 0) {
        cacheResults(cleaned, broadPapers);
        console.log(`[tavily] Found ${broadPapers.length} papers (broad search), cached`);
        return broadPapers;
      }
    }

    throw new Error(`No papers found for: "${cleaned}"`);
  }

  // Cache results
  cacheResults(cleaned, papers);
  console.log(`[tavily] Found ${papers.length} papers, cached for future searches`);

  return papers;
}

/**
 * Parse a Tavily search result into a paper object.
 * Compatible with the shape the rest of the codebase expects.
 */
function parseTavilyResult(result) {
  if (!result || !result.url) return null;

  const url = result.url;
  const title = cleanTitle(result.title || '');
  const summary = (result.content || '').slice(0, 800);

  // Skip non-paper results
  if (!title || title.length < 10) return null;

  // Extract arxiv ID if it's an arxiv URL
  const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
  const arxivId = arxivMatch ? arxivMatch[1] : url; // Use URL as fallback ID

  // Try to extract authors from content
  const authors = extractAuthors(result.content || '');

  return {
    arxiv_id: arxivId,
    title,
    authors,
    summary,
    published: '', // Tavily doesn't give structured dates
    url,
    source: arxivMatch ? 'arxiv' : new URL(url).hostname,
  };
}

function cleanTitle(title) {
  return title
    .replace(/\[[\d.]+\]\s*/, '')     // Remove arxiv ID prefix like [2301.12345]
    .replace(/\s*-\s*arXiv$/, '')      // Remove "- arXiv" suffix
    .replace(/\s*\|\s*arXiv$/, '')     // Remove "| arXiv" suffix
    .replace(/\s*- Semantic Scholar$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAuthors(content) {
  // Simple heuristic: look for "by Author1, Author2" or "Authors: ..."
  const byMatch = content.match(/\bby\s+([A-Z][a-zA-Z\s,]+?)(?:\.|$)/);
  if (byMatch) return byMatch[1].trim();
  return '';
}

// ── Cache (reuses the same table as arxiv) ──────────────────────────────────

function getCachedResults(query) {
  try {
    const row = getDb()
      .prepare('SELECT results, cached_at FROM arxiv_search_cache WHERE query = ? LIMIT 1')
      .get(query);
    if (!row) return null;

    const ageMs = Date.now() - new Date(row.cached_at).getTime();
    if (ageMs > CACHE_TTL_DAYS * 86400000) {
      getDb().prepare('DELETE FROM arxiv_search_cache WHERE query = ?').run(query);
      return null;
    }
    return JSON.parse(row.results);
  } catch (e) { return null; }
}

function cacheResults(query, results) {
  try {
    getDb()
      .prepare('INSERT OR REPLACE INTO arxiv_search_cache (query, results) VALUES (?, ?)')
      .run(query, JSON.stringify(results));
  } catch (e) {
    console.warn('[tavily] Cache write error:', e.message);
  }
}
