# AI Usage Documentation

## Overview

This project uses a multi-provider LLM abstraction to build a Socratic research mentorship agent. Stage 1 used Gemini free tier. Stages 2–3 switched to Cerebras (gpt-oss-120b) after persistent Gemini unavailability and arxiv rate limits led to a full infrastructure overhaul. All LLM calls are documented below with model, prompts, and failure handling.

## Models Used

| Model | Purpose | Rationale |
|-------|---------|-----------|
| `gpt-oss-120b` (Cerebras) | All agent interactions (phases 1–4) | Free tier, fast inference, no RPM issues after single-call refactor. Student discovered this model in Cerebras dashboard. |
| `gemini-embedding-001` | RAG corpus embedding | Only embedding model available on free tier; cosine search in SQLite. |
| `gemini-2.5-flash-lite` | Stage 1 only (deprecated) | Was primary LLM in Stage 1; became unavailable in Stage 2. |

## Human vs AI Contribution — Stage 2

### What the student did (decisions, direction, debugging)
- **Identified the arxiv problem:** Noticed persistent 429 rate limits across multiple runs, asked "Why is arxiv API rate limited? It's always the rate limiting problem" and "Do we really need arxiv api?"
- **Proposed the Tavily solution:** "Can't we just put in our own web search tool which brings arxiv papers?" — this was the student's idea, not the AI's.
- **Chose the LLM provider:** After Gemini went down, student suggested trying Cerebras and SambaNova ("Never heard of SambaNova and Cerebras. Maybe we could try these two starting with Cerebras"). Found `gpt-oss-120b` in their Cerebras dashboard.
- **Identified RPM waste:** Saw rate-limit errors in logs, asked "Why too many calls?" and stated the design principle: "Unlimited API calls are not good. We want to make the most out of the API call right?"
- **Caught bad truncation:** When Tavily 400-char limit hit, student rejected naive truncation: "Taking first 150 is not good right? Maybe summarize them but we'll lose detail."
- **Provided all API keys** (Cerebras, Tavily) and managed account setup.
- **Directed mentor UX:** Said the text "looks disengaging" and asked for "visual structure" and "reduce length a little bit so it sounds concise."
- **Directed relational mentorship:** Student's idea to add persistent mentor identity and learner story tracking across all agents.

### What the AI did (implementation)
- **Built Tavily integration** (`server/tools/tavily.js`): search function, caching layer (7-day TTL), fallback to broader search, result parsing into same shape as old arxiv API.
- **Built multi-provider LLM abstraction** (`server/tools/llm.js`): `callLLM()`/`callLLMJson()` routing to Cerebras, Groq, SambaNova, Gemini, or Ollama based on env var. Shared JSON parsing with repair logic.
- **Collapsed multi-call agents into single calls:**
  - `gapDeepening.js`: 4 LLM calls → 1 (extract claims + assess + decide readiness in one prompt)
  - `gapValidation.js`: 3 LLM calls → 1 (novelty check + quality gate in one prompt)
  - `literatureDiscovery.js`: 2 LLM calls → 1 (pick query + summarize papers together)
  - `proposalDraft.js`: parallel → sequential with delays to avoid RPM
- **Implemented smart query truncation:** Extract first sentence of long gaps instead of naive slice, cap at 380 chars.
- **Added relational mentorship system** (`server/mentorPersona.js`): `withMentorContext()` wrapper, `recordMoment()` for learner story, `detectAndRecordMoments()` for automatic moment detection.
- **Integrated mentorship into all agents:** hypothesisGeneration, specificityGate, literatureDiscovery, domainReadiness, proposalDraft.
- **Rewrote mentor text formatting:** PROBE_SYSTEM_PROMPT with bold paper titles, "What I'm seeing" structure, "My read" one-liner, ≤15 word questions. domainReadiness capped at 2 sentences. proposalDraft with emoji icons and structured sections.

## Human vs AI Contribution — Stage 3

### What the student did (decisions, direction, debugging)
- **Identified PDF export was broken:** "We really need to fix our pdf. I think maybe look at the starter code and see how they do it?"
- **Asked for rubric improvement:** "Could we do better on the scoring?" after seeing 36/50 output — student questioned whether scores were calibrated.
- **Directed commit organization:** Asked for logical grouping of changes across 5 commits rather than one giant commit.
- **Reviewed all generated code** and provided feedback on formatting, UX, and architecture decisions.
- **Managed project scope:** Prioritized which fixes to tackle (PDF → rubric → remaining cleanup).

