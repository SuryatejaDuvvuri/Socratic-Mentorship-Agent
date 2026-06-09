# Research Mentorship Agent — Build Plan

## Final Architecture

**Frontend:** React + Vite (from starter, redesigned UI)  
**Backend:** Node.js + Express (from starter, rewritten routes)  
**Database:** SQLite (better-sqlite3)  
**LLM:** Gemini API  
**Tools:** arxiv API (live paper search)  
**Demo domain:** code review / semantic bug detection  

---

## Project Structure

```
.
├── server/
│   ├── index.js                    (Express app, routes)
│   ├── db.js                       (SQLite setup + queries)
│   ├── learnerMemory.js            (LearnerMemory class, DB interface)
│   ├── agents/
│   │   ├── domainReadiness.js      (Phase 1 agent)
│   │   ├── literatureDiscovery.js  (Phase 2 agent)
│   │   ├── proposalDraft.js        (Phase 3 agent)
│   │   └── rubricCheck.js          (Phase 4 agent)
│   ├── tools/
│   │   ├── arxiv.js                (arxiv API search + fetch)
│   │   └── gemini.js               (Gemini API wrapper)
│   └── data/
│       └── codeReview.json         (demo domain: concepts, papers)
│
├── src/
│   ├── App.jsx                     (redesigned for workflow phases)
│   ├── components/
│   │   ├── Phase1.jsx              (domain readiness UI)
│   │   ├── Phase2.jsx              (literature discovery UI)
│   │   ├── Phase3.jsx              (proposal draft UI)
│   │   └── WorkflowState.jsx       (display current state)
│   └── index.css
│
├── package.json
├── .env.example
└── BUILD_PLAN.md (this file)
```

---

## Database Schema (SQLite)

```sql
-- Learner profiles (persistent across sessions)
CREATE TABLE learners (
  id TEXT PRIMARY KEY,
  domain TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Concepts understood per learner
CREATE TABLE learner_concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  concept TEXT,
  understanding_level TEXT,  -- 'weak', 'moderate', 'strong'
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learner_id) REFERENCES learners(id)
);

-- Papers read per learner
CREATE TABLE learner_papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  arxiv_id TEXT,
  title TEXT,
  authors TEXT,
  key_insight TEXT,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learner_id) REFERENCES learners(id)
);

-- Research history (decisions, explorations)
CREATE TABLE research_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  action TEXT,             -- 'explored_concept', 'read_paper', 'identified_gap', etc.
  details TEXT,            -- JSON serialized
  decision TEXT,           -- what the user decided
  reasoning TEXT,          -- why
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learner_id) REFERENCES learners(id)
);

-- Current hypothesis per learner
CREATE TABLE current_hypothesis (
  id INTEGER PRIMARY KEY,
  learner_id TEXT UNIQUE,
  gap TEXT,
  why_matters TEXT,
  proposed_solution TEXT,
  confidence REAL,         -- 0.0 to 1.0
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learner_id) REFERENCES learners(id)
);

-- Draft proposal sections
CREATE TABLE proposal_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  section_name TEXT,       -- 'motivation', 'method', 'evaluation', etc.
  content TEXT,            -- current draft
  version INTEGER,         -- iteration count
  agent_critique TEXT,     -- JSON: {strong, weak, confusion}
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learner_id) REFERENCES learners(id)
);

-- Rubric checks
CREATE TABLE rubric_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  criterion TEXT,
  status TEXT,             -- 'pass', 'weak', 'fail'
  evidence TEXT,
  fixes_attempted INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (learner_id) REFERENCES learners(id)
);
```

---

## Demo Domain Data Structure (`server/data/codeReview.json`)

```json
{
  "domain": "code review / semantic bug detection",
  "concepts": [
    {
      "name": "AST",
      "definition": "Abstract Syntax Tree — a tree representation of code structure",
      "feynman_question": "In your own words, what's an AST and why would you use it for code analysis?"
    },
    {
      "name": "data-flow analysis",
      "definition": "Tracking how data flows through a program to find bugs",
      "feynman_question": "Can you explain data-flow analysis to me like I've never heard of it?"
    },
    {
      "name": "static analysis",
      "definition": "Analyzing code without running it",
      "feynman_question": "Why would you analyze code statically instead of just running it?"
    }
  ],
  "papers": [
    {
      "arxiv_id": "2107.xxxxx",
      "title": "Example Paper 1",
      "summary": "What it does, what it assumes, what it claims"
    }
    // 4-5 more papers on semantic bug detection, code review, etc.
  ],
  "rubric": {
    "format_and_submission": { "points": 5, "description": "..." },
    "figure_or_visual": { "points": 7, "description": "..." },
    // ... rest of rubric criteria
  }
}
```

