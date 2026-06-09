# Requirements Verification Checklist

## README Core Requirements

| Requirement | Our Design | Status |
|---|---|---|
| "Build and evaluate a research proposal workflow" | 7-phase mentorship workflow (phases 1-7) | ✅ |
| "Show understanding of how strong proposals are written" | Phase 1-4 guide user through problem, gap, method, evaluation, novelty | ✅ |
| "How an agent can support that process" | Mentorship agent with honest epistemic stance, gates, memory | ✅ |
| "How the final proposal can be evaluated" | Phase 4: rubric-based evaluation against grading criteria | ✅ |

## Stage 1 Requirements (Due June 5)

| Requirement | Our Design | Status |
|---|---|---|
| "Build an initial agent or prototype through vibe coding" | Phases 1-3 working end-to-end | ✅ |
| "Research proposal-writing guides, examples, agent workflow patterns" | **NEEDS SOURCES** in video | ⚠ |
| "Submit a 5-minute presentation video" | Planned in build plan (June 4-5) | ✅ |
| "Attend mandatory in-person presentation" | June 2 presentation | ✅ |
| "A polished proposal is not required" | We only show draft in Phase 3 | ✅ |

## Stage 1 Deliverables

| Deliverable | Our Design | Status |
|---|---|---|
| "initial agent or prototype demo artifact" | Phases 1-3 code + SQLite DB | ✅ |
| "5-minute presentation video or link" | Recording of demo + explanation | ✅ |
| "mandatory in-person presentation" | June 2 session | ✅ |
| "optional screenshots or interaction trace" | Can capture both | ✅ |

## Stage 1 Grading Rubric (30 pts)

| Criterion (pts) | Our Design | Status |
|---|---|---|
| Proposal-writing understanding (8) | Workflow shows problem → gap → method → evaluation → revision | ✅ |
| External research quality (6) | **NEEDS SOURCES** to cite in video | ⚠ |
| Initial workflow structure (6) | Clear stages, inputs, outputs, state schema, stopping criteria | ✅ |
| Initial agent/prototype (5) | Phases 1-3 demo with real interaction | ✅ |
| Stage 1 presentation video (5) | Planned: design + demo + refinements | ✅ |

## Stage 2 Requirements (Due June 12)

| Requirement | Our Design | Status |
|---|---|---|
| "Refine the Stage 1 agent or workflow" | Add memory layer, Phases 4-5, honest epistemic stance refinement | ✅ |
| "Show how used to generate, revise, and evaluate" | Phase 3=generate, Phase 5=revise, Phase 4=evaluate | ✅ |
| "Submit usage evidence: logs, transcripts, screenshots" | workflow_usage.md + AI_USAGE.md + screenshots | ✅ |

## Stage 2 Deliverables

| Deliverable | Our Design | Status |
|---|---|---|
| "refined agent/workflow" | Full 7-phase system with memory | ✅ |
| "`workflow_usage.md`" | Document showing workflow in action | ✅ |
| "run transcript, screenshots, logs, or demo" | Full transcript + before/after screenshots | ✅ |
| "`AI_USAGE.md`" | Log of LLM calls, prompts, human decisions | ✅ |

## Stage 2 Grading Rubric (20 pts)

| Criterion (pts) | Our Design | Status |
|---|---|---|
| Refined workflow improvement (5) | Memory, Phase 4-5, honest epistemic stance | ✅ |
| Evidence of using workflow (5) | Transcripts showing agent-student interaction | ✅ |
| Iterative refinement (4) | Phase 5: draft → critique → user feedback → revision | ✅ |
| Workflow evaluation and critique (4) | Phase 4: checks coverage, identifies weak claims, suggests fixes | ✅ |
| Responsible AI use (2) | AI_USAGE.md documents all interactions | ✅ |

## Stage 3 Requirements (Due June 12)

| Requirement | Our Design | Status |
|---|---|---|
| "Submit final `proposal.pdf`" | Output from Phase 3-5 | ✅ |
| "Graded separately for research proposal quality" | Proposal is graded on content, not workflow | ✅ |
| "Not a short course implementation report" | **See below** | ⚠ |
| "Course deadline ≠ research timeline" | **NEEDS CLARIFICATION** | ⚠ |

## Stage 3 Deliverables

| Deliverable | Our Design | Status |
|---|---|---|
| "`proposal.pdf`" | Exported from phases 3-5 | ✅ |
| "proposal source (`.tex` or equivalent)" | Generated + editable | ✅ |
| "references or source notes" | From Phase 2 papers + cited in Phase 3 | ✅ |
| "figure/diagram source if applicable" | Phase 3-4 generate figures | ✅ |

## Stage 3 Grading Rubric (50 pts)

| Criterion (pts) | Our Design | Status |
|---|---|---|
| Format and submission (5) | PDF, 3 pages, 11pt, 1in margins | ✅ |
| Figure or visual (7) | Phase 3-4 generate with caption | ✅ |
| Motivation & problem framing (6) | Phase 2-3: grounded in literature | ✅ |
| Novelty & prior work (10) | Phase 2: research papers + gap identification | ✅ |
| Method & workflow detail (9) | Phase 3: concrete steps, state, interaction | ✅ |
| Evaluation plan (7) | Phase 3-4: concrete test scenarios, metrics | ✅ |
| Feasibility, milestones, risks (4) | Phase 3-4: timeline, resources, mitigations | ✅ |
| Writing coherence (2) | Phase 5: revision + polish | ✅ |

