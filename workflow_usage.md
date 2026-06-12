# Workflow Usage — Stage 2

This document shows how the Socratic Research Mentorship Agent was used to generate, revise, and evaluate the final research proposal. The topic is **mechanistic interpretability and sparse autoencoders for deceptive circuit detection in LLMs**.

---

## Session Setup

```bash
# Start dev servers
npm run dev
# API: http://127.0.0.1:8787
# UI:  http://127.0.0.1:5174

# Create session
curl -s -X POST http://127.0.0.1:8787/api/mentor/session \
     -H 'Content-Type: application/json' \
     -d '{"domain":"mechanistic interpretability"}'
# → { "learnerId": "mc-interp-001", "sessionId": "..." }
```

---

## Phase 1 — Domain Readiness (Feynman-style concept check)

**Goal:** Verify the student has sufficient conceptual foundation before reading literature.

**Interaction trace:**

```
POST /api/mentor/phase1/turn
{
  "learnerId": "mc-interp-001",
  "message": "Mechanistic interpretability tries to reverse-engineer the internal computations of a neural network — identifying which circuits (subgraphs of attention heads and MLP neurons) are responsible for specific behaviors. Sparse autoencoders are a tool for decomposing superimposed features in residual stream activations into interpretable monosemantic directions."
}

Mentor → "That's a strong starting definition. One thing I'd push on: when you say 'superimposed features,' what exactly is being superimposed, and why does superposition make interpretation hard? Can you give me a concrete example from the residual stream?"

Student → "Superposition is when the model stores more features than it has dimensions by using near-orthogonal directions. So a 512-dim residual stream can represent thousands of features, each as a slight direction. SAEs decompose that by learning a sparse overcomplete basis — most directions are silent for any given input."

Mentor → "Exactly. You've hit the core tension. The interpretability problem isn't 'what do neurons do' but 'what are the features when neurons polysemantically mix them.' You're ready for the literature."
```

**Outcome:** Cleared for Phase 2. All 4 key concepts (neural networks, transformers, circuits, SAEs) marked as strong.

---

## Phase 2 — Literature Discovery (Socratic gap identification)

**Goal:** Identify a genuine, open research gap through paper engagement — agent never tells the student the gap; it probes until the student surfaces it.

**Papers retrieved via Tavily search:**
- Cunningham et al. (2023): "Sparse Autoencoders Find Highly Interpretable Features in Language Models"
- Marks et al. (2023): "The Geometry of Truth: Emergent Linear Structure in Large Language Model Representations of True/False Datasets"
- Conmy et al. (2023): "Towards Automated Circuit Discovery for Mechanistic Interpretability"
- Lindsey et al. (2024): "Scaling and evaluating sparse autoencoders" (OpenAI)
- Survey: "Representation Engineering: A Top-Down Approach to AI Transparency" (Zou et al. 2023)
- Hubinger et al. (2019): "Risks from Learned Optimization in Advanced Machine Learning Systems" (deceptive alignment)

**Gap discovery exchange:**

```
Mentor → "Cunningham et al. show SAEs can isolate monosemantic features. Conmy et al. can trace which circuits activate for a given behavior. My read is that neither paper closes the loop on *deceptive* behavior specifically — one identifies features, the other traces circuits, but neither asks: which SAE features activate specifically when a model produces deceptive outputs? Does that match what you're seeing across these papers?"

Student → "Yes — they're looking at factual circuits and IOI circuits. Nothing on deception specifically. You could have all the SAE features extracted and still not know which ones are causally involved in deceptive outputs."

Mentor → "Right — that's the gap. Feature extraction ≠ causal attribution for a specific behavior class. What would it take to close it? What's the minimal experiment?"

Student → "You'd need a dataset of deceptive vs. honest outputs, run SAE decomposition on both, and then do activation patching to test which feature directions are causally necessary for the deceptive output."
```

**Gap hypothesis saved:** "SAEs can decompose LLM residual stream features, but no method identifies which SAE features causally mediate deceptive circuits — leaving deceptive alignment mechanistically uncharacterized."

---

## Phase 2.5 — Gap Validation and Deepening

**Goal:** Check novelty of the gap against the literature and stress-test claims before drafting.

