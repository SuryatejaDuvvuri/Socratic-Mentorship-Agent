/**
 * arxiv search tool
 * Fetches real papers from the arxiv API. No hallucination.
 */

const ARXIV_API = 'https://export.arxiv.org/api/query';

/**
 * Search arxiv for papers matching a query.
 * Returns up to maxResults papers with id, title, authors, summary, published.
 */
export async function searchArxiv(query, maxResults = 6) {
  // Sanitize: arxiv's `all:` field treats multiple quoted phrases as ANDed
  // exact matches, which usually returns zero results. Strip quotes and
  // boolean operators down to plain keywords for a forgiving OR-ish match.
  const cleaned = String(query)
    .replace(/["'()]/g, ' ')
    .replace(/\b(AND|OR|NOT)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const params = new URLSearchParams({
    search_query: `all:${cleaned || query}`,
    start: '0',
    max_results: String(maxResults),
    sortBy: 'relevance',
    sortOrder: 'descending'
  });

  const url = `${ARXIV_API}?${params}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ResearchMentorAgent/1.0' }
  });

  if (!response.ok) {
    throw new Error(`arxiv API returned ${response.status}`);
  }

  const xml = await response.text();
  return parseArxivXml(xml);
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
