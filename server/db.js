import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'mentor.db');

let _db = null;

export function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    -- Learner profiles: one row per user session
    CREATE TABLE IF NOT EXISTS learners (
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- What the learner told us about themselves and their domain
    CREATE TABLE IF NOT EXISTS learner_intake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      field TEXT NOT NULL,        -- 'background', 'domain', 'goal', 'audience', etc.
      value TEXT NOT NULL,
      turn INTEGER DEFAULT 0,     -- which conversation turn this came from
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- Cached arxiv search results (shared across learners, 7-day TTL)
    CREATE TABLE IF NOT EXISTS arxiv_search_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL UNIQUE,
      results TEXT NOT NULL,       -- JSON array of papers
      cached_at TEXT DEFAULT (datetime('now'))
    );

    -- Papers retrieved or discussed during literature phase
    CREATE TABLE IF NOT EXISTS learner_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      arxiv_id TEXT,
      title TEXT NOT NULL,
      authors TEXT,
      summary TEXT,
      key_insight TEXT,           -- what the learner said about this paper
      gap_identified TEXT,        -- gap this paper helped surface
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- The evolving research hypothesis / gap
    CREATE TABLE IF NOT EXISTS research_hypothesis (
      id INTEGER PRIMARY KEY,
      learner_id TEXT UNIQUE NOT NULL,
      gap TEXT,
      why_it_matters TEXT,
      proposed_approach TEXT,
      confidence_note TEXT,       -- agent's honest note on how confident it is
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- Proposal sections: each section is stored + versioned
    CREATE TABLE IF NOT EXISTS proposal_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      section_name TEXT NOT NULL, -- 'abstract', 'motivation', 'method', 'evaluation', etc.
      content TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      agent_strong TEXT,          -- what's strong about this draft
      agent_weak TEXT,            -- what's weak or uncertain
      agent_confused TEXT,        -- where agent is honestly unsure
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- Rubric evaluation results
    CREATE TABLE IF NOT EXISTS rubric_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      criterion TEXT NOT NULL,    -- e.g. 'Novelty and prior work'
      max_points INTEGER,
      projected_points INTEGER,   -- actual score the agent assigned
      status TEXT,                -- 'strong', 'weak', 'missing'
      evidence TEXT,
      suggested_fix TEXT,
      checked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- Conversation history (for context continuity)
    CREATE TABLE IF NOT EXISTS conversation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      phase TEXT NOT NULL,        -- 'intake', 'literature', 'draft', 'rubric', 'revision', 'hypothesis', 'specificity'
      role TEXT NOT NULL,         -- 'mentor' or 'user'
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- Stage 2 ── Testable hypotheses (H1 outcome, H2 mechanism, H3 impact)
    CREATE TABLE IF NOT EXISTS research_hypotheses (
      id INTEGER PRIMARY KEY,
      learner_id TEXT UNIQUE NOT NULL,
      h1 TEXT,
      h2 TEXT,
      h3 TEXT,
      rationale TEXT,
      mentor_note TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );

    -- Stage 2 ── Specificity gate (must pass before Phase 3 unlocks)
    CREATE TABLE IF NOT EXISTS specificity_gate (
      id INTEGER PRIMARY KEY,
      learner_id TEXT UNIQUE NOT NULL,
      dataset_name TEXT,
      sample_size TEXT,
      named_instruments TEXT,
      prior_reference TEXT,
      passed INTEGER DEFAULT 0,
      mentor_feedback TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );
  `);

  // Migrations — safe to run on existing DBs
  try {
    _db.exec(`ALTER TABLE rubric_checks ADD COLUMN projected_points INTEGER`);
  } catch { /* column already exists */ }

  // Stage 2 migrations — defensive (in case the CREATE TABLE didn't fire on older DBs)
  try {
    _db.exec(`CREATE TABLE IF NOT EXISTS research_hypotheses (
      id INTEGER PRIMARY KEY,
      learner_id TEXT UNIQUE NOT NULL,
      h1 TEXT, h2 TEXT, h3 TEXT,
      rationale TEXT, mentor_note TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch {}

  try {
    _db.exec(`CREATE TABLE IF NOT EXISTS specificity_gate (
      id INTEGER PRIMARY KEY,
      learner_id TEXT UNIQUE NOT NULL,
      dataset_name TEXT, sample_size TEXT,
      named_instruments TEXT, prior_reference TEXT,
      passed INTEGER DEFAULT 0, mentor_feedback TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch {}

  // Observability: agent traces for the flywheel loop
  try {
    _db.exec(`CREATE TABLE IF NOT EXISTS agent_traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      event_type TEXT NOT NULL,   -- 'rag_retrieval', 'arxiv_search', 'deepening_iteration', 'gate_rejection', 'rubric_score', 'figure_generated'
      payload TEXT,               -- JSON blob with event-specific data
      timestamp TEXT DEFAULT (datetime('now'))
    )`);
  } catch {}

  // Per-learner imported paper chunks
  try {
    _db.exec(`CREATE TABLE IF NOT EXISTS learner_paper_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learner_id TEXT NOT NULL,
      paper_title TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch {}

  console.log(`[db] SQLite ready at ${DB_PATH}`);
  return _db;
}