**Gap validation result:**
```
POST /api/mentor/phase25/validate
{
  "learnerId": "mc-interp-001"
}

→ {
  "verdict": "open",
  "confidence": 0.82,
  "novelty_check": "No paper in Tavily results combines SAE decomposition with causal attribution for deceptive outputs. Closest work (Marks et al.) identifies truth directions but does not use SAEs or target deception circuits.",
  "quality_gate": {
    "Concrete": true,
    "Scoped": true,
    "Testable": true,
    "On-domain": true,
    "Grounded": true
  }
}
```

**Gap deepening — claim stress-test:**
```
POST /api/mentor/phase25/deepen
{
  "learnerId": "mc-interp-001"
}

Claims extracted:
  Claim 1: "SAEs can extract interpretable features from LLM residual streams."
  → Status: SUPPORTED. Cunningham et al. (2023) + Lindsey et al. (2024) both confirm.

  Claim 2: "No existing method identifies which SAE features causally mediate deceptive circuit activations."
  → Status: UNVERIFIABLE (novel) — no paper refutes it; this is the open problem.

  Claim 3: "Activation patching can establish causal attribution in circuits."
  → Status: SUPPORTED. Conmy et al. (2023) use activation patching for IOI circuits.
```

**Outcome:** Gap deepened and validated. Ready for hypotheses.

---

## Phase 2.6 — Hypothesis Generation

**Three testable hypotheses generated:**

```
H1: SAE-guided activation patching will reduce deceptive output frequency by ≥30%
    on TruthfulQA (GPT-2 XL), compared to baseline random feature patching.

H2: ≤5% of the top-k SAE features per layer will account for ≥80% of the
    deceptive-vs-honest activation difference (sparse causal footprint).

H3: The identified deceptive SAE features will generalize across model scales
    (GPT-2 XL → Pythia-6.9B), indicating architectural invariance of deceptive circuits.
```

Student accepted all three hypotheses.

---

## Phase 2.7 — Specificity Gate

**Goal:** Refuse to draft until the student commits to concrete experimental details.

**Gate exchange:**

```
Mentor → "Before we draft, I need specific commitments. What dataset are you using, what sample size, what tools, and what prior work are you grounding the method in?"

Student → "TruthfulQA (817 questions), GPT-2 XL + Pythia-6.9B for cross-scale, TransformerLens for activation patching, SAELens for pre-trained SAEs. Grounding in Cunningham et al. 2023 for the SAE extraction method and Conmy et al. 2023 for the patching protocol."

Gate check:
  ✅ dataset_name: TruthfulQA (817 questions)
  ✅ sample_size: 817
  ✅ instruments: TransformerLens, SAELens
  ✅ prior_reference: Cunningham et al. 2023, Conmy et al. 2023
  ✅ models: GPT-2 XL, Pythia-6.9B
```

**Gate passed.** Drafting unlocked.

---

## Phase 3 — Proposal Drafting (RAG-grounded)

**All 5 sections drafted with RAG context injected:**

Each section retrieved the most relevant NSF/rubric standard chunks before drafting. Example for the Evaluation section:

```
RAG retrieved for "evaluation plan falsifiable metrics":
  [RAG-1] NSF Merit Review: "Intellectual Merit requires concrete evidence that proposed research
          will advance knowledge." Source: nsf-merit-review.md
  [RAG-2] Proposal Heuristics: "Evaluation plan must name a baseline, a metric, and a falsifiable
          success threshold. 'We will evaluate it' is not a plan." Source: proposal-writing-heuristics.md
  [RAG-3] Course Rubric: "7 pts for evaluation plan: must have concrete tests or metrics, at least
          one quantified success criterion." Source: course-rubric.md

Critique generated:
  "[RAG-2] requires a named baseline. Draft says 'compare against baseline' without specifying one.
  Adding 'random feature patching as the null baseline' and 'deception rate reduction ≥30% as success
  threshold' would satisfy this."
```

**Sections drafted:** Abstract, Introduction (motivation + prior work + gap), Methods (SAE extraction pipeline, activation patching protocol, cross-scale generalization test), Evaluation Plan, Risks & Resources.

---

## Phase 3.5 — Proposal Composition (One-call LaTeX)