## Proposal Content Requirements (12 required sections)

| Section | How we guide the user | Status |
|---|---|---|
| 1. Project title | User provides during intake | ✅ |
| 2. Abstract | Phase 3 drafts from gap + method | ✅ |
| 3. Keywords | Phase 3 extracts from domain + gap | ✅ |
| 4. Introduction (motivation, gap, prior work) | Phase 2: literature discovery; Phase 3: structures | ✅ |
| 5. Project goal | Emerges from gap identification (Phase 2) | ✅ |
| 6. Methods (technical approach, agent workflow) | Phase 3: drafts from user's proposed solution | ✅ |
| 7. Figure or diagram with caption | Phase 3-4: generates workflow/architecture | ✅ |
| 8. Expected results & milestones & timeline | Phase 3: user specifies during drafting | ✅ |
| 9. Evaluation plan | Phase 3-4: rubric-driven evaluation | ✅ |
| 10. Risks and mitigation | Phase 3-4: agent prompts for risks | ✅ |
| 11. Resources, tools, budget, release plan | Phase 3: user specifies | ✅ |
| 12. References, assumptions, source notes | Phase 2: papers; Phase 3: grounding claims | ✅ |

---

## ⚠ CRITICAL GAPS TO RESOLVE BEFORE CODING

### 1. External Research Sources (Stage 1 grading: 6 pts)

**Requirement:** "Video or demo artifact includes useful funded proposal, PhD proposal, NSF/fellowship, grant-writing, proposal-template, or agent-workflow resources; each source is connected to a concrete design decision."

**What we need:** 
- At least 3-5 external sources cited in the Stage 1 video
- Each source should map to a design choice
- Examples:
  - NSF GRFP proposal structure → why we gate on comprehension
  - Socratic mentorship papers → why we ask questions instead of tell
  - Agent workflow papers (ReAct, tool-use) → why we have memory + self-critique

**What to do:** Before June 2 presentation, research and document these sources.

### 2. The Proposal's Research Subject (Stage 3)

**Requirement:** "The proposal should not be framed as a short course implementation report; the course deadline and the proposed research timeline are separate."

**Decision needed:** What is the proposal actually ABOUT?

**Options:**
- **Option A (Self-referential):** The proposal is about the agent itself.
  - Research question: "Does a mentorship-style agent with honest epistemic stance improve proposal quality?"
  - Method: Build the agent (which we're doing)
  - Evaluation: Compare user proposals with-agent vs. without-agent
  - Timeline: 6 months (hypothetical), not 2 weeks
  - ✅ Pros: Clear, self-contained, good story
  - ⚠ Cons: Must be clear it's NOT "here's what I built for class"

- **Option B (Code review domain):** The proposal is about semantic bug detection in code review.
  - Research question: "How can AST + data-flow analysis detect semantic bugs that syntax-only tools miss?"
  - Method: Build a tool + evaluate on real code
  - Timeline: 6 months (hypothetical), not 2 weeks
  - Agent's job: Help the user propose and structure this
  - ✅ Pros: More traditional CS research proposal
  - ⚠ Cons: Have to actually do the research to validate

- **Option C (Hybrid):** Proposal is about the agent, but applied to code review domain.
  - Research question: "Can a mentorship agent help researchers design better code-review tools?"
  - ✅ Pros: Combines both
  - ⚠ Cons: More complex

**What to do:** Pick ONE by June 2, so the video can be clear about what we're proposing.

### 3. How to Avoid "Implementation Report" Framing

**Requirement:** "The proposal should read like a research proposal, not a short course implementation report."

**Red flags to avoid:**
- ❌ "For this class project, I built an agent that..."
- ❌ "The deadline is June 12, so the timeline is..."
- ❌ "The rubric requires X, so we included X"

**Right framing:**
- ✅ "This research proposes a mentorship-style agent for research proposal scaffolding. We hypothesize that iterative gates improve proposal quality. To test this, we built a prototype and conducted user studies over 6 months (timeline: hypothetical, not course-bound)."

**What to do:** Structure the proposal as if you had infinite time and resources. The *prototype* was built for class, but the *research* is independent of that deadline.

---

## Summary

**✅ We satisfy:** Workflow design, phases, agent logic, deliverables, grading criteria for all three stages.

**⚠ We need before moving:**
1. Identify 3-5 external research sources to cite (proposal-writing guides, mentorship papers, agent papers)
2. Decide: Is the proposal self-referential (about the agent) or domain-specific (about code review)?
3. Ensure we frame the proposal as independent research, not a course project

**Recommendation:** Pick these up in the next 2-3 hours (before coding), so the video on June 2 can reference them clearly.

Once locked, we can code with confidence that we're building toward the rubric.
