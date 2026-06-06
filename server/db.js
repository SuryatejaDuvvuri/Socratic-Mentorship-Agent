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
      phase TEXT NOT NULL,        -- 'intake', 'literature', 'draft', 'rubric', 'revision'
      role TEXT NOT NULL,         -- 'mentor' or 'user'
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (learner_id) REFERENCES learners(id)
    );
  `);

  console.log(`[db] SQLite ready at ${DB_PATH}`);
  return _db;
}
