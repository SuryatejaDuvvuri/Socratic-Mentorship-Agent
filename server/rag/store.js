// Vector store for RAG chunks, backed by the same SQLite DB.
// Embeddings are stored as JSON-encoded float arrays. For a corpus this
// size, an in-memory cosine scan is fast and dependency-free — no external
// vector DB needed. (Swappable for a real ANN index in a later phase.)

import { getDb } from '../db.js';
import { cosineSimilarity } from './embed.js';

let _ready = false;
function ensureTable() {
  if (_ready) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,        -- citation string, e.g. "NSF Merit Review"
      title TEXT NOT NULL,         -- chunk heading
      tags TEXT,                   -- comma-separated topic tags for filtering
      text TEXT NOT NULL,
      embedding TEXT NOT NULL      -- JSON float array
    );
  `);
  _ready = true;
}

export function clearChunks() {
  ensureTable();
  getDb().prepare('DELETE FROM rag_chunks').run();
}

export function insertChunk({ source, title, tags, text, embedding }) {
  ensureTable();
  getDb()
    .prepare('INSERT INTO rag_chunks (source, title, tags, text, embedding) VALUES (?, ?, ?, ?, ?)')
    .run(source, title, tags || '', text, JSON.stringify(embedding));
}

export function countChunks() {
  ensureTable();
  return getDb().prepare('SELECT COUNT(*) AS n FROM rag_chunks').get().n;
}

/**
 * Retrieve the top-k most similar chunks to a query embedding.
 * Optionally bias toward chunks whose tags include any of `preferTags`.
 * @param {number[]} queryEmbedding
 * @param {object} opts
 * @param {number} [opts.k=4]
 * @param {string[]} [opts.preferTags] - soft boost, not a hard filter
 */
export function searchChunks(queryEmbedding, { k = 4, preferTags = [] } = {}) {
  ensureTable();
  const rows = getDb().prepare('SELECT source, title, tags, text, embedding FROM rag_chunks').all();

  const scored = rows.map((r) => {
    const emb = JSON.parse(r.embedding);
    let score = cosineSimilarity(queryEmbedding, emb);
    // Soft tag boost: nudge chunks that match the section's topic.
    if (preferTags.length && r.tags) {
      const chunkTags = r.tags.split(',').map((t) => t.trim());
      if (preferTags.some((t) => chunkTags.includes(t))) score += 0.05;
    }
    return { source: r.source, title: r.title, text: r.text, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
