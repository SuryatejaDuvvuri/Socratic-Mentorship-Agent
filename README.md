# Socratic Research Mentorship Agent

A research-proposal mentor that doesn't write your proposal *for* you — it walks you through discovering one. The agent acts as a persistent mentor with memory of your journey: it checks your conceptual foundations, reads papers with you, pressure-tests your research gap against the literature, forces concrete experimental commitments, and only then drafts — with every claim grounded in retrieved sources. The final artifact is a compile-ready `proposal.tex` / `proposal.pdf`.

Built for the CS222 Spring final project (course docs live in [docs/](docs/)).

## How It Works

The workflow is a gated pipeline — you can't skip ahead until the current phase's quality bar is met:

```
Phase 1          Phase 2                  Phase 2.5             Phase 3            Phase 4
Domain     →     Literature         →     Gap Validation   →    Drafting      →    Rubric Check
Readiness        Discovery                + Deepening           + Figures          + Adversarial Review
(Feynman-style   (read papers            (novelty check         (RAG-grounded      (calibrated scoring
 concept check)   together, find          vs. literature,        sections,          against course rubric,
                  the gap Socratically)   claim stress-test)     TikZ figures)      reviewer attacks)
```

Throughout, a **relational mentor layer** tracks your story — breakthroughs, struggles, commitments, milestones — and injects that context into every LLM call, so the mentor remembers you across sessions. A **"Your Journey" panel** in the UI shows the moments it recorded.

### Key features

- **Socratic gap discovery** — the agent never hands you a gap; it probes what you noticed across papers until the gap surfaces, citing paper titles in every exchange.
- **Tavily-backed paper search** — real papers from arxiv/Semantic Scholar with 7-day result caching (replaced the rate-limited arxiv API).
- **Specificity gate** — refuses to draft until you commit to a named dataset, sample size, instruments, and a prior reference.
- **Agentic multi-hop RAG** — retrieval runs in hops (a second query derived from first-hop results pulls adjacent standards), reformulates low-relevance queries, and distills dense chunks into atomic facts before synthesis. Critiques cite `[RAG-N]` tags so every judgment is auditable against the standard it came from.
- **ReAct research assistant** (`POST /api/mentor/assistant`) — an agent that decides per-question whether tools are needed: `rag_search` (deep-dive corpus analysis with distillation), `define_term` (concept clarification, SQLite-cached so each unique term costs exactly one API call), `paper_search` (Tavily). Guardrails: per-call tool allowlists, input length caps, observation fencing against prompt injection, output sanitization, step + wall-clock budgets. Runs are traced into `agent_traces` for workflow metrics (`GET /api/mentor/traces/:learnerId/summary`).
- **Adversarial reviewer** — attacks your draft's weakest claims before a real reviewer does.
- **One-call LaTeX composition** — exports the full proposal as a single coherent LLM-composed document with a native TikZ workflow figure, compiled to PDF with tectonic (LLM repair retry on compile errors, template + print-HTML fallbacks).
- **Single-call agent architecture** — each phase is one well-structured LLM call, not chains of them, so free-tier rate limits are never the bottleneck.

## Setup

### Prerequisites

- **Node 18+**
- **[tectonic](https://tectonic-typesetting.github.io/)** for PDF compilation: `brew install tectonic` (macOS)
- API keys (all free tier):
  - [Cerebras](https://cloud.cerebras.ai/) — chat LLM (`gpt-oss-120b`)
  - [Tavily](https://tavily.com/) — paper search (1000 queries/day)
  - [Gemini](https://ai.google.dev/) — embeddings only

### Install

```bash
git clone https://github.com/SuryatejaDuvvuri/Socratic-Mentorship-Agent.git
cd Socratic-Mentorship-Agent
npm install

# Configure keys
cp .env.example .env
# … edit .env with your CEREBRAS_API_KEY, TAVILY_API_KEY, LLM_API_KEY (Gemini)

# Embed the RAG corpus (NSF criteria, proposal heuristics, course rubric)
npm run rag:ingest
```

### Run

```bash
npm run dev
```

Open **http://127.0.0.1:5174** (API runs on 8787).

Start a session, enter your research domain, and follow the phases. Progress persists in `mentor.db` (SQLite) — close the tab and resume any time; the mentor remembers where you left off.

### Export the proposal

From the UI's export buttons, or directly:

```bash
# Compile-ready LaTeX source
curl -o proposal.tex "http://127.0.0.1:8787/api/mentor/export/latex/<learnerId>"

# Compiled PDF (add ?force=1 to recompose from scratch)
curl -o proposal.pdf "http://127.0.0.1:8787/api/mentor/export/pdf/<learnerId>"
```

The export is composed by the LLM in one pass from your accumulated state (gap, hypotheses, commitments, papers, drafted sections) — coherent prose, a TikZ pipeline figure, and references built only from papers you actually read.

## Repo Layout

```
server/
  index.js               Express API (sessions, phases, export)
  proposalExport.js      Template LaTeX/HTML assembler (export fallback)
  pdfExport.js           tectonic compilation + LaTeX normalization
  learnerMemory.js       SQLite persistence for all learner state
  mentorPersona.js       Relational mentor identity + story moments
  agents/
    domainReadiness.js   Phase 1 — Feynman-style concept check
    literatureDiscovery.js Phase 2 — Socratic paper reading
    gapValidation.js     Phase 2.5 — novelty check vs. literature
    gapDeepening.js      Phase 2.5 — claim extraction + stress-test
    hypothesisGeneration.js  H1/H2/H3 testable hypotheses
    specificityGate.js   Brutal-specificity commitments gate
    proposalDraft.js     Phase 3 — RAG-grounded section drafting
    figureGeneration.js  TikZ figure suggestion + generation
    rubricCheck.js       Phase 4 — calibrated rubric scoring
    adversarialReview.js Reviewer-attack critique
    intake.js            Session intake (domain + idea capture)
    proposalCompose.js   One-call full proposal.tex composition
  tools/
    llm.js               Multi-provider LLM wrapper (Cerebras/Groq/SambaNova/Gemini/Ollama)
    tavily.js            Paper search + caching
  rag/                   Corpus, embeddings, retrieval
src/                     React UI (Vite)
docs/                    Course requirements and rubric
AI_USAGE.md              Models, prompts, human-vs-AI contributions, failures
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `CEREBRAS_API_KEY not set` | Copy `.env.example` → `.env` and add your key |
| PDF export returns HTML | tectonic isn't installed — `brew install tectonic` |
| No papers found | Check `TAVILY_API_KEY`; queries are cached 7 days in `mentor.db` |
| Embeddings fail on ingest | `LLM_API_KEY` (Gemini) is required for `npm run rag:ingest` |
| Want a different LLM | Set `LLM_PROVIDER` + matching key in `.env` (see `.env.example`) |
