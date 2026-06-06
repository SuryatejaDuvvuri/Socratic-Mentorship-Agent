/**
 * Paper Import Pipeline
 *
 * Allows students to upload their own PDFs (advisor-recommended papers,
 * course materials, etc.) that may not surface via arxiv search.
 *
 * Pipeline:
 *   1. PDF → extract text (pdf-parse)
 *   2. Extract title/authors/abstract from first page
 *   3. Chunk into sections (~800 tokens each, by paragraph boundaries)
 *   4. Embed each chunk via Gemini embeddings
 *   5. Store in learner_paper_chunks (per-learner isolation)
 *   6. Also save paper metadata to learner_papers so agent can cite it
 *
 * Design: Per-learner isolation (Jeff Huber + Luke Kim): each student's
 * imported papers stay in their own retrieval context.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { getDb } from './db.js';
import { embedText } from './rag/embed.js';
import { savePaper } from './learnerMemory.js';

const CHUNK_SIZE = 800;   // approximate tokens per chunk
const CHUNK_OVERLAP = 100; // overlap to preserve context at boundaries

// ── DB setup ──────────────────────────────────────────────────────────────────

function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS learner_paper_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      paper_title TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function clearLearnerPaperChunks(learnerId) {
  ensureTable();
  getDb().prepare('DELETE FROM learner_paper_chunks WHERE learner_id = ?').run(learnerId);
}

export function insertLearnerChunk({ learnerId, paperTitle, chunkIndex, text, embedding }) {
  ensureTable();
  getDb()
    .prepare('INSERT INTO learner_paper_chunks (learner_id, paper_title, chunk_index, text, embedding) VALUES (?, ?, ?, ?, ?)')
    .run(learnerId, paperTitle, chunkIndex, text, JSON.stringify(embedding));
}

export async function searchLearnerChunks(learnerId, queryEmbedding, { k = 4 } = {}) {
  ensureTable();
  const { cosineSimilarity } = await import('./rag/embed.js');
  const rows = getDb()
    .prepare('SELECT paper_title, chunk_index, text, embedding FROM learner_paper_chunks WHERE learner_id = ?')
    .all(learnerId);

  const scored = rows.map(r => ({
    source: `Imported: ${r.paper_title}`,
    title: `${r.paper_title} (chunk ${r.chunk_index})`,
    text: r.text,
    score: cosineSimilarity(queryEmbedding, JSON.parse(r.embedding))
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// ── Text chunking ─────────────────────────────────────────────────────────────

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  // Split on paragraph boundaries first, then combine into ~chunkSize word chunks
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
  const chunks = [];
  let current = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (wordCount + words > chunkSize && current.length > 0) {
      chunks.push(current.join('\n\n'));
      // Keep last paragraph for overlap
      const overlapParas = current.slice(-Math.ceil(overlap / 50));
      current = [...overlapParas, para];
      wordCount = overlapParas.join(' ').split(/\s+/).length + words;
    } else {
      current.push(para);
      wordCount += words;
    }
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));
  return chunks;
}

// ── Metadata extraction ───────────────────────────────────────────────────────

function extractMetadata(text) {
  const lines = text.split('\n').filter(l => l.trim());

  // Title: usually the longest line in the first 10 lines
  const titleCandidates = lines.slice(0, 10).filter(l => l.length > 10 && l.length < 200);
  const title = titleCandidates.reduce((a, b) => (b.length > a.length ? b : a), '');

  // Abstract: text between "Abstract" and first section heading
  const abstractMatch = text.match(/abstract[:\s\n]+([^]+?)(?:\n\s*\n\s*(?:1\.|introduction|keywords))/i);
  const abstract = abstractMatch ? abstractMatch[1].replace(/\s+/g, ' ').trim().slice(0, 500) : '';

  // Authors: lines near the title containing common author patterns
  const authorLines = lines.slice(0, 15).filter(l =>
    /\b(university|institute|department|@|\band\b)/i.test(l) && l.length < 200
  );
  const authors = authorLines.slice(0, 2).join(', ').slice(0, 200) || 'Unknown';

  return {
    title: title.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Imported Paper',
    abstract,
    authors
  };
}

// ── Main import function ──────────────────────────────────────────────────────

export async function importPaperFromBuffer(learnerId, pdfBuffer, originalFilename) {
  // 1. Extract text from PDF
  let pdfData;
  try {
    pdfData = await pdfParse(pdfBuffer);
  } catch (e) {
    throw new Error(`Could not parse PDF "${originalFilename}": ${e.message}`);
  }

  const text = pdfData.text || '';
  if (text.trim().length < 100) {
    throw new Error('PDF appears to be empty or image-only (no extractable text).');
  }

  // 2. Extract metadata
  const meta = extractMetadata(text);

  // 3. Save paper metadata to learner_papers so agent can cite it
  savePaper(learnerId, {
    arxiv_id: null,
    title: meta.title,
    authors: meta.authors,
    summary: meta.abstract || text.slice(0, 300),
    key_insight: `Imported PDF: ${originalFilename}`,
    gap_identified: null
  });

  // 4. Chunk the full text
  const chunks = chunkText(text);

  // 5. Embed each chunk and store
  const inserted = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = `${meta.title}\n\n${chunks[i]}`.slice(0, 3000); // cap for embedding
    const embedding = await embedText(chunkText, 'RETRIEVAL_DOCUMENT');
    insertLearnerChunk({
      learnerId,
      paperTitle: meta.title,
      chunkIndex: i,
      text: chunks[i],
      embedding
    });
    inserted.push(i);
    // Pace to avoid rate limiting
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  return {
    title: meta.title,
    authors: meta.authors,
    abstract: meta.abstract,
    chunks: inserted.length,
    pages: pdfData.numpages || '?'
  };
}

export function getImportedPaperCount(learnerId) {
  ensureTable();
  return getDb()
    .prepare('SELECT COUNT(DISTINCT paper_title) AS n FROM learner_paper_chunks WHERE learner_id = ?')
    .get(learnerId)?.n ?? 0;
}