**Full proposal composed in one LLM call:**

```bash
curl -o proposal.pdf "http://127.0.0.1:8787/api/mentor/export/pdf/mc-interp-001"
```

Output: `proposal.pdf` (4 pages: 3 body + 1 references), `proposal.tex` (compile-ready LaTeX with TikZ pipeline figure).

**TikZ figure generated:** 5-stage pipeline (TruthfulQA Input → SAE Decomposition → Feature Attribution → Circuit Mapping → Deception Reduction), rendered in a 2-row layout to fit within 16.5cm text width.

---

## Phase 4 — Rubric Check + Adversarial Review (Revision Loop)

**Rubric check — first pass:**

```
POST /api/mentor/phase4/rubric-check
{
  "learnerId": "mc-interp-001"
}

→ Projected: 38/50
  Weak criteria:
    - Evaluation plan (5/7): "Baseline is named, metric is named, but no statistical test specified."
    - Writing coherence (1/2): "Section transitions are abrupt between Methods and Evaluation."

  Points-recoverable:
    - Evaluation: +2 pts by specifying Wilcoxon signed-rank test for deception-rate comparison
    - Writing: +1 pt by adding transition sentence bridging causal attribution to evaluation design
```

**Student revision based on rubric feedback:**

Student added to the Evaluation section:
> "Statistical significance will be assessed with a two-sided Wilcoxon signed-rank test (α = 0.05) comparing deceptive output rates under SAE-guided patching versus the random-baseline condition."

**Rubric check — second pass:**

```
→ Projected: 41/50
  Improvement: +3 pts
  Remaining gap: Novelty section (8/10) — "Prior work paragraph names papers but does not explain
                 why each one falls short of the proposed approach."
```

**Adversarial review:**

```
POST /api/mentor/phase4/adversarial-review

Reviewer attacks generated:
  1. "You claim ≤5% of features cause deception — but how do you distinguish causal features from
     co-activated features that happen to correlate with deceptive outputs?"
  2. "TruthfulQA tests factual accuracy, not strategic deception. How do you justify using it to
     study 'deceptive circuits'?"
  3. "GPT-2 XL may not exhibit strategic deception at all — the behavior you're patching may be
     hallucination, not deception. How would you distinguish them?"
```

Student addressed attack #2 directly in the motivation section:
> "We operationalize 'deceptive output' as model-generated false statements where the model's internal state encodes the correct answer (as measured by linear probing on the residual stream, following Marks et al. 2023). TruthfulQA provides known-false statements the model confidently produces — a tractable proxy for studying the circuit-level mechanism even if it does not capture strategic intent."

**Final proposal exported after revisions:**

```bash
curl -o proposal.pdf "http://127.0.0.1:8787/api/mentor/export/pdf/mc-interp-001?force=1"
```

---

## Workflow Coverage Summary

| Stage 2 Checklist Item | Evidence |
|---|---|
| Refined agent is demonstrated | All phases (1–4) ran end-to-end on student's topic |
| Workflow usage is documented | This file + AI_USAGE.md |
| Student-agent interaction shown | Phase 1 + Phase 2 traces above |
| Workflow checks proposal coverage/quality | Phase 4 rubric check (38/50 → 41/50 with projected scores per criterion) |
| Workflow identifies weaknesses + revision priorities | Rubric check weak criteria + points-recoverable + adversarial attacks |
| AI usage log records tools, prompts, model calls | AI_USAGE.md (models, prompts, call patterns, failures) |
| At least one revision loop shown | Evaluation section revision (38 → 41 pts), statistical test added, adversarial response added |

---

## Reproducing This Session

```bash
# 1. Install dependencies and ingest corpus
npm install && npm run rag:ingest

# 2. Start dev server
npm run dev

# 3. Create a new session
curl -X POST http://127.0.0.1:8787/api/mentor/session \
     -H 'Content-Type: application/json' \
     -d '{"domain":"your research domain"}'

# 4. Follow phases 1–3 interactively via http://127.0.0.1:5174

# 5. Export final proposal
curl -o proposal.pdf "http://127.0.0.1:8787/api/mentor/export/pdf/<learnerId>"
```

Progress persists in `mentor.db` — close the tab and resume any time.
