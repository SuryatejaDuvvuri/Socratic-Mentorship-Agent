// Agentic retrieval layer — multi-hop, self-assessing, attribution-ready.
//
// Old design: embed query → cosine search → paste top-k into prompt. Static.
//
// New design (3 improvements over vanilla RAG):
//
// 1. MULTI-HOP RETRIEVAL — first query gets initial chunks, then a second
//    query derived from those chunks' titles pulls deeper/adjacent standards.
//    The agent sees both hops merged and deduplicated.
//
// 2. AGENTIC SELF-ASSESSMENT — if the best chunk scores below a relevance
//    threshold, the retriever reformulates the query (appending the top
//    chunk's title as context) and retries. The agent can control depth
//    via maxHops.
//
// 3. RETRIEVAL-AWARE ATTRIBUTION — each chunk gets a stable [RAG-N] tag.
//    The formatted context block instructs the LLM to cite these tags.
//    The return value includes a `citations` map so the caller can audit
//    which chunks were provided and (after generation) which were used.

import { embedText } from './embed.js';
import { searchChunks, countChunks } from './store.js';

const RELEVANCE_THRESHOLD = 0.45;

export function ragReady() {
  try {
    return countChunks() > 0;
  } catch {
    return false;
  }
}

/**
 * Single-hop retrieval (internal). Returns scored chunks.
 */
async function singleHop(query, { k = 4, preferTags = [] } = {}) {
  const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');
  return searchChunks(queryEmbedding, { k, preferTags });
}

/**
 * Deduplicate chunks by title (keep highest-scored version).
 */
function dedup(chunks) {
  const seen = new Map();
  for (const c of chunks) {
    const existing = seen.get(c.title);
    if (!existing || c.score > existing.score) {
      seen.set(c.title, c);
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/**
 * Agentic multi-hop retrieval with attribution tags.
 *
 * @param {string} query - the retrieval query
 * @param {object} opts
 * @param {number} [opts.k=4] - chunks per hop
 * @param {string[]} [opts.preferTags] - soft tag boost
 * @param {number} [opts.maxHops=2] - max retrieval hops (1 = old behavior)
 * @param {number} [opts.relevanceThreshold] - min score before reformulation
 * @returns {Promise<{chunks, context, citations, hops}>}
 */
export async function retrieveGrounding(query, {
  k = 4,
  preferTags = [],
  maxHops = 2,
  relevanceThreshold = RELEVANCE_THRESHOLD
} = {}) {
  if (!ragReady()) return { chunks: [], context: '', citations: {}, hops: 0 };

  let allChunks = [];
  let hopCount = 0;
  let currentQuery = query;

  // ── Hop 1: initial retrieval ──
  const hop1 = await singleHop(currentQuery, { k, preferTags });
  allChunks.push(...hop1);
  hopCount = 1;

  const topScore = hop1[0]?.score ?? 0;

  // ── Agentic self-assessment: if top score is below threshold, reformulate ──
  if (topScore < relevanceThreshold && maxHops >= 2 && hop1.length > 0) {
    const reformulated = `${query} — specifically: ${hop1[0].title}`;
    const retry = await singleHop(reformulated, { k, preferTags });
    allChunks.push(...retry);
    hopCount = 2;
  }
  // ── Hop 2: pull adjacent/deeper standards based on what hop 1 found ──
  else if (maxHops >= 2 && hop1.length >= 2) {
    const hop1Titles = hop1.slice(0, 2).map(c => c.title).join(', ');
    const hop2Query = `${query} — related to: ${hop1Titles}`;
    const hop2 = await singleHop(hop2Query, { k: Math.ceil(k / 2), preferTags });
    allChunks.push(...hop2);
    hopCount = 2;
  }

  // ── Dedup and rank ──
  const merged = dedup(allChunks).slice(0, k + 2);

  // ── Build attribution-tagged context ──
  const citations = {};
  const context = merged
    .map((c, i) => {
      const tag = `RAG-${i + 1}`;
      citations[tag] = { source: c.source, title: c.title, score: c.score };
      return `[${tag}] ${c.source} — "${c.title}" (relevance: ${c.score.toFixed(2)})\n${c.text}`;
    })
    .join('\n\n');

  return { chunks: merged, context, citations, hops: hopCount };
}
