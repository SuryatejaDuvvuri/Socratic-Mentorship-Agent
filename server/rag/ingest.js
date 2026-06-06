// RAG ingestion: read corpus markdown, chunk by section, embed, store.
// Run once with:  node server/rag/ingest.js
//
// Each corpus file starts with a header block:
//   # Document Title
//   SOURCE: <citation string>
//   TAGS: <comma,separated,tags>   (optional default tags for the doc)
// Followed by `## Heading` sections — each section becomes one chunk.

import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { embedText } from './embed.js';
import { clearChunks, insertChunk, countChunks } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(__dirname, 'corpus');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDoc(raw) {
  const lines = raw.split('\n');
  let source = 'Unknown source';
  let defaultTags = '';

  for (const line of lines.slice(0, 6)) {
    const s = line.match(/^SOURCE:\s*(.+)$/i);
    if (s) source = s[1].trim();
    const t = line.match(/^TAGS:\s*(.+)$/i);
    if (t) defaultTags = t[1].trim();
  }

  // Split on `## ` headings into chunks.
  const chunks = [];
  const parts = raw.split(/\n##\s+/);
  // parts[0] is the header block; the rest are sections.
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    if (!body) continue;
    chunks.push({ source, title, tags: defaultTags, text: `${title}\n${body}` });
  }
  return chunks;
}

async function main() {
  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.md'));
  if (!files.length) {
    console.error('[ingest] no .md files in corpus/');
    process.exit(1);
  }

  console.log(`[ingest] clearing existing chunks...`);
  clearChunks();

  let total = 0;
  for (const file of files) {
    const raw = readFileSync(join(CORPUS_DIR, file), 'utf8');
    const chunks = parseDoc(raw);
    console.log(`[ingest] ${file}: ${chunks.length} chunks`);
    for (const c of chunks) {
      const embedding = await embedText(c.text, 'RETRIEVAL_DOCUMENT');
      insertChunk({ ...c, embedding });
      total++;
      await sleep(250); // stay under embedding rate limits
    }
  }

  console.log(`[ingest] done. ${total} chunks embedded. Store now holds ${countChunks()}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[ingest] failed:', e);
  process.exit(1);
});