### What the AI did (implementation)
- **Fixed PDF export:** Installed tectonic (`brew install tectonic`), updated `/server/index.js` endpoint to compile LaTeX via tectonic with HTML fallback, tested end-to-end with real learner data.
- **Improved rubric scoring** (`server/agents/rubricCheck.js`):
  - Added calibrated scoring bands (full/partial/minimal descriptions per criterion)
  - Added 5-tier scoring (full/good/partial/minimal/missing) instead of 3-tier
  - Added anti-inflation rules ("45+/50 would be publication-ready, most drafts are 25-38")
  - Added evidence quoting requirement (must cite exact draft sentence)
  - Added confidence levels (high/medium/low) per criterion
  - Added points-recoverable per fix for prioritization
- **Built "Your Journey" UI panel** in `App.jsx`: amber-styled panel showing learner story moments with emoji tags.
- **Created 5 organized git commits** covering: Tavily migration, multi-provider LLM, single-call refactor, mentor formatting, learner story UI.

## Prompt Engineering Decisions

### Phase 1: Domain Readiness (Feynman-style foundation check)

**Goal:** Verify student has enough conceptual foundation before reading papers.

**Key Design:**
- **System prompt** emphasizes *conversation* not *quiz*: "react to what they said, offer your honest read, invite pushback."
- **Tone shift** from earlier quiz-style to collegial thinking-partner.
- **Stopping rule:** When student shows understanding across key concepts, declare readiness — don't drag it out.
- **Why:** Reduced API calls (fewer turns) while improving mentor authenticity.

**Prompt file:** `server/agents/domainReadiness.js` (lines 12–25)

**Example turn:**
- User: "Pattern matching is when you find things that look the same."
- Agent: [Reflects understanding] "Right, you're treating it as shape-matching. That lands for simple cases. One thing that trips students up is that in code review, two 'shapes' can have the same syntax but different *intent* — one is a legitimate refactor, the other hides a vulnerability. Does that land?"

### Phase 2: Literature Discovery (Socratic gap discovery with grounding)

**Goal:** Help student discover research gap through paper engagement, grounded in real evidence.