---

## Day-by-day Build Plan

### Day 1 (May 31, Fri): Foundation + Phase 1

**Goal:** Database + Phase 1 working end-to-end

- [ ] Set up SQLite + schema (15 min)
- [ ] Create `learnerMemory.js` class to interface with DB (30 min)
- [ ] Wire Gemini API tool calling (if not already done) (30 min)
- [ ] Build Phase 1 agent (`domainReadiness.js`) (1 hour)
  - Takes domain + learner_id
  - Loads concepts from `codeReview.json`
  - Asks Feynman questions
  - Judges answers (via Gemini: "is this answer strong/weak/moderate?")
  - Saves to DB
- [ ] Create Phase 1 Express endpoint + React component (1 hour)
- [ ] Test end-to-end: user goes through domain readiness

**By end of Day 1:** Phase 1 works locally, saves to SQLite, can be called via `/api/phase/1`

---

### Day 2 (Jun 1, Sat): Phase 2

**Goal:** Literature discovery working end-to-end

- [ ] Build arxiv search tool (`tools/arxiv.js`) (1 hour)
  - Takes domain keyword ("semantic bug detection in code review")
  - Fetches 5 papers from arxiv
  - Saves to DB
- [ ] Build Phase 2 agent (`literatureDiscovery.js`) (1.5 hours)
  - Retrieves papers from DB
  - Shows to user: "Read these"
  - User comes back: "I've read them"
  - Agent asks: "What do you notice?"
  - User answers
  - Agent asks: "What's the gap?"
  - User answers
  - Agent synthesizes + suggests gap hypothesis
  - Saves to DB
- [ ] Create Phase 2 Express endpoint + React component (1 hour)
- [ ] Test end-to-end: Phase 1 → Phase 2 flow

**By end of Day 2:** Full Phase 1 + Phase 2 working, can demo the discovery loop

---

### Day 3 (Jun 2, Sun): Phase 3 + Polish for Presentation

**Goal:** Phase 3 minimal + make it demoable

- [ ] Build Phase 3 agent (`proposalDraft.js`) (1 hour)
  - Takes validated gap from DB
  - Drafts Motivation section
  - Self-critiques (strong + weak + confusion)
  - Returns to user
- [ ] Create Phase 3 React component (30 min)
- [ ] Clean up UI: make it look like a workflow (30 min)
  - Show current phase
  - Show state summary
  - Clear input/output
- [ ] Get screenshots or record a demo walkthrough (30 min)
- [ ] Write up talking points for presentation (30 min)

**By end of Day 3:** Phase 1 + 2 + 3 working, demoable, ready for presentation

---

### Days 4-6 (Jun 3-5): Phase 4 + Refinement + Video

**Goal:** Full working prototype + 5-min video

- [ ] Build Phase 4 agent (`rubricCheck.js`) (1 hour)
  - Loads rubric from `codeReview.json`
  - Checks proposal against each criterion
  - Returns score + weak areas
- [ ] Phase 5 (revision) — stub or show one iteration (1 hour)
- [ ] Clean up code + add comments (1 hour)
- [ ] Run full demo: Phase 1 → 2 → 3 → 4 (30 min)
- [ ] Record 5-min video (1-2 hours)
  - Show workflow design
  - Live or recorded demo of the flow
  - Explain the mentorship approach
  - Mention Stage 2 refinements
- [ ] Create `AI_USAGE.md` for Stage 1 (30 min)

**By end of Day 6 (June 5):** Fully working prototype, video ready, can submit Stage 1

---

## What to Code First (Priority 1: Today)

Start with **Day 1** — get Phase 1 + database working. This is the foundation everything else sits on.

```bash
# Setup
npm install better-sqlite3 axios

# Create:
server/db.js              # SQLite initialization
server/learnerMemory.js   # DB interface class
server/agents/domainReadiness.js  # Phase 1 logic
server/tools/gemini.js    # Gemini wrapper (if not existing)

# Update:
server/index.js           # Add /api/phase/1 endpoint
src/App.jsx               # Add Phase1 component
```

The key files to start with:
1. `db.js` — initialize SQLite, create tables
2. `learnerMemory.js` — CRUD operations
3. `domainReadiness.js` — the Phase 1 agent loop

---

## Env setup

Add to `.env`:

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-flash
PORT=8787
```

---

## Is this the build plan?

If yes, I can help you code Day 1 starting now. If you want to tweak anything (the structure, the DB schema, the phases, the order), let me know before we start.
