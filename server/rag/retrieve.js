// Retrieval layer used by the phase agents. Embeds a query, pulls the
// top-k corpus chunks, and formats them as a citable context block the
// LLM is instructed to ground its judgments in.

import { embedText } from './embed.js';
import { searchChunks, countChunks } from './store.js';

export function ragReady() {
  try {
    return countChunks() > 0;
  } catch {
    return false;
  }
}

/**
 * Retrieve grounding for a query.
 * @returns {Promise<{chunks: Array, context: string}>}
 */
export async function retrieveGrounding(query, { k = 4, preferTags = [] } = {}) {
  if (!ragReady()) return { chunks: [], context: '' };

  const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');
  const chunks = searchChunks(queryEmbedding, { k, preferTags });

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.source} — "${c.title}"\n${c.text}`)
    .join('\n\n');

  return { chunks, context };
}
