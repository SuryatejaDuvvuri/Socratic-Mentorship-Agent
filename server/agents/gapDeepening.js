/**
 * Gap Deepening — Single-call architecture
 *
 * Previous design: 4 separate LLM calls per run
 *   extractClaims → retrieveEvidence → assessClaim×2 → decideReadiness
 *
 * New design: 1 LLM call that does everything at once.
 *   - Give the model the gap + domain + retrieved paper evidence upfront
 *   - Ask it to extract claims, assess each one, and decide readiness in one shot
 *   - Evidence is retrieved with Tavily (no LLM needed for search)
 *
 * Result: 4 calls → 1 call. No RPM issues. Faster. Same quality.
 */

import { callLLMJson } from '../tools/llm.js';
import { searchPapers } from '../tools/tavily.js';
import { getHypothesis, getIntake, getPapers, saveHypothesis } from '../learnerMemory.js';

const GAP_DEEPENING_PROMPT = `You are a research advisor stress-testing a proposed research gap in one pass.

You will be given:
1. A proposed research gap
2. The domain
3. Evidence retrieved from the literature (paper titles + abstracts)

Your job — all in one response:

**STEP 1 — Extract the 2 most critical claims** this gap depends on. These are the claims that, if false, would mean this isn't a real gap. Be specific and falsifiable.

**STEP 2 — Assess each claim** against the evidence provided:
- "supported": evidence confirms the claim — cite which paper
- "challenged": a paper partially addresses it — what residual remains?
- "unverifiable": evidence doesn't speak to it
- "already_solved": a paper fully solves what the claim says is missing

**STEP 3 — Decide readiness**:
- READY if: ≥1 claim is supported/challenged with a clear residual, and no claim is already_solved
- NOT READY if: gap is too broad, too speculative, or already solved

**STEP 4 — If not ready**, produce a sharpened gap that survives the evidence.

Return JSON:
{
  "claims": [
    {
      "claim": "specific falsifiable claim the gap depends on",
      "status": "supported | challenged | unverifiable | already_solved",
      "reasoning": "1-2 sentences citing specific paper titles",
      "residual": "if challenged: what precise gap remains"
    }
  ],
  "ready": true | false,
  "reason": "1 sentence: why ready or what's missing",
  "sharpened_gap": "if ready: copy original gap. If not: concrete restatement that survives the evidence",
  "evidence_chain": [
    { "claim": "claim text", "status": "supported|challenged|unverifiable|already_solved", "paper": "most relevant paper title", "note": "what it shows" }
  ]
}`;

/**
 * Run gap deepening in a single LLM call.
 * Retrieves evidence with Tavily (no LLM), then asks the model to
 * extract claims, assess them, and decide readiness all at once.
 */
export async function deepenGap(learnerId) {
  const hypothesis = getHypothesis(learnerId);
  if (!hypothesis?.gap) {
    throw new Error('No gap hypothesis found. Complete Phase 2 first.');
  }

  const intake = getIntake(learnerId);
  const existingPapers = getPapers(learnerId);
  const domain = intake.domain || '';
  const gap = hypothesis.gap;

  // ── Step 1: Retrieve evidence with Tavily (no LLM call needed) ──
  let evidence = [];
  try {
    // Tavily has a 400-char query limit. If gap is long, extract key terms instead of truncating.
    let searchQuery = gap;
    if (gap.length > 200) {
      // Extract first sentence or first ~100 chars of core problem statement
      const sentences = gap.split(/[.!?]+/);
      const mainClaim = sentences[0].slice(0, 120).trim();
      searchQuery = `${mainClaim} ${domain}`;
    }
    searchQuery = searchQuery.slice(0, 380);
    const results = await searchPapers(searchQuery, 6);
    evidence = results
      .filter(p => p.title)
      .map(p => `"${p.title}" — ${(p.summary || '').slice(0, 250)}`);
  } catch (err) {
    console.warn('[gapDeepening] Evidence retrieval failed:', err.message);
    // Proceed with papers already read by the student
  }

  // Also include papers the student already read
  const readPapers = existingPapers
    .filter(p => p.title)
    .map(p => `"${p.title}" — ${(p.summary || '').slice(0, 200)}`);

  const allEvidence = [...new Set([...evidence, ...readPapers])].slice(0, 8);

  const evidenceBlock = allEvidence.length
    ? allEvidence.join('\n\n')
    : '(No papers retrieved — assess gap based on domain knowledge only)';

  // ── Step 2: One LLM call does everything ──
  const result = await callLLMJson({
    systemPrompt: 'You are a research advisor. Return only valid JSON. Be specific about paper titles.',
    history: [],
    userMessage: `${GAP_DEEPENING_PROMPT}

Domain: ${domain}
Gap: ${gap}

Retrieved evidence:
${evidenceBlock}`,
    temperature: 0.2,
    requiredKeys: ['claims', 'ready', 'sharpened_gap', 'evidence_chain']
  });

  const finalGap = result.sharpened_gap || gap;

  // Persist the result
  saveHypothesis(learnerId, {
    gap: finalGap,
    why_it_matters: hypothesis.why_it_matters,
    proposed_approach: '',
    confidence_note: `Evidence chain: ${(result.evidence_chain || []).map(e => e.paper).filter(Boolean).join(', ') || 'none'}`
  });

  return {
    ready: result.ready === true,
    final_gap: finalGap,
    claims: result.claims || [],
    evidence_chain: result.evidence_chain || [],
    reason: result.reason || '',
    iterations: [{
      iteration: 1,
      gap,
      claims: result.claims || [],
      assessments: (result.claims || []).map(c => ({
        claim: c.claim,
        status: c.status,
        reasoning: c.reasoning,
        residual: c.residual || '',
        key_paper: c.paper || ''
      })),
      ready: result.ready === true,
      reason: result.reason || '',
      sharpened_gap: finalGap,
      evidence_chain: result.evidence_chain || []
    }],
    ...(result.ready ? {} : { warning: 'Gap narrowed but consider revisiting Phase 2 for more grounding.' })
  };
}