**Key Design:**
- **CRITICAL RULE:** Every message references papers by title — no generic "what do you notice?" questions.
- **Synthesis:** Agent connects across papers, offers its own read, invites pushback — not interrogation.
- **Grounding in corpus:** Questions grounded in NSF "what's the open problem" language.
- **Why:** Prevents hallucination (papers are cited, exist, or agent admits it doesn't know them).

**Prompt file:** `server/agents/literatureDiscovery.js` (lines 20–33)

**Example turn:**
- Papers: ["Paper A: Diff-based review assumes clean input", "Paper B: LLM review comments on syntax"]
- Agent: "My read is all three treat input as well-formed code; none handle the messy, partially-merged state. Paper A and B both skip that. I'd put ~75% confidence on that being the real gap — does that match what you're seeing?"

### Phase 3: Proposal Drafting (RAG-grounded self-critique)

**Goal:** Draft proposal sections at quality, critique honestly against authoritative standards (NSF + rubric).

**Key Design:**
- **RAG injection:** Retrieve relevant NSF/rubric standard for each section, embed in system prompt.
- **Cite by number:** Agent critiques by saying "[1] requires X; your draft misses it" — grounding visible to user.
- **Honest self-assessment:** Strong/weak/confused split.
- **Why:** Evaluation is grounded in real criteria, not model vibes. User sees sources.

**Prompt file:** `server/agents/proposalDraft.js` (lines 17–23, 45–63)

**Example critique:**
- Weak: "The draft mentions 'we will evaluate it' but does not specify metrics, baselines, or success criteria [1, 3]. [1] NSF requires a falsifiable success measure. [3] course rubric expects specific metrics."

### Phase 4: Rubric Check (Grounded evaluation)

**Goal:** Score proposal against 8 rubric criteria, each grounded in NSF/course standards.

**Key Design:**
- **RAG injection:** Retrieve rubric + NSF criteria before evaluation.
- **Honest uncertainty:** "I'm not sure if X is strong enough because Y" is preferred over false confidence.
- **Projected scoring:** Honest estimate of points per criterion.
- **Why:** Evaluation is transparent and sourced, not black-box.

**Prompt file:** `server/agents/rubricCheck.js` (lines 24–52)

### Phase 2b: Gap Validation (Single-call novelty + quality check)

**Goal:** Test whether the proposed gap is genuinely open and ready for a proposal.

**Key Design (Stage 2 rewrite):**
- **Single LLM call:** Novelty check AND quality gate in one prompt (was 3 separate calls).
- **Tavily search:** Replaces arxiv API; site-biased toward arxiv.org and semanticscholar.org.
- **Smart query truncation:** Extracts first sentence of long gaps instead of naive slice (student caught this).
- **5-check quality gate:** Concrete, Scoped, Testable, On-domain, Grounded — all must pass.
- **Honest verdict:** If no papers retrieved, agent says so honestly instead of declaring gap "open."

**Prompt file:** `server/agents/gapValidation.js` (VALIDATE_AND_ASSESS_PROMPT)

### Phase 2c: Gap Deepening (Single-call claim extraction + assessment)

**Goal:** Stress-test the gap by extracting falsifiable claims and checking them against evidence.

**Key Design (Stage 2 rewrite):**
- **Was:** 4 LLM calls (extractClaims → assessClaim×N → decideReadiness). Caused RPM limits.
- **Now:** 1 Tavily search + 1 LLM call does everything. Student's principle: "make the most out of the API call."
- **Evidence chain:** Each claim links to a specific paper title and what it shows.

**Prompt file:** `server/agents/gapDeepening.js` (GAP_DEEPENING_PROMPT)

### Phase 4: Rubric Check (Calibrated scoring with bands)

**Goal:** Score proposal against 8 rubric criteria with calibrated, evidence-backed scoring.

**Key Design (Stage 3 rewrite):**
- **Scoring bands:** Each criterion has full/partial/minimal descriptions so the LLM knows what earns each score.
- **5-tier scoring:** full/good/partial/minimal/missing (was 3-tier strong/weak/missing).
- **Anti-inflation:** Explicit rule: "45+/50 would be publication-ready, most drafts are 25-38."
- **Evidence quoting:** Must quote exact sentence from draft. No quote = score 0.
- **Confidence levels:** high/medium/low per criterion so student knows where assessment is uncertain.
- **Points-recoverable:** Each fix shows how many points it would gain for prioritization.

**Prompt file:** `server/agents/rubricCheck.js` (RUBRIC_SYSTEM_PROMPT)

## External Data Sources (RAG Corpus)

The following documents were ingested, chunked, embedded, and stored in SQLite for retrieval:

### 1. NSF Merit Review Criteria
**Source:** https://www.nsf.gov/funding/merit-review  
**File:** `server/rag/corpus/nsf-merit-review.md`  
**Chunks:** 7  
**Content:** Definition of Intellectual Merit and Broader Impacts, 4 review elements, the 5 questions every project description must answer.  
**Used in:** Phase 3 (drafting), Phase 4 (rubric check)

### 2. NSF Proposal Components & Requirements
**Source:** https://www.nsf.gov/policies/pappg/24-1/ch-2-proposal-preparation  
**File:** Built into nsf-merit-review.md  
**Content:** Concrete rubric for each proposal section (project summary, project description, results from prior support, budget, data management plan, etc.).  
**Used in:** Phase 3 (section drafting)

### 3. Proposal-Writing Heuristics
**Source:** Synthesized from NSF "A Guide for Proposal Writing" and standard research-methods guidance  
**File:** `server/rag/corpus/proposal-writing-heuristics.md`  
**Chunks:** 7  
**Content:** How to test a gap is open, novelty checks, writing motivation (concrete stakeholder + pain), method specificity, evaluation falsifiability, feasibility/risk, common failure modes.  
**Used in:** Phase 2 (gap discovery), Phase 3 (drafting), Phase 4 (rubric)

### 4. Course Rubric
**Source:** CS222 course grading rubric (from README)  
**File:** `server/rag/corpus/course-rubric.md`  
**Chunks:** 8  
**Content:** 8 rubric criteria (format, figure, motivation, novelty, method, evaluation, feasibility, writing) with point values.  
**Used in:** Phase 4 (rubric check)

**Total corpus:** 22 chunks, ~5KB of text, embedded and searchable.  
**Ingestion:** `npm run rag:ingest` (see package.json).

## API Call Patterns

### callLLMJson / callLLM (all agents — Stage 2+)

**Handler:** `server/tools/llm.js`

**Pattern:**
```
callLLMJson({
  systemPrompt: withMentorContext(learnerId, "mentor instructions"),
  history: [...prior turns],
  userMessage: "user input",
  temperature: 0.2–0.6,
  requiredKeys: ["message", "verdict", ...]
})
```

**Multi-provider routing:** Routes to Cerebras, Groq, SambaNova, Gemini, or Ollama based on `LLM_PROVIDER` env var. All use OpenAI-compatible `/v1/chat/completions` format.

**Guardrails:**
1. **JSON repair:** `parseJson()` handles markdown fences, trailing commas, truncated JSON.
2. **Retry-on-parse-failure:** Sends correction prompt with the broken output, retries once.
3. **Required keys validation:** Missing keys throw an error.
4. **Mentor context injection:** `withMentorContext()` prepends persistent mentor identity to every system prompt.

**Model:** `gpt-oss-120b` on Cerebras (configurable via `LLM_MODEL` env var)

### embedText (RAG)

**Handler:** `server/rag/embed.js`

**Pattern:**
```
embedText(text, 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY')
```

**Returns:** Float32 vector (768 dims for `gemini-embedding-001`)

**Note:** Embeddings still use Gemini — only the chat LLM switched to Cerebras.

### searchPapers (Tavily — replaces arxiv API in Stage 2)

**Handler:** `server/tools/tavily.js`

**Pattern:**
```
searchPapers(query, maxResults=6)
```

**Design:** Uses Tavily Search API with `include_domains: ["arxiv.org", "semanticscholar.org"]` bias. Falls back to broader search if site-filtered returns nothing.

**Caching:** Results cached in `arxiv_search_cache` SQLite table with 7-day TTL (1000 free queries/day, but no point re-searching the same gap).

**Query truncation:** If query > 200 chars, extract first sentence and cap at 380 chars (Tavily's 400-char limit).

**Returns:** Same shape as old searchArxiv: `{ arxiv_id, title, authors, summary, published, url }`.

**Why Tavily over arxiv API:** arxiv API rate-limited every request (even with caching, backoff, circuit breakers). Student identified this: "Do we really need arxiv api? Can't we just put in our own web search tool?"

## Failures & Mitigations

| Failure | Root Cause | Mitigation | Who Found It |
|---------|-----------|-----------|--------------|
| JSON truncation (Phase 3) | Gemini `maxOutputTokens: 2048` too low for 6-paper summaries | Raised to 8192; added `tryRepairJson()` fallback | AI debugging |
| Gemini ignoring JSON instruction | Instruction buried in system prompt; Gemini returned prose | Added `responseMimeType: 'application/json'` at API level | AI debugging |
| Zero-result arxiv queries | LLM emitting over-quoted queries like `"code review" "intent"` | Sanitize queries (strip quotes/operators) + prompt rule | AI debugging |
| arxiv API rate limiting (persistent) | arxiv API returns 429 on nearly every request, even with caching + backoff + circuit breakers | **Student proposed replacing arxiv entirely with Tavily search** — implemented `server/tools/tavily.js` | **Student** |
| Gemini API unavailable | "The service is currently unavailable" errors | Student suggested trying Cerebras; built multi-provider LLM abstraction | **Student** |
| Cerebras model not found | `llama-3.3-70b` doesn't exist on Cerebras | Student found `gpt-oss-120b` in their Cerebras dashboard | **Student** |
| Cerebras RPM exceeded | gapDeepening ran 4+ LLM calls in parallel via Promise.all | Collapsed to single-call architecture (student's principle: "make the most out of the API call") | **Student** identified, AI implemented |
| Tavily 400-char query limit | Long gap descriptions exceeded Tavily's max query length | Student rejected naive truncation; AI implemented first-sentence extraction | **Student** caught bad fix |
| PDF export broken | tectonic CLI not installed; endpoint not wired to starter code's `proposalLatexToPdf()` | Installed tectonic, updated endpoint with HTML fallback | Student identified, AI fixed |
| Mentor text disengaging | Long unstructured text walls in mentor responses | Rewrote prompts with visual structure (bold titles, bullets, "My read" pattern) | **Student** identified, AI implemented |
| Domain not persisting on resume | Phase 1 never saved domain to DB | Added `saveIntakeField(learnerId, 'domain', userMessage, 0)` on turn 0 | AI debugging |
| Section regeneration on tab switch | Each tab click called `/api/mentor/phase3/draft`, regenerating the section | Implemented section caching | AI debugging |

## Human Oversight & Edits

| Stage | Human Role | Evidence |
|-------|-----------|----------|
| **Phase 1** | Student answers conceptual questions; mentor probes. | Conversation history in DB. |
| **Phase 2** | Student reads papers, forms initial gap, requests novelty check. | Paper selection (student decides which to read), gap hypothesis (student proposes, agent refines). |
| **Phase 3** | Student accepts, edits, or rejects draft; provides feedback. | Critique history in DB; multiple versions per section stored. |
| **Phase 4** | Student reviews rubric check, prioritizes fixes. | Rubric results stored; student chooses which fixes to tackle. |

**All proposal content** is co-authored: agent drafts, human decides what to keep/revise. No section is 100% AI-generated without human review.

## Reproducibility

To reproduce this setup:

1. **Environment:** Node 18+, SQLite3 (via `better-sqlite3`), tectonic (for PDF export)
2. **API keys:** `.env` with `CEREBRAS_API_KEY`, `TAVILY_API_KEY`, `LLM_API_KEY` (Gemini, for embeddings). Set `LLM_PROVIDER=cerebras` and `LLM_MODEL=gpt-oss-120b`.
3. **Ingest corpus:** `npm run rag:ingest` (embeds corpus, populates SQLite `rag_chunks` table)
4. **Start dev:** `npm run dev` (API on 8787, web on 5174)
5. **Session:** Create learner via POST `/api/mentor/session`, then follow phases 1–4

**Test query:**
```bash
curl -X POST http://127.0.0.1:8787/api/mentor/session \
  | jq '.learnerId' | xargs -I {} \
  curl -X POST http://127.0.0.1:8787/api/mentor/phase1/concepts \
    -H 'Content-Type: application/json' \
    -d '{"domain":"code review"}'
```

## Cost & Quota Notes

- **Cerebras free tier:** gpt-oss-120b, generous RPM after single-call refactor
- **Tavily free tier:** 1000 queries/day, more than sufficient for student use
- **Gemini free tier:** Still used for embeddings only (20 req/min, 1500/day)
- **Typical session:** ~6-8 LLM calls total (phases 1–4) after single-call collapse
- **Cost:** All free tiers; student manages own API keys

## Proposal Generation Workflow (Final End-to-End Run)

The final `proposal.pdf` and `proposal.tex` were generated by running the complete workflow end-to-end on the student's actual research topic (mechanistic interpretability + sparse autoencoders for deceptive circuit detection):

**Workflow steps executed:**
1. **Phase 1 (Domain Readiness):** Student answered 4 Feynman concept questions (neural networks, transformers, embeddings, circuits) — all marked as "strong" or "weak" understanding. Cleared for Phase 2.
2. **Phase 2 (Literature Discovery):** Tavily searched for papers on mechanistic interpretability + sparse autoencoders; returned 6 real papers (Cunningham et al., Marks et al., survey papers). Student engaged in 3 Socratic turns identifying the gap: SAEs can decompose features but no method identifies deceptive circuits causally.
3. **Gap Deepening:** One LLM call validated the gap against literature — confirmed first claim (SAE feature extraction) is supported, second claim (no deceptive circuit method) is unverifiable (novel), ready to proceed.
4. **Hypotheses:** Generated H1 (≥30% deception reduction), H2 (≤5% SAE features cause it), H3 (generalizes across model scales). Student accepted all three.
5. **Specificity Gate:** Student committed to TruthfulQA dataset (817 questions), cross-scale models (GPT-2 XL + Pythia-6.9B), named tools (TransformerLens, SAELens), prior references (Cunningham, Marks). Passed gate.
6. **Draft-all:** All 5 proposal sections drafted in parallel (intellectual merit, broader impacts, motivation, method, novelty).
7. **Compose:** One LLM call with 12000 token budget composed full `proposal.tex` with TikZ pipeline figure, per-section word budgets, and citations to 6 papers.
8. **Compile:** tectonic compiled LaTeX to PDF; spacing issues fixed (titlesec + TikZ layout) to fit 3-page body + 1-page references.

**AI contribution:** All LLM calls, LaTeX generation, PDF compilation, caching, and error recovery.
**Human contribution:** Topic selection, answers to concept questions, paper reading and gap identification, hypothesis feedback, specificity commitments, final approval of PDF structure.

**Reproducibility:** To generate a fresh proposal on any topic, run `curl -o proposal.pdf "http://127.0.0.1:8787/api/mentor/export/pdf/<learnerId>?force=1"` after completing phases 1–3.

## Responsible AI Checklist

- ✅ All paper citations verified against arxiv/semanticscholar (tool-grounded via Tavily, no hallucination)
- ✅ Grounding sources documented (NSF, course rubric, proposal-writing guides embedded in RAG corpus)
- ✅ Critique and scores transparent (student sees which standard each critique cites)
- ✅ Honest uncertainty admitted (gap deepening agent says "unverifiable" for deceptive circuit novelty claim)
- ✅ Human-in-the-loop: student selected topic, answered concept questions, chose papers to read, confirmed gap, committed to specificity, approved final PDF
- ✅ Reproducible: corpus sourced, code open, no proprietary data, full workflow can be re-run end-to-end
- ✅ Proposal is student's research, not hallucinated — student defined mechanistic interpretability domain + sparse autoencoder + deceptive circuits focus from day one
